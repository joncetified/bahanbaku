import test from 'node:test';
import assert from 'node:assert/strict';
import {buildForecast,shift} from '../src/forecast.js';
const asOf='2026-10-12';
const series=Array.from({length:120},(_,i)=>({day:shift(asOf,i-120),quantity:Math.round(90+i*.5+((i%7)>4?30:0))}));
test('learns model from history and evaluates on a chronological recursive holdout',()=>{
 const r=buildForecast(series,14,asOf);
 assert.equal(r.future.length,14);assert.equal(r.future[0].day,asOf);
 assert.equal(r.evaluation.trainThrough,series.at(-15).day);assert.equal(r.evaluation.rows.length,14);
 assert.ok(r.model.weights.every(Number.isFinite));assert.ok(Number.isFinite(r.evaluation.mae));
 assert.ok(r.future.every(v=>v.quantity>=0&&Number.isInteger(v.quantity)));
 assert.equal(r.total,r.future.reduce((s,v)=>s+v.quantity,0));
});
test('holdout actual values do not leak into holdout predictions',()=>{
 const altered=series.map((r,i)=>({...r,quantity:i>=106?r.quantity+10000:r.quantity}));
 const original=buildForecast(series,7,asOf),changed=buildForecast(altered,7,asOf);
 assert.deepEqual(original.evaluation.rows.map(r=>r.predicted),changed.evaluation.rows.map(r=>r.predicted));
 assert.notEqual(original.total,changed.total);
});
test('rejects missing dates, stale history and insufficient observations',()=>{
 assert.throws(()=>buildForecast(series.slice(30,90),7,asOf),/70 hari/);
 assert.throws(()=>buildForecast(series.filter((_,i)=>i!==35),7,asOf),/tanggal/);
 assert.throws(()=>buildForecast(series.slice(0,-1),7,asOf),/kemarin/);
});
test('all zero demand has valid zero forecast and undefined percentage error',()=>{
 const r=buildForecast(series.map(r=>({...r,quantity:0})),7,asOf);
 assert.equal(r.total,0);assert.equal(r.evaluation.wape,null);
});
