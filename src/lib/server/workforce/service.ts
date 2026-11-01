import type { SupabaseClient } from '@supabase/supabase-js';
import type { RequestEvent } from '@sveltejs/kit';
import { isAdminRole, type SessionUser } from '$lib/server/auth/session';
import { calendarMonth, classifyWorkDay, monthBounds, rigaToday } from '$lib/workforce/calendar';
import { formatMinutes, sumTotals, totalEntries } from '$lib/workforce/calculations';
import {
  WORKFORCE_POLICY_VERSION, WORKFORCE_TIME_ZONE,
  type Absence, type HolidayOverride, type WorkEntry, type WorkforceMonth,
  type WorkforceOwner, type WorkforceReport, type WorkforceTeam
} from '$lib/workforce/types';
import { parseMonth, parseUuid, WorkforceError } from '$lib/workforce/validation';

type Database = SupabaseClient<any, any, any>;
type Row = Record<string, any>;

export function requireWorkforceUser(event: Pick<RequestEvent, 'locals'>, manager = false): SessionUser {
  const user = event.locals.user;
  if (!user) throw new WorkforceError('Sign in to open your cabinet.', 401, 'AUTH_REQUIRED');
  if (manager && !isAdminRole(user.role)) throw new WorkforceError('Team information is available to R&D, Boss and Head of Production.', 403, 'FORBIDDEN');
  return user;
}

export function databaseError(error: any): never {
  if (error?.code === '40001') throw new WorkforceError('This record changed since you opened it. Reload and try again.', 409, 'VERSION_CONFLICT');
  if (error?.code === '23P01') throw new WorkforceError('This period overlaps an active absence or recorded work. Adjust the dates or mark the absence as partial day.', 409, 'OVERLAP');
  if (error?.code === '42501') throw new WorkforceError('You do not have access to this workforce record.', 403, 'FORBIDDEN');
  if (error?.code === 'P0002') throw new WorkforceError('This record no longer exists. Reload the page.', 404, 'NOT_FOUND');
  if (error?.code === '22023' || error?.code === '22007' || error?.code === '23514') throw new WorkforceError('Check the supplied dates, hours and record version.', 400, 'INVALID_INPUT');
  if (error?.code === 'PGRST202' || error?.code === 'PGRST205' || error?.code === '42P01' || error?.code === '42883') {
    throw new WorkforceError('The workforce database update has not been installed yet. Ask R&D to apply the cabinet migration.', 503, 'SETUP_REQUIRED');
  }
  console.error('[workforce] database operation failed', { code: error?.code });
  throw new WorkforceError('Workforce records are temporarily unavailable. Your changes have not been confirmed.', 503, 'DATABASE_UNAVAILABLE');
}

export async function rpc(db: Database, name: string, args: Record<string, unknown> = {}): Promise<any> {
  const { data, error } = await db.rpc(name, args);
  if (error) databaseError(error);
  return data;
}

async function rows(query: any): Promise<Row[]> {
  const { data, error } = await query;
  if (error) databaseError(error);
  return data ?? [];
}

export function mapOwner(row: Row): WorkforceOwner {
  return { userId: row.id, displayName: row.display_name || row.username || 'Team member', username: row.username || '', role: row.role, isActive: row.is_active === true };
}

export function mapEntry(row: Row): WorkEntry {
  return {
    id: row.id, userId: row.user_id, workDate: row.work_date, actualMinutes: row.actual_minutes,
    startTime: typeof row.start_time === 'string' ? row.start_time.slice(0, 5) : null,
    finishTime: typeof row.finish_time === 'string' ? row.finish_time.slice(0, 5) : null,
    creditedMinutes: row.credited_minutes, multiplier: row.multiplier, holidayName: row.holiday_name,
    note: row.note || '', version: row.version, createdAt: row.created_at, updatedAt: row.updated_at
  };
}

export function mapAbsence(row: Row): Absence {
  return {
    id: row.id, userId: row.user_id, startDate: row.start_date, endDate: row.end_date,
    partialDay: row.partial_day, reason: row.reason, note: row.note || '', status: row.status,
    version: row.version, createdAt: row.created_at, updatedAt: row.updated_at
  };
}

export function mapOverride(row: Row): HolidayOverride {
  return { date: row.date, name: row.name, isPublicHoliday: row.is_public_holiday, version: row.version, updatedAt: row.updated_at };
}

export function mapReport(row: Row): WorkforceReport {
  return { id: row.id, kind: row.kind, period: row.period, version: row.version, generatedAt: row.generated_at, isStale: row.is_stale, payload: row.payload };
}

export async function readMonth(db: Database, actor: SessionUser, monthValue: string | null, requestedUser?: string | null): Promise<WorkforceMonth> {
  const today = rigaToday();
  const currentMonth = today.slice(0, 7);
  const month = parseMonth(monthValue || currentMonth);
  const userId = requestedUser ? parseUuid(requestedUser) : actor.id;
  if (userId !== actor.id && !isAdminRole(actor.role)) throw new WorkforceError('You can only open your own work history.', 403, 'FORBIDDEN');
  const { start, end } = monthBounds(month);
  const currentBounds = monthBounds(currentMonth);
  // Two exact month windows avoid downloading the intervening years of history.
  const entryQuery = db.from('workforce_work_entries').select('*').eq('user_id', userId)
    .or(`and(work_date.gte.${start},work_date.lte.${end}),and(work_date.gte.${currentBounds.start},work_date.lte.${currentBounds.end})`).order('work_date');
  const [profileRows, entryRows, absenceRows, overrideRows] = await Promise.all([
    rows(db.from('profiles').select('id,display_name,username,role,is_active').eq('id', userId).limit(1)),
    rows(entryQuery),
    rows(db.from('workforce_absences').select('*').eq('user_id', userId).lte('start_date', end).gte('end_date', start).order('start_date')),
    rows(db.from('workforce_holiday_overrides').select('*').gte('date', start).lte('date', end))
  ]);
  if (!profileRows[0]) throw new WorkforceError('This worker profile was not found.', 404, 'NOT_FOUND');
  const allEntries = entryRows.map(mapEntry);
  const entries = allEntries.filter((entry) => entry.workDate.startsWith(month));
  return {
    month, currentMonth, today, owner: mapOwner(profileRows[0]), timeZone: WORKFORCE_TIME_ZONE,
    policyVersion: WORKFORCE_POLICY_VERSION, days: calendarMonth(month, overrideRows.map(mapOverride)),
    entries, absences: absenceRows.map(mapAbsence), totals: totalEntries(entries),
    currentMonthTotals: totalEntries(allEntries.filter((entry) => entry.workDate.startsWith(currentMonth)))
  };
}

export async function readTeam(db: Database, monthValue: string | null): Promise<WorkforceTeam> {
  const today = rigaToday();
  const month = parseMonth(monthValue || today.slice(0, 7));
  // SQL returns every registered profile, including zero-entry and inactive workers.
  const result = await rpc(db, 'workforce_team_month', { p_month: `${month}-01` });
  return { month, today, workers: result.workers, totals: result.totals };
}

export async function readHolidays(db: Database, year: number): Promise<{ holidays: ReturnType<typeof classifyWorkDay>[]; overrides: HolidayOverride[] }> {
  const overrideRows = await rows(db.from('workforce_holiday_overrides').select('*').gte('date', `${year}-01-01`).lte('date', `${year}-12-31`).order('date'));
  const overrides = overrideRows.map(mapOverride);
  const holidays = Array.from({ length: 12 }, (_, index) => calendarMonth(`${year}-${String(index + 1).padStart(2, '0')}`, overrides))
    .flat().filter((day) => day.holidayName !== null);
  return { holidays, overrides };
}

export async function readReports(db: Database, monthValue: string | null): Promise<WorkforceReport[]> {
  const month = parseMonth(monthValue || rigaToday().slice(0, 7));
  const { start, end } = monthBounds(month);
  return (await rows(db.from('workforce_reports').select('*').gte('period', start).lte('period', end).order('generated_at', { ascending: false }))).map(mapReport);
}

export async function readReport(db: Database, id: string): Promise<WorkforceReport> {
  const result = await rows(db.from('workforce_reports').select('*').eq('id', parseUuid(id)).limit(1));
  if (!result[0]) throw new WorkforceError('The report was not found.', 404, 'NOT_FOUND');
  return mapReport(result[0]);
}

/** Spreadsheet formula injection protection applies even to saved names and notes. */
export function reportCsv(report: WorkforceReport): string {
  const safeCell = (value: unknown) => {
    let cell = String(value ?? '');
    if (/^[\s]*[=+\-@\t\r]/.test(cell)) cell = `'${cell}`;
    return `"${cell.replace(/"/g, '""')}"`;
  };
  let table: unknown[][];
  if (report.kind === 'monthly_hours' && 'workers' in report.payload) {
    table = [['Month', 'Worker', 'Username', 'Role', 'Active', 'Recorded days', 'Days worked', 'Actual hours', 'Credited hours', 'Actual minutes', 'Regular minutes', 'Premium actual minutes', 'Credited minutes', 'Snapshot generated', 'Version', 'Stale']];
    for (const worker of report.payload.workers) table.push([
      report.payload.month, worker.displayName, worker.username, worker.role, worker.isActive,
      worker.totals.recordedDays, worker.totals.daysWorked, formatMinutes(worker.totals.actualMinutes), formatMinutes(worker.totals.creditedMinutes), worker.totals.actualMinutes, worker.totals.regularMinutes,
      worker.totals.premiumMinutes, worker.totals.creditedMinutes, report.generatedAt, report.version, report.isStale
    ]);
    const totals = sumTotals(report.payload.workers.map((worker) => worker.totals));
    table.push([report.payload.month, 'TOTAL', '', '', '', totals.recordedDays, totals.daysWorked, formatMinutes(totals.actualMinutes), formatMinutes(totals.creditedMinutes), totals.actualMinutes, totals.regularMinutes, totals.premiumMinutes, totals.creditedMinutes, report.generatedAt, report.version, report.isStale]);
  } else if ('absences' in report.payload) {
    table = [['Date', 'Worker', 'Username', 'From', 'Through', 'Duration', 'Reason', 'Snapshot generated', 'Version']];
    for (const absence of report.payload.absences) table.push([report.payload.date, absence.displayName, absence.username, absence.startDate, absence.endDate, absence.partialDay ? 'Partial day' : 'Full day', absence.reason, report.generatedAt, report.version]);
  } else throw new WorkforceError('The report format is unavailable.', 503, 'INVALID_REPORT');
  return '\uFEFF' + table.map((row) => row.map(safeCell).join(',')).join('\r\n') + '\r\n';
}
