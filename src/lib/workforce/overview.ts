import type { Absence, TeamWorker, WorkEntry, WorkforceDay, WorkforceMonth, WorkforceReport } from './types';
import { MAX_WORKFORCE_YEAR, MIN_WORKFORCE_YEAR } from './validation';

export function adjacentWorkMonth(month: string, direction: -1 | 1): string | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  const date = new Date(`${month}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + direction);
  if (date.getUTCFullYear() < MIN_WORKFORCE_YEAR || date.getUTCFullYear() > MAX_WORKFORCE_YEAR) return null;
  return date.toISOString().slice(0, 7);
}

export type MonthDayStatus = 'recorded' | 'zero' | 'absence' | 'unrecorded' | 'future';
export interface MonthDayOverview {
  day: WorkforceDay;
  entry?: WorkEntry;
  absence?: Absence;
  status: MonthDayStatus;
}

/** A calendar is a record overview, not an assumed rota or attendance requirement. */
export function monthOverview(data: Pick<WorkforceMonth, 'days' | 'entries' | 'absences' | 'today'>): MonthDayOverview[] {
  const entries = new Map(data.entries.map(entry => [entry.workDate, entry]));
  const absences = data.absences.filter(absence => absence.status === 'active');
  return data.days.map(day => {
    const entry = entries.get(day.date);
    const absence = absences.find(row => row.startDate <= day.date && row.endDate >= day.date);
    return {
      day, entry, absence,
      status: entry ? (entry.actualMinutes > 0 ? 'recorded' : 'zero')
        : absence ? 'absence' : day.date > data.today ? 'future' : 'unrecorded'
    };
  });
}

/** Monday first. UTC prevents a browser's zone from moving date-only values. */
export function monthCalendarRows(days: readonly MonthDayOverview[]): Array<Array<MonthDayOverview | null>> {
  if (!days.length) return [];
  const firstWeekday = (new Date(`${days[0].day.date}T12:00:00Z`).getUTCDay() + 6) % 7;
  const cells: Array<MonthDayOverview | null> = [...Array(firstWeekday).fill(null), ...days];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, index) => cells.slice(index * 7, index * 7 + 7));
}

export type TeamFilter = 'all' | 'active' | 'inactive' | 'unrecorded' | 'absence';
/** Safe UI metadata only; search text and worker identities stay in the view. */
export interface TeamVisibilitySummary { count: number; filter: TeamFilter; searchActive: boolean }
const searchKey = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase();

export function filterTeam(workers: readonly TeamWorker[], query: string, filter: TeamFilter): TeamWorker[] {
  const terms = searchKey(query).trim().split(/\s+/).filter(Boolean);
  return workers.filter(worker => {
    const name = searchKey(`${worker.displayName} ${worker.username}`);
    if (!terms.every(term => name.includes(term))) return false;
    if (filter === 'active') return worker.isActive;
    if (filter === 'inactive') return !worker.isActive;
    // A saved zero is an entry. No entry says nothing about whether work was expected.
    if (filter === 'unrecorded') return worker.totals.recordedDays === 0;
    if (filter === 'absence') return worker.activeAbsences.some(absence => absence.status === 'active');
    return true;
  });
}

export type ReportKindFilter = 'all' | WorkforceReport['kind'];
export interface ReportVisibilitySummary { count: number; kind: ReportKindFilter; versions: 'latest' | 'all' }

export function latestReportIds(reports: readonly WorkforceReport[]): Set<string> {
  const latest = new Map<string, WorkforceReport>();
  for (const report of reports) {
    const key = `${report.kind}:${report.period}`;
    const previous = latest.get(key);
    if (!previous || report.version > previous.version
      || (report.version === previous.version && report.generatedAt > previous.generatedAt)) latest.set(key, report);
  }
  return new Set([...latest.values()].map(report => report.id));
}

export function filterReports(reports: readonly WorkforceReport[], kind: ReportKindFilter, allVersions: boolean): WorkforceReport[] {
  const latest = latestReportIds(reports);
  return reports.filter(report => (kind === 'all' || report.kind === kind) && (allVersions || latest.has(report.id)))
    .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'monthly_hours' ? -1 : 1)
      || b.period.localeCompare(a.period) || b.version - a.version || b.generatedAt.localeCompare(a.generatedAt));
}
