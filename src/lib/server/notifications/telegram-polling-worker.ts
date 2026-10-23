import { getTelegramRuntime } from './telegram-runtime';
import { runTelegramPollingCycle } from './telegram-polling';

type State = {
  started: boolean;
  controller?: AbortController;
  timer?: ReturnType<typeof setTimeout>;
  active?: Promise<void>;
};
const key = Symbol.for('oms.telegram.pollingWorker');
const state = () => {
  const globals = globalThis as typeof globalThis & { [key]?: State };
  return globals[key] ??= { started: false };
};

/** Invoked only by the existing production-only worker bootstrap. */
export function startTelegramPollingWorker(): void {
  const current = state();
  if (current.started) return;
  current.started = true;
  current.controller = new AbortController();
  const signal = current.controller.signal;
  const tick = () => {
    if (!current.started || signal.aborted) return;
    current.active = (async () => {
      let delay = 5000;
      try {
        const runtime = await getTelegramRuntime();
        if (runtime && !signal.aborted) delay = await runTelegramPollingCycle(runtime.config, runtime.db, { signal });
      } catch { /* Optional integration/storage failures never stop OMS or leak credentials. */ }
      finally {
        if (current.started && !signal.aborted) {
          // Backoff is durable in SQL. Recheck settings promptly even during a long retry delay.
          current.timer = setTimeout(tick, Math.min(5000, Math.max(250, delay)));
          current.timer.unref?.();
        }
      }
    })();
  };
  current.timer = setTimeout(tick, 250);
  current.timer.unref?.();
}

export async function stopTelegramPollingWorker(): Promise<void> {
  const current = state();
  current.started = false;
  clearTimeout(current.timer);
  current.controller?.abort();
  await current.active;
}
