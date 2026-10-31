import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { dispatchWorkforceReports, WorkforceDispatchError, type WorkforceReportDatabase } from '../../src/lib/server/workforce/report-dispatch';

const jobId = '00000000-0000-4000-8000-000000000001';
const leaseToken = '00000000-0000-4000-8000-000000000002';
const reportId = '00000000-0000-4000-8000-000000000003';
const daily = { kind: 'daily_absences', period: '2026-11-01' };
const monthly = { kind: 'monthly_hours', period: '2026-10-01' };
const ok = (data: unknown) => ({ data, error: null });
const claimed = () => ok({ status: 'claimed', jobId, leaseToken });
const done = () => ok({ status: 'completed', reportId });

function database(respond: (name: string, args?: Record<string, unknown>) => unknown) {
  const calls: Array<{ name: string; args?: Record<string, unknown> }> = [];
  const db: WorkforceReportDatabase = {
    rpc: async (name, args) => {
      calls.push({ name, args });
      return await respond(name, args) as Awaited<ReturnType<WorkforceReportDatabase['rpc']>>;
    }
  };
  return { db, calls };
}

describe('workforce reporting dispatch', () => {
  it('takes due periods from the database and completes with only the claimed lease', async () => {
    const { db, calls } = database(name => name === 'workforce_due_report_jobs' ? ok([daily, monthly])
      : name === 'workforce_claim_report_job' ? claimed() : done());
    assert.deepEqual(await dispatchWorkforceReports(db), { due: 2, completed: 2, busy: 0, failed: 0 });
    assert.deepEqual(calls, [
      { name: 'workforce_due_report_jobs', args: undefined },
      { name: 'workforce_claim_report_job', args: { p_kind: daily.kind, p_period: daily.period } },
      { name: 'workforce_complete_report_job', args: { p_job_id: jobId, p_lease_token: leaseToken } },
      { name: 'workforce_claim_report_job', args: { p_kind: monthly.kind, p_period: monthly.period } },
      { name: 'workforce_complete_report_job', args: { p_job_id: jobId, p_lease_token: leaseToken } }
    ]);
  });

  it('does nothing before the database schedule is due', async () => {
    const { db, calls } = database(() => ok([]));
    assert.deepEqual(await dispatchWorkforceReports(db), { due: 0, completed: 0, busy: 0, failed: 0 });
    assert.equal(calls.length, 1);
  });

  it('does not complete jobs already handled or leased by another replica', async () => {
    const { db, calls } = database((name, args) => name === 'workforce_due_report_jobs' ? ok([daily, monthly])
      : ok({ status: args?.p_kind === daily.kind ? 'busy' : 'completed', jobId, reportId }));
    assert.deepEqual(await dispatchWorkforceReports(db), { due: 2, completed: 0, busy: 1, failed: 0 });
    assert.ok(calls.every(call => call.name !== 'workforce_complete_report_job'));
  });

  it('does not reclaim a job after an uncertain commit and still attempts the other due job', async () => {
    let completions = 0;
    const { db, calls } = database(name => {
      if (name === 'workforce_due_report_jobs') return ok([monthly, daily]);
      if (name === 'workforce_claim_report_job') return claimed();
      if (++completions === 1) throw new Error('network response lost');
      return done();
    });
    assert.deepEqual(await dispatchWorkforceReports(db), { due: 2, completed: 1, busy: 0, failed: 1 });
    assert.equal(calls.filter(call => call.name === 'workforce_claim_report_job').length, 2);
  });

  it('deduplicates the due list and bounds the batch', async () => {
    const many = Array.from({ length: 30 }, (_, index) => ({ kind: 'monthly_hours', period: `${2020 + Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}-01` }));
    const { db } = database(name => name === 'workforce_due_report_jobs' ? ok([daily, daily, ...many])
      : name === 'workforce_claim_report_job' ? claimed() : done());
    const result = await dispatchWorkforceReports(db);
    assert.equal(result.due, 23);
    assert.equal(result.completed, 23);
  });

  it('refuses malformed job/lease responses without inventing IDs or report content', async () => {
    const invalid = database(() => ok([{ kind: 'unexpected', period: monthly.period }]));
    await assert.rejects(dispatchWorkforceReports(invalid.db), (error: unknown) =>
      error instanceof WorkforceDispatchError && error.reason === 'invalid_response');
    assert.equal(invalid.calls.length, 1);
    const missingLease = database(name => name === 'workforce_due_report_jobs' ? ok([monthly]) : ok({ status: 'claimed', jobId }));
    assert.equal((await dispatchWorkforceReports(missingLease.db)).failed, 1);
    assert.equal(missingLease.calls.length, 2);
  });

  it('reports schema/configuration failure with a safe reason and never passes a raw database message', async () => {
    const { db } = database(() => ({ data: null, error: { code: 'PGRST202', message: 'private diagnostic text' } }));
    await assert.rejects(dispatchWorkforceReports(db), (error: unknown) =>
      error instanceof WorkforceDispatchError && error.reason === 'migration_required' && !error.message.includes('private'));
  });

  it('stops before taking a lease during shutdown', async () => {
    const controller = new AbortController();
    const { db, calls } = database(() => { controller.abort(); return ok([daily]); });
    await assert.rejects(dispatchWorkforceReports(db, controller.signal), { name: 'AbortError' });
    assert.equal(calls.length, 1);
  });

  it('accepts database idempotent completion after a previously committed report', async () => {
    const { db } = database(name => name === 'workforce_due_report_jobs' ? ok([monthly])
      : name === 'workforce_claim_report_job' ? claimed() : ok({ status: 'already_completed', reportId }));
    assert.equal((await dispatchWorkforceReports(db)).completed, 1);
  });
});
