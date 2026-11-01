#!/usr/bin/env node
// Real migration against an isolated PostgreSQL/WASM database. No Supabase
// credentials, external requests, live notifications or production database.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import ts from 'typescript';

const root = fileURLToPath(new URL('../../', import.meta.url));
const { PGlite } = await import(process.env.OMS_WORKFORCE_PGLITE_MODULE || '@electric-sql/pglite');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const profiles = read('supabase/migrations/20260204000002_user_profiles.sql').match(/CREATE TABLE IF NOT EXISTS public\.profiles \([\s\S]*?\n\);/)?.[0];
const notifications = read('supabase/migrations/20260204000008_communications.sql').match(/CREATE TABLE IF NOT EXISTS public\.notifications \([\s\S]*?\n\);/)?.[0];
assert.ok(profiles && notifications, 'Canonical profile and notification contracts must be available.');
const migration = read('supabase/migrations/20261031000003_workforce_cabinet.sql');
const clockMigration = read('supabase/migrations/20261031000006_workforce_clock_times.sql');
const db = new PGlite();
const compiled = mkdtempSync(join(tmpdir(), 'oms-workforce-calendar-'));
const ids = {
  a: '11111111-1111-4111-8111-111111111111', b: '22222222-2222-4222-8222-222222222222',
  station: '33333333-3333-4333-8333-333333333333', hop: '44444444-4444-4444-8444-444444444444',
  rd: '55555555-5555-4555-8555-555555555555', boss: '66666666-6666-4666-8666-666666666666',
  inactive: '77777777-7777-4777-8777-777777777777'
};

// Only the private workforce_now seam is replaced in this disposable fixture.
// Its production body reads PostgreSQL now(); clients cannot call/configure it.
async function clock(iso) {
  assert.match(iso, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  await db.exec('CREATE TABLE IF NOT EXISTS public.test_workforce_clock(singleton BOOLEAN PRIMARY KEY, instant TIMESTAMPTZ NOT NULL)');
  await db.query('INSERT INTO public.test_workforce_clock VALUES (true,$1) ON CONFLICT(singleton) DO UPDATE SET instant=excluded.instant', [iso]);
  await db.exec('CREATE OR REPLACE FUNCTION public.workforce_now() RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT instant FROM public.test_workforce_clock WHERE singleton $$');
}
async function as(actor, sql, params = [], role = 'authenticated') {
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claim.role', $2, false)", [actor || '', role]);
  await db.exec(role === 'service_role' ? 'SET ROLE service_role' : 'SET ROLE authenticated');
  try { return await db.query(sql, params); }
  finally { await db.exec('RESET ROLE'); }
}
async function rpc(actor, fn, params = [], role = 'authenticated') {
  const values = params.map((_, index) => `$${index + 1}`).join(',');
  const result = await as(actor, `SELECT public.${fn}(${values}) AS result`, params, role);
  return result.rows[0].result;
}
async function fails(action, code) {
  await assert.rejects(action, (error) => { assert.equal(error.code, code); return true; });
}
const scalar = async (sql, params = []) => (await db.query(sql, params)).rows[0].value;

try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id UUID PRIMARY KEY, email TEXT);
    CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::UUID $$;
    CREATE FUNCTION auth.role() RETURNS TEXT LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.role', true), '') $$;
    GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
    GRANT EXECUTE ON FUNCTION auth.uid(), auth.role() TO anon, authenticated, service_role;
    ${profiles}
    ALTER TABLE public.profiles ADD COLUMN role TEXT NOT NULL DEFAULT 'Operator' CHECK (role IN ('RD','Boss','HeadOfProduction','StationHead','Operator'));
    ${notifications}
    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
    CREATE POLICY profile_read ON public.profiles FOR SELECT TO authenticated USING(true);
    GRANT SELECT ON public.profiles TO authenticated;
    ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
    CREATE POLICY notification_read ON public.notifications FOR SELECT TO authenticated USING(user_id = auth.uid());
    GRANT SELECT ON public.notifications TO authenticated;`);
  for (const [name, id] of Object.entries(ids)) {
    await db.query('INSERT INTO auth.users(id,email) VALUES ($1,$2)', [id, `${name}@test.invalid`]);
    const role = { station: 'StationHead', hop: 'HeadOfProduction', rd: 'RD', boss: 'Boss' }[name] || 'Operator';
    await db.query('INSERT INTO public.profiles(id,username,display_name,role,is_active) VALUES ($1,$2,$3,$4,$5)', [id, name, `Worker ${name}`, role, name !== 'inactive']);
  }
  await db.exec(migration);
  await clock('2026-10-31T05:59:00Z');
  await db.query('UPDATE public.workforce_report_schedule SET installed_at=$1', ['2026-10-31T05:59:00Z']);
  console.log('PASS: unchanged migration installs against canonical profiles/notifications contracts.');

  let entry = await rpc(ids.a, 'workforce_save_entry', ['2026-10-30', 451, '', null]);
  const retry = await rpc(ids.a, 'workforce_save_entry', ['2026-10-30', 451, '', null]);
  assert.equal(retry.id, entry.id); assert.equal(retry.version, 1);
  assert.equal(entry.actual_minutes, 451); assert.equal(entry.credited_minutes, 451);
  const weekend = await rpc(ids.a, 'workforce_save_entry', ['2026-10-31', 60, '', null]);
  assert.equal(weekend.multiplier, 2); assert.equal(weekend.credited_minutes, 120);
  await rpc(ids.a, 'workforce_save_entry', ['2026-10-29', 0, '', null]);
  await rpc(ids.b, 'workforce_save_entry', ['2026-10-30', 240, '', null]);
  assert.equal(await scalar('SELECT count(*)::INTEGER AS value FROM public.workforce_audit_log WHERE entity = \'workforce_work_entries\''), 4);
  await fails(() => rpc(ids.a, 'workforce_save_entry', ['2026-10-30', 460, '', null]), '40001');
  await fails(() => rpc(ids.a, 'workforce_save_entry', ['2026-11-01', 60, '', null]), '22023');
  await fails(() => rpc(ids.a, 'workforce_save_entry', ['2026-10-30', 1441, '', 1]), '22023');
  await fails(() => rpc(ids.inactive, 'workforce_save_entry', ['2026-10-30', 60, '', null]), '42501');
  await fails(() => rpc(null, 'workforce_save_entry', ['2026-10-30', 60, '', null]), '42501');
  await fails(() => as(ids.a, 'UPDATE public.workforce_work_entries SET multiplier=2 WHERE id=$1', [entry.id]), '42501');
  assert.equal((await as(ids.a, 'SELECT * FROM public.workforce_work_entries')).rows.length, 3);
  assert.equal((await as(ids.b, 'SELECT * FROM public.workforce_work_entries')).rows.length, 1);
  assert.equal((await as(ids.inactive, 'SELECT * FROM public.workforce_work_entries')).rows.length, 0);
  for (const id of [ids.rd, ids.boss, ids.hop]) assert.equal((await as(id, 'SELECT * FROM public.workforce_work_entries')).rows.length, 4);
  await fails(() => rpc(ids.station, 'workforce_team_month', ['2026-10-01']), '42501');
  await fails(() => rpc(ids.b, 'workforce_delete_entry', [entry.id, 1]), 'P0002');
  const team = await rpc(ids.rd, 'workforce_team_month', ['2026-10-01']);
  assert.equal(team.workers.length, 7); assert.equal(team.totals.actualMinutes, 751); assert.equal(team.totals.creditedMinutes, 811);
  assert.equal(team.workers.find((worker) => worker.userId === ids.a).totals.recordedDays, 3);
  assert.equal(team.workers.find((worker) => worker.userId === ids.a).totals.daysWorked, 2);
  console.log('PASS: own-only writes/reads, manager hierarchy, inactive denial, exact credit, zero vs missing, retry and optimistic concurrency.');

  const absence = await rpc(ids.a, 'workforce_create_absence', ['2026-11-01', '2026-11-01', false, 'personal', 'Optional private note']);
  assert.equal((await rpc(ids.a, 'workforce_create_absence', ['2026-11-01', '2026-11-01', false, 'personal', 'Optional private note'])).id, absence.id);
  await rpc(ids.a, 'workforce_create_absence', ['2026-10-29', '2026-10-29', false, 'leave', '']);
  await fails(() => rpc(ids.a, 'workforce_create_absence', ['2026-10-30', '2026-10-30', false, 'sick', '']), '23P01');
  const partial = await rpc(ids.a, 'workforce_create_absence', ['2026-10-30', '2026-10-30', true, 'personal', '']);
  await fails(() => rpc(ids.a, 'workforce_create_absence', ['2026-10-30', '2026-10-31', true, 'personal', '']), '23P01');
  await fails(() => rpc(ids.a, 'workforce_save_entry', ['2026-10-29', 1, '', 1]), '23P01');
  await fails(() => rpc(ids.b, 'workforce_cancel_absence', [partial.id, 1]), 'P0002');
  await fails(() => rpc(ids.a, 'workforce_cancel_absence', [partial.id, 10]), '40001');
  assert.equal((await rpc(ids.a, 'workforce_cancel_absence', [partial.id, 1])).version, 2);
  await rpc(ids.a, 'workforce_cancel_absence', [partial.id, 1]);
  const alerts = (await db.query("SELECT * FROM public.notifications WHERE notification_type='workforce_absence'")).rows;
  assert.equal(alerts.length, 4); assert.ok(alerts.every((row) => row.user_id === ids.hop));
  assert.ok(alerts.every((row) => !row.message.includes('Optional private note') && !row.message.includes('personal')));
  assert.ok(alerts.every((row) => row.link.includes(`worker=${ids.a}`)));
  assert.equal((await as(ids.b, 'SELECT * FROM public.workforce_absences')).rows.length, 0);
  console.log('PASS: full/partial absence rules in both directions, owner cancellation and private duplicate-safe immediate HOP alerts.');

  await fails(() => rpc(ids.a, 'workforce_save_holiday_override', ['2026-10-30', 'Company holiday', true, null]), '42501');
  const holiday = await rpc(ids.rd, 'workforce_save_holiday_override', ['2026-10-30', 'Company holiday', true, null]);
  entry = (await db.query('SELECT * FROM public.workforce_work_entries WHERE id=$1', [entry.id])).rows[0];
  assert.equal(entry.actual_minutes, 451); assert.equal(entry.multiplier, 2); assert.equal(entry.credited_minutes, 902); assert.equal(entry.version, 2);
  await fails(() => rpc(ids.a, 'workforce_save_entry', ['2026-10-30', 450, '', 1]), '40001');
  await rpc(ids.boss, 'workforce_delete_holiday_override', ['2026-10-30', holiday.version]);
  entry = await rpc(ids.a, 'workforce_save_entry', ['2026-10-30', 450, '', 3]);
  assert.equal(entry.multiplier, 1); assert.equal(entry.version, 4);
  console.log('PASS: audited calendar exceptions recalculate stored credits without changing actual minutes and invalidate stale editor revisions.');

  // Prove every supported TS date matches the real SQL holiday calculation.
  for (const name of ['types', 'validation', 'calendar', 'clock-times']) {
    const code = ts.transpileModule(read(`src/lib/workforce/${name}.ts`), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
      .replace(/from '(\.\/(?:types|validation))'/g, "from '$1.mjs'");
    writeFileSync(join(compiled, `${name}.mjs`), code);
  }
  const { classifyWorkDay } = await import(pathToFileURL(join(compiled, 'calendar.mjs')).href);
  const { parseWorkClockInterval } = await import(pathToFileURL(join(compiled, 'clock-times.mjs')).href);
  const dates = (await db.query("SELECT d::DATE::TEXT AS date, public.workforce_base_holiday(d::DATE) AS holiday FROM generate_series(DATE '2015-01-01', DATE '2099-12-31', INTERVAL '1 day') d")).rows;
  for (const row of dates) assert.equal(classifyWorkDay(row.date).holidayName, row.holiday, `SQL/TS holiday differs on ${row.date}`);
  console.log(`PASS: SQL/TypeScript calendar parity for all ${dates.length} supported dates, including Easter and historical observed festival days.`);

  await fails(() => rpc(ids.rd, 'workforce_due_report_jobs'), '42501');
  assert.deepEqual(await rpc(null, 'workforce_due_report_jobs', [], 'service_role'), []);
  await clock('2026-10-31T06:00:00Z');
  assert.deepEqual(await rpc(null, 'workforce_due_report_jobs', [], 'service_role'), [{ kind: 'daily_absences', period: '2026-10-31' }]);
  await fails(() => rpc(null, 'workforce_claim_report_job', ['monthly_hours', '2026-09-01'], 'service_role'), '22023');
  await clock('2026-11-01T05:59:00Z');
  assert.deepEqual(await rpc(null, 'workforce_due_report_jobs', [], 'service_role'), []);
  await clock('2026-11-01T06:00:00Z');
  assert.deepEqual(await rpc(null, 'workforce_due_report_jobs', [], 'service_role'), [{ kind: 'monthly_hours', period: '2026-10-01' }, { kind: 'daily_absences', period: '2026-11-01' }]);
  const claimed = await rpc(null, 'workforce_claim_report_job', ['monthly_hours', '2026-10-01'], 'service_role');
  assert.equal(claimed.status, 'claimed');
  assert.equal((await rpc(null, 'workforce_claim_report_job', ['monthly_hours', '2026-10-01'], 'service_role')).status, 'busy');
  await fails(() => rpc(null, 'workforce_complete_report_job', [claimed.jobId, ids.a], 'service_role'), '40001');
  await clock('2026-11-01T06:06:00Z');
  const reclaimed = await rpc(null, 'workforce_claim_report_job', ['monthly_hours', '2026-10-01'], 'service_role');
  assert.notEqual(reclaimed.leaseToken, claimed.leaseToken);
  await fails(() => rpc(null, 'workforce_complete_report_job', [claimed.jobId, claimed.leaseToken], 'service_role'), '40001');
  console.log('PASS: exact08:00 Europe/Riga boundary, installation floor, service-only scheduling and lease fencing/crash retry.');

  await db.exec(`CREATE TABLE public.test_telegram_outbox(notification_id UUID PRIMARY KEY);
    CREATE FUNCTION public.enqueue_telegram_notifications(ids UUID[]) RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
    BEGIN
      IF current_setting('test.fail_outbox', true) = 'on' THEN RAISE EXCEPTION 'Fixture outbox unavailable'; END IF;
      INSERT INTO public.test_telegram_outbox SELECT unnest(ids) ON CONFLICT DO NOTHING;
      RETURN cardinality(ids);
    END $$;`);
  await db.query("SELECT set_config('test.fail_outbox', 'on', false)");
  const notificationsBefore = await scalar('SELECT count(*)::INTEGER AS value FROM public.notifications');
  await assert.rejects(() => rpc(null, 'workforce_complete_report_job', [reclaimed.jobId, reclaimed.leaseToken], 'service_role'), /Fixture outbox unavailable/);
  assert.equal(await scalar("SELECT count(*)::INTEGER AS value FROM public.workforce_reports WHERE kind='monthly_hours'"), 0);
  assert.equal(await scalar('SELECT count(*)::INTEGER AS value FROM public.notifications'), notificationsBefore);
  await db.query("SELECT set_config('test.fail_outbox', 'off', false)");
  const completed = await rpc(null, 'workforce_complete_report_job', [reclaimed.jobId, reclaimed.leaseToken], 'service_role');
  assert.equal(completed.status, 'completed');
  assert.equal((await rpc(null, 'workforce_complete_report_job', [reclaimed.jobId, reclaimed.leaseToken], 'service_role')).status, 'already_completed');
  assert.equal(await scalar('SELECT count(*)::INTEGER AS value FROM public.test_telegram_outbox'), 1);
  assert.equal(await scalar("SELECT count(*)::INTEGER AS value FROM public.notifications WHERE notification_type='workforce_report'"), 1);
  assert.equal((await as(ids.a, 'SELECT * FROM public.workforce_reports')).rows.length, 0);
  const report = (await as(ids.rd, 'SELECT * FROM public.workforce_reports WHERE id=$1', [completed.reportId])).rows[0];
  assert.equal(report.payload.workers.length, 7); assert.equal(report.payload.totals.actualMinutes, 750); assert.equal(report.payload.totals.creditedMinutes, 810);
  assert.equal(report.is_stale, false);
  entry = await rpc(ids.a, 'workforce_save_entry', ['2026-10-30', 480, 'Corrected actual hours', entry.version]);
  assert.equal(await scalar('SELECT is_stale AS value FROM public.workforce_reports WHERE id=$1', [report.id]), true);
  const regenerated = await rpc(ids.rd, 'workforce_regenerate_monthly_report', ['2026-10-01']);
  assert.equal(regenerated.version, 2); assert.equal(regenerated.payload.totals.actualMinutes, 780); assert.equal(regenerated.is_stale, false);
  assert.equal(await scalar('SELECT payload->\'totals\'->>\'actualMinutes\' AS value FROM public.workforce_reports WHERE id=$1', [report.id]), '750');
  await fails(() => rpc(ids.rd, 'workforce_regenerate_monthly_report', ['2026-11-01']), '22023');
  console.log('PASS: report + HOP notification + optional outbox are atomic, delivery retries do not duplicate, and corrected snapshots remain versioned.');

  const day = await rpc(null, 'workforce_claim_report_job', ['daily_absences', '2026-11-01'], 'service_role');
  const daily = await rpc(null, 'workforce_complete_report_job', [day.jobId, day.leaseToken], 'service_role');
  assert.equal(await scalar("SELECT payload->>'totalAbsent' AS value FROM public.workforce_reports WHERE id=$1", [daily.reportId]), '1');
  await rpc(ids.a, 'workforce_cancel_absence', [absence.id, absence.version]);
  assert.equal(await scalar('SELECT is_stale AS value FROM public.workforce_reports WHERE id=$1', [daily.reportId]), true);
  assert.deepEqual(await rpc(null, 'workforce_due_report_jobs', [], 'service_role'), []);
  await clock('2027-02-02T06:01:00Z');
  assert.deepEqual(await rpc(null, 'workforce_due_report_jobs', [], 'service_role'), [
    { kind: 'monthly_hours', period: '2026-11-01' }, { kind: 'monthly_hours', period: '2026-12-01' },
    { kind: 'monthly_hours', period: '2027-01-01' }, { kind: 'daily_absences', period: '2027-02-02' }
  ]);
  await clock('2027-06-01T04:59:00Z');
  assert.ok(!(await rpc(null, 'workforce_due_report_jobs', [], 'service_role')).some((job) => job.period === '2027-05-01' || job.kind === 'daily_absences'));
  await clock('2027-06-01T05:00:00Z');
  assert.ok((await rpc(null, 'workforce_due_report_jobs', [], 'service_role')).some((job) => job.kind === 'monthly_hours' && job.period === '2027-05-01'));
  console.log('PASS: daily snapshot staleness, monthly downtime catch-up, no stale daily spam and summer/winter08:00 offsets.');

  const historical = (await db.query('SELECT id, actual_minutes, credited_minutes, version FROM public.workforce_work_entries ORDER BY id')).rows;
  await db.exec(clockMigration);
  assert.deepEqual((await db.query('SELECT id, actual_minutes, credited_minutes, version FROM public.workforce_work_entries ORDER BY id')).rows, historical);
  assert.equal(await scalar('SELECT count(*)::INTEGER AS value FROM public.workforce_work_entries WHERE start_time IS NOT NULL OR finish_time IS NOT NULL'), 0);
  await fails(() => rpc(ids.a, 'workforce_save_entry', ['2027-05-10', 60, '', null]), '42501');
  await fails(() => rpc(ids.a, 'workforce_clock_minutes', ['2027-05-10', '08:00', '09:00']), '42501');
  console.log('PASS: additive clock migration verifies its predecessor, preserves every historical duration/revision and retires manual-duration writes.');

  let shift = await rpc(ids.a, 'workforce_save_clock_entry', ['2027-05-10', '08:00', '15:31', 'Clock entry', null]);
  assert.equal(shift.start_time, '08:00:00'); assert.equal(shift.finish_time, '15:31:00');
  assert.equal(shift.actual_minutes, 451); assert.equal(shift.credited_minutes, 451);
  assert.equal((await rpc(ids.a, 'workforce_save_clock_entry', ['2027-05-10', '08:00', '15:31', 'Clock entry', null])).version, 1);
  const shiftedSameDuration = await rpc(ids.a, 'workforce_save_clock_entry', ['2027-05-10', '09:00', '16:31', 'Clock entry', 1]);
  assert.equal(shiftedSameDuration.version, 2); assert.equal(shiftedSameDuration.actual_minutes, 451);
  await fails(() => rpc(ids.a, 'workforce_save_clock_entry', ['2027-05-10', '08:00', '16:00', '', 1]), '40001');
  for (const [start, finish] of [['08:00', '08:00'], ['22:00', '06:00'], ['08:00:30', '16:00'], ['00:00', '24:00']]) {
    await fails(() => rpc(ids.a, 'workforce_save_clock_entry', ['2027-05-11', start, finish, '', null]), '22023');
  }
  await fails(() => rpc(ids.a, 'workforce_save_clock_entry', ['2027-06-02', '08:00', '16:00', '', null]), '22023');
  await fails(() => rpc(ids.inactive, 'workforce_save_clock_entry', ['2027-05-10', '08:00', '16:00', '', null]), '42501');
  await fails(() => rpc(null, 'workforce_save_clock_entry', ['2027-05-10', '08:00', '16:00', '', null]), '42501');
  await fails(() => as(ids.a, 'UPDATE public.workforce_work_entries SET actual_minutes=1 WHERE id=$1', [shift.id]), '42501');
  await fails(() => db.query('UPDATE public.workforce_work_entries SET actual_minutes=1 WHERE id=$1', [shift.id]), '23514');
  assert.equal((await as(ids.b, 'SELECT * FROM public.workforce_work_entries WHERE id=$1', [shift.id])).rows.length, 0);
  for (const manager of [ids.rd, ids.hop, ids.boss]) assert.equal((await as(manager, 'SELECT start_time, finish_time FROM public.workforce_work_entries WHERE id=$1', [shift.id])).rows.length, 1);

  const saturdayShift = await rpc(ids.a, 'workforce_save_clock_entry', ['2027-05-15', '08:00', '09:00', '', null]);
  const holidayShift = await rpc(ids.a, 'workforce_save_clock_entry', ['2027-05-04', '08:00', '09:00', '', null]);
  assert.equal(saturdayShift.credited_minutes, 120); assert.equal(holidayShift.credited_minutes, 120);
  const clockAbsence = await rpc(ids.a, 'workforce_create_absence', ['2027-05-12', '2027-05-12', false, 'leave', '']);
  await fails(() => rpc(ids.a, 'workforce_save_clock_entry', ['2027-05-12', '08:00', '09:00', '', null]), '23P01');
  await rpc(ids.a, 'workforce_cancel_absence', [clockAbsence.id, clockAbsence.version]);
  const clockReport = await rpc(ids.rd, 'workforce_regenerate_monthly_report', ['2027-05-01']);
  assert.equal(clockReport.payload.totals.actualMinutes, 571); assert.equal(clockReport.payload.totals.creditedMinutes, 691);
  shift = await rpc(ids.a, 'workforce_save_clock_entry', ['2027-05-10', '08:00', '16:00', 'Corrected clock entry', 2]);
  assert.equal(await scalar('SELECT is_stale AS value FROM public.workforce_reports WHERE id=$1', [clockReport.id]), true);
  assert.equal(shift.version, 3);
  const correctedClockReport = await rpc(ids.rd, 'workforce_regenerate_monthly_report', ['2027-05-01']);
  assert.equal(correctedClockReport.payload.totals.actualMinutes, 600); assert.equal(correctedClockReport.payload.totals.creditedMinutes, 720);
  console.log('PASS: clock input persists, server computes credits, exact retries/versioning/absence/RLS guards hold, and monthly reports count corrected clock entries.');

  for (const [date, start, finish] of [['2026-03-29', '01:00', '05:00'], ['2026-10-25', '01:00', '05:00'], ['2026-10-30', '08:00', '17:00']]) {
    const expected = parseWorkClockInterval(date, start, finish).actualMinutes;
    assert.equal(await scalar('SELECT public.workforce_clock_minutes($1,$2,$3) AS value', [date, start, finish]), expected);
  }
  for (const [date, start, finish] of [['2026-03-29', '03:30', '05:00'], ['2026-10-25', '01:00', '03:30']]) {
    await fails(() => rpc(ids.a, 'workforce_save_clock_entry', [date, start, finish, '', null]), '22007');
  }
  console.log('PASS: SQL and TypeScript agree across Riga clock changes; skipped/repeated boundary times are rejected instead of guessed.');
} finally {
  await db.close();
  rmSync(compiled, { recursive: true, force: true });
}
