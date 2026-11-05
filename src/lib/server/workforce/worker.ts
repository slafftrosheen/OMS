import { logger } from '../logging/logger';
import { getWorkforceDatabase } from './runtime';
import { dispatchWorkforceReports, WorkforceDispatchError } from './report-dispatch';

type WorkerState = {
  started: boolean;
  running: Promise<void> | null;
  timer?: ReturnType<typeof setTimeout>;
  controller: AbortController;
  lastWarning: number;
  lastProblem: string;
};
const stateKey = Symbol.for('oms.workforce.reportWorker');

/** One local loop; durable database leases coordinate independent app replicas. */
export function startWorkforceWorker() {
  const globals = globalThis as typeof globalThis & { [stateKey]?: WorkerState };
  const state = globals[stateKey] ??= {
    started: false, running: null, controller: new AbortController(), lastWarning: 0, lastProblem: ''
  };
  if (state.started) return;
  state.started = true;
  state.controller = new AbortController();

  function problem(reason: string) {
    if (reason !== state.lastProblem || Date.now() - state.lastWarning >= 60 * 60 * 1000) {
      // Never log tokens, worker notes, absence reasons or raw database responses.
      logger.warn('Workforce reports are waiting for recovery', { reason });
      state.lastWarning = Date.now();
      state.lastProblem = reason;
    }
  }

  async function run() {
    try {
      const db = getWorkforceDatabase();
      if (!db) { problem('server_database_configuration_required'); return; }
      const result = await dispatchWorkforceReports(db, state.controller.signal);
      if (result.failed) problem('report_job_retry_pending');
      else if (state.lastProblem) {
        logger.info('Workforce report worker recovered');
        state.lastProblem = '';
      }
      if (result.completed) logger.info('Workforce reports completed', { count: result.completed });
    } catch (error) {
      if (!state.controller.signal.aborted) {
        problem(error instanceof WorkforceDispatchError ? error.reason : 'database_unavailable');
      }
    }
  }

  const tick = async () => {
    if (!state.started || state.running) return;
    state.running = run();
    try { await state.running; }
    finally {
      state.running = null;
      if (state.started) {
        state.timer = setTimeout(() => void tick(), 30000);
        state.timer.unref?.();
      }
    }
  };

  process.once('sveltekit:shutdown', async () => {
    state.started = false;
    clearTimeout(state.timer);
    state.controller.abort();
    await state.running;
  });
  state.timer = setTimeout(() => void tick(), 1000);
  state.timer.unref?.();
}
