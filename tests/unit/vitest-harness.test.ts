import {describe,it,expect} from 'vitest';
describe('lightweight assertion compatibility',()=>{
 it('matches objectContaining recursively inside exact equality',()=>{
  expect([{id:'a',review:{status:'RESOLVED',revision:2}}]).toEqual([
   expect.objectContaining({review:expect.objectContaining({status:'RESOLVED'})})
  ]);
  expect(()=>expect([{id:'wrong'}]).toEqual([expect.objectContaining({id:'a'})])).toThrow();
  expect(()=>expect([{id:'a'}, {id:'extra'}]).toEqual([expect.objectContaining({id:'a'})])).toThrow();
  expect(()=>expect({id:'a',extra:true}).toEqual({id:'a'})).toThrow();
  expect(()=>expect({}).toEqual(expect.objectContaining({id:undefined}))).toThrow();
  expect(()=>expect(new Map([['a',1]])).toEqual(new Map([['b',1]]))).toThrow();
  expect(()=>expect(new Set([1])).toEqual(new Set([2]))).toThrow();
 });
});
