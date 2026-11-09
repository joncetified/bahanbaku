// Reject extra precision instead of letting PostgreSQL silently round business input.
export function decimal(value,name,places,min=0,max=1e9){
 if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)
  throw Object.assign(Error(name+' tidak valid.'),{statusCode:400});
 const scaled=value*10**places;
 const tolerance=Math.min(0.0001,Number.EPSILON*Math.max(1,Math.abs(scaled))*4);
 if(Math.abs(scaled-Math.round(scaled))>tolerance)
  throw Object.assign(Error(name+' maksimal '+places+' angka di belakang koma.'),{statusCode:400});
 return value;
}
