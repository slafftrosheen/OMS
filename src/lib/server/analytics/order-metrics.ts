import { normaliseStatus } from '$lib/auth/permission-utils';

type Row = Record<string, any>;
const closed = new Set(['DISPATCHED','ARCHIVED','CANCELLED','VOIDED']);
const completed = (row: Row) => ['DISPATCHED','ARCHIVED'].includes(normaliseStatus(row.status));
const active = (row: Row) => !closed.has(normaliseStatus(row.status));
const visible = (row: Row) => normaliseStatus(row.status) !== 'CANCELLED';
// All dashboard date boundaries use the shop's time zone, including DST.
const shopFormatter = new Intl.DateTimeFormat('en-CA', { timeZone:'Europe/Riga', year:'numeric',month:'2-digit',day:'2-digit' });
export function shopDate(value: string | Date) {
  const parts = shopFormatter.formatToParts(new Date(value));
  const part = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}
function completionDate(row: Row) { return row.dispatched_at ?? row.archived_at ?? row.updated_at; }
export function summarizeOrders(input: Row[], now = new Date()) {
  const rows = input.filter(visible), today = shopDate(now);
  const month = today.slice(0,7);
  const weekStart = new Date(`${today}T00:00:00Z`);
  weekStart.setUTCDate(weekStart.getUTCDate() - ((weekStart.getUTCDay()+6)%7));
  const week = weekStart.toISOString().slice(0,10);
  const done = rows.filter(completed);
  const durations = done.filter(row => completionDate(row) && row.created_at)
    .map(row => (Date.parse(completionDate(row))-Date.parse(row.created_at))/3600000)
    .filter(n => Number.isFinite(n) && n >= 0);
  return { total:rows.length, active:rows.filter(active).length, completed:done.length,
    today:rows.filter(row => row.created_at && shopDate(row.created_at) === today).length,
    thisWeek:rows.filter(row => row.created_at && shopDate(row.created_at) >= week).length,
    thisMonth:rows.filter(row => row.created_at && shopDate(row.created_at).startsWith(month)).length,
    completedToday:done.filter(row => completionDate(row) && shopDate(completionDate(row)) === today).length,
    avgCompletionHours:durations.length ? durations.reduce((a,b)=>a+b,0)/durations.length : 0 };
}
export function dailyOrderTrends(input: Row[], days: number, now = new Date()) {
  const today = shopDate(now), end = new Date(`${today}T00:00:00Z`);
  const dates = Array.from({length:days},(_,i) => new Date(end.getTime()-(days-1-i)*86400000).toISOString().slice(0,10));
  const buckets = new Map(dates.map(date=>[date,{total:0,completed:0,inProgress:0,draft:0,onHold:0}]));
  for (const row of input.filter(visible)) {
    const bucket=row.created_at ? buckets.get(shopDate(row.created_at)) : null;
    if(bucket) {
      bucket.total++;
      const status=normaliseStatus(row.status);
      if(status==='IN_PRODUCTION') bucket.inProgress++;
      if(status==='DRAFT') bucket.draft++;
      if(status==='ON_HOLD') bucket.onHold++;
    }
    if(completed(row) && completionDate(row)) {
      const done=buckets.get(shopDate(completionDate(row)));
      if(done) done.completed++;
    }
  }
  return {dates,...Object.fromEntries(['total','completed','inProgress','draft','onHold'].map(key=>
    [key,dates.map(date=>(buckets.get(date) as any)[key])]))} as {
      dates:string[];total:number[];completed:number[];inProgress:number[];draft:number[];onHold:number[]
    };
}
export function logisticsMetrics(rows: Row[], capacities: Row[], now = new Date()) {
  const today = shopDate(now), live = rows.filter(active);
  const upcoming = capacities.filter(row => row.date >= today && !row.is_blocked);
  const capacity = upcoming.reduce((n,row)=>n+Number(row.max_capacity),0);
  const used = upcoming.reduce((n,row)=>n+Number(row.used_count),0);
  return { pending_dispatch:live.filter(row=>row.status==='READY_TO_LOAD').length,
    scheduled_today:live.filter(row=>row.loading_date===today).length,
    overdue:live.filter(row=>row.due_date && row.due_date<today).length,
    loading_capacity_pct:capacity>0 ? Math.round(used/capacity*100) : null };
}

/** PostgREST caps each response: page explicitly so totals never silently truncate. */
export async function readMetricRows(db: any, table: string, fields: string, filter?: (query: any) => any): Promise<Row[]> {
  const rows: Row[] = [], pageSize = 500;
  for (let offset=0; offset<100000; offset+=pageSize) {
    let query = db.from(table).select(fields).order(table === 'loading_capacity_overview' ? 'date' : 'id');
    if (filter) query = filter(query);
    const result = await query.range(offset,offset+pageSize-1);
    if (result.error || !Array.isArray(result.data)) throw new Error('Analytics data unavailable');
    rows.push(...result.data);
    if (result.data.length<pageSize) return rows;
  }
  throw new Error('Analytics result exceeds the supported report size');
}
export const ORDER_METRIC_FIELDS = 'id,status,client,created_at,updated_at,dispatched_at,archived_at,due_date,loading_date';
