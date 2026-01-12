import { describe, it, expect } from 'vitest';
import { diffKeyValues } from './diff.js';

describe('diffKeyValues', () => {
  it('detects changes', () => {
    const a = { x: '1', y: '2' };
    const b = { x: '1', y: '3', z: '9' };
    const rows = diffKeyValues(a, b);
    expect(rows.find((r) => r.key === 'y')?.changed).toBe(true);
    expect(rows.find((r) => r.key === 'x')?.changed).toBe(false);
  });
});
