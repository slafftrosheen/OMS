/** R44 — canonical planning signals; NOT purchase orders or inventory stock. */
export type ReplenishmentMaterial={
 id:string;sku:string|null;name_en:string|null;
 stock:number|null;min_stock:number|null;max_stock:number|null;
 unit:string|null;supplier:string|null;vendor:string|null;
 price:number|null;updated_at:string|null
};
export type ReplenishmentRequest={
 id:string;material_id:string;quantity:number;unit:string;
 supplier_label:string|null;supplier_reference:string|null;note:string;
 status:'OPEN'|'ORDERED'|'CLOSED'|'CANCELLED';
 stock_at_request:number;minimum_at_request:number;
 created_by:string;updated_by:string;created_at:string;
 updated_at:string;ordered_at:string|null;closed_at:string|null
};
export type ReplenishmentCandidate={
 materialId:string;sku:string;name:string;
 stock:number;minimum:number;maximum:number|null;
 unit:string;preferredSupplier:string|null;referencePrice:number|null;
 shortage:number;targetQuantity:number|null;targetTopUp:number;
 activeRequest:ReplenishmentRequest|null;
};
export function deriveReplenishmentCandidates(
 materials:ReplenishmentMaterial[],requests:ReplenishmentRequest[]
):ReplenishmentCandidate[]{
 const active=new Map<string,ReplenishmentRequest>();
 for(const request of requests){
   if(request.status!=='OPEN'&&request.status!=='ORDERED')continue;
   if(active.has(request.material_id))
     throw new Error('Multiple active replenishment requests for a material');
   active.set(request.material_id,request);
 }
 const result:ReplenishmentCandidate[]=[];
 for(const item of materials){
   if(typeof item.stock!=='number'||!Number.isSafeInteger(item.stock)||
     item.stock<0||typeof item.min_stock!=='number'||
     !Number.isSafeInteger(item.min_stock)||item.min_stock<=0||
     item.stock>item.min_stock)continue;
   const max=typeof item.max_stock==='number'&&
     Number.isSafeInteger(item.max_stock)&&
     item.max_stock>item.min_stock?item.max_stock:null;
   result.push({
     materialId:item.id,sku:item.sku??item.id,
     name:item.name_en??item.sku??item.id,
     stock:item.stock,minimum:item.min_stock,maximum:max,
     unit:item.unit??'PCS',
     preferredSupplier:item.supplier?.trim()||item.vendor?.trim()||null,
     referencePrice:typeof item.price==='number'&&
       Number.isFinite(item.price)&&item.price>=0?item.price:null,
     shortage:Math.max(0,item.min_stock-item.stock),
     targetQuantity:max??item.min_stock,
     targetTopUp:Math.max(0,(max??item.min_stock)-item.stock),
     activeRequest:active.get(item.id)??null
   });
 }
 return result.sort((a,b)=>
   (a.stock===0?0:1)-(b.stock===0?0:1)||
   b.shortage-a.shortage||a.sku.localeCompare(b.sku)||a.materialId.localeCompare(b.materialId));
}
export const isManagerReplenishmentAction=(action:string)=>
 ['create','update','order','close','cancel'].includes(action);
export type ReplenishmentInput={
 action:'create'|'update'|'order'|'close'|'cancel';
 requestId:string;materialId:string|null;expectedUpdatedAt:string|null;
 quantity:number|null;supplierLabel:string|null;
 supplierReference:string|null;note:string
};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseReplenishmentChange(data:unknown):ReplenishmentInput{
 if(!data||typeof data!=='object'||Array.isArray(data))
   throw new Error('Invalid replenishment request');
 const x=data as Record<string,unknown>;
 if(typeof x.action!=='string'||!isManagerReplenishmentAction(x.action)||
   typeof x.requestId!=='string'||!uuid.test(x.requestId))
   throw new Error('Valid action and request ID required');
 const action=x.action as ReplenishmentInput['action'];
 const materialId=x.materialId??null,revision=x.expectedUpdatedAt??null;
 const quantity=x.quantity??null,supplier=x.supplierLabel??null,
   reference=x.supplierReference??null,note=x.note??'';
 if((action==='create')!==(typeof materialId==='string'&&uuid.test(materialId))||
   (action==='create'&&revision!==null)||
   (action!=='create'&&(typeof revision!=='string'||
      revision.length>64||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(revision)||
      !Number.isFinite(Date.parse(revision))||
      !/(Z|[+-]\d{2}:\d{2})$/.test(revision))))
   throw new Error('Original material or saved revision is invalid');
 if((action==='create'||action==='update')?
   !Number.isSafeInteger(quantity)||Number(quantity)<=0||Number(quantity)>100000000:
   quantity!==null)
   throw new Error('A positive quantity is required for draft create/update only');
 if(typeof note!=='string'||note.length>1000||
   (supplier!==null&&(typeof supplier!=='string'||supplier.length>200))||
   (reference!==null&&(typeof reference!=='string'||reference.length>200))||
   (action==='order'&&(typeof reference!=='string'||!reference.trim()))||
   (action!=='order'&&reference!==null)||
   (['close','cancel'].includes(action)&&note.trim().length<5))
   throw new Error('Supplier reference or review note is invalid');
 return {action,requestId:x.requestId,materialId:materialId as string|null,
   expectedUpdatedAt:revision as string|null,quantity:quantity as number|null,
   supplierLabel:supplier as string|null,
   supplierReference:reference as string|null,note};
}
