import { WORKFLOW_STATIONS, isKnownStation } from './workflow';

export type StageState = 'NOT_STARTED' | 'QUEUED' | 'IN_PROGRESS' | 'BLOCKED' | 'REWORK' | 'COMPLETED';
export type StageRow = { station: string; state: string };

const allowed: Record<StageState, readonly StageState[]> = {
  NOT_STARTED: ['QUEUED'],
  QUEUED: ['IN_PROGRESS', 'BLOCKED'],
  IN_PROGRESS: ['BLOCKED', 'REWORK', 'COMPLETED'],
  BLOCKED: ['IN_PROGRESS', 'REWORK'],
  REWORK: ['IN_PROGRESS', 'BLOCKED', 'COMPLETED'],
  COMPLETED: []
};

export const REVIEW_STATES = ['DRAFT', 'draft', 'PENDING_REVIEW'] as const;
export const TERMINAL_ORDER_STATES = ['DISPATCHED', 'ARCHIVED', 'CANCELLED', 'VOIDED'] as const;
export function mayConfirm(status: string): boolean { return (REVIEW_STATES as readonly string[]).includes(status); }
export function mayEditStage(status: string): boolean { return ['CONFIRMED', 'IN_PRODUCTION'].includes(status); }
export function mayAssignLoading(status: string): boolean { return status === 'IN_PRODUCTION' || status === 'READY_TO_LOAD'; }
export function mayDispatch(status: string): boolean { return status === 'READY_TO_LOAD'; }

export function validStageTransition(from: string, to: string): boolean {
  return Object.prototype.hasOwnProperty.call(allowed, from)
    && (allowed[from as StageState] as readonly string[]).includes(to);
}

export function canOperateStation(user: { role?: string; stations?: { stationId: string }[] } | null, station: string): boolean {
  if (!user || !isKnownStation(station)) return false;
  if (['RD', 'Boss', 'HeadOfProduction'].includes(user.role ?? '')) return true;
  if (!['StationHead', 'Operator'].includes(user.role ?? '')) return false;
  return (user.stations ?? []).some(s => s.stationId?.toUpperCase() === station.toUpperCase());
}

/** Loading/dispatch requires completed standard production stages, optional QC
 * if present, and no unresolved/blocked/rework stages from any station.
 * DELIVERY is performed AFTER loading and must not block it.
 */
export function productionReadiness(stages: StageRow[]): { ready: boolean; pending: string[] } {
  const byStation = new Map(stages.map(row => [row.station.toUpperCase(), row.state]));
  const required: readonly string[] = WORKFLOW_STATIONS.filter(s => s !== 'DELIVERY');
  const pending = [...required, ...(byStation.has('QC') ? ['QC'] : [])]
    .filter(station => byStation.get(station) !== 'COMPLETED');
  for (const row of stages) {
    if (['BLOCKED', 'REWORK'].includes(row.state) && !pending.includes(row.station)) {
      pending.push(row.station);
    }
  }
  return { ready: pending.length === 0, pending };
}
