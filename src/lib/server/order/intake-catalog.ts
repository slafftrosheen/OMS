import type {SupabaseClient} from '@supabase/supabase-js';
import type {IntakeMaterial} from '$lib/order/production-intake';
const columns='id,code,category,name_en,name_ru,name_lv,thickness_options,metadata';
/** PostgREST max_rows can silently cap a requested limit. Exact counts and
 * actual page lengths are required before a match can be called unique. */
export async function readCompleteIntakeCatalog(db:SupabaseClient,signal?:AbortSignal):Promise<IntakeMaterial[]>{
 const rows:IntakeMaterial[]=[];
 let total:number|null=null;
 do{
  let query=db.from('materials').select(columns,{count:'exact'}).order('id').range(rows.length,rows.length+499);
  if(signal)query=query.abortSignal(signal);
  const {data,error,count}=await query;
  if(error||!data||count===null||!Number.isSafeInteger(count)||count<0||count>5000||
    (total!==null&&total!==count))throw new Error('Complete catalog resolution unavailable');
  total=count;
  if((!data.length&&rows.length<count)||rows.length+data.length>count)
    throw new Error('Incomplete material catalog');
  rows.push(...data as IntakeMaterial[]);
 }while(rows.length<(total??0));
 if(new Set(rows.map(row=>row.id)).size!==rows.length)throw new Error('Material catalog changed during lookup');
 return rows;
}
