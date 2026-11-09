import test from 'node:test';
import assert from 'node:assert/strict';
import {formPayload} from '../src/form-values.ts';
const fields=[{key:'quantity',type:'number',label:'Jumlah'},{key:'note',type:'text',label:'Catatan'}];
test('converts dynamic numeric inputs without changing text or original form',()=>{
 const form={quantity:'0.0004',note:'10',materialId:1};
 assert.deepEqual(formPayload(form,fields),{quantity:.0004,note:'10',materialId:1});
 assert.equal(form.quantity,'0.0004');
});
test('preserves zero and negative stock adjustments',()=>{
 assert.equal(formPayload({quantity:'0'},fields).quantity,0);
 assert.equal(formPayload({quantity:'-0.125'},fields).quantity,-.125);
});
test('empty numeric fields are not silently converted to zero',()=>{
 for(const quantity of ['',null,undefined,' '])assert.throws(()=>formPayload({quantity},fields),/wajib/);
});
