import test from 'node:test';
import assert from 'node:assert/strict';
import {assessSupply,roundUp} from '../src/planning.js';
const date='2026-10-20',due='2026-10-22';
const material={id:1,name:'Terigu',unit:'kg',supplier_id:1,supplier_name:'Pemasok',active:true,stock:10,safety_stock:5,pack_size:5,unit_cost:10000,lead_days:2};
const context=(orders=[],commitments=[])=>({stock:[material],orders,commitments});
const assess=(c,start=due)=>assessSupply(c,[{materialId:1,gross:20}],1,start,date)[0];
test('purchase estimates preserve currency precision',()=>{
 const c=context();c.stock=[{...material,stock:0,safety_stock:0,pack_size:1,unit_cost:1.23}];
 const r=assessSupply(c,[{materialId:1,gross:.04}],0,due,date)[0];
 assert.equal(r.orderQty,1);assert.equal(r.estimatedCost,1.23);
});
test('late and overdue incoming stock does not hide shortage on production date',()=>{
 for(const expected_day of ['2026-10-23','2026-10-19']){
  const r=assess(context([{material_id:1,quantity:15,expected_day}]));
  assert.equal(r.onTimeIncoming,0);assert.equal(r.shortByStart,15);assert.equal(r.lateIncoming,15);assert.equal(r.orderQty,0);assert.equal(r.scheduleRisk,true);
 }
});
test('receipt expected on start date is eligible and new purchases are not duplicated',()=>{
 const r=assess(context([{material_id:1,quantity:15,expected_day:due}]));assert.equal(r.shortByStart,0);assert.equal(r.onTimeIncoming,15);assert.equal(r.orderQty,0);assert.equal(r.scheduleRisk,false);
});
test('pack rounding, other reservations and excluding own reservation',()=>{
 const r=assess(context([],[{id:1,materials:[{materialId:1,gross:200}]},{id:2,materials:[{materialId:1,gross:1.01}]}]));
 assert.equal(r.reserved,1.01);assert.equal(r.shortByStart,16.01);assert.equal(r.orderQty,20);assert.equal(r.estimatedCost,200000);assert.equal(roundUp(1.00000000001),1);
});
test('new purchase cannot be portrayed as available earlier than supplier lead time',()=>{
 const r=assess(context(),date);assert.equal(r.expectedNewDelivery,due);assert.equal(r.scheduleRisk,true);
});
test('supplier consolidated delivery uses longest lead time',()=>{
 const c=context();c.stock.push({...material,id:2,lead_days:5});const rows=assessSupply(c,[{materialId:1,gross:20},{materialId:2,gross:20}],1,due,date);
 assert.ok(rows.every(r=>r.expectedNewDelivery==='2026-10-25'&&r.scheduleRisk));
});
test('covered stock needs neither purchasing nor schedule warnings',()=>{
 const c=context();c.stock=[{...material,stock:100}];const r=assess(c);assert.equal(r.shortByStart,0);assert.equal(r.orderQty,0);assert.equal(r.scheduleRisk,false);
});
