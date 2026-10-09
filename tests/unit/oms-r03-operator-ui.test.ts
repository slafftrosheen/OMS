import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  priorityLabel, priorityRank, stageStateLabel, dueDateLabel,
  isOrderOverdue, compareStationOrders
} from '../../src/lib/order/operator-ui';

const source = (p: string) => readFileSync(p, 'utf8');

describe('OMS-R03 shop-floor presentation', () => {
  it('renders named and legacy numeric priorities without spurious P-prefixes', () => {
    expect(priorityLabel('HIGH')).toBe('High');
    expect(priorityLabel('NORMAL')).toBe('Normal');
    expect(priorityLabel('LOW')).toBe('Low');
    expect(priorityLabel('urgent')).toBe('Urgent');
    expect(priorityLabel(9)).toBe('P9');
    expect(priorityRank('HIGH')).toBeLessThan(priorityRank('LOW'));
  });
  it('sorts urgent orders before ordinary ones, then by earliest due date', () => {
    const urgent = { priority: 'HIGH', due_date: '2026-11-20', po_number: '123' };
    const normal = { priority: 'NORMAL', due_date: '2026-10-10', po_number: '124' };
    expect(compareStationOrders(urgent, normal)).toBeLessThan(0);
    expect(compareStationOrders(normal, { ...normal, due_date: '2026-10-30' })).toBeLessThan(0);
  });
  it('formats stage status and protects empty dates', () => {
    expect(stageStateLabel('IN_PROGRESS')).toBe('In Progress');
    expect(stageStateLabel('REWORK')).toBe('Rework');
    expect(dueDateLabel(null)).toBe('No due date');
    expect(dueDateLabel('not-a-date')).toBe('Invalid due date');
    expect(dueDateLabel('2026-10-09')).toContain('2026');
  });
  it('highlights dates before today but not dates on the due day', () => {
    expect(isOrderOverdue('2026-10-08','2026-10-09')).toBe(true);
    expect(isOrderOverdue('2026-10-09','2026-10-09')).toBe(false);
    expect(isOrderOverdue(null,'2026-10-09')).toBe(false);
  });
});

describe('OMS-R03 workflow UI guardrails', () => {
  it('does not offer a stage completion dropdown on the read-only overview', () => {
    const board = source('src/lib/components/production/StationBoard.svelte');
    expect(board).not.toContain('status-select');
    expect(board).not.toContain('onstatuschange');
    expect(board).toContain('Workstation');
    expect(board).toContain('stageStateLabel');
    const page = source('src/routes/production/+page.svelte');
    expect(page).not.toContain('handleStatusChange');
  });
  it('renders real station stages instead of order lifecycle status', () => {
    const api = source('src/routes/api/production/board/+server.ts');
    expect(api).toContain(".from('order_stages')");
    expect(api).toContain('stageState: stageStateByKey.get');
  });
  it('does not start an order implicitly on QR scan', () => {
    const station = source('src/routes/station/[station]/+page.svelte');
    const scanner = station.split('async function handleQRScan')[1]?.split('async function startOrder')[0];
    expect(scanner).toContain('goto(');
    expect(scanner).not.toContain('updateStageState(');
  });
  it('exposes accessible filters, retry, and no-data states', () => {
    const station = source('src/routes/station/[station]/+page.svelte');
    expect(station).toContain('aria-pressed=');
    expect(station).toContain('role="alert"');
    expect(station).toContain('Clear order search');
    expect(station).toContain('hasLoaded');
    expect(station).toContain('operatorCanAct');
    expect(station).toContain('min-height: 44px');
  });
  it('resolves rework through the dedicated lifecycle RPC and forbids a generic resume', () => {
    const station = source('src/routes/station/[station]/+page.svelte');
    expect(station).toContain('submitResolution');
    expect(station).toContain('Resolve rework');
    const stageApi = source('src/routes/api/orders/[id]/stages/+server.ts');
    expect(stageApi).toContain('Resolve the open rework cycle before changing stage state');
    expect(stageApi).toContain('Open a rework cycle through the dedicated rework endpoint');
  });
  it('requires quantity within real stock, and an explicit skip reason', () => {
    const modal = source('src/lib/components/station/StationCompleteModal.svelte');
    expect(modal).toContain('Number.isSafeInteger');
    expect(modal).toContain('r.quantity > r.stock');
    expect(modal).toContain('Reason for skipping (required)');
    expect(modal).toContain('Inventory search unavailable');
    expect(modal).not.toContain('Math.floor(r.quantity)');
  });
});
