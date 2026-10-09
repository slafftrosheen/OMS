import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  ACTIVE_ORDER_STATUSES, capacityStateFilter, exportCsv, mergeOrderExportRows, stationLogRpcArgs
} from '../../src/lib/server/contracts/oms-r01';
import { ALL_STATIONS, WORKFLOW_STATIONS, isKnownStation } from '../../src/lib/order/workflow';

describe('OMS-R01 deployed contracts', () => {
  it('maps station log payloads to the exact three-argument RPC', () => {
    expect(stationLogRpcArgs({
      orderId: 'order-a', station: ' cnc ', logType: 'REWORK',
      message: 'Redo panel', isIssue: true,
      qualityScore: 5, tags: ['quality']
    })).toEqual({
      p_station: 'CNC', p_action: 'REWORK',
      p_details: {
        order_id: 'order-a', message: 'Redo panel', is_issue: true,
        quality_score: 5, tags: ['quality']
      }
    });
    expect(() => stationLogRpcArgs({ station: '', logType: 'OTHER' })).toThrow();
  });

  it('maps old capacity-status labels to the deployed state field', () => {
    expect(capacityStateFilter('ok')).toBe('open');
    expect(capacityStateFilter('warning')).toBe('tight');
    expect(capacityStateFilter('blocked')).toBe('blocked');
    expect(capacityStateFilter('invalid')).toBeNull();
    expect(capacityStateFilter(null)).toBeNull();
  });

  it('joins order exports by loading date and draft_order_id', () => {
    const out = mergeOrderExportRows(
      [{ id: 'o1', loading_date: '2026-10-12' }, { id: 'o2', loading_date: null }],
      [{ date: '2026-10-12', notes: 'Truck 1' }],
      [
        { draft_order_id: 'o1', assignee_id: 'u1' },
        { draft_order_id: 'o1', assignee_id: 'u1' },
        { draft_order_id: 'o2', assignee_id: 'u2' }
      ]
    );
    expect(out[0].loading_day).toMatchObject({ notes: 'Truck 1' });
    expect(out[0].assignees_data).toEqual(['u1']);
    expect(out[1].loading_day).toBeNull();
    expect(out[1].assignees_data).toEqual(['u2']);
  });

  it('creates in-memory CSV with escaped quotes and no spreadsheet formulas', () => {
    const csv = exportCsv([{ client: '=SUM(1,1)', notes: 'A"BC' }], ['client', 'notes']);
    expect(csv).toContain(`"'=SUM(1,1)"`);
    expect(csv).toContain(`"A""BC"`);
    expect(csv).toContain('\r\n');
  });

  it('keeps legacy stations addressable and excludes shipped orders', () => {
    expect(isKnownStation('welding')).toBe(true);
    expect(ALL_STATIONS).toContain('PACKAGING');
    expect(WORKFLOW_STATIONS[0]).toBe('CAD');
    expect(ACTIVE_ORDER_STATUSES).not.toContain('DISPATCHED');
  });
});

describe('OMS-R01 source contract guardrails', () => {
  const source = (path: string) => readFileSync(path, 'utf8');

  it('never embeds a non-existent draft_orders/loading_days FK', () => {
    const code = source('src/routes/api/export/+server.ts');
    expect(code).not.toContain('loading_day:loading_days');
    expect(code).not.toContain('orders:draft_orders(*)');
    expect(code).toContain(".from('loading_event_pos')");
    expect(code).toContain(".from('order_assignees')");
  });

  it('does not write a temporary CSV file from a production handler', () => {
    const code = source('src/routes/api/export/+server.ts');
    expect(code).not.toContain("require('fs')");
    expect(code).not.toContain('temp.csv');
  });

  it('never calls the non-idempotent legacy lock RPC for set-state', () => {
    const code = source('src/routes/api/loading-days/capacity/+server.ts');
    expect(code).not.toContain(".rpc('toggle_loading_day_lock'");
    expect(code).toContain('canManageSharedInventory');
    expect(code).toContain("is_blocked: body.lock");
  });

  it('returns a loading ICS string and resolves the calendar event FK', () => {
    const code = source('src/lib/server/calendar/CalendarService.ts');
    const method = code.split('async generateLoadingCalendar()')[1].split('Create calendar subscription token')[0];
    expect(method).toContain(".from('calendar_events')");
    expect(method).toContain('loading_event_id');
    expect(method).toContain('return calendar.toString()');
    expect(method).not.toContain("days.map((d: any) => String(d.id))");
  });

  it('does not query nonexistent station_timeline columns', () => {
    const code = source('src/routes/api/station-logs/+server.ts');
    expect(code).toContain("details->>order_id");
    expect(code).toContain("details->>is_issue");
    expect(code).not.toContain(".eq('log_type',");
    expect(code).not.toContain(".eq('order_id',");
  });
});
