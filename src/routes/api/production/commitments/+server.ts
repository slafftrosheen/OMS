import {json,error} from '@sveltejs/kit';
import type {RequestHandler} from './$types';

// R23: an ALL-DATES approved snapshot. Do not limit to the visible
// forecast window: stage commitments outside the window reduce residual work.
const PAGE_SIZE=200;
const LIMIT=10000;
const headers={'Cache-Control':'private, no-store'};
export const GET:RequestHandler=async ({locals})=>{
  if(!locals.user)throw error(401,'Unauthorized');
  const rows:Array<{id:string;draft_order_id:string;station:string;work_date:string;hours:number}>=[];
  const seen=new Set<string>();
  let expectedTotal:number|null=null;
  for(let offset=0;;offset+=PAGE_SIZE){
    const {data,count,error:dbError}=await locals.supabase.from('production_reservations')
      .select('id,draft_order_id,station,work_date,hours',{count:'exact'})
      .eq('status','APPROVED')
      .order('id',{ascending:true})
      .range(offset,offset+PAGE_SIZE-1);
    if(dbError||count===null){
      console.error('[Production commitments] Snapshot query failed',dbError);
      throw error(503,'Approved reservation snapshot unavailable');
    }
    if(count>LIMIT)throw error(503,'Approved reservation snapshot exceeds supported limit');
    if(expectedTotal!==null&&count!==expectedTotal)
      throw error(503,'Approved reservations changed during snapshot; retry');
    expectedTotal=count;
    if(!(data?.length) && offset<count)
      throw error(503,'Approved reservations could not be fully read');
    for(const row of data??[]){
      const hours=Number(row.hours);
      if(seen.has(row.id)||!Number.isFinite(hours)||hours<=0)
        throw error(503,'Approved reservation snapshot contains invalid or repeated entries');
      seen.add(row.id);
      rows.push({...row,hours});
    }
    if(rows.length>=count)break;
    if((data??[]).length<PAGE_SIZE)throw error(503,'Approved reservation snapshot was truncated');
  }
  if(rows.length!==expectedTotal)throw error(503,'Approved reservation snapshot is incomplete');
  return json({commitments:rows,total:rows.length,asOf:new Date().toISOString()},{headers});
};