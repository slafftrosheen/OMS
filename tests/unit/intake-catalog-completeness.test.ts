import {describe,it,expect} from 'vitest';
import {readCompleteIntakeCatalog} from '../../src/lib/server/order/intake-catalog';
function database(rows:any[],count:number|null=rows.length){
 return {from:()=>{
  let from=0,to=5000;
  const query:any={select:()=>query,order:()=>query,limit:()=>query,abortSignal:()=>query,
   range:(a:number,b:number)=>{from=a;to=b;return query;},
   then:(resolve:any)=>Promise.resolve({data:rows.slice(from,Math.min(from+1000,to+1)),count,error:null}).then(resolve)};
  return query;
 }} as any;
}
const rows=Array.from({length:1200},(_,i)=>({id:`id-${i}`,code:`CODE_${i}`,category:'ACRYLIC_XT',name_en:`Material ${i}`,metadata:{}}));
describe('complete caller-visible intake catalog',()=>{
 it('reads beyond the PostgREST max_rows cap before deciding identities are unique',async()=>{
  const result=await readCompleteIntakeCatalog(database(rows));
  expect(result.length).toBe(1200);
  expect(result[1199].code).toBe('CODE_1199');
 });
 it('refuses an uncounted, oversized or duplicate scan',async()=>{
  for(const db of [database(rows,null),database(rows,6000),database([...rows.slice(0,1199),rows[0]])]){
   let failed=false;try{await readCompleteIntakeCatalog(db);}catch{failed=true;}
   expect(failed).toBe(true);
  }
 });
});
