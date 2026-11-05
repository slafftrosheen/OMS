/** Service-role RPC boundary. The database owns the clock, leases and snapshots. */
export interface WorkforceReportDatabase {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{
    data: unknown;
    error: { code?: string } | null;
  }>;
}

export interface WorkforceDispatchResult {
  due: number;
  completed: number;
  busy: number;
  failed: number;
}

export class WorkforceDispatchError extends Error {
  constructor(readonly reason: 'migration_required' | 'database_unavailable' | 'invalid_response') {
    super(reason);
    this.name = 'WorkforceDispatchError';
  }
}

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const uuid = (value: unknown): value is string => typeof value === 'string'
  && /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(value);

/**
 * Bounded, serial dispatch avoids a burst of historical notifications on recovery.
 * A failed/uncertain commit is retried only through the persisted lease. Completing
 * a job atomically writes the report, notifications and completed state in SQL.
 */
export async function dispatchWorkforceReports(
  db: WorkforceReportDatabase,
  signal?: AbortSignal
): Promise<WorkforceDispatchResult> {
  signal?.throwIfAborted();
  const pending = await db.rpc('workforce_due_report_jobs');
  signal?.throwIfAborted();
  if (pending.error) {
    throw new WorkforceDispatchError(['PGRST202', '42883', '42P01'].includes(pending.error.code ?? '')
      ? 'migration_required' : 'database_unavailable');
  }
  if (!Array.isArray(pending.data)) throw new WorkforceDispatchError('invalid_response');
  const jobs = pending.data.slice(0, 24).map(value => {
    const job = record(value);
    if (!['daily_absences', 'monthly_hours'].includes(String(job.kind))
      || typeof job.period !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(job.period)
      || (job.kind === 'monthly_hours' && !job.period.endsWith('-01'))) {
      throw new WorkforceDispatchError('invalid_response');
    }
    return { kind: job.kind as string, period: job.period };
  });
  const result: WorkforceDispatchResult = { due: 0, completed: 0, busy: 0, failed: 0 };
  const seen = new Set<string>();
  for (const job of jobs) {
    signal?.throwIfAborted();
    const key = `${job.kind}:${job.period}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.due++;
    try {
      const claim = await db.rpc('workforce_claim_report_job', { p_kind: job.kind, p_period: job.period });
      signal?.throwIfAborted();
      if (claim.error) throw new WorkforceDispatchError('database_unavailable');
      const lease = record(claim.data);
      if (lease.status === 'completed') continue;
      if (lease.status === 'busy') { result.busy++; continue; }
      if (lease.status !== 'claimed' || !uuid(lease.jobId) || !uuid(lease.leaseToken)) {
        throw new WorkforceDispatchError('invalid_response');
      }
      const completion = await db.rpc('workforce_complete_report_job', {
        p_job_id: lease.jobId, p_lease_token: lease.leaseToken
      });
      signal?.throwIfAborted();
      if (completion.error) throw new WorkforceDispatchError('database_unavailable');
      const completed = record(completion.data);
      if (!['completed', 'already_completed'].includes(String(completed.status)) || !uuid(completed.reportId)) {
        throw new WorkforceDispatchError('invalid_response');
      }
      result.completed++;
    } catch {
      signal?.throwIfAborted();
      // Do not release/reclaim a possibly committed job in this process. The next
      // due/claim pass resolves the persisted result or waits for the lease expiry.
      result.failed++;
    }
  }
  return result;
}
