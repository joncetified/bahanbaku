import {Matrix,solve} from 'ml-matrix';

export const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const shift=(day,n)=>new Date(Date.parse(day+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
const avg=a=>a.reduce((x,y)=>x+y,0)/a.length;
function features(values,i,date){
 const weekday=new Date(date+'T00:00:00Z').getUTCDay();
 return [i,values[i-1],values[i-7],values[i-14],avg(values.slice(i-7,i)),...Array.from({length:6},(_,d)=>weekday===d?1:0)];
}
function fit(values,dates){
 const rows=values.slice(14).map((_,j)=>features(values,j+14,dates[j+14]));
 const means=rows[0].map((_,k)=>avg(rows.map(r=>r[k])));
 const scales=means.map((m,k)=>Math.sqrt(avg(rows.map(r=>(r[k]-m)**2)))||1);
 const X=new Matrix(rows.map(r=>[1,...r.map((v,k)=>(v-means[k])/scales[k])]));
 const Y=Matrix.columnVector(values.slice(14));
 const gram=X.transpose().mmul(X);
 for(let j=1;j<gram.rows;j++)gram.set(j,j,gram.get(j,j)+1);
 const weights=solve(gram,X.transpose().mmul(Y),true).to1DArray();
 return {weights,means,scales,alpha:1};
}
function predict(model,values,dates,horizon){
 const v=[...values],start=shift(dates.at(-1),1),result=[];
 for(let d=0;d<horizon;d++){
  const day=shift(start,d),r=features(v,v.length,day);
  const y=model.weights[0]+r.reduce((s,x,k)=>s+((x-model.means[k])/model.scales[k])*model.weights[k+1],0);
  if(!Number.isFinite(y))throw Error('Model menghasilkan prediksi tidak valid.');
  const quantity=Math.max(0,Math.round(y));v.push(quantity);result.push({day,quantity});
 }return result;
}
export function buildForecast(history,horizon,asOf=today()){
 if(![7,14,30].includes(horizon))throw Error('Horizon harus 7, 14, atau 30 hari.');
 if(history.length<70)throw Error('Diperlukan minimal 70 hari berurutan, termasuk hari tanpa penjualan bernilai 0.');
 for(let i=0;i<history.length;i++){
  if(history[i].day>=asOf)throw Error('Data latihan harus berakhir sebelum hari ini.');
  if(i&&shift(history[i-1].day,1)!==history[i].day)throw Error('Ada tanggal yang belum dicatat. Lengkapi data harian; jangan menganggap tanggal kosong sebagai nol.');
  if(!Number.isInteger(history[i].quantity)||history[i].quantity<0)throw Error('Jumlah historis tidak valid.');
 }
 if(history.at(-1).day!==shift(asOf,-1))throw Error('Riwayat terakhir '+history.at(-1).day+'. Lengkapi data '+shift(history.at(-1).day,1)+' sampai '+shift(asOf,-1)+' (kemarin) sebelum melatih model; jangan isi nol kecuali memang tidak ada permintaan.');
 const values=history.map(r=>r.quantity),dates=history.map(r=>r.day),split=values.length-14;
 const evaluationModel=fit(values.slice(0,split),dates.slice(0,split));
 const predicted=predict(evaluationModel,values.slice(0,split),dates.slice(0,split),14);
 const baselineValues=values.slice(0,split),baseline=[];
 for(let i=0;i<14;i++){const n=baselineValues.at(-7);baselineValues.push(n);baseline.push(n);}
 const actual=values.slice(split),mae=avg(actual.map((n,i)=>Math.abs(n-predicted[i].quantity)));
 const baselineMae=avg(actual.map((n,i)=>Math.abs(n-baseline[i])));
 const denominator=actual.reduce((s,v)=>s+v,0);
 const wape=denominator?actual.reduce((s,v,i)=>s+Math.abs(v-predicted[i].quantity),0)/denominator*100:null;
 const model=fit(values,dates),future=predict(model,values,dates,horizon);
 return {algorithm:'Ridge regression',version:1,horizon,trainingDays:history.length,trainedThrough:dates.at(-1),model,
  evaluation:{method:'14 hari terakhir, prediksi rekursif tanpa membaca nilai aktual holdout',trainThrough:dates[split-1],mae,baselineMae,wape,betterThanBaseline:mae<baselineMae,rows:actual.map((v,i)=>({day:dates[split+i],actual:v,predicted:predicted[i].quantity,baseline:baseline[i]}))},
  history:history.slice(-30),future,total:future.reduce((s,r)=>s+r.quantity,0),
  warning:mae>=baselineMae?'Model belum mengungguli pola mingguan. Tinjau hasil sebelum menyetujui produksi.':null};
}
