export function formatQuantity(value:number,places=3):string{
 return new Intl.NumberFormat('id-ID',{maximumFractionDigits:places}).format(value||0);
}
