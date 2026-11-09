export interface ReportSnapshot {
 company:{company_name:string;address:string;contact:string;demo_loaded:boolean};
 filters:{period:string;from:string;to:string};generatedAt:string;timeZone:string;
 demand:{period:string;quantity:number}[];
 usage:{name:string;unit:string;quantity:number;cost:number}[];
 totals:{demand:number;cost:number};
}
const periods:Record<string,string>={day:'Harian',week:'Mingguan',month:'Bulanan',year:'Tahunan'};
const quantity=(n:number)=>new Intl.NumberFormat('id-ID',{maximumFractionDigits:3}).format(n);
const rupiah=(n:number)=>'Rp '+new Intl.NumberFormat('id-ID',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n);
const time=(r:ReportSnapshot)=>new Intl.DateTimeFormat('id-ID',{timeZone:r.timeZone,dateStyle:'medium',timeStyle:'short'}).format(new Date(r.generatedAt))+' WIB';
const filename=(r:ReportSnapshot)=>`laporan-bahanbaku-${r.filters.from}-${r.filters.to}-${r.filters.period}`;
function save(blob:Blob,name:string){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}

export async function downloadReport(r:ReportSnapshot,format:'pdf'|'xlsx'){
 if(format==='xlsx'){
  const excelModule=await import('exceljs');
  const ExcelJS=(excelModule as unknown as {default?:typeof excelModule}).default||excelModule;
  const workbook=new ExcelJS.Workbook();workbook.creator='BahanBaku';workbook.created=new Date(r.generatedAt);
  const summary=workbook.addWorksheet('Ringkasan');summary.columns=[{width:28},{width:75}];
  summary.addRows([
   ['LAPORAN PERMINTAAN DAN PEMAKAIAN BAHAN'],['Usaha',r.company.company_name],['Alamat',r.company.address||'-'],['Kontak',r.company.contact||'-'],
   ['Dari (inklusif)',r.filters.from],['Sampai (inklusif)',r.filters.to],['Ringkasan',periods[r.filters.period]],['Dibuat',time(r)],['Zona waktu',r.timeZone],
   ['Sumber',r.company.demo_loaded?'Database PostgreSQL - memuat data simulasi':'Database PostgreSQL'],['Jumlah permintaan',r.totals.demand],['Total biaya bahan (Rp)',r.totals.cost],
   ['Catatan','Biaya pemakaian adalah biaya bahan produksi selesai, bukan pendapatan atau laba.'],['Pengelompokan','Tanggal periode adalah awal kelompok; hanya data dalam rentang dipilih yang dihitung.'],['Satuan','Jumlah pemakaian bahan tidak dijumlahkan antar satuan berbeda.']
  ]);summary.mergeCells('A1:B1');summary.getCell('B12').numFmt='"Rp" #,##0.00';
  const demand=workbook.addWorksheet('Permintaan');demand.columns=[{width:24},{width:26}];demand.addRow(['Awal periode','Jumlah unit produk']);
  for(const row of r.demand)demand.addRow([row.period,row.quantity]);
  if(!r.demand.length)demand.addRow(['Tidak ada data',null]);
  const demandTotal=demand.addRow(['TOTAL',r.totals.demand]);demandTotal.font={bold:true};demand.getColumn(2).numFmt='#,##0';
  const usage=workbook.addWorksheet('Pemakaian Bahan');usage.columns=[{width:40},{width:16},{width:23},{width:28}];usage.addRow(['Bahan','Satuan','Jumlah pemakaian','Biaya (Rp)']);
  for(const row of r.usage)usage.addRow([row.name,row.unit,row.quantity,row.cost]);
  if(!r.usage.length)usage.addRow(['Tidak ada data',null,null,null]);
  const costTotal=usage.addRow(['TOTAL BIAYA',null,null,r.totals.cost]);costTotal.font={bold:true};usage.getColumn(3).numFmt='#,##0.000';usage.getColumn(4).numFmt='"Rp" #,##0.00';
  for(const sheet of workbook.worksheets){
   sheet.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'},size:12};sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF183B59'}};sheet.getRow(1).height=32;
   sheet.eachRow(row=>{row.eachCell(cell=>{cell.alignment={vertical:'middle',wrapText:true};});});
   sheet.views=[{state:'frozen',ySplit:1}];sheet.pageSetup={paperSize:9,orientation:'portrait',fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'1:1'};
   sheet.headerFooter.oddFooter='BahanBaku | &P / &N';
  }
  if(r.demand.length)demand.autoFilter={from:'A1',to:`B${r.demand.length+1}`};
  if(r.usage.length)usage.autoFilter={from:'A1',to:`D${r.usage.length+1}`};
  const buffer=await workbook.xlsx.writeBuffer();
  save(new Blob([new Uint8Array(buffer as ArrayBuffer)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),filename(r)+'.xlsx');
  return;
 }
 const [{jsPDF},{autoTable}]=await Promise.all([import('jspdf'),import('jspdf-autotable')]);
 const doc=new jsPDF({unit:'mm',format:'a4'});doc.setProperties({title:'Laporan BahanBaku',author:r.company.company_name});
 let y=18;
 const paragraph=(text:string,size=10,bold=false)=>{doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(size);const lines=doc.splitTextToSize(text,180);for(const line of lines){if(y>273){doc.addPage();y=18;}doc.text(line,15,y);y+=size*.45;}y+=3;};
 paragraph('LAPORAN PERMINTAAN DAN PEMAKAIAN BAHAN',14,true);
 paragraph(r.company.company_name,12,true);if(r.company.address)paragraph(r.company.address);if(r.company.contact)paragraph('Kontak: '+r.company.contact);
 paragraph(`${r.filters.from} sampai ${r.filters.to} (inklusif) | ${periods[r.filters.period]}`);
 paragraph('Dibuat: '+time(r));if(r.company.demo_loaded)paragraph('DATA SIMULASI - untuk pembelajaran, bukan transaksi usaha nyata.',9);
 paragraph('Total permintaan: '+quantity(r.totals.demand)+' | Biaya bahan: '+rupiah(r.totals.cost),10,true);
 const table=(head:string[],body:(string|number)[][])=>{autoTable(doc,{startY:y,head:[head],body,margin:{top:18,bottom:18,left:15,right:15},styles:{fontSize:9,cellPadding:3,overflow:'linebreak'},headStyles:{fillColor:[24,59,89]},rowPageBreak:'avoid',showHead:'everyPage'});y=(doc as any).lastAutoTable.finalY+10;};
 paragraph('1. Permintaan produk',11,true);
 table(['Awal periode','Jumlah unit produk'],[...r.demand.map(row=>[row.period,quantity(row.quantity)]),...(!r.demand.length?[['Tidak ada data','-']]:[]),['TOTAL',quantity(r.totals.demand)]]);
 paragraph('2. Pemakaian bahan produksi selesai',11,true);
 table(['Bahan','Satuan','Jumlah','Biaya (Rp)'],[...r.usage.map(row=>[row.name,row.unit,quantity(row.quantity),rupiah(row.cost)]),...(!r.usage.length?[['Tidak ada data','-','-','-']]:[]),['TOTAL BIAYA','','',rupiah(r.totals.cost)]]);
 paragraph('Catatan: biaya bahan bukan pendapatan atau laba. Jumlah bahan tidak dijumlahkan antar satuan berbeda. Tanggal periode adalah awal kelompok; hanya data dalam rentang dipilih yang dihitung.',9);
 const count=doc.getNumberOfPages();for(let p=1;p<=count;p++){doc.setPage(p);doc.setFont('helvetica','normal');doc.setFontSize(8);doc.text(`BahanBaku | ${r.filters.from} - ${r.filters.to}`,15,288);doc.text(`Halaman ${p} / ${count}`,195,288,{align:'right'});}
 save(doc.output('blob'),filename(r)+'.pdf');
}
