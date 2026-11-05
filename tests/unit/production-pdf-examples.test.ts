import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {reviewProductionFacts} from '../../src/lib/order/production-intake';
const examples=JSON.parse(readFileSync('tests/fixtures/production-intake/examples.json','utf8')).cases;
describe('five supplied production drawings: hand-reviewed source observations',()=>{
 it('retains each drawing and its uncertainty without inventing catalog entries',()=>{
  expect(examples.map((c:any)=>c.id)).toEqual(['avans','intertoys','lowen','speldspit','ip-handlers']);
  for(const example of examples){
   const reviewed=reviewProductionFacts(example.production,[]);
   expect(reviewed.length).toBeGreaterThan(5);
   expect(reviewed.every(f=>f.material===null)).toBe(true);
   expect(example.sha256.length).toBe(64);
   expect(example.reviewQuestions.length).toBeGreaterThan(1);
  }
 });
 it('refuses to collapse different parts, infer unknown years, or apply a placeholder PO',()=>{
  const avans=reviewProductionFacts(examples[0].production,[]);
  expect(avans.filter(f=>f.target==='depth').map(f=>f.status)).toEqual(['unresolved','unresolved']);
  const intertoys=reviewProductionFacts(examples[1].production,[]);
  expect(intertoys.filter(f=>f.target==='depth').every(f=>f.status==='unresolved')).toBe(true);
  const lowen=reviewProductionFacts(examples[2].production,[]);
  expect(lowen.find(f=>f.target==='customerReference')?.status).toBe('unresolved');
  expect(examples[2].printedDeliveryDate).toBe(null);
  const handlers=reviewProductionFacts(examples[4].production,[]);
  expect(handlers.find(f=>f.target==='cableType')).toBe(undefined);
  expect(handlers.find(f=>f.target==='cableLength')).toBe(undefined);
 });
});
