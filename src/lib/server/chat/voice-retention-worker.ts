import { logger } from '../logging/logger';
import { getChatVoiceDatabase } from './voice-runtime';
import { cleanupExpiredVoices } from './voice-retention';

type State = { started: boolean; running: Promise<void> | null; timer?: ReturnType<typeof setTimeout>; controller: AbortController; lastWarning: number };
const key = Symbol.for('oms.chat.voiceRetention');

/** Start from production hooks alongside the other durable workers. */
export function startChatVoiceRetentionWorker() {
  const globals = globalThis as typeof globalThis & { [key]?: State };
  const state = globals[key] ??= { started: false, running: null, controller: new AbortController(), lastWarning: 0 };
  if (state.started) return;
  state.started = true;
  state.controller = new AbortController();
  const warn = (reason: string) => {
    if (!state.lastWarning || Date.now() - state.lastWarning >= 60 * 60 * 1000) {
      logger.warn('Voice recording cleanup is waiting for recovery', { reason });
      state.lastWarning = Date.now();
    }
  };
  const run = async () => {
    try {
      const db = getChatVoiceDatabase();
      if (!db) { warn('server_storage_configuration_required'); return; }
      const result = await cleanupExpiredVoices(db, state.controller.signal);
      if (result.failed) warn('storage_retry_pending');
      else state.lastWarning = 0;
      if (result.removed) logger.info('Expired voice recordings removed', { count: result.removed });
    } catch (error) {
      if (!state.controller.signal.aborted) warn(error instanceof Error && error.message === 'voice_migration_required' ? 'voice_migration_required' : 'storage_unavailable');
    }
  };
  const tick = async () => {
    if (!state.started || state.running) return;
    state.running = run();
    try { await state.running; } finally {
      state.running = null;
      if (state.started) { state.timer = setTimeout(() => void tick(), 60_000); state.timer.unref?.(); }
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
