import {describe,it} from 'vitest';
import assert from 'node:assert/strict';
import {creationFormFingerprint,deleteCreationUpload} from '../../src/lib/order/creation-state';

describe('new-order recovery',()=>{
 it('tracks profile content and form changes while ignoring profile expansion and transient ids',()=>{
  const fields={clientName:'TEST ONLY',selectedPresetId:null}, profile={id:'a',collapsed:false,quantity:1,configuration:{BENDER:{depth:100}}};
  const initial=creationFormFingerprint(fields,[profile]);
  const expanded={...profile,id:'b',collapsed:true};
  assert.equal(creationFormFingerprint(fields,[expanded]),initial);
  assert.notEqual(creationFormFingerprint(fields,[{...profile,quantity:2}]),initial);
  assert.notEqual(creationFormFingerprint(fields,[{...profile,configuration:{BENDER:{depth:120}}}]),initial);
  assert.notEqual(creationFormFingerprint({...fields,clientName:'CHANGED'},[profile]),initial);
  assert.notEqual(creationFormFingerprint(fields,[]),initial);
 });
 it('waits for the canonical deletion before resolving, with the configured base path',async()=>{
  let release!:(response:Response)=>void;let completed=false;
  const operation=deleteCreationUpload('stored/id','/oms',((url,options)=>{
   assert.equal(url,'/oms/api/files/stored%2Fid');assert.equal(options?.method,'DELETE');
   return new Promise<Response>(resolve=>release=resolve);
  }) as typeof fetch).then(()=>completed=true);
  await Promise.resolve();assert.equal(completed,false);
  release(new Response(null,{status:204}));await operation;assert.equal(completed,true);
 });
 it('rejects permission, evidence-retention and network errors so staged files stay available for retry',async()=>{
  for(const status of [403,404,409,503]){
   await assert.rejects(deleteCreationUpload('stored','',async()=>new Response(JSON.stringify({message:'Keep this attachment'}),{status})),/Keep this attachment/);
  }
  await assert.rejects(deleteCreationUpload('stored','',async()=>{throw new Error('Offline');}),/Offline/);
  await assert.rejects(deleteCreationUpload('stored','',async()=>new Response('<html>Failure</html>',{status:500})));
 });
});
