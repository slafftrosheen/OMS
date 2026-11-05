import { describe, expect, it } from 'vitest';
import { calendarMonth } from '../../src/lib/workforce/calendar';
import { emptyTotals, totalEntries } from '../../src/lib/workforce/calculations';
import { adjacentWorkMonth, filterReports, filterTeam, latestReportIds, monthCalendarRows, monthOverview } from '../../src/lib/workforce/overview';
import type { Absence, TeamWorker, WorkEntry, WorkforceReport } from '../../src/lib/workforce/types';

const entry = (workDate: string, actualMinutes: number): WorkEntry => ({
  id: workDate, userId: 'worker', workDate, actualMinutes, creditedMinutes: actualMinutes, multiplier: 1,
  holidayName: null, note: '', version: 1, createdAt: '', updatedAt: ''
});
const absence = (startDate: string, endDate = startDate, overrides: Partial<Absence> = {}): Absence => ({
  id: startDate, userId: 'worker', startDate, endDate, partialDay: false, reason: 'leave', note: '', status: 'active',
  version: 1, createdAt: '', updatedAt: '', ...overrides
});
const worker = (userId: string, overrides: Partial<TeamWorker> = {}): TeamWorker => ({
  userId, displayName: userId, username: userId, role: 'Operator', isActive: true, totals: emptyTotals(), activeAbsences: [], ...overrides
});
const report = (id: string, kind: WorkforceReport['kind'], period: string, version: number, generatedAt = ''): WorkforceReport => ({
  id, kind, period, version, generatedAt, isStale: false,
  payload: { month: period.slice(0, 7), workers: [], totals: emptyTotals(), timeZone: 'Europe/Riga', policyVersion: 'lv-company-hours-v1' }
});

describe('workforce record overviews', () => {
  it('distinguishes saved zero, work, full/partial absence, cancellation, upcoming and unknown days', () => {
    const rows = monthOverview({ days: calendarMonth('2026-10'), today: '2026-10-12',
      entries: [entry('2026-10-01', 480), entry('2026-10-02', 0), entry('2026-10-06', 120)],
      absences: [absence('2026-10-03', '2026-10-04'), absence('2026-10-06', undefined, { partialDay: true }),
        absence('2026-10-07', undefined, { status: 'cancelled' }), absence('2026-10-15')]
    });
    const on = (date: string) => rows.find(row => row.day.date === date)!;
    expect(on('2026-10-01').status).toBe('recorded');
    expect(on('2026-10-02').status).toBe('zero');
    expect(on('2026-10-03').status).toBe('absence');
    expect(on('2026-10-04').status).toBe('absence');
    expect(on('2026-10-06').status).toBe('recorded');
    expect(on('2026-10-06').absence?.partialDay).toBe(true);
    expect(on('2026-10-07').status).toBe('unrecorded');
    expect(on('2026-10-10').status).toBe('unrecorded'); // Weekend is not inferred to be a day off.
    expect(on('2026-10-12').status).toBe('unrecorded');
    expect(on('2026-10-13').status).toBe('future');
    expect(on('2026-10-15').status).toBe('absence'); // Planned absence remains visible.
  });

  it('keeps month cells Monday-first across leap years and six-week months', () => {
    const rows = (month: string) => monthCalendarRows(monthOverview({ days: calendarMonth(month), today: '2026-10-31', entries: [], absences: [] }));
    expect(rows('2026-10')[0].slice(0, 3)).toEqual([null, null, null]);
    expect(rows('2026-10')[0][3]?.day.date).toBe('2026-10-01');
    expect(rows('2024-02').flat().filter(Boolean).length).toBe(29);
    expect(rows('2026-03').length).toBe(6);
    expect(rows('2026-03')[0][6]?.day.date).toBe('2026-03-01');
    expect(monthCalendarRows([])).toEqual([]);
  });

  it('navigates across years without exceeding supported calendar bounds', () => {
    expect(adjacentWorkMonth('2026-12', 1)).toBe('2027-01');
    expect(adjacentWorkMonth('2026-01', -1)).toBe('2025-12');
    expect(adjacentWorkMonth('2015-01', -1)).toBe(null);
    expect(adjacentWorkMonth('2099-12', 1)).toBe(null);
    expect(adjacentWorkMonth('2026-13', 1)).toBe(null);
    expect(adjacentWorkMonth('', 1)).toBe(null);
  });

  it('finds Latvian names without diacritics and combines all name terms with the selected status', () => {
    const workers = [worker('elina', { displayName: 'Elīna Ozola' }), worker('janis', { displayName: 'Jānis Bērziņš', isActive: false })];
    expect(filterTeam(workers, '  OZOLA elina ', 'all').map(row => row.userId)).toEqual(['elina']);
    expect(filterTeam(workers, 'berzins', 'all').map(row => row.userId)).toEqual(['janis']);
    expect(filterTeam(workers, 'janis', 'active')).toEqual([]);
    expect(filterTeam(workers, 'janis', 'inactive').map(row => row.userId)).toEqual(['janis']);
    expect(filterTeam(workers, 'unknown', 'all')).toEqual([]);
  });

  it('does not treat a saved zero as no entry and only filters active absence notices', () => {
    const workers = [worker('missing'), worker('zero', { totals: totalEntries([entry('2026-10-01', 0)]) }),
      worker('away', { activeAbsences: [absence('2026-10-02')] }),
      worker('cancelled', { activeAbsences: [absence('2026-10-02', undefined, { status: 'cancelled' })] })];
    expect(filterTeam(workers, '', 'unrecorded').map(row => row.userId)).toEqual(['missing', 'away', 'cancelled']);
    expect(filterTeam(workers, '', 'absence').map(row => row.userId)).toEqual(['away']);
  });

  it('selects latest versions separately per report kind and period, independent of input order', () => {
    const reports = [report('m1', 'monthly_hours', '2026-09-01', 1, '2026-10-04'),
      report('d2', 'daily_absences', '2026-09-01', 2), report('m2', 'monthly_hours', '2026-09-01', 2, '2026-10-02'),
      report('d1', 'daily_absences', '2026-09-01', 1), report('d3', 'daily_absences', '2026-09-02', 1)];
    expect([...latestReportIds(reports)].sort()).toEqual(['d2', 'd3', 'm2']);
    expect(filterReports(reports, 'all', false).map(row => row.id)).toEqual(['m2', 'd3', 'd2']);
    expect(filterReports(reports, 'monthly_hours', true).map(row => row.id)).toEqual(['m2', 'm1']);
    expect(filterReports(reports, 'daily_absences', false).map(row => row.id)).toEqual(['d3', 'd2']);
    expect(reports[0].id).toBe('m1'); // Filtering never changes immutable snapshot order/content.
  });
});
