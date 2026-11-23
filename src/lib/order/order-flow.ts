/** Order flow guide: where an order is in its life and the one next step.
 * Read-only guidance. It never authorises a transition: every action it names
 * maps to a control the order page already shows under the same permission. */
import { orderLifecycle, type OrderLifecycle } from './status-semantics';

export const ORDER_FLOW_STEPS = ['draft', 'review', 'confirmed', 'production', 'loading', 'dispatched', 'archived'] as const;
export type OrderFlowStep = typeof ORDER_FLOW_STEPS[number];
export type OrderFlowAction = 'edit' | 'review' | 'stages' | 'dispatch' | 'archive' | null;
export type OrderFlowTone = 'normal' | 'held' | 'blocked' | 'done' | 'stopped';

export interface OrderFlowPermissions {
  mayEdit: boolean; mayReview: boolean; mayDispatch: boolean; mayControlAnyStage: boolean;
}
export interface OrderFlow {
  step: OrderFlowStep | null;
  index: number;
  tone: OrderFlowTone;
  /** i18n key under orderFlow.next */
  next: string;
  /** Station named in the next-step sentence, if any. */
  station: string | null;
  owner: 'author' | 'review' | 'floor' | 'logistics' | null;
  action: OrderFlowAction;
}

const stepOf: Partial<Record<OrderLifecycle, OrderFlowStep>> = {
  draft: 'draft', pending_review: 'review', confirmed: 'confirmed', in_production: 'production',
  ready_to_load: 'loading', dispatched: 'dispatched', archived: 'archived', completed: 'archived', open: 'confirmed'
};

type StageRow = { station?: unknown; state?: unknown };
function stageRows(rows: unknown): Array<{ station: string; state: string }> {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row: StageRow) => row && typeof row.station === 'string' && typeof row.state === 'string'
    ? [{ station: row.station.trim().toUpperCase(), state: row.state.trim().toUpperCase() }] : []);
}

export function orderFlow(status: unknown, stages: unknown, can: OrderFlowPermissions): OrderFlow {
  const life = orderLifecycle(status);
  const rows = stageRows(stages).filter(row => row.station !== 'DELIVERY');
  const base = (step: OrderFlowStep | null, tone: OrderFlowTone, next: string, owner: OrderFlow['owner'], action: OrderFlowAction, station: string | null = null): OrderFlow =>
    ({ step, index: step ? ORDER_FLOW_STEPS.indexOf(step) : -1, tone, next, owner, action, station });

  if (life === 'cancelled' || life === 'voided') return base(null, 'stopped', life, null, null);
  if (life === 'on_hold') {
    const step: OrderFlowStep = rows.some(r => r.state !== 'NOT_STARTED') ? 'production' : 'confirmed';
    return base(step, 'held', 'on_hold', null, null);
  }
  const step = life ? stepOf[life] ?? null : null;
  switch (step) {
    case 'draft': return base(step, 'normal', 'draft', 'author', can.mayEdit ? 'edit' : null);
    case 'review': return base(step, 'normal', 'review', 'review', can.mayReview ? 'review' : null);
    case 'confirmed':
    case 'production': {
      const blocked = rows.find(r => r.state === 'BLOCKED' || r.state === 'REWORK');
      const action = can.mayControlAnyStage ? 'stages' : null;
      if (blocked) return base('production', 'blocked', blocked.state === 'REWORK' ? 'rework' : 'blocked', 'floor', action, blocked.station);
      const running = rows.find(r => r.state === 'IN_PROGRESS');
      if (running) return base('production', 'normal', 'running', 'floor', action, running.station);
      const waiting = rows.find(r => r.state === 'NOT_STARTED');
      if (waiting) return base(rows.some(r => r.state === 'COMPLETED' || r.state === 'SKIPPED') ? 'production' : step,
        'normal', 'start', 'floor', action, waiting.station);
      return base('production', 'normal', rows.length ? 'finish' : 'no_stages', rows.length ? 'logistics' : null, null);
    }
    case 'loading': return base(step, 'normal', 'loading', 'logistics', can.mayDispatch ? 'dispatch' : null);
    case 'dispatched': return base(step, 'normal', 'dispatched', 'logistics', can.mayDispatch ? 'archive' : null);
    case 'archived': return base(step, 'done', 'archived', null, null);
    default: return base(null, 'normal', 'unknown', null, null);
  }
}
