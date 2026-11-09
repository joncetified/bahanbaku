import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeUsername} from '../src/username.js';
test('normalizes case and surrounding whitespace',()=>{assert.equal(normalizeUsername(' ADITYA '),'aditya');assert.equal(normalizeUsername('nama.user_01-2'),'nama.user_01-2');});
test('rejects email, invalid names and missing values',()=>{for(const name of [undefined,null,42,{},'', 'ab','a'.repeat(41),'aditya@bahanbaku.local','nama user','.nama','nama/baru'])assert.throws(()=>normalizeUsername(name),{statusCode:400});});
test('accepts username length boundaries',()=>{assert.equal(normalizeUsername('abc'),'abc');assert.equal(normalizeUsername('a'.repeat(40)).length,40);});
