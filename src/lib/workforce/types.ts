export const WORKFORCE_TIME_ZONE = 'Europe/Riga' as const;
export const WORKFORCE_POLICY_VERSION = 'lv-company-hours-v1' as const;

export interface WorkforceOwner {
  userId: string;
  displayName: string;
  username: string;
  role: string;
  isActive: boolean;
}

export interface WorkforceDay {
  date: string;
  isWeekend: boolean;
  isPublicHoliday: boolean;
  isObservedDayOff: boolean;
  holidayName: string | null;
  multiplier: 1 | 2;
}

export interface WorkEntry {
  id: string;
  userId: string;
  workDate: string;
  /** Null or absent on historical duration-only records. Never infer clock times. */
  startTime?: string | null;
  finishTime?: string | null;
  actualMinutes: number;
  creditedMinutes: number;
  multiplier: 1 | 2;
  holidayName: string | null;
  note: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type AbsenceReason = 'leave' | 'sick' | 'personal' | 'other';
export interface Absence {
  id: string;
  userId: string;
  startDate: string;
  endDate: string;
  partialDay: boolean;
  reason: AbsenceReason;
  note: string;
  status: 'active' | 'cancelled';
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkforceTotals {
  actualMinutes: number;
  regularMinutes: number;
  /** Actual minutes qualifying for the company's 2× credit. */
  premiumMinutes: number;
  creditedMinutes: number;
  daysWorked: number;
  /** Includes a deliberate zero-hour entry; missing dates remain unrecorded. */
  recordedDays: number;
}

export interface WorkforceMonth {
  month: string;
  currentMonth: string;
  today: string;
  owner: WorkforceOwner;
  timeZone: typeof WORKFORCE_TIME_ZONE;
  policyVersion: string;
  days: WorkforceDay[];
  entries: WorkEntry[];
  absences: Absence[];
  totals: WorkforceTotals;
  currentMonthTotals: WorkforceTotals;
}

export interface TeamWorker extends WorkforceOwner {
  totals: WorkforceTotals;
  activeAbsences: Absence[];
}

export interface WorkforceTeam {
  month: string;
  today: string;
  workers: TeamWorker[];
  totals: WorkforceTotals;
}

export interface MonthlyHoursPayload {
  month: string;
  workers: TeamWorker[];
  totals: WorkforceTotals;
  timeZone: typeof WORKFORCE_TIME_ZONE;
  policyVersion: string;
}

export interface DailyAbsencesPayload {
  date: string;
  absences: Array<Absence & { displayName: string; username: string }>;
  totalAbsent: number;
  timeZone: typeof WORKFORCE_TIME_ZONE;
  policyVersion: string;
}

export interface WorkforceReport {
  id: string;
  kind: 'monthly_hours' | 'daily_absences';
  period: string;
  version: number;
  generatedAt: string;
  isStale: boolean;
  payload: MonthlyHoursPayload | DailyAbsencesPayload;
}

export interface HolidayOverride {
  date: string;
  name: string;
  isPublicHoliday: boolean;
  version: number;
  updatedAt: string;
}

export interface SaveWorkEntry {
  workDate: string;
  startTime: string;
  finishTime: string;
  note?: string;
  expectedVersion: number | null;
}

export interface CreateAbsence {
  startDate: string;
  endDate: string;
  partialDay: boolean;
  reason: AbsenceReason;
  note?: string;
}

export interface WorkforceApiError { error: string; code: string }

export interface WorkforceDueJob {
  kind: WorkforceReport['kind'];
  period: string;
}

export interface WorkforceReportJobClaim {
  status: 'claimed' | 'completed' | 'busy';
  jobId: string;
  leaseToken?: string;
  reportId?: string;
}

export interface WorkforceReportJobCompletion {
  status: 'completed' | 'already_completed';
  reportId: string;
}
