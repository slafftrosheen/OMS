import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ORDER_METRIC_FIELDS, readMetricRows, summarizeOrders, dailyOrderTrends, shopDate } from '$lib/server/analytics/order-metrics';
import { normaliseStatus } from '$lib/auth/permission-utils';
import { ALL_STATIONS } from '$lib/order/workflow';

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user) throw error(401,'Unauthorized');
  const type=url.searchParams.get('type') || 'kpis';
  const days=Number(url.searchParams.get('period') || 30);
  if (!['kpis','trends','stations','loading','clients'].includes(type) || !Number.isInteger(days) || days<1 || days>366)
    throw error(400,'Invalid analytics type or period');
  const db=locals.supabase, now=new Date(), today=shopDate(now);
  try {
    let data: any;
    if (type==='loading') {
      const end=new Date(`${today}T00:00:00Z`); end.setUTCDate(end.getUTCDate()+days);
      const rows=await readMetricRows(db,'loading_capacity_overview','*',q=>q.gte('date',today).lt('date',end.toISOString().slice(0,10)));
      data={dates:rows.map(r=>r.date),capacity:rows.map(r=>r.max_capacity),used:rows.map(r=>r.used_count),
        remaining:rows.map(r=>r.remaining_capacity),status:rows.map(r=>r.state)};
    } else if (type==='stations') {
      const requested=url.searchParams.get('station')?.toUpperCase();
      if (requested && !ALL_STATIONS.includes(requested)) throw error(400,'Unknown station');
      const orders=await readMetricRows(db,'draft_orders','id,status');
      const live=new Set(orders.filter(r=>['CONFIRMED','IN_PRODUCTION','READY_TO_LOAD'].includes(r.status)).map(r=>r.id));
      const stages=await readMetricRows(db,'order_stages','id,draft_order_id,station,state,actual_hours,completed_at');
      data=ALL_STATIONS.filter(s=>!requested||s===requested).map(station=>{
        const rows=stages.filter(s=>s.station===station && live.has(s.draft_order_id));
        const done=stages.filter(s=>s.station===station && s.state==='COMPLETED' && orders.some(o=>o.id===s.draft_order_id && o.status!=='CANCELLED'));
        const hours=done.filter(s=>s.actual_hours!=null);
        return {station,total_orders_processed:done.length,in_progress:rows.filter(s=>s.state==='IN_PROGRESS').length,
          blocked:rows.filter(s=>s.state==='BLOCKED').length,rework:rows.filter(s=>s.state==='REWORK').length,
          avg_completion_hours:hours.length?hours.reduce((n,s)=>n+Number(s.actual_hours),0)/hours.length:null};
      });
    } else {
      const rows=await readMetricRows(db,'draft_orders',ORDER_METRIC_FIELDS);
      if(type==='kpis') data={orders:summarizeOrders(rows,now)};
      else if(type==='trends') data=dailyOrderTrends(rows,days,now);
      else {
        const from=new Date(now.getTime()-days*86400000).toISOString();
        const clients=new Map<string,any>();
        for(const row of rows.filter(r=>r.status!=='CANCELLED' && r.created_at>=from && r.client)) {
          const item=clients.get(row.client) ?? {name:row.client,totalOrders:0,completed:0,inProgress:0,draft:0};
          item.totalOrders++;
          const status=normaliseStatus(row.status);
          if(['DISPATCHED','ARCHIVED'].includes(status)) item.completed++;
          if(status==='IN_PRODUCTION') item.inProgress++;
          if(status==='DRAFT') item.draft++;
          clients.set(row.client,item);
        }
        data=[...clients.values()].sort((a,b)=>b.totalOrders-a.totalOrders).slice(0,10);
      }
    }
    return json({data},{headers:{'Cache-Control':'private, no-store'}});
  } catch(err) {
    if ((err as any)?.status) throw err;
    throw error(503,'Analytics data unavailable');
  }
};
