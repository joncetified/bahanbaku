import test from 'node:test';
import assert from 'node:assert/strict';
import {historyReadiness} from '../src/history-readiness.js';
const asOf='2026-11-09';
test('empty history explains required data without inventing zero demand',()=>{
 const r=historyReadiness({count:0,first:null,last:null},asOf);
 assert.equal(r.ready,false);assert.equal(r.requiredThrough,'2026-11-08');assert.equal(r.missingDays,null);
});
test('complete chronological history is ready including zero-demand recorded days',()=>{
 const r=historyReadiness({count:70,first:'2026-08-31',last:'2026-11-08'},asOf);
 assert.equal(r.ready,true);assert.equal(r.missingDays,0);
});
test('stale history shows precise missing trailing range',()=>{
 const r=historyReadiness({count:120,first:'2026-06-14',last:'2026-10-11'},asOf);
 assert.equal(r.ready,false);assert.equal(r.missingDays,28);assert.match(r.message,/2026-10-12 sampai 2026-11-08/);
});
test('internal missing dates and insufficient history are not ready',()=>{
 assert.equal(historyReadiness({count:69,first:'2026-08-31',last:'2026-11-08'},asOf).missingDays,1);
 assert.equal(historyReadiness({count:10,first:'2026-10-30',last:'2026-11-08'},asOf).ready,false);
});
