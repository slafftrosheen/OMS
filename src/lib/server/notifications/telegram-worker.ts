import { getTelegramRuntime } from './telegram-runtime';
import { dispatchTelegramDeliveries } from './telegram-service';
import { dispatchTelegramBotReplies } from './telegram-bot';
import { startTelegramPollingWorker, stopTelegramPollingWorker } from './telegram-polling-worker';

type WorkerState = { started: boolean; busy: boolean; lastDelivery: number; timer?: ReturnType<typeof setTimeout> };
const stateKey = Symbol.for('oms.telegram.deliveryWorker');

/** Separate incoming/outgoing loops; persisted leases coordinate production replicas. */
export function startTelegramWorker() {
  const globals = globalThis as typeof globalThis & { [stateKey]?: WorkerState };
  const state = globals[stateKey] ??= { started: false, busy: false, lastDelivery: 0 };
  if (state.started) return;
  state.started = true;
  startTelegramPollingWorker();
  // Use adapter-node's async lifecycle event, not a SIGTERM handler that changes Node's exit behavior.
  process.once('sveltekit:shutdown', async () => {
    state.started = false;
    clearTimeout(state.timer);
    await stopTelegramPollingWorker();
  });
  const tick = async () => {
    if (state.busy || !state.started) return;
    state.busy = true;
    try {
      const runtime = await getTelegramRuntime();
      const options = runtime?.config.options;
      if (runtime) {
        if (options?.automaticDelivery !== false && Date.now() - state.lastDelivery >= (options?.deliveryIntervalSeconds ?? 30) * 1000) {
          state.lastDelivery = Date.now();
          try { await dispatchTelegramDeliveries(runtime.config, runtime.db); }
          catch { /* A notification failure must not block command replies. */ }
        }
        // Direct replies remain enabled when automatic notification delivery is paused.
        await dispatchTelegramBotReplies(runtime.config, runtime.db);
      }
    } catch { /* Optional integration failures must never stop the OMS server. */ }
    finally {
      state.busy = false;
      if (state.started) {
        state.timer = setTimeout(() => void tick(), 10000);
        state.timer.unref?.();
      }
    }
  };
  state.timer = setTimeout(() => void tick(), 1000);
  state.timer.unref?.();
}
