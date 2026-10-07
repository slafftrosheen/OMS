import { describe, expect, it } from 'vitest';
import { buildStagePatch, updateStageRows } from './stage-contract';

describe('order stage API contract', () => {
  it('builds the handler query and payload using station/state names', () => {
    expect(buildStagePatch('CNC', 'IN_PROGRESS')).toEqual({
      url: '?station=CNC',
      body: { state: 'IN_PROGRESS' }
    });
  });

  it('updates the matching stage row without replacing the stage list', () => {
    const rows = [
      { station: 'CAD', state: 'COMPLETED' },
      { station: 'CNC', state: 'QUEUED' }
    ];
    expect(updateStageRows(rows, 'CNC', 'IN_PROGRESS')).toEqual([
      { station: 'CAD', state: 'COMPLETED' },
      { station: 'CNC', state: 'IN_PROGRESS' }
    ]);
  });
});
