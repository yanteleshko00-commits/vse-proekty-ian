import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomBytes} from 'node:crypto';
import {createStudioTicketStore} from '../nexora/studio-ticket-store.js';
const state=randomBytes(32).toString('base64url'),wrong=randomBytes(32).toString('base64url');
test('one-time memory ticket bound to state, capacity and expiration',async()=>{
 let now=Date.now();const store=createStudioTicketStore({clock:()=>now,capacity:1});
 const value={state,userId:'user-a',sessionId:'session-a'};
 const id=await store.issue(value);
 assert.equal(await store.issue(value),null);assert.equal(await store.consume(id,wrong),null);
 assert.equal((await store.consume(id,state)).userId,'user-a');assert.equal(await store.consume(id,state),null);
 const next=await store.issue(value);now+=60001;assert.equal(await store.consume(next,state),null);assert.ok(await store.issue(value));
});
test('mounted directory ticket can be consumed exactly once across store instances',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'nx-sso-test-'));
 try{
  const a=createStudioTicketStore({directory}),b=createStudioTicketStore({directory});
  const id=await a.issue({state,userId:'user-a',sessionId:'session-a'});
  assert.equal(await b.consume(id,wrong),null);
  const results=await Promise.all([a.consume(id,state),b.consume(id,state)]);
  assert.equal(results.filter(Boolean).length,1);assert.equal(results.find(Boolean).sessionId,'session-a');
  assert.equal(await b.consume(id,state),null);
 }finally{await rm(directory,{recursive:true,force:true});}
});
