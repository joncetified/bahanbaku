const shift=(date,days)=>new Date(Date.parse(date+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);
export function historyReadiness(summary,asOf){
 const count=Number(summary.count),first=summary.first,last=summary.last,requiredThrough=shift(asOf,-1);
 if(!count||!first||!last)return {...summary,count,requiredThrough,missingDays:null,ready:false,message:'Belum ada riwayat. Catat minimal 70 hari berurutan sampai '+requiredThrough+'.'};
 const days=(a,b)=>Math.round((Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/86400000)+1;
 const gaps=Math.max(0,days(first,last)-count),trailing=Math.max(0,days(last,requiredThrough)-1);
 const missingDays=gaps+trailing,ready=count>=70&&last===requiredThrough&&missingDays===0;
 const reasons=[];
 if(count<70)reasons.push('Baru '+count+' hari; diperlukan minimal 70 hari.');
 if(gaps)reasons.push(gaps+' tanggal belum dicatat di antara '+first+' dan '+last+'.');
 if(trailing)reasons.push('Lengkapi '+shift(last,1)+' sampai '+requiredThrough+' ('+trailing+' hari).');
 if(last>requiredThrough)reasons.push('Riwayat hanya boleh sampai kemarin.');
 return {...summary,count,requiredThrough,missingDays,ready,message:ready?'Riwayat lengkap dan siap dilatih sampai '+requiredThrough+'.':reasons.join(' ')+' Isi nol hanya jika memang tidak ada permintaan.'};
}
