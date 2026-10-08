import { describe, it, expect } from 'vitest';
import { buildStagePatch, updateStageRows, ORDER_STAGE_STATES } from './stage-contract';

describe('production board stage PATCH contract', () => {
  it('builds ?station= query + {state} body as the handler requires', () => {
    const patch = buildStagePatch('CNC', 'IN_PROGRESS');
    expect(patch.url).toBe('?station=CNC');
    expect(patch.body).toEqual({ state: 'IN_PROGRESS' });
  });

  it('every state the production board offers is accepted by the handler', () => {
    // handler VALID_STATES = ORDER_STAGE_STATES; board must not offer SKIPPED
    const boardOptions = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED'];
    for (const s of boardOptions) {
      expect(ORDER_STAGE_STATES).toContain(s);
    }
    expect(ORDER_STAGE_STATES).not.toContain('SKIPPED');
  });

  it('url-encodes station names with special characters', () => {
    expect(buildStagePatch('ST A/B', 'QUEUED').url).toBe('?station=ST%20A%2FB');
  });

  it('updates only the touched stage row', () => {
    const rows = [
      { station: 'CAD', state: 'COMPLETED' },
      { station: 'CNC', state: 'QUEUED' },
    ];
    expect(updateStageRows(rows, 'CNC', 'IN_PROGRESS')).toEqual([
      { station: 'CAD', state: 'COMPLETED' },
      { station: 'CNC', state: 'IN_PROGRESS' },
    ]);
  });
});