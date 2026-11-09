import test from 'node:test';
import assert from 'node:assert/strict';
import {formatQuantity} from '../src/quantity.ts';
test('recipe quantities retain all six stored decimal places',()=>{
 assert.equal(formatQuantity(.0004,6),'0,0004');
 assert.equal(formatQuantity(.000001,6),'0,000001');
 assert.equal(formatQuantity(.012345,6),'0,012345');
});
test('stock quantities retain the existing three-decimal formatting',()=>{
 assert.equal(formatQuantity(1234.125),'1.234,125');
 assert.equal(formatQuantity(0),'0');
});
