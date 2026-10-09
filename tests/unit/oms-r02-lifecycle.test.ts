import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  canOperateStation, mayAssignLoading, mayConfirm, mayDispatch, mayEditStage,
  productionReadiness, validStageTransition
} from '../../src/lib/order/lifecycle-guards';
import { WORKFLOW_STATIONS } from '../../src/lib/order/workflow';

const production = WORKFLOW_STATIONS
  .filter(s => s !== 'DELIVERY')
  .map(station => ({ station, state: 'COMPLETED' }));

describe('OMS-R02 lifecycle policy', () => {
  it('only confirms review-stage orders', () => {
    for (const s of ['DRAFT','draft','PENDING_REVIEW']) expect(mayConfirm(s)).toBe(true);
    for (const s of ['CONFIRMED','IN_PRODUCTION','READY_TO_LOAD','DISPATCHED','ARCHIVED','VOIDED'])
      expect(mayConfirm(s)).toBe(false);
  });
  it('keeps stage edits within active production', () => {
    expect(mayEditStage('CONFIRMED')).toBe(true);
    expect(mayEditStage('IN_PRODUCTION')).toBe(true);
    expect(mayEditStage('READY_TO_LOAD')).toBe(false);
    expect(mayEditStage('ARCHIVED')).toBe(false);
  });
  it('requires a real loading assignment before dispatch', () => {
    expect(mayAssignLoading('IN_PRODUCTION')).toBe(true);
    expect(mayAssignLoading('DRAFT')).toBe(false);
    expect(mayDispatch('CONFIRMED')).toBe(false);
    expect(mayDispatch('IN_PRODUCTION')).toBe(false);
    expect(mayDispatch('READY_TO_LOAD')).toBe(true);
  });
  it('does not allow a generic PATCH to complete or reopen a finished stage', () => {
    expect(validStageTransition('NOT_STARTED','QUEUED')).toBe(true);
    expect(validStageTransition('QUEUED','IN_PROGRESS')).toBe(true);
    expect(validStageTransition('IN_PROGRESS','BLOCKED')).toBe(true);
    expect(validStageTransition('BLOCKED','IN_PROGRESS')).toBe(true);
    expect(validStageTransition('IN_PROGRESS','REWORK')).toBe(true);
    expect(validStageTransition('REWORK','IN_PROGRESS')).toBe(true);
    expect(validStageTransition('IN_PROGRESS','COMPLETED')).toBe(true);
    expect(validStageTransition('COMPLETED','IN_PROGRESS')).toBe(false);
    expect(validStageTransition('NOT_STARTED','COMPLETED')).toBe(false);
  });
  it('requires every production stage, excluding DELIVERY', () => {
    expect(productionReadiness(production)).toEqual({ ready: true, pending: [] });
    expect(productionReadiness(production.slice(0, -1)).ready).toBe(false);
    expect(productionReadiness([...production, { station:'QC', state:'IN_PROGRESS' }]).pending)
      .toContain('QC');
    expect(productionReadiness([...production, { station:'QC', state:'COMPLETED' }]).ready).toBe(true);
    expect(productionReadiness([...production, { station:'SANDING', state:'REWORK' }]).ready)
      .toBe(false);
  });
  it('rejects unassigned operator stations even with valid credentials', () => {
    const operator = { role:'Operator', stations:[{ stationId:'cnc' }] };
    expect(canOperateStation(operator,'CNC')).toBe(true);
    expect(canOperateStation(operator,'PAINT')).toBe(false);
    expect(canOperateStation({ role:'HeadOfProduction', stations:[] },'PAINT')).toBe(true);
    expect(canOperateStation(null,'CAD')).toBe(false);
  });
});

const code = (path: string) => readFileSync(path,'utf8');
describe('OMS-R02 API and transaction invariants', () => {
  it('does not publish CONFIRMED before stage initialization', () => {
    const s = code('src/routes/api/draft-orders/[id]/confirm/+server.ts');
    expect(s).toContain("'confirm_order_with_stages'");
    const migration = code('supabase/migrations/20261009000004_confirm_order_with_stages.sql');
    expect(migration.indexOf('INSERT INTO public.order_stages'))
      .toBeLessThan(migration.indexOf('UPDATE public.draft_orders'));
    expect(code('src/routes/api/draft-orders/[id]/approve/+server.ts'))
      .toContain("export { POST } from '../confirm/+server'");
  });
  it('calls atomic consumption RPC rather than direct stock deduction', () => {
    const s = code('src/routes/api/orders/[id]/stages/[station]/complete/+server.ts');
    expect(s).toContain("rpc(\n    'complete_stage_with_consumption'");
    expect(s).not.toContain("'consume_materials_for_order'");
    const migration = code('supabase/migrations/20261009000001_complete_stage_with_consumption.sql');
    expect(migration).toContain('FOR UPDATE');
    expect(migration).toContain("v_stage_state NOT IN ('IN_PROGRESS','REWORK')");
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.consume_materials_for_order');
  });
  it('makes loading assignment atomic and capacity-aware', () => {
    const api = code('src/routes/api/loading-days/[id]/orders/+server.ts');
    expect(api).toContain("rpc('assign_order_loading_day'");
    const sql = code('supabase/migrations/20261009000002_assign_order_loading_day.sql');
    expect(sql).toContain('FOR UPDATE');
    expect(sql).toContain('v_used>=');
    expect(sql).toContain("'READY_TO_LOAD'");
  });
  it('makes rework and its stage state a single transaction', () => {
    const s = code('src/routes/api/orders/[id]/rework/+server.ts');
    expect(s).toContain("rpc('open_order_rework'");
    expect(s).toContain("rpc('resolve_order_rework'");
  });
  it('prevents generic API status bypasses', () => {
    const d = code('src/routes/api/draft-orders/[id]/+server.ts');
    const o = code('src/routes/api/orders/[id]/+server.ts');
    expect(d).toContain('Use the dedicated order lifecycle endpoints');
    expect(o).not.toContain("'status', 'priority'");
    expect(o).toContain("['status', 'po_number', 'loading_date']");
  });
});
