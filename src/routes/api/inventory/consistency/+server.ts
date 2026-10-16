import {json,error} from '@sveltejs/kit';
import type {RequestHandler} from './$types';
import {canManageSharedInventory} from '$lib/server/authz/shared-data';
import {classifyInventoryParity} from '$lib/inventory/consistency';

const PAGE_LIMIT=50;
const headers={'Cache-Control':'private, no-store'};
/** Bounded diagnostic only. This cannot silently reconcile a historical
 * mismatch, does not invent a physical count, and respects staff roles.
 */
export const GET:RequestHandler=async ({locals,url})=>{
 if(!locals.user)throw error(401,'Unauthorized');
 if(!canManageSharedInventory(locals.user.role))
   throw error(403,'Only inventory managers can inspect stock parity');
 const page=Number(url.searchParams.get('page')??1);
 if(!Number.isSafeInteger(page)||page<1||page>10000)
   throw error(400,'Invalid page');
 const from=(page-1)*PAGE_LIMIT;
 const db=locals.supabase;
 const [materialsResponse,orphanCountResponse]=await Promise.all([
   db.from('materials')
     .select('id,sku,name_en,stock',{count:'exact'})
     .order('id',{ascending:true})
     .range(from,from+PAGE_LIMIT-1),
   db.from('inventory_items').select('id',{count:'exact',head:true})
     .is('material_id',null)
 ]);
 if(materialsResponse.error||materialsResponse.count===null||
    orphanCountResponse.error||orphanCountResponse.count===null)
   throw error(503,'Inventory parity cannot be verified');
 const materials=materialsResponse.data??[];
 const ids=materials.map(x=>x.id);
 let legacy: Array<{id:string;material_id:string|null;sku:string|null;stock:number|null}>=[];
 if(ids.length){
   const result=await db.from('inventory_items')
     .select('id,material_id,sku,stock',{count:'exact'})
     .in('material_id',ids)
     .order('id',{ascending:true}).limit(500);
   if(result.error||result.count===null||result.count>500)
     throw error(503,'Linked legacy stock coverage incomplete');
   legacy=result.data??[];
 }
 const rows=classifyInventoryParity(materials,legacy);
 return json({
   asOf:new Date().toISOString(),page,pageLimit:PAGE_LIMIT,
   totalMaterials:materialsResponse.count,
   totalPages:Math.ceil(materialsResponse.count/PAGE_LIMIT),
   unmappedLegacyCount:orphanCountResponse.count,
   scannedMaterials:rows.length,
   divergentOnPage:rows.filter(r=>r.state==='DIVERGENT').length,
   ambiguousOnPage:rows.filter(r=>r.state==='AMBIGUOUS'||r.state==='INVALID').length,
   rows
 },{headers});
};

/** Manager-recorded physical count with atomic stale-snapshot check.
 * This NEVER chooses canonical or legacy values as the true physical stock.
 */
export const POST:RequestHandler=async ({locals,request})=>{
 if(!locals.user)throw error(401,'Unauthorized');
 if(!canManageSharedInventory(locals.user.role))
   throw error(403,'Only inventory managers can reconcile stock');
 const body=await request.json().catch(()=>null);
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 if(!body||typeof body!=='object'||Array.isArray(body)||
   typeof body.materialId!=='string'||!uuid.test(body.materialId)||
   typeof body.requestId!=='string'||!uuid.test(body.requestId)||
   !Number.isSafeInteger(body.physicalCount)||body.physicalCount<0||
   body.physicalCount>100000000||
   !Number.isSafeInteger(body.expectedCanonicalStock)||
   !Number.isSafeInteger(body.expectedLegacyStock)||
   typeof body.reason!=='string'||body.reason.trim().length<10||
   body.reason.length>1000)
   throw error(400,'Physical count, saved balances, request ID and reconciliation explanation required');
 const {data,error:dbError}=await locals.supabase.rpc(
   'oms_reconcile_inventory_stock',{
     p_request_id:body.requestId,
     p_material_id:body.materialId,
     p_new_stock:body.physicalCount,
     p_expected_canonical_stock:body.expectedCanonicalStock,
     p_expected_legacy_stock:body.expectedLegacyStock,
     p_reason:body.reason.trim()
   }
 );
 if(dbError){
   if(dbError.code==='42501')throw error(403,'Inventory management permission denied');
   if(dbError.code==='22023')throw error(400,'Invalid reconciliation count or reason');
   if(dbError.code==='P0002')throw error(404,'Material no longer exists');
   if(dbError.code==='P0001')throw error(409,
     'Stock changed or legacy mapping is ambiguous; refresh and recount before another decision');
   console.error('[Inventory consistency] reconciliation failed',dbError);
   throw error(503,'Inventory reconciliation result uncertain; retry the same request ID, not a new one');
 }
 if(!data?.id)throw error(503,'Audit receipt unavailable; inspect stock and movements before retry');
 return json({ok:true,receipt:data},{status:200,headers});
};
