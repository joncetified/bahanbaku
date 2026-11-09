import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import sensible from '@fastify/sensible';
import rateLimit from '@fastify/rate-limit';
import bcrypt from 'bcryptjs';
import {pool,tx,audit,initialize} from './db.js';
import {buildForecast,today,shift} from './forecast.js';
import {inventory,requirements,supplyContext,assessSupply} from './planning.js';
import {normalizeUsername} from './username.js';
import {decimal} from './decimal.js';
import {requestLimitKey,ipLimitKey} from './request-limit.js';
import {historyReadiness} from './history-readiness.js';

const app=Fastify({logger:true,bodyLimit:2*1024*1024});
if(!process.env.JWT_SECRET||process.env.JWT_SECRET.length<32)throw Error('JWT_SECRET minimal 32 karakter.');
await app.register(sensible);await app.register(jwt,{secret:process.env.JWT_SECRET,sign:{expiresIn:'8h'}});
await app.register(rateLimit,{max:300,timeWindow:'1 minute',keyGenerator:requestLimitKey});
const roles=['SUPER_ADMIN','ADMIN','MANAGER','WAREHOUSE','PURCHASING'];
const fail=(message,statusCode=400)=>{throw Object.assign(Error(message),{statusCode});};
const txt=(v,name,max=200)=>{if(typeof v!=='string'||!v.trim()||v.trim().length>max)fail(name+' wajib diisi dengan benar.');return v.trim();};
const num=(v,name,min=0,max=1e9,integer=false)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max||(integer&&!Number.isInteger(v)))fail(name+' tidak valid.');return v;};
const id=v=>{const n=Number(v);if(!Number.isSafeInteger(n)||n<1)fail('ID tidak valid.');return n;};
const day=v=>{if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||Number.isNaN(Date.parse(v))||new Date(v+'T00:00:00Z').toISOString().slice(0,10)!==v)fail('Tanggal tidak valid.');return v;};
const password=v=>{txt(v,'Password',72);if(v.length<12||Buffer.byteLength(v)>72)fail('Password harus 12 sampai 72 byte.');return v;};
const guard=(allowed=roles)=>async(req,reply)=>{
 try{await req.jwtVerify();}catch{return reply.unauthorized('Silakan login kembali.');}
 const user=(await pool.query('SELECT id,name,username,email,role,active,session_version FROM users WHERE id=$1',[req.user.id])).rows[0];
 if(!user?.active||user.session_version!==req.user.version)return reply.unauthorized('Sesi telah berakhir.');
 if(!allowed.includes(user.role))return reply.forbidden('Jabatan Anda tidak berwenang melakukan tindakan ini.');
 req.actor=user;
};
const read=(url,fn)=>app.get('/api'+url,{preHandler:guard()},fn);
const post=(url,allowed,fn)=>app.post('/api'+url,{preHandler:guard(allowed)},fn);
const managers=['SUPER_ADMIN','MANAGER'],admins=['SUPER_ADMIN','ADMIN'];
const stockRoles=['SUPER_ADMIN','WAREHOUSE'],buyRoles=['SUPER_ADMIN','PURCHASING'];
const lock=c=>c.query('SELECT pg_advisory_xact_lock(7314400)');
app.addHook('onSend',async(req,reply,body)=>{reply.header('Cache-Control','no-store');return body;});
app.get('/api/health',{config:{rateLimit:false}},async()=>{await pool.query('SELECT 1');return {status:'ok',service:'BahanBaku'};});
app.post('/api/auth/login',{config:{rateLimit:{max:10,timeWindow:'1 minute',keyGenerator:ipLimitKey}}},async(req,reply)=>{
 const username=normalizeUsername(req.body?.username);txt(req.body?.password,'Password',100);const pass=req.body.password;
 const u=(await pool.query('SELECT * FROM users WHERE lower(username)=$1 AND active',[username])).rows[0];
 if(!u||!await bcrypt.compare(pass,u.password_hash))return reply.unauthorized('Username atau password tidak sesuai.');
 await audit(pool,u.id,'LOGIN','USER',u.id);
 return {token:app.jwt.sign({id:u.id,version:u.session_version}),user:{id:u.id,name:u.name,username:u.username,email:u.email,role:u.role}};
});
read('/auth/me',async req=>({user:req.actor}));
post('/auth/logout',roles,async req=>{await pool.query('UPDATE users SET session_version=session_version+1 WHERE id=$1',[req.actor.id]);return {message:'Anda sudah keluar.'};});
post('/auth/password',roles,async req=>{
 const fresh=password(req.body?.newPassword);txt(req.body?.oldPassword,'Password lama',100);const old=req.body.oldPassword;
 const u=(await pool.query('SELECT password_hash FROM users WHERE id=$1',[req.actor.id])).rows[0];
 if(!await bcrypt.compare(old,u.password_hash))fail('Password lama salah.');
 await pool.query('UPDATE users SET password_hash=$1,session_version=session_version+1 WHERE id=$2',[await bcrypt.hash(fresh,12),req.actor.id]);return {message:'Password diganti. Silakan login kembali.'};
});
read('/catalog',async()=>({materials:await inventory(pool),suppliers:(await pool.query('SELECT * FROM suppliers ORDER BY name')).rows,products:(await pool.query('SELECT * FROM products ORDER BY code')).rows,bom:(await pool.query('SELECT * FROM bom ORDER BY product_id,material_id')).rows}));
post('/suppliers',admins,async req=>tx(async c=>{
 const b=req.body||{},r=(await c.query('INSERT INTO suppliers(name,contact,address) VALUES($1,$2,$3) RETURNING id',[txt(b.name,'Nama'),String(b.contact||'').slice(0,200),String(b.address||'').slice(0,500)])).rows[0];await audit(c,req.actor.id,'CREATE','SUPPLIER',r.id);return r;
}));
post('/materials',admins,async req=>tx(async c=>{
 await lock(c);const b=req.body||{};const values=[txt(b.code,'Kode',30),txt(b.name,'Nama'),txt(b.unit,'Satuan',20),id(b.supplierId),decimal(b.unitCost,'Harga',2),decimal(b.safetyStock,'Stok pengaman',3),decimal(b.packSize,'Ukuran kemasan',3,0.001),num(b.leadDays,'Waktu pasok',0,365,true)];
 let result;if(b.id){result=await c.query('UPDATE materials SET code=$1,name=$2,unit=$3,supplier_id=$4,unit_cost=$5,safety_stock=$6,pack_size=$7,lead_days=$8 WHERE id=$9 AND unit=$3 RETURNING id',[...values,id(b.id)]);if(!result.rowCount)fail('Bahan tidak ditemukan atau satuan diubah. Satuan bahan yang sudah dibuat tidak boleh diubah.');}
 else result=await c.query('INSERT INTO materials(code,name,unit,supplier_id,unit_cost,safety_stock,pack_size,lead_days) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',values);
 await audit(c,req.actor.id,b.id?'UPDATE':'CREATE','MATERIAL',result.rows[0].id);return result.rows[0];
}));
post('/products',admins,async req=>tx(async c=>{const b=req.body||{};const r=(await c.query('INSERT INTO products(code,name,unit) VALUES($1,$2,$3) RETURNING id',[txt(b.code,'Kode',30),txt(b.name,'Nama'),txt(b.unit,'Satuan',20)])).rows[0];await audit(c,req.actor.id,'CREATE','PRODUCT',r.id);return r;}));
post('/bom', [...admins,'MANAGER'],async req=>tx(async c=>{
 await lock(c);const b=req.body||{},productId=id(b.productId),materialId=id(b.materialId),q=decimal(b.quantity,'Jumlah resep',6,0.000001,100000),w=decimal(b.wastePct,'Susut',2,0,30);
 await c.query('INSERT INTO bom(product_id,material_id,quantity,waste_pct) VALUES($1,$2,$3,$4) ON CONFLICT(product_id,material_id) DO UPDATE SET quantity=$3,waste_pct=$4',[productId,materialId,q,w]);
 await audit(c,req.actor.id,'SAVE_RECIPE','PRODUCT',productId,{materialId});return {message:'Komposisi disimpan untuk 1 unit produk.'};
}));
post('/bom/remove',[...admins,'MANAGER'],async req=>tx(async c=>{await lock(c);await c.query('DELETE FROM bom WHERE product_id=$1 AND material_id=$2',[id(req.body?.productId),id(req.body?.materialId)]);await audit(c,req.actor.id,'REMOVE_RECIPE','PRODUCT',req.body.productId,{materialId:req.body.materialId});return {message:'Komposisi dihapus. Snapshot rencana yang sudah dibuat tetap tersimpan.'};}));
read('/stock',async()=>({moves:(await pool.query('SELECT s.*,m.name,m.unit,u.name actor FROM stock_moves s JOIN materials m ON m.id=s.material_id LEFT JOIN users u ON u.id=s.actor_id ORDER BY s.id DESC LIMIT 250')).rows}));
post('/stock',stockRoles,async req=>tx(async c=>{
 await lock(c);const b=req.body||{},materialId=id(b.materialId),quantity=decimal(b.quantity,'Perubahan stok',3,-1e7,1e7);if(!quantity)fail('Perubahan stok tidak boleh nol.');
 const m=(await inventory(c)).find(m=>m.id===materialId);if(!m)fail('Bahan tidak ditemukan.',404);if(m.stock+quantity<0)fail('Perubahan akan membuat stok negatif.');
 const r=(await c.query("INSERT INTO stock_moves(material_id,quantity,kind,reference,note,unit_cost,actor_id) VALUES($1,$2,'ADJUSTMENT','STOCK-OPNAME',$3,$4,$5) RETURNING id",[materialId,quantity,txt(b.note,'Alasan koreksi',500),m.unit_cost,req.actor.id])).rows[0];
 await audit(c,req.actor.id,'ADJUST_STOCK','STOCK',r.id,{materialId,quantity});return r;
}));
read('/demand',async req=>{
 const productId=req.query.productId?id(req.query.productId):null;
 return {rows:(await pool.query('SELECT d.*,p.code,p.name FROM demand d JOIN products p ON p.id=d.product_id WHERE ($1::bigint IS NULL OR product_id=$1) ORDER BY day DESC,p.code LIMIT 10000',[productId])).rows};
});
post('/demand',[...admins,'MANAGER'],async req=>tx(async c=>{
 const b=req.body||{},productId=id(b.productId),date=day(b.day),quantity=num(b.quantity,'Permintaan',0,1000000,true);if(date>=today())fail('Catat data harian yang sudah selesai, paling akhir kemarin.');
 await c.query("INSERT INTO demand(product_id,day,quantity,created_by) VALUES($1,$2,$3,$4) ON CONFLICT(product_id,day) DO UPDATE SET quantity=$3,source='MANUAL',created_by=$4",[productId,date,quantity,req.actor.id]);await audit(c,req.actor.id,'SAVE_DEMAND','PRODUCT',productId,{day:date});return {message:'Riwayat permintaan disimpan.'};
}));
post('/demand/import',[...admins,'MANAGER'],async req=>tx(async c=>{
 const rows=req.body?.rows;if(!Array.isArray(rows)||!rows.length||rows.length>10000)fail('Impor harus berisi 1–10.000 baris.');
 const products=(await c.query('SELECT id,code FROM products')).rows,seen=new Set();
 for(const r of rows){const p=products.find(p=>p.code===r.code),d=day(r.day),q=num(r.quantity,'Jumlah',0,1000000,true);if(!p||d>=today())fail('Kode produk atau tanggal impor tidak valid.');const key=p.id+':'+d;if(seen.has(key))fail('Ada tanggal/produk ganda dalam file.');seen.add(key);
  await c.query("INSERT INTO demand(product_id,day,quantity,source,created_by) VALUES($1,$2,$3,'IMPORT',$4) ON CONFLICT(product_id,day) DO UPDATE SET quantity=$3,source='IMPORT',created_by=$4",[p.id,d,q,req.actor.id]);}
 await audit(c,req.actor.id,'IMPORT_DEMAND','DEMAND','batch',{rows:rows.length});return {message:rows.length+' baris berhasil diimpor.'};
}));
read('/forecasts',async()=>{
 const [models,summaries]=await Promise.all([
  pool.query('SELECT f.*,p.name,p.code,u.name creator FROM forecasts f JOIN products p ON p.id=f.product_id JOIN users u ON u.id=f.created_by ORDER BY f.id DESC LIMIT 50'),
  pool.query('SELECT p.id product_id,p.name,count(d.id)::int count,min(d.day) first,max(d.day) last FROM products p LEFT JOIN demand d ON d.product_id=p.id WHERE p.active GROUP BY p.id ORDER BY p.code')
 ]);
 return {forecasts:models.rows,readiness:summaries.rows.map(s=>historyReadiness(s,today()))};
});
post('/forecasts',managers,async req=>{
 const productId=id(req.body?.productId),horizon=num(req.body?.horizon,'Horizon',7,30,true);
 const history=(await pool.query('SELECT day,quantity FROM demand WHERE product_id=$1 ORDER BY day',[productId])).rows;
 let result;try{result=buildForecast(history,horizon);}catch(e){fail(e.message);}
 return tx(async c=>{const r=(await c.query('INSERT INTO forecasts(product_id,horizon,trained_through,result,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id',[productId,horizon,result.trainedThrough,result,req.actor.id])).rows[0];await audit(c,req.actor.id,'TRAIN_MODEL','FORECAST',r.id,{productId,horizon,mae:result.evaluation.mae});return r;});
});
read('/plans',async()=>tx(async c=>{
 await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
 const plans=(await c.query('SELECT p.*,u.name creator FROM plans p JOIN users u ON u.id=p.created_by ORDER BY p.id DESC LIMIT 100')).rows;
 const context=await supplyContext(c);
 return {plans:plans.map(p=>({...p,readiness:['DRAFT','APPROVED'].includes(p.status)?assessSupply(context,p.materials,p.id,p.start_day):null}))};
}));
post('/plans',managers,async req=>tx(async c=>{
 await lock(c);const b=req.body||{},title=txt(b.title,'Judul rencana'),start=day(b.startDay),end=day(b.endDay);
 if(start<today()||end<start||end>shift(start,30))fail('Periode rencana harus mulai hari ini atau setelahnya, maksimal 31 hari.');
 if(!Array.isArray(b.items)||!b.items.length||b.items.length>100)fail('Tambahkan produk ke rencana.');
 const seen=new Set(),items=[];
 for(const r of b.items){const productId=id(r.productId);if(seen.has(productId))fail('Produk tidak boleh ganda.');seen.add(productId);const quantity=num(r.quantity,'Target produksi',1,1000000,true);let forecastId=null;
  if(r.forecastId){forecastId=id(r.forecastId);const f=(await c.query('SELECT * FROM forecasts WHERE id=$1 AND product_id=$2',[forecastId,productId])).rows[0];if(!f||f.result.future[0].day!==start||f.result.future.at(-1).day!==end)fail('Periode prediksi tidak sesuai periode rencana.');}
  const p=(await c.query('SELECT name,unit FROM products WHERE id=$1',[productId])).rows[0];if(!p)fail('Produk tidak ditemukan.');items.push({productId,quantity,forecastId,...p});}
 const materials=await requirements(c,items,0,start);const r=(await c.query('INSERT INTO plans(title,start_day,end_day,products,materials,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[title,start,end,JSON.stringify(items),JSON.stringify(materials),req.actor.id])).rows[0];
 await audit(c,req.actor.id,'CREATE_PLAN','PLAN',r.id);return r;
}));
post('/plans/:id/approve',managers,async req=>tx(async c=>{
 await lock(c);const p=(await c.query('SELECT * FROM plans WHERE id=$1 FOR UPDATE',[id(req.params.id)])).rows[0];if(!p||p.status!=='DRAFT')fail('Hanya rencana draf yang dapat disetujui.',409);
 if(p.start_day<today())fail('Periode rencana sudah lewat. Buat rencana baru.');
 const materials=await requirements(c,p.products,p.id,p.start_day);
 await c.query("UPDATE plans SET status='APPROVED',materials=$1,approved_by=$2,updated_at=now() WHERE id=$3",[JSON.stringify(materials),req.actor.id,p.id]);await audit(c,req.actor.id,'APPROVE_PLAN','PLAN',p.id);return {message:'Rencana disetujui. Gudang dan pembelian dapat menindaklanjuti.'};
}));
post('/plans/:id/cancel',managers,async req=>tx(async c=>{
 await lock(c);const p=(await c.query('SELECT * FROM plans WHERE id=$1 FOR UPDATE',[id(req.params.id)])).rows[0];if(!p||!['DRAFT','APPROVED'].includes(p.status))fail('Rencana tidak dapat dibatalkan.',409);
 if((await c.query('SELECT id FROM purchase_orders WHERE plan_id=$1',[p.id])).rowCount)fail('Rencana sudah memiliki pesanan pembelian. Selesaikan tindak lanjutnya terlebih dahulu.');
 await c.query("UPDATE plans SET status='CANCELLED',updated_at=now() WHERE id=$1",[p.id]);await audit(c,req.actor.id,'CANCEL_PLAN','PLAN',p.id);return {message:'Rencana dibatalkan.'};
}));
post('/plans/:id/produce',stockRoles,async req=>tx(async c=>{
 await lock(c);const p=(await c.query('SELECT * FROM plans WHERE id=$1 FOR UPDATE',[id(req.params.id)])).rows[0];if(!p||p.status!=='APPROVED')fail('Rencana harus berstatus disetujui.',409);
 if(p.start_day>today())fail('Produksi belum memasuki tanggal mulai rencana.');const stock=await inventory(c);
 for(const r of p.materials){const m=stock.find(m=>m.id===r.materialId);if(!m||m.stock+1e-8<r.gross)fail('Stok belum cukup untuk '+r.name);}
 for(const r of p.materials)await c.query("INSERT INTO stock_moves(material_id,quantity,kind,reference,note,unit_cost,actor_id) VALUES($1,$2,'PRODUCTION',$3,$4,$5,$6)",[r.materialId,-r.gross,'PLAN-'+p.id,p.title,stock.find(m=>m.id===r.materialId).unit_cost,req.actor.id]);
 await c.query("UPDATE plans SET status='PRODUCED',produced_by=$1,updated_at=now() WHERE id=$2",[req.actor.id,p.id]);await audit(c,req.actor.id,'COMPLETE_PRODUCTION','PLAN',p.id);return {message:'Produksi dicatat dan stok bahan dikurangi sesuai rencana.'};
}));
read('/orders',async()=>({orders:(await pool.query('SELECT o.*,s.name supplier_name,p.title plan_title FROM purchase_orders o JOIN suppliers s ON s.id=o.supplier_id JOIN plans p ON p.id=o.plan_id ORDER BY o.id DESC')).rows,lines:(await pool.query('SELECT l.*,m.name,m.unit FROM purchase_lines l JOIN materials m ON m.id=l.material_id')).rows}));
post('/plans/:id/orders',buyRoles,async req=>tx(async c=>{
 await lock(c);const p=(await c.query('SELECT * FROM plans WHERE id=$1 FOR UPDATE',[id(req.params.id)])).rows[0];if(!p||p.status!=='APPROVED')fail('Rencana belum disetujui.',409);
 if((await c.query('SELECT id FROM purchase_orders WHERE plan_id=$1',[p.id])).rowCount)fail('Pesanan untuk rencana ini sudah dibuat.',409);
 // Use the approved recipe snapshot; master recipe edits must not change committed consumption.
 const assessment=assessSupply(await supplyContext(c),p.materials,p.id,p.start_day),needed=assessment.filter(r=>r.orderQty>0);
 if(!needed.length)fail(assessment.some(r=>r.shortByStart>0)?'Pembelian tambahan tidak diperlukan, tetapi bahan belum cukup pada tanggal produksi. Konfirmasi/percepat pesanan berjalan atau tinjau ulang jadwal; jangan menggandakan pesanan.':'Stok dan pesanan tepat waktu sudah mencukupi. Tidak perlu pembelian baru.');
 const ids=[];for(const supplierId of new Set(needed.map(r=>r.supplierId))){const lines=needed.filter(r=>r.supplierId===supplierId);const expected=shift(today(),Math.max(...lines.map(r=>r.leadDays)));const o=(await c.query('INSERT INTO purchase_orders(plan_id,supplier_id,expected_day,created_by) VALUES($1,$2,$3,$4) RETURNING id',[p.id,supplierId,expected,req.actor.id])).rows[0];
  for(const r of lines)await c.query('INSERT INTO purchase_lines(order_id,material_id,quantity,unit_cost) VALUES($1,$2,$3,$4)',[o.id,r.materialId,r.orderQty,r.unitCost]);ids.push(o.id);await audit(c,req.actor.id,'CREATE_PO','PURCHASE_ORDER',o.id);}
 return {message:ids.length+' pesanan pembelian dibuat.'+(assessment.some(r=>r.scheduleRisk)?' Perhatian: ada risiko bahan belum tersedia pada tanggal mulai. Konfirmasikan jadwal pemasok sebelum produksi.':''),ids};
}));
post('/orders/:id/receive',stockRoles,async req=>tx(async c=>{
 await lock(c);const o=(await c.query('SELECT * FROM purchase_orders WHERE id=$1 FOR UPDATE',[id(req.params.id)])).rows[0];if(!o||o.status!=='ORDERED')fail('Pesanan sudah diterima atau tidak ditemukan.',409);
 const lines=(await c.query('SELECT * FROM purchase_lines WHERE order_id=$1',[o.id])).rows;
 for(const r of lines)await c.query("INSERT INTO stock_moves(material_id,quantity,kind,reference,unit_cost,actor_id) VALUES($1,$2,'RECEIPT',$3,$4,$5)",[r.material_id,r.quantity,'PO-'+o.id,r.unit_cost,req.actor.id]);
 await c.query("UPDATE purchase_orders SET status='RECEIVED',received_at=now(),received_by=$1 WHERE id=$2",[req.actor.id,o.id]);await audit(c,req.actor.id,'RECEIVE_PO','PURCHASE_ORDER',o.id);return {message:'Seluruh bahan pada pesanan diterima dan stok bertambah.'};
}));
read('/dashboard',async()=>{
 const stock=await inventory(pool);return {lowStock:stock.filter(m=>m.stock<m.safety_stock),stockValue:stock.reduce((s,m)=>s+m.stock*m.unit_cost,0),materialCount:stock.length,productCount:Number((await pool.query('SELECT count(*) FROM products')).rows[0].count),planCounts:(await pool.query('SELECT status,count(*)::int count FROM plans GROUP BY status')).rows,orderCounts:(await pool.query('SELECT status,count(*)::int count FROM purchase_orders GROUP BY status')).rows,recent:(await pool.query('SELECT a.action,a.entity,a.created_at,u.name FROM audit a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 8')).rows};
});
read('/reports',async req=>tx(async c=>{
 await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
 const period=req.query.period||'month';if(!['day','week','month','year'].includes(period))fail('Periode laporan tidak valid.');
 const from=day(req.query.from||shift(today(),-90)),to=day(req.query.to||today());if(from>to)fail('Rentang laporan terbalik.');
 const demand=(await c.query("SELECT to_char(date_trunc($1,day),'YYYY-MM-DD') period,sum(quantity)::float8 quantity FROM demand WHERE day BETWEEN $2 AND $3 GROUP BY 1 ORDER BY 1",[period,from,to])).rows;
 const usage=(await c.query("SELECT m.name,m.unit,-sum(s.quantity)::float8 quantity,-sum(s.quantity*s.unit_cost)::float8 cost FROM stock_moves s JOIN materials m ON m.id=s.material_id WHERE s.kind='PRODUCTION' AND (s.created_at AT TIME ZONE 'Asia/Jakarta')::date BETWEEN $1 AND $2 GROUP BY m.id ORDER BY cost DESC,m.id",[from,to])).rows;
 const company=(await c.query('SELECT company_name,address,contact,demo_loaded FROM settings WHERE id=1')).rows[0];
 return {demand,usage,company,filters:{period,from,to},generatedAt:new Date().toISOString(),timeZone:'Asia/Jakarta',totals:{demand:demand.reduce((s,r)=>s+r.quantity,0),cost:usage.reduce((s,r)=>s+r.cost,0)}};
}));
app.get('/api/users',{preHandler:guard(admins)},async()=>({users:(await pool.query('SELECT id,name,username,email,role,active,created_at FROM users ORDER BY id')).rows}));
post('/users',admins,async req=>tx(async c=>{
 const b=req.body||{},role=txt(b.role,'Role');if(!roles.includes(role))fail('Role tidak valid.');if(req.actor.role==='ADMIN'&&['ADMIN','SUPER_ADMIN'].includes(role))fail('Administrator hanya dapat membuat akun operasional.',403);
 const email=txt(b.email,'Email').toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail('Format email tidak valid.');
 const username=normalizeUsername(b.username);
 const r=(await c.query('INSERT INTO users(name,username,email,password_hash,role) VALUES($1,$2,$3,$4,$5) RETURNING id',[txt(b.name,'Nama'),username,email,await bcrypt.hash(password(b.password),12),role])).rows[0];await audit(c,req.actor.id,'CREATE_USER','USER',r.id);return r;
}));
post('/users/:id/toggle',['SUPER_ADMIN'],async req=>tx(async c=>{
 const target=id(req.params.id);if(target===req.actor.id)fail('Akun sendiri tidak dapat dinonaktifkan.');const r=(await c.query('UPDATE users SET active=NOT active,session_version=session_version+1 WHERE id=$1 RETURNING id',[target])).rows[0];if(!r)fail('Akun tidak ditemukan.',404);await audit(c,req.actor.id,'TOGGLE_USER','USER',target);return {message:'Status akun diperbarui.'};
}));
read('/settings',async()=>({settings:(await pool.query('SELECT * FROM settings WHERE id=1')).rows[0]}));
post('/settings',admins,async req=>tx(async c=>{const b=req.body||{};await c.query('UPDATE settings SET company_name=$1,address=$2,contact=$3 WHERE id=1',[txt(b.companyName,'Nama usaha'),String(b.address||'').slice(0,500),String(b.contact||'').slice(0,200)]);await audit(c,req.actor.id,'UPDATE_SETTINGS','SETTINGS',1);return {message:'Identitas usaha disimpan.'};}));
app.get('/api/audit',{preHandler:guard(['SUPER_ADMIN'])},async()=>({rows:(await pool.query('SELECT a.*,u.name actor FROM audit a LEFT JOIN users u ON u.id=a.actor_id ORDER BY id DESC LIMIT 300')).rows}));
app.setNotFoundHandler((req,reply)=>reply.code(404).send({message:'Halaman atau layanan tidak ditemukan.'}));
app.setErrorHandler((error,req,reply)=>{let status=error.statusCode||500,message=error.message;
 if(status===429)message='Terlalu banyak permintaan. Tunggu sekitar satu menit lalu coba kembali. Sesi Anda tidak dihapus.';
 if(error.code==='23505'){status=409;message='Kode atau data tersebut sudah terdaftar.';}if(error.code==='23503'){status=400;message='Data rujukan tidak ditemukan atau masih digunakan.';}
 if(status>=500){req.log.error(error);message='Layanan sedang bermasalah. Silakan coba kembali.';}reply.code(status).send({message});});
await initialize();
if(!(await pool.query('SELECT id FROM users LIMIT 1')).rowCount){const pass=password(process.env.INITIAL_PASSWORD);await pool.query("INSERT INTO users(name,username,email,password_hash,role) VALUES('Aditya Pranata','aditya','aditya@bahanbaku.local',$1,'SUPER_ADMIN') ON CONFLICT(email) DO NOTHING",[await bcrypt.hash(pass,12)]);}
await app.listen({host:'0.0.0.0',port:3000});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await app.close();await pool.end();process.exit(0);});
