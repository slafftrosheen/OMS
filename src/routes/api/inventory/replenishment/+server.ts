import {json,error} from '@sveltejs/kit';
import type {RequestHandler} from './$types';
import {canManageSharedInventory} from '$lib/server/authz/shared-data';
import {deriveReplenishmentCandidates,parseReplenishmentChange,
 type ReplenishmentMaterial,type ReplenishmentRequest} from '$lib/inventory/replenishment';

const headers={'Cache-Control':'private, no-store'};
const CHUNK=200,MAX=10000;
async function fetchAll(db:any,table:'materials'|'inventory_replenishment_requests',
 projection:string):Promise<Record<string,unknown>[]>{
 const all:Record<string,unknown>[]=[];
 let expected:number|null=null;
 const seen=new Set<string>();
 for(let offset=0;;offset+=CHUNK){
   const {data,count,error:dbError}=await db.from(table).select(projection,{count:'exact'})
     .order('id',{ascending:true}).range(offset,offset+CHUNK-1);
   if(dbError||count===null||count>MAX||
      expected!==null&&expected!==count)
     throw error(503,'Replenishment source unavailable or changed during read');
   expected=count;
   if((data??[]).length===0&&all.length<count)
     throw error(503,'Replenishment source incomplete');
   for(const row of data??[]){
     if(typeof row.id!=='string'||seen.has(row.id))
       throw error(503,'Replenishment source repeated an item');
     seen.add(row.id);all.push(row);
   }
   if(all.length>=count)break;
   if((data??[]).length<CHUNK)throw error(503,'Replenishment source truncated');
 }
 return all;
}
export const GET:RequestHandler=async ({locals})=>{
 if(!locals.user)throw error(401,'Unauthorized');
 if(!canManageSharedInventory(locals.user.role))
   throw error(403,'Only inventory managers can access replenishment planning');
 const [materials,requests]=await Promise.all([
   fetchAll(locals.supabase,'materials',
     'id,sku,name_en,stock,min_stock,max_stock,unit,supplier,vendor,price,updated_at'),
   fetchAll(locals.supabase,'inventory_replenishment_requests',
     'id,material_id,quantity,unit,supplier_label,supplier_reference,note,status,stock_at_request,minimum_at_request,created_by,updated_by,created_at,updated_at,ordered_at,closed_at')
 ]);
 const normalized=requests as unknown as ReplenishmentRequest[];
 const materialRecords=materials as unknown as ReplenishmentMaterial[];
 const invalidBalanceCount=materialRecords.filter(item=>
   typeof item.stock!=='number'||!Number.isSafeInteger(item.stock)||item.stock<0||
   typeof item.min_stock!=='number'||!Number.isSafeInteger(item.min_stock)||
   item.min_stock<0).length;
 const noThresholdCount=materialRecords.filter(item=>
   typeof item.min_stock==='number'&&item.min_stock===0).length;
 let candidates;
 try{candidates=deriveReplenishmentCandidates(materialRecords,normalized);}
 catch{throw error(503,'Active replenishment records conflict; manager inspection required');}
 const byId=new Map(materialRecords.map(item=>[item.id,item]));
 const requestMaterials=[...new Set(normalized.map(row=>row.material_id))].map(id=>{
   const item=byId.get(id);
   return {id,sku:item?.sku??id,name:item?.name_en??item?.sku??id,
     unit:item?.unit??null,stock:item?.stock??null};
 });
 return json({
   asOf:new Date().toISOString(),candidateCount:candidates.length,
   totalMaterials:materialRecords.length,invalidBalanceCount,noThresholdCount,
   candidates,requests:normalized,requestMaterials,
   stockIsCanonical:true,physicalCountVerified:false,
   supplierOrderingAutomated:false,receiptsAffectStock:false
 },{headers});
};
export const POST:RequestHandler=async ({locals,request})=>{
 if(!locals.user)throw error(401,'Unauthorized');
 if(!canManageSharedInventory(locals.user.role))
   throw error(403,'Inventory management role required');
 const raw=await request.json().catch(()=>null);
 let input:ReturnType<typeof parseReplenishmentChange>;
 try{input=parseReplenishmentChange(raw);}
 catch(e){throw error(400,e instanceof Error?e.message:'Invalid replenishment action');}
 const {data,error:rpcError}=await locals.supabase.rpc('oms_manage_inventory_replenishment',{
   p_action:input.action,p_request_id:input.requestId,
   p_material_id:input.materialId,
   p_expected_updated_at:input.expectedUpdatedAt,
   p_quantity:input.quantity,p_supplier_label:input.supplierLabel,
   p_supplier_reference:input.supplierReference,p_note:input.note
 });
 if(rpcError){
   if(rpcError.code==='42501')throw error(403,'Active manager required');
   if(rpcError.code==='P0002')throw error(404,'Material or request no longer exists');
   if(rpcError.code==='23505'||rpcError.code==='P0001')
     throw error(409,'Request already active, modified or material inventory needs reconciliation');
   if(rpcError.code==='22023')throw error(400,'Replenishment action or transition invalid');
   console.error('[Inventory replenishment] RPC unavailable',rpcError);
   throw error(503,'Procurement follow-up unavailable; review before retry');
 }
 if(!data?.id||typeof data.updated_at!=='string')
   throw error(503,'Request receipt unverifiable; refresh before repeating');
 return json({request:data},{status:input.action==='create'?201:200,headers});
};
