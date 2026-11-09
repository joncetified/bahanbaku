import bcrypt from 'bcryptjs';
import {pool,initialize,tx,audit} from './db.js';
import {today,shift} from './forecast.js';
await initialize();
try{await tx(async c=>{
 await c.query('SELECT pg_advisory_xact_lock(7314400)');
 if((await c.query('SELECT demo_loaded FROM settings WHERE id=1')).rows[0].demo_loaded){console.log('Data simulasi sudah pernah dimuat; tidak ada perubahan.');return;}
 if((await c.query('SELECT id FROM materials LIMIT 1')).rowCount)throw Error('Database sudah berisi bahan. Impor simulasi dibatalkan agar data tidak tercampur.');
 if(!process.env.INITIAL_PASSWORD||process.env.INITIAL_PASSWORD.length<12)throw Error('INITIAL_PASSWORD belum diisi.');
 const hash=await bcrypt.hash(process.env.INITIAL_PASSWORD,12);
 const accounts=[['Aditya Pranata','aditya@bahanbaku.local','SUPER_ADMIN'],['Nadia Putri','nadia@bahanbaku.local','ADMIN'],['Rizky Saputra','rizky@bahanbaku.local','MANAGER'],['Dewi Anggraini','dewi@bahanbaku.local','WAREHOUSE'],['Fajar Hidayat','fajar@bahanbaku.local','PURCHASING']];
 for(const [name,email,role] of accounts)await c.query('INSERT INTO users(name,username,email,password_hash,role) VALUES($1,$2,$3,$4,$5) ON CONFLICT(email) DO NOTHING',[name,email.split('@')[0],email,hash,role]);
 const actor=(await c.query("SELECT id FROM users WHERE email='aditya@bahanbaku.local'")).rows[0].id;
 const suppliers=[];
 for(const [name,contact,address] of [['Toko Bahan Pangan Batam (Simulasi)','Kontak contoh','Batam Kota'],['Distribusi Susu Nusantara (Simulasi)','Kontak contoh','Batu Aji'],['Kemasan Sejahtera (Simulasi)','Kontak contoh','Bengkong']])suppliers.push((await c.query('INSERT INTO suppliers(name,contact,address) VALUES($1,$2,$3) RETURNING id',[name,contact,address])).rows[0].id);
 const raw=[['BB-001','Tepung terigu','kg',0,14000,20,25,2,70],['BB-002','Gula pasir','kg',0,17000,8,10,2,20],['BB-003','Margarin','kg',0,29000,5,5,2,15],['BB-004','Susu bubuk','kg',1,65000,3,1,3,8],['BB-005','Ragi instan','kg',0,90000,1,0.5,2,2],['BB-006','Cokelat isi','kg',0,48000,3,5,2,10],['BB-007','Keju','kg',1,85000,3,2,3,8],['BB-008','Kemasan roti','pcs',2,450,150,100,1,450]];
 const materials=[];
 for(const [code,name,unit,supplier,cost,safety,pack,lead,opening] of raw){const m=(await c.query('INSERT INTO materials(code,name,unit,supplier_id,unit_cost,safety_stock,pack_size,lead_days) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',[code,name,unit,suppliers[supplier],cost,safety,pack,lead])).rows[0];materials.push(m.id);
  await c.query("INSERT INTO stock_moves(material_id,quantity,kind,reference,note,unit_cost,actor_id) VALUES($1,$2,'OPENING','SIMULASI-AWAL','Saldo awal simulasi UMKM roti; bukan stok usaha nyata.',$3,$4)",[m.id,opening,cost,actor]);}
 const products=[];
 for(const [code,name] of [['PR-001','Roti Cokelat'],['PR-002','Roti Keju'],['PR-003','Roti Susu']])products.push((await c.query('INSERT INTO products(code,name) VALUES($1,$2) RETURNING id',[code,name])).rows[0].id);
 for(let p=0;p<products.length;p++)for(const [m,q] of [[0,.08],[1,.015],[2,.012],[3,.008],[4,.001],[7,1],...(p===0?[[5,.02]]:p===1?[[6,.018]]:[])])await c.query('INSERT INTO bom(product_id,material_id,quantity,waste_pct) VALUES($1,$2,$3,$4)',[products[p],materials[m],q,m===7?0:2]);
 let random=773;const noise=()=>{random=(random*1664525+1013904223)>>>0;return random/4294967296;};
 for(let p=0;p<products.length;p++)for(let i=0;i<120;i++){
  const date=shift(today(),i-120),weekday=new Date(date+'T00:00:00Z').getUTCDay();
  const quantity=Math.max(0,Math.round(70+p*20+i*.25+(weekday===0||weekday===6?35:0)+(noise()-.5)*16));
  await c.query("INSERT INTO demand(product_id,day,quantity,source,created_by) VALUES($1,$2,$3,'SIMULASI',$4)",[products[p],date,quantity,actor]);}
 await c.query("UPDATE settings SET company_name='Dapur Roti Batam',address='Batam, Kepulauan Riau (alamat simulasi)',contact='Data demonstrasi',demo_loaded=TRUE WHERE id=1");
 await audit(c,actor,'IMPORT_DEMO','DATABASE','initial',{products:3,materials:8,dailyRecords:360});
 console.log('Tersimpan di PostgreSQL: 5 akun, 3 pemasok, 8 bahan, 3 produk, resep, dan 360 riwayat harian simulasi.');
});}finally{await pool.end();}
