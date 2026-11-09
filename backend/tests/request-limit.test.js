import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import {requestLimitKey,ipLimitKey} from '../src/request-limit.js';
test('normal requests from two authenticated staff have separate quotas behind one proxy',async()=>{
 const app=Fastify();
 try{
  await app.register(jwt,{secret:'isolated-unit-test-secret-at-least-32-characters'});
  await app.register(rateLimit,{max:300,timeWindow:'1 minute',keyGenerator:requestLimitKey});
  app.get('/read',async()=>({ok:true}));
  await app.ready();
  for(const id of [1,2]){
   const token=app.jwt.sign({id,version:0});
   for(const remaining of [299,298]){
    const r=await app.inject({url:'/read',headers:{authorization:'Bearer '+token}});
    assert.equal(r.statusCode,200);
    assert.equal(Number(r.headers['x-ratelimit-remaining']),remaining);
   }
  }
  assert.equal(ipLimitKey({ip:'127.0.0.1'}),'ip:127.0.0.1');
 }finally{await app.close();}
});
