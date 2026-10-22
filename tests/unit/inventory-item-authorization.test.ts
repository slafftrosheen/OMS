import {describe,it,expect} from 'vitest';
import {POST} from '../../src/routes/api/inventory/items/+server';
describe('inventory item creation boundary',()=>{
 const event=(user:unknown,body:unknown)=>({locals:{user,supabase:{from(){throw Error('Unexpected inventory write');}}},request:new Request('https://example.test/api/inventory/items',{method:'POST',body:JSON.stringify(body)})}) as any;
 it('returns HTTP authorization and validation errors before accessing storage',async()=>{
  await expect(POST(event(null,{}))).rejects.toMatchObject({status:401});
  await expect(POST(event({role:'Operator'},{}))).rejects.toMatchObject({status:403});
  await expect(POST(event({role:'Boss'},null))).rejects.toMatchObject({status:400});
  await expect(POST(event({role:'Boss'},{stock:10}))).rejects.toMatchObject({status:409});
 });
});
