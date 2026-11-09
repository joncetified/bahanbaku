import {Component,OnInit,ChangeDetectorRef} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {HttpClient,HttpHeaders} from '@angular/common/http';
import {firstValueFrom} from 'rxjs';
import {formatQuantity} from './quantity';
import {formPayload} from './form-values';
type Item=Record<string,any>;
@Component({selector:'app-root',standalone:true,imports:[CommonModule,FormsModule],templateUrl:'./app.html'})
export class App implements OnInit{
 constructor(private http:HttpClient,private cdr:ChangeDetectorRef){}
 user:Item|null=null;token=sessionStorage.getItem('bahanbaku-session')||'';username='';password='';busy=false;error='';notice='';page='dashboard';mobile=false;
 settings:Item={company_name:'BahanBaku'};catalog:Item={materials:[],suppliers:[],products:[],bom:[]};dashboard:Item={};data:Item={};
 roles:Item={SUPER_ADMIN:'Super Admin',ADMIN:'Administrator',MANAGER:'Manajer Produksi',WAREHOUSE:'Petugas Gudang',PURCHASING:'Petugas Pembelian'};
 status:Item={DRAFT:'Draf',APPROVED:'Disetujui',PRODUCED:'Sudah diproduksi',CANCELLED:'Dibatalkan',ORDERED:'Dalam pengiriman',RECEIVED:'Sudah diterima'};
 pages=[{id:'dashboard',label:'Ikhtisar',icon:'01'},{id:'materials',label:'Bahan & pemasok',icon:'02'},{id:'products',label:'Produk & resep',icon:'03'},{id:'stock',label:'Stok gudang',icon:'04'},{id:'demand',label:'Riwayat permintaan',icon:'05'},{id:'forecasts',label:'Prediksi ML',icon:'06'},{id:'plans',label:'Rencana produksi',icon:'07'},{id:'orders',label:'Pembelian',icon:'08'},{id:'reports',label:'Laporan',icon:'09'},{id:'users',label:'Akun & akses',icon:'10'},{id:'settings',label:'Pengaturan',icon:'11'},{id:'audit',label:'Jejak aktivitas',icon:'12'}];
 descriptions:Item={dashboard:'Kendalikan persediaan hari ini. Siapkan produksi berikutnya.',materials:'Harga dan jumlah selalu menggunakan satuan dasar bahan.',products:'Tetapkan komposisi bahan untuk menghasilkan satu unit produk.',stock:'Setiap penerimaan, koreksi, dan pemakaian memiliki catatan.',demand:'Catat kebutuhan pelanggan per hari, termasuk nol saat tidak ada permintaan.',forecasts:'Pelajari pola historis, periksa kesalahan prediksi, lalu susun rencana.',plans:'Ubah target produk menjadi jumlah bahan dan estimasi pembelian.',orders:'Pesanan dikelompokkan berdasarkan pemasok. Gudang mengonfirmasi penerimaan.',reports:'Baca tren permintaan dan biaya bahan yang benar-benar digunakan.',users:'Akun internal dibuat sesuai pekerjaan dan tanggung jawabnya.',settings:'Identitas usaha yang ditampilkan di ruang kerja.',audit:'Catatan perubahan dan pelakunya.'};
 editor='';form:Item={};fields:Item[]=[];editorTitle='';
 selectedProduct=0;horizon=7;selectedForecast:Item|null=null;selectedPlan:Item|null=null;
 planForm:Item={title:'',startDay:this.today(),endDay:this.shift(this.today(),6)};planItems:Item[]=[];planProduct=0;planQuantity=1;
 period='month';reportFrom=this.shift(this.today(),-90);reportTo=this.today();chartMode='bar';
 report:Item|null=null;periodLabels:Item={day:'Harian',week:'Mingguan',month:'Bulanan',year:'Tahunan'};
 clearSession(){this.user=null;this.token='';this.password='';this.username='';sessionStorage.removeItem('bahanbaku-session');this.data={};this.report=null;this.dashboard={};this.catalog={materials:[],suppliers:[],products:[],bom:[]};this.settings={company_name:'BahanBaku'};this.selectedForecast=null;this.selectedPlan=null;this.selectedProduct=0;this.planItems=[];this.planProduct=0;this.planQuantity=1;this.planForm={title:'',startDay:this.today(),endDay:this.shift(this.today(),6)};this.editor='';this.form={};this.fields=[];this.mobile=false;this.notice='';this.page='dashboard';}
 private async api(path:string,body?:any){try{return await firstValueFrom(body===undefined?this.http.get<any>('/api'+path,{headers:new HttpHeaders({Authorization:'Bearer '+this.token})}):this.http.post<any>('/api'+path,body,{headers:new HttpHeaders({Authorization:'Bearer '+this.token})}));}catch(e:any){if(e.status===401)this.clearSession();throw Error(e.error?.message||'Layanan tidak dapat dihubungi.');}}
 async run(fn:()=>Promise<void>){if(this.busy)return;this.busy=true;this.error='';try{await fn();}catch(e:any){this.error=e.message;}finally{this.busy=false;this.cdr.markForCheck();}}
 ngOnInit(){if(this.token)void this.run(async()=>{this.user=(await this.api('/auth/me')).user;await this.refresh();});}
 login(){void this.run(async()=>{const r=await this.api('/auth/login',{username:this.username,password:this.password});this.user=r.user;this.token=r.token;sessionStorage.setItem('bahanbaku-session',r.token);this.password='';this.page='dashboard';await this.refresh();});}
 logout(){void this.run(async()=>{try{await this.api('/auth/logout',{});}finally{this.clearSession();}});}
 can(...roles:string[]){return !!this.user&&(this.user['role']==='SUPER_ADMIN'||roles.includes(this.user['role']));}
 visiblePage(id:string){return id==='audit'?this.can('SUPER_ADMIN'):['users','settings'].includes(id)?this.can('ADMIN'):true;}
 get title(){return this.pages.find(p=>p.id===this.page)?.label||'Halaman tidak ditemukan';}
 go(id:string){void this.run(async()=>{this.page=id;this.notice='';this.mobile=false;this.editor='';this.selectedPlan=null;await this.refresh();});}
 async refresh(){
  [this.catalog,{settings:this.settings}]=await Promise.all([this.api('/catalog'),this.api('/settings')]);
  if(this.page==='dashboard'){this.dashboard=await this.api('/dashboard');this.data={};}
  else if(['stock','demand','forecasts','plans','orders','users','audit'].includes(this.page))this.data=await this.api('/'+this.page);
  else if(this.page==='reports'){this.report=null;if(!this.reportFrom||!this.reportTo||this.reportFrom>this.reportTo)throw Error('Isi rentang tanggal laporan yang valid.');this.data=await this.api('/reports?'+new URLSearchParams({period:this.period,from:this.reportFrom,to:this.reportTo}));this.report=this.data;}
  else this.data={};
  if(this.selectedPlan&&this.page==='plans')this.selectedPlan=this.data['plans'].find((p:Item)=>p['id']===this.selectedPlan!['id'])||null;
 }
 update(){void this.run(()=>this.refresh());}
 get reportChanged(){const f=this.report?.['filters'];return !f||f.period!==this.period||f.from!==this.reportFrom||f.to!==this.reportTo;}
 get reportReady(){return !!this.report&&!this.reportChanged&&!this.busy;}
 reportTime(value:string){return new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',dateStyle:'medium',timeStyle:'short'}).format(new Date(value))+' WIB';}
 printReport(){if(this.reportReady)window.print();}
 exportReport(format:'pdf'|'xlsx'){if(!this.reportReady)return;const snapshot=structuredClone(this.report);void this.run(async()=>{const exporter=await import('./report-export');await exporter.downloadReport(snapshot as any,format);this.notice='Laporan '+format.toUpperCase()+' berhasil dibuat sesuai filter yang ditampilkan.';});}
 today(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
 shift(d:string,n:number){return new Date(Date.parse(d+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);}
 money(n:number){return new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(n||0);}
 moneyExact(n:number){return new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',minimumFractionDigits:2,maximumFractionDigits:2}).format(n||0);}
 qty(n:number,places=3){return formatQuantity(n,places);}
 opts(list:any[],label='name'){return list.map(v=>({value:v.id,label:v[label]}));}
 open(kind:string,item?:Item){
  this.editor=kind;this.error='';this.form={};this.fields=[];
  const f=(key:string,label:string,type='text',options?:any[],required=true)=>({key,label,type,options,required});
  if(kind==='supplier'){this.editorTitle='Pemasok baru';this.fields=[f('name','Nama pemasok'),f('contact','Kontak (opsional)','text',undefined,false),f('address','Alamat (opsional)','text',undefined,false)];}
  if(kind==='material'){this.editorTitle=item?'Edit bahan':'Bahan baku baru';this.form=item?{id:item['id'],code:item['code'],name:item['name'],unit:item['unit'],supplierId:item['supplier_id'],unitCost:item['unit_cost'],safetyStock:item['safety_stock'],packSize:item['pack_size'],leadDays:item['lead_days']}:{unit:'kg',unitCost:0,safetyStock:0,packSize:1,leadDays:2};this.fields=[f('code','Kode bahan'),f('name','Nama bahan'),f('unit','Satuan dasar (tetap)'),f('supplierId','Pemasok','select',this.opts(this.catalog['suppliers'])),f('unitCost','Harga per satuan (Rp)','number'),f('safetyStock','Stok pengaman','number'),f('packSize','Jumlah per kemasan pembelian','number'),f('leadDays','Waktu pasok (hari)','number')];}
  if(kind==='product'){this.editorTitle='Produk baru';this.form={unit:'pcs'};this.fields=[f('code','Kode produk'),f('name','Nama produk'),f('unit','Satuan produk')];}
  if(kind==='bom'){this.editorTitle='Komposisi untuk 1 unit produk';this.form={productId:item?.['id'],quantity:0.01,wastePct:0};this.fields=[f('productId','Produk','select',this.opts(this.catalog['products'])),f('materialId','Bahan','select',this.catalog['materials'].map((m:Item)=>({value:m['id'],label:m['name']+' ('+m['unit']+')'}))),f('quantity','Kebutuhan per unit produk','number'),f('wastePct','Tambahan susut (%)','number')];}
  if(kind==='stock'){this.editorTitle='Koreksi stok / stok opname';this.fields=[f('materialId','Bahan','select',this.opts(this.catalog['materials'])),f('quantity','Perubahan (+ tambah / − kurang)','number'),f('note','Alasan koreksi')];}
  if(kind==='demand'){this.editorTitle='Catat permintaan harian';this.form={day:this.shift(this.today(),-1),quantity:0};this.fields=[f('productId','Produk','select',this.opts(this.catalog['products'])),f('day','Tanggal (maksimal kemarin)','date'),f('quantity','Jumlah unit','number')];}
  if(kind==='user'){this.editorTitle='Akun pegawai baru';this.fields=[f('name','Nama lengkap'),f('username','Username (3–40 karakter)'),f('email','Email','email'),f('password','Password awal (minimal 12 karakter)','password'),f('role','Jabatan','select',Object.entries(this.roles).filter(([k])=>this.can('SUPER_ADMIN')||!['ADMIN','SUPER_ADMIN'].includes(k)).map(([value,label])=>({value,label})))];}
  if(kind==='password'){this.editorTitle='Ganti password';this.fields=[f('oldPassword','Password lama','password'),f('newPassword','Password baru (minimal 12 karakter)','password')];}
 }
 save(){void this.run(async()=>{
  const paths:Item={supplier:'/suppliers',material:'/materials',product:'/products',bom:'/bom',stock:'/stock',demand:'/demand',user:'/users',password:'/auth/password'};
  await this.api(paths[this.editor],formPayload(this.form,this.fields));const reset=this.editor==='password';this.editor='';this.form={};this.notice='Perubahan tersimpan.';
  if(reset){this.clearSession();this.notice='Password diganti. Silakan login kembali.';}else await this.refresh();
 });}
 action(path:string,message:string){if(!confirm(message))return;void this.run(async()=>{const r=await this.api(path,{});this.notice=r.message||'Berhasil disimpan.';await this.refresh();});}
 recipe(productId:number){return this.catalog['bom'].filter((r:Item)=>r['product_id']===productId).map((r:Item)=>({...r,material:this.catalog['materials'].find((m:Item)=>m['id']===r['material_id'])}));}
 removeRecipe(r:Item){if(!confirm('Hapus bahan ini dari resep untuk rencana baru?'))return;void this.run(async()=>{await this.api('/bom/remove',{productId:r['product_id'],materialId:r['material_id']});await this.refresh();});}
 train(){void this.run(async()=>{const r=await this.api('/forecasts',{productId:Number(this.selectedProduct),horizon:Number(this.horizon)});await this.refresh();this.selectedForecast=this.data['forecasts'].find((f:Item)=>f['id']===r.id);this.notice='Model dilatih dan hasil evaluasi disimpan.';});}
 useForecast(f:Item){this.planForm={title:'Rencana '+f['name'],startDay:f['result'].future[0].day,endDay:f['result'].future.at(-1).day};this.planItems=[{productId:f['product_id'],name:f['name'],quantity:f['result'].total,forecastId:f['id']}];this.go('plans');}
 addPlanItem(){const p=this.catalog['products'].find((p:Item)=>p['id']===Number(this.planProduct));if(!p||this.planQuantity<1||!Number.isInteger(this.planQuantity)){this.error='Pilih produk dan jumlah bulat minimal 1.';return;}if(this.planItems.some(p=>p['productId']===this.planProduct)){this.error='Produk sudah ada di rencana.';return;}this.planItems.push({productId:p.id,name:p.name,quantity:this.planQuantity});}
 createPlan(){void this.run(async()=>{const r=await this.api('/plans',{...this.planForm,items:this.planItems});this.planItems=[];await this.refresh();this.selectedPlan=this.data['plans'].find((p:Item)=>p['id']===r.id);this.notice='Draf dibuat. Tinjau kebutuhan bahan sebelum menyetujui.';});}
 get planCost(){return this.selectedPlan?.['materials'].reduce((s:number,m:Item)=>s+m['estimatedCost'],0)||0;}
 orderLines(id:number){return (this.data['lines']||[]).filter((l:Item)=>l['order_id']===id);}
 orderCost(id:number){return this.orderLines(id).reduce((s:number,l:Item)=>s+l['quantity']*l['unit_cost'],0);}
 saveSettings(){void this.run(async()=>{await this.api('/settings',{companyName:this.settings['company_name'],address:this.settings['address'],contact:this.settings['contact']});this.notice='Identitas usaha disimpan.';await this.refresh();});}
 csv(name:string,headers:string[],rows:any[][]){const escape=(v:any)=>'"'+String(typeof v==='string'&&/^[=+@-]/.test(v)?"'"+v:v??'').replaceAll('"','""')+'"';const blob=new Blob(['\uFEFF'+[headers,...rows].map(r=>r.map(escape).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name; a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
 exportDemand(){this.csv('riwayat-permintaan.csv',['kode','tanggal','jumlah'],this.data['rows'].map((r:Item)=>[r['code'],r['day'],r['quantity']]));}
 exportMaterials(){this.csv('persediaan-bahan.csv',['kode','nama','satuan','stok','stok_pengaman','harga'],this.catalog['materials'].map((m:Item)=>[m['code'],m['name'],m['unit'],m['stock'],m['safety_stock'],m['unit_cost']]));}
 exportPlan(){if(!this.selectedPlan)return;this.csv('kebutuhan-rencana-'+this.selectedPlan['id']+'.csv',['bahan','satuan','kebutuhan','stok_saat_dihitung','pesanan_berjalan','rekomendasi_beli','estimasi_biaya'],this.selectedPlan['materials'].map((m:Item)=>[m['name'],m['unit'],m['gross'],m['stock'],m['incoming'],m['orderQty'],m['estimatedCost']]));}
 importDemand(event:Event){const input=event.target as HTMLInputElement,file=input.files?.[0];if(!file)return;if(!confirm('Impor riwayat? Baris dengan kode dan tanggal yang sama akan diperbarui.')){input.value='';return;}
  void this.run(async()=>{if(file.size>1500000)throw Error('File maksimal 1,5 MB.');const text=(await file.text()).replace(/^\uFEFF/,'');const rows:string[][]=[];let row:string[]=[],cell='',quoted=false;
   for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(cell);cell='';}else if(c==='\n'&&!quoted){row.push(cell.replace(/\r$/,''));if(row.some(v=>v.trim()))rows.push(row);row=[];cell='';}else cell+=c;}
   if(quoted)throw Error('Tanda kutip CSV tidak lengkap.');if(cell||row.length){row.push(cell.replace(/\r$/,''));rows.push(row);}
   if(rows.shift()?.join(',')!=='kode,tanggal,jumlah')throw Error('Header CSV harus kode,tanggal,jumlah. Gunakan hasil ekspor sebagai contoh.');
   const data=rows.map(r=>{if(r.length!==3||r[2].trim()==='')throw Error('Baris CSV tidak lengkap.');return {code:r[0].trim(),day:r[1].trim(),quantity:Number(r[2])};});
   const result=await this.api('/demand/import',{rows:data});this.notice=result.message;await this.refresh();input.value='';});
 }
 barWidth(n:number,list:Item[],key:string){return Math.max(0,n/Math.max(1,...list.map(r=>r[key]))*100);}
 get predictionPoints(){const rows=this.selectedForecast?.['result'].future||[],max=Math.max(1,...rows.map((r:Item)=>r['quantity']));return rows.map((r:Item,i:number)=>(20+i*600/Math.max(1,rows.length-1))+','+(150-r['quantity']/max*120)).join(' ');}
 palette=['#1b5fa7','#df7c41','#3a9a8c','#9874b5','#c5a447','#7593ac','#ad5861','#7aab62'];
 get pie(){const rows=this.data['usage']||[],total=rows.reduce((s:number,r:Item)=>s+r['cost'],0);if(total<=0)return '#edf2f7';let current=0;return 'conic-gradient('+rows.map((r:Item,i:number)=>{const start=current;current+=total?r['cost']/total*100:0;return this.palette[i%8]+' '+start+'% '+current+'%';}).join(',')+')';}
}
