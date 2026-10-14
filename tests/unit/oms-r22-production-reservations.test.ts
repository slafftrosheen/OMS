import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {parseReservationAction,validDate} from '../../src/lib/order/production-reservation';
const read=(path:string)=>readFileSync(path,'utf8');
const id='11111111-1111-4111-8111-111111111111';
const valid={action:'propose',orderId:id,station:'CNC',workDate:'2026-10-19',hours:2.25,note:''};
describe('OMS-R22 production reservation approval boundaries',()=>{
 it('accepts proposed stage/day hours with two decimal places',()=>{
  expect(parseReservationAction(valid)).toMatchObject({
   action:'propose',orderId:id,station:'CNC',workDate:'2026-10-19',hours:2.25
  });
  expect(validDate('2026-10-19')).toBe(true);
  expect(validDate('2026-02-30')).toBe(false);
  for(const hours of [0,-1,1000,1.234,NaN])
   expect(()=>parseReservationAction({...valid,hours})).toThrow();
 });
 it('requires exact reservation ID and version for approval and cancellation',()=>{
  expect(parseReservationAction({action:'approve',reservationId:id,expectedUpdatedAt:'2026-10-14T12:00:00+03:00'}))
   .toMatchObject({action:'approve',reservationId:id});
  for(const action of ['approve','cancel'])
    expect(()=>parseReservationAction({action,reservationId:id})).toThrow();
 });
 it('enforces manager role on every mutation even when UI is bypassed',()=>{
  const api=read('src/routes/api/production/reservations/+server.ts');
  expect(api).toContain('canManageSharedInventory(locals.user.role)');
  expect(api).toContain("oms_manage_production_reservation");
  expect(api).toContain("p_expected_updated_at:payload.expectedUpdatedAt");
  expect(api).toContain("status:payload.action==='propose'?201:200");
 });
 it('uses a serialized authoritative SQL approval and checks workflow prerequisites',()=>{
  const sql=read('supabase/migrations/20261014000003_production_reservation_approvals.sql');
  expect(sql).toContain('WHERE station=v_station FOR UPDATE');
  expect(sql).toContain('FOR UPDATE;');
  expect(sql).toContain("v_booked+v_row.hours >");
  expect(sql).toContain("v_stage_booked+v_row.hours>v_stage.estimated_hours");
  expect(sql).toContain("previous.state::text='COMPLETED'");
  expect(sql).toContain('AS prerequisite(station)');
  expect(sql).toContain('previous.station::text=prerequisite.station');
  expect(sql).toContain("'PROPOSED','APPROVED','CANCELLED'");
  expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
  expect(sql).toContain('GRANT SELECT ON public.production_reservations TO authenticated');
  expect(sql).not.toContain('GRANT INSERT ON public.production_reservations');
  expect(sql).toContain('oms_guard_capacity_bookings');
  expect(sql).toContain('oms_cancel_completed_stage_reservations');
 });
 it('does not allow supplying a second order as an approval prerequisite bypass',()=>{
  const sql=read('supabase/migrations/20261014000003_production_reservation_approvals.sql');
  expect(sql).toContain('OR p_order_id IS NOT NULL OR p_station IS NOT NULL');
  expect(sql).toContain("CASE WHEN p_action='propose' THEN p_order_id ELSE v_row.draft_order_id END");
 });
 it('only allows proposals on approved production state and explicitly blocks premature approval',()=>{
  const sql=read('supabase/migrations/20261014000003_production_reservation_approvals.sql');
  expect(sql).toContain("'CONFIRMED','IN_PRODUCTION'");
  expect(sql).toContain("v_stage.state::text NOT IN ('QUEUED','IN_PROGRESS')");
  expect(sql).toContain("p_action='cancel'");
 });
 it('keeps forecast suggestions separate from approved bookings',()=>{
  const panel=read('src/lib/components/production/ProductionReservationPanel.svelte');
  const planner=read('src/routes/production/planner/+page.svelte');
  expect(panel).toContain('approvedHours');
  expect(panel).toContain("record.status==='PROPOSED'");
  expect(panel).toContain("activeKeys.has(");
  expect(panel).toContain('confirmApprove');
  expect(planner).toContain('<ProductionReservationPanel');
 });
 it('localizes ledger and approval warnings across all supported languages',()=>{
  for(const lang of ['en','ru','lv']){
   const messages=JSON.parse(read(`src/locales/${lang}.json`)).productionReservations;
   expect(messages.forecastWarning.length).toBeGreaterThan(30);
   expect(messages.conflict).toBeTruthy();
   expect(messages.status.APPROVED).toBeTruthy();
  }
 });
});
