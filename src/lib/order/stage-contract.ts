export const ORDER_STAGE_STATES = ['NOT_STARTED', 'QUEUED', 'IN_PROGRESS', 'BLOCKED', 'REWORK', 'COMPLETED'] as const;

export function buildStagePatch(station: string, state: string) {
  return { url: `?station=${encodeURIComponent(station)}`, body: { state } };
}

export function updateStageRows<T extends { station: string; state: string }>(rows: T[], station: string, state: string): T[] {
  return rows.map((row) => row.station === station ? { ...row, state } : row);
}
