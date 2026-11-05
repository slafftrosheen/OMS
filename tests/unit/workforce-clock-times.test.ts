import { describe, it, expect } from 'vitest';
import { parseClockTime, parseWorkClockInterval } from '../../src/lib/workforce/clock-times';
import { mapEntry } from '../../src/lib/server/workforce/service';

describe('workforce start and finish inputs', () => {
  it('calculates exact elapsed minutes and retains the entered minute-precision clocks', () => {
    expect(parseWorkClockInterval('2026-10-30', '08:00', '15:31')).toEqual({ startTime: '08:00', finishTime: '15:31', actualMinutes: 451 });
    expect(parseWorkClockInterval('2026-10-31', '00:00', '23:59').actualMinutes).toBe(1439);
  });

  it('rejects invalid, partial and non-minute precision clocks', () => {
    for (const value of ['', undefined, null, 8, '8:00', '24:00', '12:60', '08:00:30', '08:00Z']) {
      expect(() => parseClockTime(value)).toThrow();
    }
    for (const [start, finish] of [['08:00', '08:00'], ['17:00', '08:00'], ['23:00', '01:00']]) {
      expect(() => parseWorkClockInterval('2026-10-30', start, finish)).toThrow();
    }
  });

  it('uses Riga elapsed time around daylight-saving changes, without silently adding breaks', () => {
    expect(parseWorkClockInterval('2026-03-29', '01:00', '05:00').actualMinutes).toBe(180);
    expect(parseWorkClockInterval('2026-10-25', '01:00', '05:00').actualMinutes).toBe(300);
    expect(parseWorkClockInterval('2026-10-30', '08:00', '17:00').actualMinutes).toBe(540);
  });

  it('rejects missing or repeated DST boundary times and intervals over24 elapsed hours', () => {
    expect(() => parseWorkClockInterval('2026-03-29', '03:30', '05:00')).toThrow();
    expect(() => parseWorkClockInterval('2026-10-25', '01:00', '03:30')).toThrow();
    expect(() => parseWorkClockInterval('2026-10-25', '00:00', '23:30')).toThrow();
  });

  it('maps saved clocks without inventing times for historical duration-only rows', () => {
    const legacy = { id: 'entry', user_id: 'owner', work_date: '2026-10-30', actual_minutes: 480, credited_minutes: 480, multiplier: 1, version: 1 };
    expect(mapEntry(legacy)).toMatchObject({ actualMinutes: 480, startTime: null, finishTime: null });
    expect(mapEntry({ ...legacy, start_time: '08:00:00', finish_time: '16:00:00' })).toMatchObject({ startTime: '08:00', finishTime: '16:00' });
  });
});
