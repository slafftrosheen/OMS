import {z} from 'zod';
const nullableText=z.string().nullable();
export const clientAddressChoiceSchema=z.object({
 id:z.string().uuid(),address:z.string(),contact:nullableText,phone:nullableText,email:nullableText,
 last_used_at:z.string().datetime({offset:true})
});
export const clientAddressChoicesSchema=z.array(clientAddressChoiceSchema).max(50);
export type ClientAddressChoice=z.infer<typeof clientAddressChoiceSchema>;
export const clientAddressHistorySchema=z.object({
 items:z.array(z.object({id:z.string().uuid(),raw_address:z.string(),contact:nullableText,phone:nullableText,
  email:nullableText,used_at:z.string().datetime({offset:true}),source_order_id:z.string().uuid().nullable()})).max(20),
 total:z.number().int().min(0),nextOffset:z.number().int().min(1).max(10000).nullable()
});
export type ClientAddressHistory=z.infer<typeof clientAddressHistorySchema>;
export type DeliveryDetails={deliveryAddress:string;deliveryContact:string;deliveryPhone:string;deliveryEmail:string};
const searchKey=(s:string)=>s.normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase();
export function filterClientAddresses(choices:ClientAddressChoice[],query:string):ClientAddressChoice[]{
 const terms=searchKey(query).split(/\s+/).filter(Boolean);
 return choices.filter(choice=>{
  const text=searchKey([choice.address,choice.contact,choice.phone,choice.email].filter(Boolean).join(' '));
  return terms.every(term=>text.includes(term));
 });
}
export const deliveryFingerprint=(current:DeliveryDetails)=>JSON.stringify([
 current.deliveryAddress,current.deliveryContact,current.deliveryPhone,current.deliveryEmail
]);
