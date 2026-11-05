<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte';
  import { locale } from 'svelte-i18n';
  import Mic from 'lucide-svelte/icons/mic';
  import Square from 'lucide-svelte/icons/square';
  import Send from 'lucide-svelte/icons/send';
  import { voiceCopy } from './voice-copy';
  import { durationLabel, recordingExtension, recordingMimeType, VoiceTransferError, VOICE_MAX_BYTES, VOICE_MAX_DURATION_MS } from './voice';
  import type { VoiceDraft } from './types';
  import VoicePlayer from './VoicePlayer.svelte';

  let { contextKey, disabled = false, onSend }: {
    contextKey: string; disabled?: boolean; onSend: (draft: VoiceDraft, signal: AbortSignal) => Promise<boolean>;
  } = $props();
  let c = $derived(voiceCopy($locale));
  let phase = $state<'idle' | 'requesting' | 'recording' | 'preparing' | 'preview' | 'sending'>('idle');
  let elapsed = $state(0);
  let draft = $state<VoiceDraft | null>(null);
  let previewURL = $state('');
  let error = $state<keyof typeof c | ''>('');
  let notice = $state<keyof typeof c | ''>('');
  let supported = $state(false);
  let supportError = $state<keyof typeof c | ''>('');
  let destroyed = false;
  let epoch = 0;
  let upload: AbortController | null = null;
  interface Capture { epoch: number; owner: string; stream: MediaStream; recorder: MediaRecorder; chunks: Blob[]; bytes: number; startedAt: number; durationMs: number; timer?: ReturnType<typeof setInterval>; stopping: boolean; valid: boolean; }
  let capture: Capture | null = null;
  let draftOwner = '';

  function live(session: Capture) { return !destroyed && session.valid && session.epoch === epoch && contextKey === session.owner && capture === session; }
  function release(session: Capture) {
    clearInterval(session.timer);
    for (const track of session.stream.getTracks()) { track.onended = null; track.stop(); }
  }
  function clearDraft() {
    if (previewURL) URL.revokeObjectURL(previewURL);
    previewURL = ''; draft = null; draftOwner = '';
  }
  function reset() {
    epoch++; upload?.abort(); upload = null;
    const session = capture; capture = null;
    if (session) {
      session.valid = false;
      clearInterval(session.timer);
      if (session.recorder.state !== 'inactive') { try { session.recorder.stop(); } catch { /* Already stopped. */ } }
      release(session);
    }
    clearDraft(); phase = 'idle'; elapsed = 0; error = ''; notice = '';
  }
  $effect.pre(() => {
    const owner = contextKey, unavailable = disabled;
    untrack(() => { void owner; void unavailable; reset(); });
    return () => { reset(); };
  });
  onMount(() => {
    supported = typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
    if (!window.isSecureContext) { supported = false; supportError = 'insecure'; }
    else if (!supported) supportError = 'unsupported';
    const hide = () => {
      if (!document.hidden) return;
      if (phase === 'requesting') { reset(); notice = 'backgroundStopped'; }
      else if (phase === 'recording') { notice = 'backgroundStopped'; stop(); }
    };
    document.addEventListener('visibilitychange', hide);
    return () => document.removeEventListener('visibilitychange', hide);
  });
  onDestroy(() => { destroyed = true; reset(); });

  function permissionError(reason: unknown): keyof typeof c {
    const name = reason instanceof Error ? reason.name : '';
    if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'noMicrophone';
    if (name === 'NotReadableError' || name === 'TrackStartError') return 'busy';
    if (name === 'NotSupportedError') return 'unsupported';
    return 'recordFailed';
  }
  function requestId(): string {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16)); bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  async function start() {
    if (!supported || disabled || !contextKey || phase !== 'idle') return;
    reset(); const attempt = epoch, owner = contextKey;
    phase = 'requesting';
    let stream: MediaStream | null = null;
    try {
      const mime = recordingMimeType(type => MediaRecorder.isTypeSupported(type));
      if (!mime) throw new DOMException('No supported audio format', 'NotSupportedError');
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      if (destroyed || attempt !== epoch || contextKey !== owner || disabled || document.hidden) { stream.getTracks().forEach(track => track.stop()); return; }
      const recorder = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 96000 });
      const session: Capture = { epoch: attempt, owner, stream, recorder, chunks: [], bytes: 0, startedAt: performance.now(), durationMs: 0, stopping: false, valid: true };
      capture = session;
      recorder.ondataavailable = event => {
        if (!live(session) || !event.data.size) return;
        session.bytes += event.data.size;
        if (session.bytes > VOICE_MAX_BYTES) { reset(); error = 'tooLarge'; return; }
        session.chunks.push(event.data);
      };
      recorder.onerror = () => { if (live(session)) { reset(); error = 'recordFailed'; } };
      recorder.onstop = () => {
        release(session);
        if (!live(session)) return;
        const durationMs = session.durationMs || Math.min(VOICE_MAX_DURATION_MS, Math.max(1, Math.round(performance.now() - session.startedAt)));
        const blob = new Blob(session.chunks, { type: recorder.mimeType || mime });
        capture = null; session.valid = false;
        if (!blob.size || durationMs < 1) { phase = 'idle'; error = 'tooShort'; return; }
        if (blob.size > VOICE_MAX_BYTES) { phase = 'idle'; error = 'tooLarge'; return; }
        const file = new File([blob], `voice-${Date.now()}.${recordingExtension(blob.type)}`, { type: blob.type });
        draft = { file, durationMs, clientRequestId: requestId() }; draftOwner = session.owner;
        previewURL = URL.createObjectURL(blob); elapsed = durationMs; phase = 'preview';
      };
      for (const track of stream.getTracks()) track.onended = () => { if (live(session) && !session.stopping) { reset(); error = 'interrupted'; } };
      recorder.start(1000); phase = 'recording';
      session.timer = setInterval(() => {
        if (!live(session)) return;
        elapsed = Math.min(VOICE_MAX_DURATION_MS, Math.round(performance.now() - session.startedAt));
        // Leave one second for encoder flushing; the server measures the actual audio duration.
        if (elapsed >= VOICE_MAX_DURATION_MS - 1000) { notice = 'maxReached'; stop(); }
      }, 200);
    } catch (reason) {
      stream?.getTracks().forEach(track => track.stop());
      if (!destroyed && attempt === epoch && contextKey === owner) { reset(); error = permissionError(reason); }
    }
  }
  function stop() {
    const session = capture;
    if (!session || !live(session) || session.stopping) return;
    session.stopping = true; phase = 'preparing';
    session.durationMs = Math.min(VOICE_MAX_DURATION_MS, Math.max(1, Math.round(performance.now() - session.startedAt)));
    clearInterval(session.timer);
    try { session.recorder.stop(); release(session); }
    catch { reset(); error = 'recordFailed'; }
  }
  async function send() {
    const recording = draft;
    if (!recording || phase !== 'preview' || disabled) return;
    if (draftOwner !== contextKey) { reset(); return; }
    const owner = contextKey, generation = epoch, controller = new AbortController();
    upload = controller; phase = 'sending'; error = ''; notice = '';
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
      const confirmed = await onSend(recording, controller.signal);
      if (destroyed || generation !== epoch || contextKey !== owner || upload !== controller) return;
      if (!confirmed || controller.signal.aborted) throw new Error('Send not confirmed');
      clearDraft(); phase = 'idle'; notice = 'sent'; elapsed = 0;
    } catch (reason) {
      if (destroyed || generation !== epoch || contextKey !== owner || upload !== controller) return;
      phase = 'preview';
      if (reason instanceof VoiceTransferError && reason.status === 410 && reason.code === 'UPLOAD_EXPIRED') {
        draft = { ...recording, clientRequestId: requestId() };
      }
      error = reason instanceof VoiceTransferError && reason.status === 413 ? 'uploadLimit'
        : reason instanceof VoiceTransferError && [401, 403].includes(reason.status) ? 'noAccess'
        : reason instanceof VoiceTransferError && reason.status === 503 ? 'setup' : 'sendFailed';
    } finally { clearTimeout(timer); if (upload === controller) upload = null; }
  }
</script>

<section class="voice-recorder" aria-label={c.record}>
  {#if phase === 'idle'}
    <div class="voice-toolbar"><button type="button" class="voice-button" onclick={start} disabled={!supported || disabled || !contextKey}><Mic size={17} aria-hidden="true" />{c.record}</button><span class="voice-meta">{c.limit}</span></div>
    {#if supportError}<p class="voice-meta">{c[supportError]}</p>{/if}
  {:else if phase === 'requesting'}
    <div class="voice-toolbar"><p role="status">{c.requesting}</p><button type="button" class="voice-button" onclick={() => { reset(); notice = 'permissionCancelled'; }}>{c.cancel}</button></div>
  {:else if phase === 'recording' || phase === 'preparing'}
    <div class="voice-toolbar"><span class="voice-recording"><span aria-hidden="true" class="record-dot"></span>{phase === 'preparing' ? c.preparing : c.recording}</span><output class="voice-elapsed" aria-label={c.duration}>{durationLabel(elapsed)}</output><button type="button" class="voice-button" disabled={phase === 'preparing'} onclick={stop}><Square size={15} aria-hidden="true" />{c.stop}</button><button type="button" class="voice-button" onclick={reset}>{c.discard}</button></div>
  {:else if draft}
    <VoicePlayer {previewURL} durationMs={draft.durationMs} {contextKey} label={c.preview} />
    <div class="voice-toolbar"><button type="button" class="voice-button voice-send" disabled={phase === 'sending' || disabled} aria-busy={phase === 'sending'} onclick={send}><Send size={16} aria-hidden="true" />{phase === 'sending' ? c.sending : c.send}</button><button type="button" class="voice-button" disabled={phase === 'sending'} onclick={reset}>{c.discard}</button></div>
  {/if}
  {#if error}<p class="voice-feedback" data-tone="error" role="alert">{c[error]}</p>{/if}
  {#if notice}<p class="voice-feedback" role="status">{c[notice]}</p>{/if}
  <p class="voice-meta">{c.retention}</p>
</section>

<style>
  .voice-recorder { display: grid; gap: var(--space-sm); min-width: 0; width: 100%; color: var(--ink-primary); overflow-wrap: anywhere; }
  .voice-toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-sm); min-width: 0; }
  .voice-button { display: inline-flex; align-items: center; justify-content: center; gap: var(--space-xs); min-height: var(--control-size); max-width: 100%; border: 1px solid var(--border); border-radius: var(--radius-sm); padding: var(--space-sm) var(--space-md); color: var(--ink-primary); background: var(--bg-2); font: inherit; font-size: var(--text-sm); font-weight: 600; cursor: pointer; white-space: normal; overflow-wrap: anywhere; }
  .voice-button :global(svg) { flex-shrink: 0; }
  .voice-button:hover:not(:disabled) { border-color: var(--brand); }
  .voice-button:disabled { color: var(--ink-secondary); background: var(--bg-2); opacity: 1; cursor: not-allowed; }
  .voice-button:focus-visible { outline: 2px solid var(--focus); outline-offset: var(--space-xxs); }
  .voice-send { border-color: var(--brand); background: var(--brand-soft); }
  .voice-recording { display: inline-flex; align-items: center; gap: var(--space-sm); font-size: var(--text-sm); font-weight: 600; }
  .record-dot { width: var(--space-sm); height: var(--space-sm); border-radius: var(--radius-full); background: var(--error); }
  .voice-elapsed { font-variant-numeric: tabular-nums; font-weight: 650; }
  p { margin: 0; }
  .voice-meta { color: var(--ink-tertiary); font-size: var(--text-xs); line-height: var(--leading-normal); }
  .voice-feedback { color: var(--ink-primary); background: var(--ok-soft); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: var(--space-sm) var(--space-md); font-size: var(--text-sm); }
  .voice-feedback[data-tone="error"] { background: var(--error-soft); }
</style>
