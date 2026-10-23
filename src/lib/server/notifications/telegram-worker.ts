import { getTelegramRuntime } from './telegram-runtime';
import { dispatchTelegramDeliveries } from './telegram-service';
import { dispatchTelegramBotReplies } from './telegram-bot';

type WorkerState = { started: boolean; busy: boolean; lastDelivery: number; timer?: ReturnType<typeof setTimeout> };
const stateKey = Symbol.for('oms.telegram.deliveryWorker');

/** One loop per Node process; persisted SKIP LOCKED leases coordinate replicas. */
export function startTelegramWorker() {
  const globals = globalThis as typeof globalThis & { [stateKey]?: WorkerState };
  const state = globals[stateKey] ??= { started: false, busy: false, lastDelivery: 0 };
  if (state.started) return;
  state.started = true;
  const tick = async () => {
    if (state.busy) return;
    state.busy = true;
    try {
      const runtime = await getTelegramRuntime();
      const options = runtime?.config.options;
      if (runtime && options?.automaticDelivery !== false && Date.now() - state.lastDelivery >= (options?.deliveryIntervalSeconds ?? 30) * 1000) {
        state.lastDelivery = Date.now();
        await dispatchTelegramDeliveries(runtime.config, runtime.db);
        await dispatchTelegramBotReplies(runtime.config, runtime.db);
      }
    } catch { /* Optional integration failures must never stop the OMS server. */ }
    finally {
      state.busy = false;
      state.timer = setTimeout(() => void tick(), 10000);
      state.timer.unref?.();
    }
  };
  state.timer = setTimeout(() => void tick(), 10000);
  state.timer.unref?.();
}
