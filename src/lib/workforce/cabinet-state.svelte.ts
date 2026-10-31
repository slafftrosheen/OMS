import { createScreenReadScope } from '$lib/assistant/operational-context';
import type { Absence, CreateAbsence, HolidayOverride, SaveWorkEntry, WorkEntry, WorkforceDay, WorkforceMonth, WorkforceReport, WorkforceTeam } from './types';
import { downloadWorkforceCSV, rigaToday, workforceCSV, workforceRequest } from './client';

type View = 'personal' | 'team' | 'reports';

/** Per-page private state. Requests and drafts are invalidated when account or role changes. */
export class CabinetState {
  owner = $state('');
  manager = $state(false);
  view = $state<View>('personal');
  month = $state(rigaToday().slice(0, 7));
  workDate = $state(rigaToday());
  today = $state(rigaToday());
  personal = $state<WorkforceMonth | null>(null);
  editor = $state<WorkforceMonth | null>(null);
  team = $state<WorkforceTeam | null>(null);
  worker = $state<WorkforceMonth | null>(null);
  workerId = $state('');
  reports = $state<WorkforceReport[]>([]);
  selectedReport = $state<WorkforceReport | null>(null);
  reportMissing = $state(false);
  overrides = $state<HolidayOverride[]>([]);
  holidayYear = $state(String(new Date().getUTCFullYear()));
  holidaysOpen = $state(false);
  loading = $state({ personal: false, editor: false, team: false, worker: false, reports: false, holidays: false });
  errors = $state<Record<'personal' | 'editor' | 'team' | 'worker' | 'reports' | 'holidays', unknown>>({ personal: null, editor: null, team: null, worker: null, reports: null, holidays: null });
  busy = $state('');
  mutationError = $state<unknown>(null);
  mutationAction = $state('');
  success = $state('');
  private scopes = {
    personal: createScreenReadScope(), editor: createScreenReadScope(), team: createScreenReadScope(),
    worker: createScreenReadScope(), reports: createScreenReadScope(), holidays: createScreenReadScope(), mutation: createScreenReadScope()
  };

  constructor(private currentOwner: () => string) {}

  setOwner(owner: string, manager: boolean) {
    this.dispose();
    this.owner = owner; this.manager = manager;
    this.view = 'personal'; this.today = rigaToday(); this.month = this.today.slice(0, 7); this.workDate = this.today;
    this.holidayYear = this.today.slice(0, 4); this.holidaysOpen = false;
    this.personal = null; this.editor = null; this.team = null; this.worker = null; this.workerId = '';
    this.reports = []; this.selectedReport = null; this.reportMissing = false; this.overrides = [];
    this.busy = ''; this.mutationError = null; this.mutationAction = ''; this.success = '';
    this.loading = { personal: false, editor: false, team: false, worker: false, reports: false, holidays: false };
    this.errors = { personal: null, editor: null, team: null, worker: null, reports: null, holidays: null };
    if (owner) { void this.loadPersonal(); void this.loadEditor(); }
  }

  dispose() { for (const scope of Object.values(this.scopes)) scope.cancel(); }

  private isCurrent() { return !!this.owner && this.owner === this.currentOwner(); }

  async loadPersonal() {
    if (!this.isCurrent()) return;
    const month = this.month, request = this.scopes.personal.begin(this.owner);
    this.loading.personal = true; this.errors.personal = null; this.personal = null;
    try {
      const result = await workforceRequest<WorkforceMonth>(`/month?month=${encodeURIComponent(month)}`, request);
      if (!request.accepts(this.currentOwner()) || month !== this.month) return;
      this.personal = result; this.today = result.today;
    } catch (error) { if (request.accepts(this.currentOwner())) this.errors.personal = error; }
    finally { if (request.accepts(this.currentOwner())) this.loading.personal = false; }
  }

  async loadEditor() {
    if (!this.isCurrent() || !/^\d{4}-\d{2}-\d{2}$/.test(this.workDate)) return;
    const month = this.workDate.slice(0, 7), request = this.scopes.editor.begin(this.owner);
    this.loading.editor = true; this.errors.editor = null; this.editor = null;
    try {
      const result = await workforceRequest<WorkforceMonth>(`/month?month=${encodeURIComponent(month)}`, request);
      if (!request.accepts(this.currentOwner()) || month !== this.workDate.slice(0, 7)) return;
      this.editor = result; this.today = result.today;
    } catch (error) { if (request.accepts(this.currentOwner())) this.errors.editor = error; }
    finally { if (request.accepts(this.currentOwner())) this.loading.editor = false; }
  }

  async loadTeam() {
    if (!this.isCurrent() || !this.manager) return;
    const month = this.month, request = this.scopes.team.begin(this.owner);
    this.loading.team = true; this.errors.team = null; this.team = null;
    try {
      const result = await workforceRequest<WorkforceTeam>(`/team?month=${encodeURIComponent(month)}`, request);
      if (!request.accepts(this.currentOwner()) || month !== this.month || !this.manager) return;
      this.team = result;
    } catch (error) { if (request.accepts(this.currentOwner())) this.errors.team = error; }
    finally { if (request.accepts(this.currentOwner())) this.loading.team = false; }
  }

  async loadWorker(userId = this.workerId) {
    if (!this.isCurrent() || !this.manager || !userId) return;
    this.workerId = userId; this.worker = null;
    const month = this.month, request = this.scopes.worker.begin(this.owner);
    this.loading.worker = true; this.errors.worker = null;
    try {
      const result = await workforceRequest<WorkforceMonth>(`/month?month=${encodeURIComponent(month)}&userId=${encodeURIComponent(userId)}`, request);
      if (!request.accepts(this.currentOwner()) || month !== this.month || userId !== this.workerId || !this.manager) return;
      this.worker = result;
    } catch (error) { if (request.accepts(this.currentOwner())) this.errors.worker = error; }
    finally { if (request.accepts(this.currentOwner())) this.loading.worker = false; }
  }

  closeWorker() { this.scopes.worker.cancel(); this.workerId = ''; this.worker = null; this.loading.worker = false; this.errors.worker = null; }

  async loadReports(reportId = '') {
    if (!this.isCurrent() || !this.manager) return;
    const month = this.month, request = this.scopes.reports.begin(this.owner);
    this.loading.reports = true; this.errors.reports = null; this.reports = []; this.selectedReport = null; this.reportMissing = false;
    try {
      const result = await workforceRequest<{ reports: WorkforceReport[] }>(`/reports?month=${encodeURIComponent(month)}`, request);
      if (!request.accepts(this.currentOwner()) || month !== this.month || !this.manager) return;
      this.reports = result.reports;
      if (reportId) {
        this.selectedReport = result.reports.find(report => report.id === reportId) ?? null;
        this.reportMissing = !this.selectedReport;
      }
    } catch (error) { if (request.accepts(this.currentOwner())) this.errors.reports = error; }
    finally { if (request.accepts(this.currentOwner())) this.loading.reports = false; }
  }

  async loadHolidays() {
    if (!this.isCurrent() || !this.manager) return;
    const year = this.holidayYear, request = this.scopes.holidays.begin(this.owner);
    this.loading.holidays = true; this.errors.holidays = null; this.overrides = [];
    try {
      const result = await workforceRequest<{ holidays: WorkforceDay[]; overrides: HolidayOverride[] }>(`/holidays?year=${encodeURIComponent(year)}`, request);
      if (!request.accepts(this.currentOwner()) || year !== this.holidayYear || !this.manager) return;
      this.overrides = result.overrides;
    } catch (error) { if (request.accepts(this.currentOwner())) this.errors.holidays = error; }
    finally { if (request.accepts(this.currentOwner())) this.loading.holidays = false; }
  }

  selectDate(date: string) {
    const oldMonth = this.workDate.slice(0, 7);
    this.workDate = date; this.mutationError = null; this.success = '';
    if (date.slice(0, 7) !== oldMonth || !this.editor) void this.loadEditor();
  }

  selectMonth(month: string) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return;
    this.month = month; this.mutationError = null; this.success = '';
    if (this.view === 'personal') void this.loadPersonal();
    else if (this.view === 'team') { void this.loadTeam(); if (this.workerId) void this.loadWorker(); }
    else void this.loadReports();
  }

  selectView(view: View) {
    if (view !== 'personal' && !this.manager) return;
    this.view = view; this.mutationError = null; this.success = '';
    this.closeWorker();
    if (view === 'personal') void this.loadPersonal();
    else if (view === 'team') void this.loadTeam();
    else void this.loadReports();
  }

  openNotification(input: { view: 'team' | 'reports'; month: string; report?: string; worker?: string }) {
    if (!this.isCurrent() || !this.manager) return;
    this.view = input.view; this.month = input.month; this.mutationError = null; this.success = ''; this.closeWorker();
    if (input.view === 'reports') void this.loadReports(input.report ?? '');
    else { void this.loadTeam(); if (input.worker) void this.loadWorker(input.worker); }
  }

  private async change<T>(action: string, path: string, method: 'POST' | 'DELETE', body: unknown, success: string): Promise<T | null> {
    if (!this.isCurrent() || this.busy) return null;
    const request = this.scopes.mutation.begin(this.owner);
    this.busy = action; this.mutationAction = action; this.mutationError = null; this.success = '';
    try {
      const result = await workforceRequest<T>(path, { ...request, method, body });
      if (!request.accepts(this.currentOwner())) return null;
      this.success = success;
      return result;
    } catch (error) { if (request.accepts(this.currentOwner())) this.mutationError = error; return null; }
    finally { if (request.accepts(this.currentOwner())) this.busy = ''; }
  }

  async saveEntry(input: SaveWorkEntry) {
    const result = await this.change<{ entry: WorkEntry }>('entry', '/entries', 'POST', input, 'saved');
    if (result) { await Promise.all([this.loadPersonal(), this.loadEditor()]); return true; }
    return false;
  }

  async deleteEntry(entry: WorkEntry) {
    const result = await this.change('delete-entry', `/entries/${encodeURIComponent(entry.id)}`, 'DELETE', { expectedVersion: entry.version }, 'deleted');
    if (result) await Promise.all([this.loadPersonal(), this.loadEditor()]);
  }

  async saveAbsence(input: CreateAbsence) {
    const owner = this.owner;
    const result = await this.change<{ absence: Absence }>('absence', '/absences', 'POST', input, 'absenceSaved');
    if (result && owner === this.owner && owner === this.currentOwner()) {
      // Show the saved range even when the worker is planning a future month.
      this.month = input.startDate.slice(0, 7);
      await Promise.all([this.loadPersonal(), this.loadEditor()]); return true;
    }
    return false;
  }

  async cancelAbsence(absence: Absence) {
    const result = await this.change('cancel-absence', `/absences/${encodeURIComponent(absence.id)}`, 'DELETE', { expectedVersion: absence.version }, 'absenceCancelled');
    if (result) await Promise.all([this.loadPersonal(), this.loadEditor()]);
  }

  async generateReport() {
    if (!this.manager) return;
    const month = this.month, owner = this.owner;
    const result = await this.change<{ report: WorkforceReport }>('report', '/reports', 'POST', { month }, 'generated');
    if (result && month === this.month && owner === this.owner && owner === this.currentOwner()) await this.loadReports(result.report.id);
  }

  async exportReport(report: WorkforceReport) {
    if (!this.isCurrent() || !this.manager || this.busy) return;
    const request = this.scopes.mutation.begin(this.owner);
    this.busy = `export:${report.id}`; this.mutationAction = 'export'; this.mutationError = null; this.success = '';
    try {
      const blob = await workforceCSV(report.id, request.signal);
      if (!request.accepts(this.currentOwner()) || !this.manager) return;
      downloadWorkforceCSV(blob, `${report.kind}-${report.period}-v${report.version}.csv`);
    } catch (error) { if (request.accepts(this.currentOwner())) this.mutationError = error; }
    finally { if (request.accepts(this.currentOwner())) this.busy = ''; }
  }

  async saveHoliday(input: { date: string; name: string; isPublicHoliday: boolean; expectedVersion: number | null }) {
    if (!this.manager) return false;
    const result = await this.change('holiday', '/holidays', 'POST', input, 'holidaySaved');
    if (result) { await Promise.all([this.loadHolidays(), this.loadTeam(), this.loadPersonal(), this.loadEditor()]); return true; }
    return false;
  }

  async removeHoliday(override: HolidayOverride) {
    if (!this.manager) return;
    const result = await this.change('holiday', `/holidays/${encodeURIComponent(override.date)}`, 'DELETE', { expectedVersion: override.version }, 'holidayRemoved');
    if (result) await Promise.all([this.loadHolidays(), this.loadTeam(), this.loadPersonal(), this.loadEditor()]);
  }
}
