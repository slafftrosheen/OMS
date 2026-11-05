import { describe, it, expect } from 'vitest';
import { POST as saveEntry } from '../../src/routes/api/workforce/entries/+server';
import { GET as getTeam } from '../../src/routes/api/workforce/team/+server';
import { GET as getMonth } from '../../src/routes/api/workforce/month/+server';
import { reportCsv } from '../../src/lib/server/workforce/service';

const ownId = '11111111-1111-4111-8111-111111111111';
const otherId = '22222222-2222-4222-8222-222222222222';
const user = { id: ownId, username: 'worker', displayName: 'Worker', role: 'Operator', stations: [] };
function event(body: unknown, role = 'Operator', result: any = { data: null, error: null }) {
  const calls: any[] = [];
  return {
    calls,
    request: new Request('https://oms.test/api/workforce/entries', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    url: new URL('https://oms.test/api/workforce/team?month=2026-09'),
    locals: { user: { ...user, role }, supabase: { rpc: async (name: string, args: unknown) => { calls.push({ name, args }); return result; } } }
  };
}

describe('workforce API authorization and mutation boundary', () => {
  it('rejects anonymous and cross-worker requests before accessing the database', async () => {
    const anonymous = event({}); anonymous.locals.user = null as any;
    expect((await saveEntry(anonymous as any)).status).toBe(401);
    const other = event({}); other.url = new URL(`https://oms.test/api/workforce/month?month=2026-09&userId=${otherId}`);
    expect((await getMonth(other as any)).status).toBe(403);
    expect(anonymous.calls.length).toBe(0);
    expect(other.calls.length).toBe(0);
  });

  it('restricts team information to RD, Boss and HeadOfProduction', async () => {
    for (const role of ['Operator', 'StationHead']) {
      const request = event({}, role);
      expect((await getTeam(request as any)).status).toBe(403);
      expect(request.calls.length).toBe(0);
    }
    for (const role of ['RD', 'Boss', 'HeadOfProduction']) {
      const request = event({}, role, { data: { workers: [], totals: {} } });
      expect((await getTeam(request as any)).status).toBe(200);
      expect(request.calls[0].name).toBe('workforce_team_month');
    }
  });

  it('sends clock inputs and caller revision to SQL without trusting browser identity or rate', async () => {
    const record = { id: ownId, user_id: ownId, work_date: '2026-01-05', start_time: '08:00:00', finish_time: '15:31:00', actual_minutes: 451, credited_minutes: 451, multiplier: 1, holiday_name: null, note: '', version: 1, created_at: '', updated_at: '' };
    const request = event({ workDate: '2026-01-05', startTime: '08:00', finishTime: '15:31', expectedVersion: null, userId: otherId, multiplier: 4 }, 'Operator', { data: record });
    const response = await saveEntry(request as any);
    expect(response.status).toBe(200);
    expect(request.calls).toEqual([{ name: 'workforce_save_clock_entry', args: { p_work_date: '2026-01-05', p_start_time: '08:00', p_finish_time: '15:31', p_note: '', p_expected_version: null } }]);
    expect((await response.json()).entry).toMatchObject({ actualMinutes: 451, startTime: '08:00', finishTime: '15:31' });
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('rejects invalid dates, manual-duration tampering, invalid clocks and missing revisions before SQL', async () => {
    for (const body of [
      { workDate: '2099-12-01', startTime: '08:00', finishTime: '09:00', expectedVersion: null },
      { workDate: '2026-02-31', startTime: '08:00', finishTime: '09:00', expectedVersion: null },
      { workDate: '2026-01-05', startTime: '08:00', finishTime: '09:00', actualMinutes: 600, expectedVersion: null },
      { workDate: '2026-01-05', hours: '1.01', expectedVersion: null },
      { workDate: '2026-01-05', actualMinutes: 60, expectedVersion: null },
      { workDate: '2026-01-05', startTime: '08:00', finishTime: '08:00', expectedVersion: null },
      { workDate: '2026-01-05', startTime: '22:00', finishTime: '06:00', expectedVersion: null },
      { workDate: '2026-01-05', startTime: '08:00', finishTime: '09:00:30', expectedVersion: null },
      { workDate: '2026-01-05', startTime: '08:00', finishTime: '09:00' },
      { workDate: '2026-03-29', startTime: '03:30', finishTime: '05:00', expectedVersion: null }
    ]) {
      const request = event(body);
      expect((await saveEntry(request as any)).status).toBe(400);
      expect(request.calls.length).toBe(0);
    }
  });

  it('returns actionable revision and setup errors rather than implying a save succeeded', async () => {
    for (const [code, status, expected] of [['40001', 409, 'VERSION_CONFLICT'], ['23P01', 409, 'OVERLAP'], ['PGRST202', 503, 'SETUP_REQUIRED']] as const) {
      const request = event({ workDate: '2026-01-05', startTime: '08:00', finishTime: '09:00', expectedVersion: 1 }, 'Operator', { error: { code } });
      const response = await saveEntry(request as any);
      expect(response.status).toBe(status);
      expect((await response.json()).code).toBe(expected);
    }
  });

  it('exports readable hours and exact minutes with spreadsheet formula injection protection', () => {
    const totals = { actualMinutes: 451, regularMinutes: 451, premiumMinutes: 0, creditedMinutes: 451, daysWorked: 1, recordedDays: 1 };
    const csv = reportCsv({ id: ownId, kind: 'monthly_hours', period: '2026-01-01', version: 1, generatedAt: '2026-02-01T06:00:00Z', isStale: false,
      payload: { month: '2026-01', timeZone: 'Europe/Riga', policyVersion: 'lv-company-hours-v1', totals, workers: [{ userId: ownId, displayName: '=HYPERLINK("bad")', username: 'worker', role: 'Operator', isActive: true, totals, activeAbsences: [] }] } });
    expect(csv.includes('7 h 31 min')).toBe(true);
    expect(csv.includes("'=HYPERLINK")).toBe(true);
    expect(csv.includes('Actual minutes')).toBe(true);
  });
});
