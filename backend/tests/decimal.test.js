import test from 'node:test';
import assert from 'node:assert/strict';
import {decimal} from '../src/decimal.js';
test('preserves valid recipe, stock and money precision',()=>{
 for(const [value,places] of [[.000001,6],[.0004,6],[.001,3],[-.125,3],[1.23,2],[999999999.99,2]])
  assert.equal(decimal(value,'Nilai',places,-1e9),value);
});
test('rejects silent rounding of stock, recipes and prices with a validation error',()=>{
 for(const [value,places] of [[.0004,3],[.0011,3],[-.0011,3],[.0000011,6],[100.001,2]])
  assert.throws(()=>decimal(value,'Nilai',places,-1e9),e=>e.statusCode===400&&e.message.includes('angka di belakang koma'));
});
test('enforces finite number and supported range',()=>{
 for(const value of [NaN,Infinity,-1,'1',null])assert.throws(()=>decimal(value,'Nilai',3),{statusCode:400});
 assert.throws(()=>decimal(0,'Kemasan',3,.001),{statusCode:400});
});
