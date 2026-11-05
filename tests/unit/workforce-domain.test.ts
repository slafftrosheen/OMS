import { describe, it, expect } from 'vitest';
import { calendarMonth, classifyWorkDay, easterSunday, monthBounds, rigaToday } from '../../src/lib/workforce/calendar';
import { emptyTotals, formatMinutes, totalEntries } from '../../src/lib/workforce/calculations';
import { parseActualMinutes, parseDate, parseHoursToMinutes, parseMonth, parseVersion } from '../../src/lib/workforce/validation';

describe('workforce calendar and exact hour accounting', () => {
  it('uses Riga dates at UTC midnight boundaries and both DST offsets', () => {
    expect(rigaToday(new Date('2026-01-01T22:30:00Z'))).toBe('2026-01-02');
    expect(rigaToday(new Date('2026-06-01T21:30:00Z'))).toBe('2026-06-02');
    expect(rigaToday(new Date('2026-03-29T00:30:00Z'))).toBe('2026-03-29');
    expect(rigaToday(new Date('2026-10-25T01:30:00Z'))).toBe('2026-10-25');
  });

  it('computes Easter, Pentecost and Mother’s Day, without stacking weekend credits', () => {
    expect(easterSunday(2024)).toBe('2024-03-31');
    expect(easterSunday(2025)).toBe('2025-04-20');
    expect(easterSunday(2026)).toBe('2026-04-05');
    expect(classifyWorkDay('2026-04-03').holidayName).toBe('Good Friday');
    expect(classifyWorkDay('2026-04-06').multiplier).toBe(2);
    expect(classifyWorkDay('2026-05-10').holidayName).toBe('Mother’s Day');
    const pentecost = classifyWorkDay('2026-05-24');
    expect(pentecost.isWeekend).toBe(true);
    expect(pentecost.isPublicHoliday).toBe(true);
    expect(pentecost.multiplier).toBe(2);
    expect(classifyWorkDay('2035-05-13').holidayName).toBe('Pentecost / Mother’s Day');
    expect(classifyWorkDay('2035-05-13').multiplier).toBe(2);
    expect(classifyWorkDay('2026-10-30').multiplier).toBe(1);
    expect(classifyWorkDay('2026-10-31').multiplier).toBe(2);
  });

  it('only carries over specified holidays and includes verified historical festival dates', () => {
    const observed = classifyWorkDay('2025-05-05');
    expect(observed.isObservedDayOff).toBe(true);
    expect(observed.isPublicHoliday).toBe(false);
    expect(observed.multiplier).toBe(2);
    expect(classifyWorkDay('2023-11-20').isObservedDayOff).toBe(true);
    expect(classifyWorkDay('2023-01-02').multiplier).toBe(1);
    expect(classifyWorkDay('2018-07-09').isObservedDayOff).toBe(true);
    expect(classifyWorkDay('2023-07-09').isPublicHoliday).toBe(true);
    expect(classifyWorkDay('2023-07-10').isObservedDayOff).toBe(true);
    expect(classifyWorkDay('2023-05-29').holidayName).toBe('Latvian Ice Hockey Bronze Medal Day');
    expect(classifyWorkDay('2025-07-07').holidayName).toBe(null);
  });

  it('applies explicit exceptions without turning weekends into normal-rate days', () => {
    const override = { date: '2026-10-30', name: 'Company holiday', isPublicHoliday: true, version: 1, updatedAt: '' };
    expect(classifyWorkDay(override.date, [override]).multiplier).toBe(2);
    const removedHoliday = { ...override, date: '2026-11-18', isPublicHoliday: false };
    expect(classifyWorkDay(removedHoliday.date, [removedHoliday]).multiplier).toBe(1);
    const weekend = { ...removedHoliday, date: '2026-10-31' };
    expect(classifyWorkDay(weekend.date, [weekend]).multiplier).toBe(2);
  });

  it('rejects rollover dates, unbounded months, invalid minutes and inexact decimal hours', () => {
    for (const invalid of ['2026-02-29', '2026-04-31', '2026-13-01', '2026-1-01', '2014-12-31', '2100-01-01']) expect(() => parseDate(invalid)).toThrow();
    for (const invalid of ['2026-13', '2026-1', '2026-02-01', '2026-01&userId=other']) expect(() => parseMonth(invalid)).toThrow();
    expect(parseDate('2024-02-29')).toBe('2024-02-29');
    expect(calendarMonth('2024-02').length).toBe(29);
    expect(monthBounds('2026-12')).toEqual({ start: '2026-12-01', end: '2026-12-31', next: '2027-01-01' });
    expect(parseHoursToMinutes('7.75')).toBe(465);
    expect(parseHoursToMinutes('7,5')).toBe(450);
    expect(parseHoursToMinutes('0')).toBe(0);
    expect(parseHoursToMinutes('24.000000')).toBe(1440);
    expect(parseActualMinutes(1)).toBe(1);
    for (const invalid of ['0.01', '1.333333', '24.01', '-1', '2e1', '1:30', 'Infinity']) expect(() => parseHoursToMinutes(invalid)).toThrow();
    for (const invalid of [-1, 1441, 1.5, NaN, '60']) expect(() => parseActualMinutes(invalid)).toThrow();
    expect(parseVersion(null, true)).toBe(null);
    expect(() => parseVersion(undefined, true)).toThrow();
  });

  it('retains actual hours and deliberate zero entries separately from credit and missing records', () => {
    expect(totalEntries([])).toEqual(emptyTotals());
    const totals = totalEntries([
      { actualMinutes: 450, multiplier: 1, creditedMinutes: 450 },
      { actualMinutes: 120, multiplier: 2, creditedMinutes: 240 },
      { actualMinutes: 0, multiplier: 1, creditedMinutes: 0 }
    ]);
    expect(totals).toEqual({ actualMinutes: 570, regularMinutes: 450, premiumMinutes: 120, creditedMinutes: 690, daysWorked: 2, recordedDays: 3 });
    expect(formatMinutes(totals.actualMinutes)).toBe('9 h 30 min');
    expect(formatMinutes(totals.creditedMinutes)).toBe('11 h 30 min');
  });
});
