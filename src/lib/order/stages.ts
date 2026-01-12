export type StationTag =
  | 'CAD'
  | 'CNC'
  | 'SANDING'
  | 'BENDING'
  | 'WELDING'
  | 'PAINT'
  | 'FILM_COATING'
  | 'GLUEING'
  | 'ASSEMBLY'
  | 'QC'
  | 'LOGISTICS';

export type StageState =
  | 'NOT_STARTED'
  | 'QUEUED'
  | 'IN_PROGRESS'
  | 'BLOCKED'
  | 'REWORK'
  | 'COMPLETED';

export type ReworkReason =
  | 'RECUT'
  | 'RESAND'
  | 'REBEND'
  | 'REWELD'
  | 'REPAINT'
  | 'RECOAT'
  | 'REGLUE'
  | 'REASSEMBLE'
  | 'RECHECK'
  | 'CUSTOM';

export const REWORK_LABEL: Record<ReworkReason, string> = {
  RECUT: 'rework.reasons.RECUT',
  RESAND: 'rework.reasons.RESAND',
  REBEND: 'rework.reasons.REBEND',
  REWELD: 'rework.reasons.REWELD',
  REPAINT: 'rework.reasons.REPAINT',
  RECOAT: 'rework.reasons.RECOAT',
  REGLUE: 'rework.reasons.REGLUE',
  REASSEMBLE: 'rework.reasons.REASSEMBLE',
  RECHECK: 'rework.reasons.RECHECK',
  CUSTOM: 'rework.reasons.CUSTOM'
};

export type StageCycle = {
  idx: number;
  station: StationTag;
  reason: ReworkReason;
  note?: string;
  at: string;
  by: string;
};

export type StageMap = Record<StationTag, StageState>;

export const STATIONS: StationTag[] = [
  'CAD',
  'CNC',
  'SANDING',
  'BENDING',
  'WELDING',
  'PAINT',
  'FILM_COATING',
  'GLUEING',
  'ASSEMBLY',
  'QC',
  'LOGISTICS'
];

export const STATE_LABEL: Record<StageState, string> = {
  NOT_STARTED: 'stages.NOT_STARTED',
  QUEUED: 'stages.QUEUED',
  IN_PROGRESS: 'stages.IN_PROGRESS',
  BLOCKED: 'stages.BLOCKED',
  REWORK: 'stages.REWORK',
  COMPLETED: 'stages.COMPLETED'
};

export const STAGE_SEQUENCE: StageState[] = [
  'NOT_STARTED',
  'QUEUED',
  'IN_PROGRESS',
  'BLOCKED',
  'REWORK',
  'COMPLETED'
];

export const STATE_TONE: Record<
  StageState,
  'primary' | 'warn' | 'danger' | 'success' | 'muted'
> = {
  NOT_STARTED: 'muted',
  QUEUED: 'primary',
  IN_PROGRESS: 'primary',
  BLOCKED: 'danger',
  REWORK: 'warn',
  COMPLETED: 'success'
};

export const ALLOWED: Partial<Record<StageState, StageState[]>> = {
  NOT_STARTED: ['QUEUED', 'IN_PROGRESS', 'BLOCKED'],
  QUEUED: ['IN_PROGRESS', 'BLOCKED'],
  IN_PROGRESS: ['REWORK', 'BLOCKED', 'COMPLETED'],
  REWORK: ['IN_PROGRESS', 'BLOCKED', 'COMPLETED'],
  BLOCKED: ['IN_PROGRESS', 'REWORK'],
  COMPLETED: []
};

export function blankStages(): StageMap {
  const base: Partial<StageMap> = {};
  for (const station of STATIONS) {
    base[station] = 'NOT_STARTED';
  }
  return base as StageMap;
}
