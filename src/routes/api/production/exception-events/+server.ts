import {json,error} from '@sveltejs/kit';
import type {RequestHandler} from './$types';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const GET:RequestHandler=async ({locals,url})=>{
 if(!locals.user)throw error(401,'Unauthorized');
 const reviewId=url.searchParams.get('reviewId');
 if(!reviewId||!uuid.test(reviewId))throw error(400,'Review ID required');
 // The review SELECT RLS policy also controls visibility of its events.
 const {data:review,error:reviewError}=await locals.supabase
   .from('production_exception_reviews').select('id')
   .eq('id',reviewId).maybeSingle();
 if(reviewError)throw error(503,'Review permission lookup failed');
 if(!review)throw error(404,'Review not found');
 const {data,count,error:dbError}=await locals.supabase
   .from('production_exception_events')
   .select('id,actor_id,action,description,previous_status,new_status,occurred_at',
     {count:'exact'}).eq('review_id',reviewId)
   .order('occurred_at',{ascending:false}).order('id',{ascending:false}).limit(200);
 if(dbError||count===null||count>200)
   throw error(503,'Review history cannot be loaded completely');
 return json({events:data??[],total:count},
   {headers:{'Cache-Control':'private, no-store'}});
};
