import pg from 'pg';
pg.types.setTypeParser(20,Number);
pg.types.setTypeParser(1700,Number);
pg.types.setTypeParser(1082,v=>v);
export const pool=new pg.Pool({max:10,connectionTimeoutMillis:5000});
export async function tx(work){const c=await pool.connect();try{await c.query('BEGIN');const out=await work(c);await c.query('COMMIT');return out;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
export const audit=(c,actor,action,entity,id,details={})=>c.query('INSERT INTO audit(actor_id,action,entity,entity_id,details) VALUES($1,$2,$3,$4,$5)',[actor,action,entity,String(id),details]);
export async function initialize(){await pool.query(`
CREATE TABLE IF NOT EXISTS users(
 id BIGSERIAL PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN('SUPER_ADMIN','ADMIN','MANAGER','WAREHOUSE','PURCHASING')),
 active BOOLEAN NOT NULL DEFAULT TRUE,session_version INTEGER NOT NULL DEFAULT 0,created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY CHECK(id=1),company_name TEXT NOT NULL,address TEXT NOT NULL DEFAULT '',contact TEXT NOT NULL DEFAULT '',demo_loaded BOOLEAN NOT NULL DEFAULT FALSE);
INSERT INTO settings(id,company_name) VALUES(1,'BahanBaku • UMKM Produksi') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS suppliers(id BIGSERIAL PRIMARY KEY,name TEXT NOT NULL UNIQUE,contact TEXT NOT NULL DEFAULT '',address TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS materials(
 id BIGSERIAL PRIMARY KEY,code TEXT NOT NULL UNIQUE,name TEXT NOT NULL,unit TEXT NOT NULL,
 supplier_id BIGINT NOT NULL REFERENCES suppliers(id),unit_cost NUMERIC(16,2) NOT NULL CHECK(unit_cost>=0),
 safety_stock NUMERIC(16,3) NOT NULL DEFAULT 0 CHECK(safety_stock>=0),pack_size NUMERIC(16,3) NOT NULL DEFAULT 1 CHECK(pack_size>0),
 lead_days INTEGER NOT NULL DEFAULT 2 CHECK(lead_days BETWEEN 0 AND 365),active BOOLEAN NOT NULL DEFAULT TRUE);
CREATE TABLE IF NOT EXISTS products(id BIGSERIAL PRIMARY KEY,code TEXT NOT NULL UNIQUE,name TEXT NOT NULL,unit TEXT NOT NULL DEFAULT 'pcs',active BOOLEAN NOT NULL DEFAULT TRUE);
CREATE TABLE IF NOT EXISTS bom(product_id BIGINT NOT NULL REFERENCES products(id),material_id BIGINT NOT NULL REFERENCES materials(id),quantity NUMERIC(16,6) NOT NULL CHECK(quantity>0),waste_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK(waste_pct BETWEEN 0 AND 30),PRIMARY KEY(product_id,material_id));
CREATE TABLE IF NOT EXISTS demand(id BIGSERIAL PRIMARY KEY,product_id BIGINT NOT NULL REFERENCES products(id),day DATE NOT NULL,quantity INTEGER NOT NULL CHECK(quantity>=0),source TEXT NOT NULL DEFAULT 'MANUAL',created_by BIGINT REFERENCES users(id),UNIQUE(product_id,day));
CREATE TABLE IF NOT EXISTS stock_moves(id BIGSERIAL PRIMARY KEY,material_id BIGINT NOT NULL REFERENCES materials(id),quantity NUMERIC(16,3) NOT NULL CHECK(quantity<>0),kind TEXT NOT NULL CHECK(kind IN('OPENING','ADJUSTMENT','RECEIPT','PRODUCTION')),reference TEXT NOT NULL,note TEXT NOT NULL DEFAULT '',unit_cost NUMERIC(16,2) NOT NULL DEFAULT 0,actor_id BIGINT REFERENCES users(id),created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS forecasts(id BIGSERIAL PRIMARY KEY,product_id BIGINT NOT NULL REFERENCES products(id),horizon INTEGER NOT NULL,trained_through DATE NOT NULL,result JSONB NOT NULL,created_by BIGINT REFERENCES users(id),created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS plans(id BIGSERIAL PRIMARY KEY,title TEXT NOT NULL,start_day DATE NOT NULL,end_day DATE NOT NULL,status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN('DRAFT','APPROVED','PRODUCED','CANCELLED')),products JSONB NOT NULL,materials JSONB NOT NULL,created_by BIGINT REFERENCES users(id),approved_by BIGINT REFERENCES users(id),produced_by BIGINT REFERENCES users(id),created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS purchase_orders(id BIGSERIAL PRIMARY KEY,plan_id BIGINT NOT NULL REFERENCES plans(id),supplier_id BIGINT NOT NULL REFERENCES suppliers(id),status TEXT NOT NULL DEFAULT 'ORDERED' CHECK(status IN('ORDERED','RECEIVED')),expected_day DATE NOT NULL,created_by BIGINT REFERENCES users(id),received_by BIGINT REFERENCES users(id),created_at TIMESTAMPTZ NOT NULL DEFAULT now(),received_at TIMESTAMPTZ,UNIQUE(plan_id,supplier_id));
CREATE TABLE IF NOT EXISTS purchase_lines(order_id BIGINT NOT NULL REFERENCES purchase_orders(id),material_id BIGINT NOT NULL REFERENCES materials(id),quantity NUMERIC(16,3) NOT NULL CHECK(quantity>0),unit_cost NUMERIC(16,2) NOT NULL CHECK(unit_cost>=0),PRIMARY KEY(order_id,material_id));
CREATE TABLE IF NOT EXISTS audit(id BIGSERIAL PRIMARY KEY,actor_id BIGINT REFERENCES users(id),action TEXT NOT NULL,entity TEXT NOT NULL,entity_id TEXT NOT NULL,details JSONB NOT NULL DEFAULT '{}',created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS idx_stock_material ON stock_moves(material_id);
CREATE INDEX IF NOT EXISTS idx_demand_date ON demand(day);
`);
 // Add login names without recreating accounts or changing email/password hashes.
 await tx(async c=>{
  await c.query('SELECT pg_advisory_xact_lock(7314401)');
  await c.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT CHECK(username ~ '^[a-z0-9][a-z0-9._-]{2,39}$');
DO $$
DECLARE account RECORD; base_name TEXT; candidate TEXT; suffix INTEGER;
BEGIN
 FOR account IN SELECT id,email FROM users WHERE username IS NULL ORDER BY id LOOP
  base_name := left(regexp_replace(lower(split_part(account.email,'@',1)), '[^a-z0-9._-]', '', 'g'), 25);
  IF length(base_name)<3 OR base_name !~ '^[a-z0-9]' THEN base_name := 'user-' || account.id; END IF;
  candidate := base_name; suffix := 0;
  WHILE EXISTS(SELECT 1 FROM users WHERE lower(username)=candidate) LOOP
   suffix := suffix+1; candidate := left(base_name,20) || '-' || account.id || '-' || suffix;
  END LOOP;
  UPDATE users SET username=candidate WHERE id=account.id;
 END LOOP;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique ON users(lower(username));
ALTER TABLE users ALTER COLUMN username SET NOT NULL;`);
 });
}
