<script lang="ts">
  // VoiceInput — mic button with built-in VAD (Web Audio), sends recorded audio
  // to /api/ai/forge/asr, calls onTranscription with the returned text.
  //
  // VAD logic: if RMS drops below SILENCE_THRESHOLD for SILENCE_FRAMES
  // consecutive animation frames the recording stops automatically.
  // This enables hands-free station use — speak, pause, get transcription.

  type Props = {
    onTranscription: (text: string) => void;
    /** Auto-stop after silence detected (default true). */
    vad?: boolean;
    /** Override detected language sent to Whisper. */
    language?: string;
    /** Small = compact icon-only button; default = button with label. */
    size?: 'sm' | 'md';
    /** Extra CSS classes on the root element. */
    class?: string;
  };

  let {
    onTranscription,
    vad = true,
    language,
    size = 'md',
    class: extraClass = ''
  }: Props = $props();

  type State = 'idle' | 'recording' | 'transcribing' | 'error';
  let state = $state<State>('idle');
  let level = $state(0);      // 0–1 normalized RMS for the level ring
  let errorMsg = $state('');

  let mediaRecorder: MediaRecorder | null = null;
  let audioCtx: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let rafId: number | null = null;
  let chunks: Blob[] = [];
  let mime = 'audio/webm;codecs=opus';

  const SILENCE_THRESHOLD = 0.018;
  const SILENCE_FRAMES_TO_STOP = 45; // ~1.5 s at ~30 fps
  let silenceFrames = 0;

  async function startRecording() {
    errorMsg = '';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

      // Web Audio API for level meter + VAD.
      audioCtx = new AudioContext();
      const src = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);

      const timeBuf = new Uint8Array(analyser.frequencyBinCount);
      silenceFrames = 0;

      function tick() {
        if (!analyser) return;
        analyser.getByteTimeDomainData(timeBuf);
        let sumSq = 0;
        for (let i = 0; i < timeBuf.length; i++) {
          const s = (timeBuf[i] - 128) / 128;
          sumSq += s * s;
        }
        const rms = Math.sqrt(sumSq / timeBuf.length);
        level = Math.min(1, rms * 4);

        if (vad) {
          if (rms < SILENCE_THRESHOLD) silenceFrames++;
          else silenceFrames = 0;
          // Only auto-stop if we have at least 1 s of audio first.
          if (chunks.length > 0 && silenceFrames >= SILENCE_FRAMES_TO_STOP) {
            stopRecording();
            return;
          }
        }
        rafId = requestAnimationFrame(tick);
      }
      rafId = requestAnimationFrame(tick);

      // MediaRecorder — prefer opus/webm, fallback to whatever the browser has.
      if (!MediaRecorder.isTypeSupported(mime)) {
        mime = MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
          ? 'audio/ogg;codecs=opus'
          : '';
      }
      mediaRecorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      mediaRecorder.onstop = () => void sendToAsr();
      mediaRecorder.start(100); // 100 ms slices give VAD responsiveness

      state = 'recording';
    } catch (err) {
      errorMsg = (err as Error).message;
      state = 'error';
    }
  }

  function stopRecording() {
    if (rafId != null) { cancelAnimationFrame(rafId); rafId = null; }
    analyser = null;
    audioCtx?.close();
    audioCtx = null;
    mediaRecorder?.stream.getTracks().forEach((t) => t.stop());
    mediaRecorder?.stop();
    state = 'transcribing';
    level = 0;
  }

  async function sendToAsr() {
    if (chunks.length === 0) { state = 'idle'; return; }
    try {
      const blob = new Blob(chunks, { type: mime || 'audio/webm' });
      const form = new FormData();
      form.append('file', blob, mime.includes('ogg') ? 'recording.ogg' : 'recording.webm');
      if (language) form.append('language', language);

      const resp = await fetch('/api/ai/forge/asr', { method: 'POST', body: form });
      if (!resp.ok) throw new Error(`ASR ${resp.status}`);
      const j = (await resp.json()) as { text?: string; error?: string };
      if (j.error) throw new Error(j.error);
      const text = (j.text ?? '').trim();
      if (text) onTranscription(text);
      state = 'idle';
    } catch (err) {
      errorMsg = (err as Error).message;
      state = 'error';
    }
  }

  function toggle() {
    if (state === 'idle' || state === 'error') void startRecording();
    else if (state === 'recording') stopRecording();
  }

  const label = $derived(
    state === 'recording'    ? 'Stop recording'   :
    state === 'transcribing' ? 'Transcribing…'    :
    state === 'error'        ? errorMsg || 'Error' :
                               'Start voice input'
  );
</script>

<button
  type="button"
  class="voice-btn {size} {state} {extraClass}"
  onclick={toggle}
  disabled={state === 'transcribing'}
  aria-label={label}
  title={label}
>
  <!-- Animated level ring when recording -->
  {#if state === 'recording'}
    <span class="ring" style="--lv: {level}"></span>
  {/if}

  <!-- Icon -->
  {#if state === 'transcribing'}
    <span class="icon-wrap spinning">
      <!-- loader spinner via CSS -->
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path d="M12 2a10 10 0 0 1 10 10"/>
      </svg>
    </span>
  {:else}
    <span class="icon-wrap">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <rect x="9" y="2" width="6" height="13" rx="3"/>
        <path d="M5 10a7 7 0 0 0 14 0M12 19v3M8 22h8"/>
      </svg>
    </span>
  {/if}

  {#if size === 'md'}
    <span class="label">{label}</span>
  {/if}
</button>

<style>
  .voice-btn {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-full);
    background: transparent;
    color: var(--text);
    cursor: pointer;
    font: inherit;
    transition: background var(--transition-fast), border-color var(--transition-fast),
                color var(--transition-fast);
  }
  .voice-btn.md { padding: 8px 14px; }
  .voice-btn.sm { padding: 7px; }

  .voice-btn:hover { background: color-mix(in oklab, var(--brand) 8%, transparent); }
  .voice-btn:focus-visible { outline: none; box-shadow: var(--focus-ring); }
  .voice-btn:disabled { opacity: 0.6; cursor: not-allowed; }

  /* Active / recording state */
  .voice-btn.recording {
    background: color-mix(in oklab, var(--brand) 16%, transparent);
    border-color: var(--brand);
    color: var(--brand);
  }
  .voice-btn.error {
    border-color: var(--error);
    color: var(--error);
  }

  /* Pulsing level ring */
  .ring {
    position: absolute;
    inset: -4px;
    border-radius: var(--radius-full);
    border: 2px solid var(--brand);
    opacity: calc(0.3 + var(--lv, 0) * 0.7);
    transform: scale(calc(1 + var(--lv, 0) * 0.12));
    transition: transform 0.05s, opacity 0.05s;
    pointer-events: none;
  }

  .icon-wrap {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .icon-wrap svg { width: 16px; height: 16px; }
  .spinning svg {
    animation: spin 0.9s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .label {
    font-size: calc(0.875rem * var(--font-scale, 1));
    white-space: nowrap;
  }
</style>
