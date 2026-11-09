import {today,shift} from './forecast.js';
export const roundUp=n=>Math.ceil((n-1e-9)*1000)/1000||0;
export async function inventory(c){return (await c.query(`SELECT m.*,s.name supplier_name,COALESCE((SELECT sum(quantity) FROM stock_moves WHERE material_id=m.id),0)::float8 stock,
 COALESCE((SELECT sum(l.quantity) FROM purchase_lines l JOIN purchase_orders o ON o.id=l.order_id WHERE l.material_id=m.id AND o.status='ORDERED'),0)::float8 incoming
 FROM materials m JOIN suppliers s ON s.id=m.supplier_id ORDER BY m.code`)).rows;}
export async function supplyContext(c){return {
 stock:await inventory(c),
 commitments:(await c.query("SELECT id,materials FROM plans WHERE status='APPROVED'")).rows,
 orders:(await c.query("SELECT l.material_id,l.quantity,o.expected_day FROM purchase_lines l JOIN purchase_orders o ON o.id=l.order_id WHERE o.status='ORDERED'")).rows
};}
export function assessSupply(context,materials,excludePlan,needBy,asOf=today()){
 const reserved=context.commitments.filter(p=>p.id!==excludePlan).flatMap(p=>p.materials);
 const result=materials.map(r=>{
  const m=context.stock.find(m=>m.id===r.materialId);
  if(!m?.active)throw Object.assign(Error('Resep memakai bahan yang tidak aktif atau tidak ditemukan.'),{statusCode:400});
  const committed=roundUp(reserved.filter(x=>x.materialId===m.id).reduce((s,x)=>s+x.gross,0));
  const orders=context.orders.filter(o=>o.material_id===m.id);
  const incoming=roundUp(orders.reduce((s,o)=>s+o.quantity,0));
  const onTimeIncoming=roundUp(orders.filter(o=>o.expected_day>=asOf&&o.expected_day<=needBy).reduce((s,o)=>s+o.quantity,0));
  const gross=roundUp(r.gross),shortByStart=roundUp(Math.max(0,gross+committed+m.safety_stock-m.stock-onTimeIncoming));
  // Existing late orders must be expedited/rescheduled, not silently duplicated.
  const shortage=roundUp(Math.max(0,gross+committed+m.safety_stock-m.stock-incoming));
  const orderQty=roundUp(Math.ceil(Math.max(0,shortage-1e-9)/m.pack_size)*m.pack_size);
  return {materialId:m.id,name:m.name,unit:m.unit,supplierId:m.supplier_id,supplierName:m.supplier_name,gross,reserved:committed,stock:m.stock,incoming,onTimeIncoming,lateIncoming:roundUp(incoming-onTimeIncoming),shortByStart,needBy,checkedOn:asOf,safetyStock:m.safety_stock,orderQty,unitCost:m.unit_cost,estimatedCost:Math.round(orderQty*m.unit_cost*100)/100,leadDays:m.lead_days};
 });
 return result.map(r=>{
  const group=result.filter(x=>x.supplierId===r.supplierId&&x.orderQty>0);
  const expectedNewDelivery=r.orderQty>0?shift(asOf,Math.max(...group.map(x=>x.leadDays))):null;
  const scheduleRisk=r.shortByStart>0&&(r.lateIncoming>0||!!expectedNewDelivery&&expectedNewDelivery>needBy);
  return {...r,expectedNewDelivery,scheduleRisk};
 });
}
export async function requirements(c,items,excludePlan=0,needBy=today()){
 const products=(await c.query('SELECT * FROM products WHERE active')).rows;
 const recipe=(await c.query('SELECT * FROM bom')).rows;
 const totals=new Map();
 for(const item of items){
  if(!products.some(p=>p.id===item.productId))throw Object.assign(Error('Produk tidak aktif atau tidak ditemukan.'),{statusCode:400});
  const lines=recipe.filter(r=>r.product_id===item.productId);
  if(!lines.length)throw Object.assign(Error('Resep produk belum lengkap.'),{statusCode:400});
  for(const r of lines)totals.set(r.material_id,(totals.get(r.material_id)||0)+item.quantity*r.quantity*(1+r.waste_pct/100));
 }
 return assessSupply(await supplyContext(c),[...totals].map(([materialId,gross])=>({materialId,gross})),excludePlan,needBy);
}
