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
