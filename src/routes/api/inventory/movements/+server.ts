import {json,error} from '@sveltejs/kit';
import type {RequestHandler} from './$types';
import {canManageSharedInventory} from '$lib/server/authz/shared-data';

const headers={'Cache-Control':'private, no-store'};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const kinds=new Set(['in','out','adjustment']);
/** R41: canonical manual stock history; order consumption remains the separate
 * atomic production-stage RPC. Never forge an order reference or actor.
 */
export const GET:RequestHandler=async ({locals,url})=>{
  if(!locals.user)throw error(401,'Unauthorized');
  const requested=Number(url.searchParams.get('limit')??50);
  if(!Number.isInteger(requested)||requested<1||requested>200)
    throw error(400,'Movement limit must be 1–200');
  const filter=url.searchParams.get('kind');
  if(filter!==null && !kinds.has(filter) && filter!=='order')
    throw error(400,'Unsupported inventory movement filter');
  let query=locals.supabase.from('inventory_movements')
    .select('id,material_id,movement_type,quantity,reference_id,reference_type,performed_by,notes,created_at')
    .order('created_at',{ascending:false}).order('id',{ascending:false});
  if(filter==='order')query=query.eq('reference_type','order');
  else if(filter)query=query.eq('movement_type',filter);
  const materialId=url.searchParams.get('materialId');
  if(materialId){
    if(!uuid.test(materialId))throw error(400,'Invalid material ID');
    query=query.eq('material_id',materialId);
  }
  const {data,error:dbError}=await query.limit(requested);
  if(dbError){console.error('[Inventory audit] movement history',dbError);
    throw error(503,'Inventory movement history unavailable');}
  // Some legacy deployments have two material FKs on inventory_movements;
  // use explicit IDs rather than PostgREST's ambiguous implicit join.
  const ids=[...new Set((data??[]).map(row=>row.material_id)
    .filter((id):id is string=>typeof id==='string'))];
  const materialById=new Map<string,{
    sku:string|null;code:string|null;name_en:string|null;unit:string|null
  }>();
  if(ids.length){
    const {data:materialRows,error:materialError}=await locals.supabase
      .from('materials').select('id,sku,name_en,code,unit').in('id',ids);
    if(materialError)throw error(503,'Movement material details unavailable');
    for(const row of materialRows??[])materialById.set(row.id,row);
  }
  return json((data??[]).map(row=>{
    const material=row.material_id?materialById.get(row.material_id):null;
    return {
      id:row.id,materialId:row.material_id,
      sku:material?.sku??material?.code??null,
      name:material?.name_en??material?.code??null,
      kind:row.movement_type,qty:row.quantity,unit:material?.unit??'PCS',
      by:row.performed_by,
      refPO:row.reference_type==='order'?row.reference_id:null,
      note:row.notes,at:row.created_at
    };
  }),{headers});
};

export const POST:RequestHandler=async ({locals,request})=>{
  if(!locals.user)throw error(401,'Unauthorized');
  if(!canManageSharedInventory(locals.user.role))
    throw error(403,'Only inventory managers can change stock');
  const body=await request.json().catch(()=>null);
  if(!body||typeof body!=='object'||Array.isArray(body))
    throw error(400,'Invalid movement request');
  if(typeof body.materialId!=='string'||!uuid.test(body.materialId)||
     typeof body.requestId!=='string'||!uuid.test(body.requestId)||
     !['IN','OUT','ADJUST'].includes(body.kind)||
     !Number.isInteger(body.qty)||body.qty<0||body.qty>100000000||
     (body.kind!=='ADJUST'&&body.qty===0)||
     (body.note!==undefined&&
        (typeof body.note!=='string'||body.note.length>1000))||
     (body.kind==='ADJUST'&&!String(body.note??'').trim()))
    throw error(400,'Material, movement type, quantity, request ID and reason are required');
  // Only the stage-completion RPC can write references to an order.
  if(body.refPO)throw error(409,
    'Order material consumption must be recorded through stage completion');
  const {data, error:rpcError}=await locals.supabase.rpc(
    'oms_record_manual_inventory_movement',{
      p_request_id:body.requestId,p_material_id:body.materialId,
      p_kind:body.kind,p_quantity:body.qty,p_note:body.note??null
    }
  );
  if(rpcError){
    if(rpcError.code==='42501')throw error(403,'Inventory management access denied');
    if(rpcError.code==='P0001')throw error(409,
      'Stock changed, insufficient stock or request already used; review current inventory');
    if(rpcError.code==='22023')throw error(400,'Invalid inventory movement or adjustment reason');
    if(rpcError.code==='P0002')throw error(404,'Material not found');
    console.error('[Inventory audit] atomic movement failed',rpcError);
    throw error(503,'Atomic inventory movement unavailable; do not retry with another request ID');
  }
  if(!data?.id||typeof data.newStock!=='number')
    throw error(503,'Inventory receipt unavailable; refresh history before repeating');
  return json(data,{status:data.idempotent===true?200:201,headers});
};
