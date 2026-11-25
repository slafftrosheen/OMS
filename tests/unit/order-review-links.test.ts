import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { GET } from '../../src/routes/api/orders/pending-review/+server';
import { ALL_STATIONS, stationRoomFor } from '../../src/lib/order/workflow';
import { postStationMessage } from '../../src/lib/server/chat/stationMessenger';

const id = 'c0000000-0000-4000-8000-000000000001';
async function review(search: string, role = 'HeadOfProduction') {
  const filters: string[][] = [], tables: string[] = [];
  const query = {
    select: () => query,
    eq(key:string,value:string) { filters.push([key,value]); return query; },
    order: () => query,
    then(resolve: (reply: unknown) => unknown) { return resolve({data:[],error:null}); }
  };
  const locals = {
    getSession: async () => ({user:{id:'reviewer'}}),
    supabase:{from(table:string) {
      tables.push(table);
      if (table === 'profiles') return {select:()=>({eq:()=>({single:async()=>({data:{role}})})})};
      assert.equal(table,'orders_pending_review');
      return query;
    }}
  };
  const response = await GET({locals,url:new URL('https://oms.test/api/orders/pending-review'+search)} as any);
  return {response, filters, tables};
}

describe('order and station handoffs', () => {
  it('filters the authorized review queue on the requested order and handles a stale link', async () => {
    const item = await review('?order='+id);
    assert.deepEqual(item.filters,[['id',id]]);
    assert.equal(item.response.status,200);
    assert.deepEqual(await item.response.json(),[]);
    assert.equal(item.response.headers.get('Cache-Control'),'private, no-store');
    assert.deepEqual((await review('')).filters,[]);
  });
  it('rejects a malformed or unauthorized lookup before reading the queue', async () => {
    for (const [query,role,status] of [['?order=broken','Boss',400],['?order='+id,'StationHead',403]] as const) {
      const result = await review(query,role);
      assert.equal(result.response.status,status);
      assert.deepEqual(result.tables,['profiles']);
    }
  });
  it('writes stage announcements to the same room each workstation opens', async () => {
    const rooms: string[] = [];
    const supabase = {from(table:string) {
      assert.equal(table,'chat_messages');
      return {insert:async (row:{room_id:string}) => { rooms.push(row.room_id); return {error:null}; }};
    }};
    for (const station of ALL_STATIONS) {
      await postStationMessage(supabase as any,{station,poNumber:'QA-23',state:'QUEUED'});
      assert.equal(rooms.at(-1),stationRoomFor(station.toLowerCase()));
    }
    await postStationMessage(supabase as any,{station:'UNKNOWN',state:'QUEUED'});
    assert.deepEqual(rooms, ALL_STATIONS.map(station=>'station-'+station.toLowerCase()));
  });
});
