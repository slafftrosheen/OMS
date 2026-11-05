import {describe,it,expect} from 'vitest';
import {filterClientAddresses,clientAddressChoicesSchema,clientAddressHistorySchema} from '../../src/lib/order/client-address-review';
const choice={id:'11111111-1111-4111-8111-111111111111',address:'Rīgas iela 4',contact:'Warehouse team',phone:'+371 123',email:'deliveries@example.test',last_used_at:'2026-11-05T12:00:00Z'};
describe('address search and bounded history responses',()=>{
 it('finds addresses by multiple case-insensitive accent-insensitive contact and address terms',()=>{
  expect(filterClientAddresses([choice],'RIGAS warehouse').length).toBe(1);
  expect(filterClientAddresses([choice],'example.test 123').length).toBe(1);
  expect(filterClientAddresses([choice],'unknown').length).toBe(0);
 });
 it('rejects malformed addresses or unbounded history pages before offering them to the form',()=>{
  expect(clientAddressChoicesSchema.safeParse([{...choice,id:'invented'}]).success).toBe(false);
  expect(clientAddressChoicesSchema.safeParse(Array.from({length:51},()=>choice)).success).toBe(false);
  expect(clientAddressHistorySchema.safeParse({items:[],total:2,nextOffset:-1}).success).toBe(false);
 });
});
