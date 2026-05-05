<script lang="ts">
  /**
   * Voice + visual assistant primitives for the AI Lab chat (and any other
   * surface that wants hands-free / camera-augmented interaction).
   *
   * - mic button records up to MAX_RECORD_MS of audio and posts to /api/ai/forge/asr
   *   for transcription. Result is appended into the bound `text`.
   * - camera button opens a station-friendly preview, captures a JPEG and
   *   surfaces it as a base64 image attachment for vision-capable models.
   * - TTS playback is wired via `speak(text)` on demand (pull, not push).
   *
   * Permission model: getUserMedia prompts in-browser; we surface failures as
   * inline notices instead of silently dying. Air-gapped Tailnet means we can't
   * fall back to a public ASR service — we always go through the OMS sidecar.
   */
  import { onDestroy } from 'svelte';
  import Icon from '$lib/ui/Icon.svelte';

  let {
    text = $bindable(''),
    /** Latest captured image as `data:image/jpeg;base64,...` for vision turns. */
    image = $bindable<string | null>(null),
    /** Auto-speak the latest assistant reply. */
    autoSpeakReply = $bindable(false),
    /** Locale used by ASR + TTS. */
    language = 'en',
    /** Disable everything (network busy, etc.). */
    disabled = false
  }: {
    text?: string;
    image?: string | null;
    autoSpeakReply?: boolean;
    language?: string;
    disabled?: boolean;
  } = $props();

  const MAX_RECORD_MS = 30_000;

  // ─── Recording state ─────────────────────────────────────────────────────
  let recording = $state(false);
  let transcribing = $state(false);
  let elapsed = $state(0);
  let error = $state<string | null>(null);

  let mediaStream: MediaStream | null = null;
  let mediaRecorder: MediaRecorder | null = null;
  let recordedChunks: BlobPart[] = [];
  let recordTimer: ReturnType<typeof setInterval> | null = null;
  let stopTimer: ReturnType<typeof setTimeout> | null = null;

  // ─── Camera state ────────────────────────────────────────────────────────
  let camOpen = $state(false);
  let videoEl: HTMLVideoElement | null = $state(null);
  let camStream: MediaStream | null = null;
  let snapping = $state(false);

  // ─── TTS state ───────────────────────────────────────────────────────────
  let speaking = $state(false);
  let audioEl: HTMLAudioElement | null = null;

  async function startRecording() {
    if (disabled || recording) return;
    error = null;
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : '';
      mediaRecorder = new MediaRecorder(mediaStream, mime ? { mimeType: mime } : undefined);
      recordedChunks = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) recordedChunks.push(e.data);
      };
      mediaRecorder.onstop = handleStopped;
      mediaRecorder.start();
      recording = true;
      elapsed = 0;
      recordTimer = setInterval(() => {
        elapsed += 100;
        if (elapsed >= MAX_RECORD_MS) stopRecording();
      }, 100);
      stopTimer = setTimeout(stopRecording, MAX_RECORD_MS + 500);
    } catch (err) {
      error = (err as Error).message || 'Microphone unavailable';
      cleanupRecording();
    }
  }

  function stopRecording() {
    if (!recording || !mediaRecorder) return;
    try {
      mediaRecorder.stop();
    } catch {
      cleanupRecording();
    }
  }

  async function handleStopped() {
    recording = false;
    if (recordTimer) { clearInterval(recordTimer); recordTimer = null; }
    if (stopTimer) { clearTimeout(stopTimer); stopTimer = null; }

    const blob = new Blob(recordedChunks, { type: mediaRecorder?.mimeType || 'audio/webm' });
    cleanupRecording();
    if (blob.size === 0) return;

    transcribing = true;
    try {
      const fd = new FormData();
      fd.append('file', blob, `voice-${Date.now()}.webm`);
      fd.append('language', language);
      const res = await fetch('/api/ai/forge/asr', { method: 'POST', body: fd });
      if (!res.ok) throw new Error(await res.text());
      const j = await res.json() as { text?: string };
      const transcript = (j.text ?? '').trim();
      if (transcript) {
        text = text ? `${text} ${transcript}` : transcript;
      } else {
        error = 'No speech detected.';
      }
    } catch (err) {
      error = `Transcription failed: ${(err as Error).message}`;
    } finally {
      transcribing = false;
    }
  }

  function cleanupRecording() {
    if (recordTimer) { clearInterval(recordTimer); recordTimer = null; }
    if (stopTimer) { clearTimeout(stopTimer); stopTimer = null; }
    mediaStream?.getTracks().forEach((t) => t.stop());
    mediaStream = null;
    mediaRecorder = null;
    recording = false;
  }

  // ─── Camera ──────────────────────────────────────────────────────────────

  async function openCamera() {
    if (disabled) return;
    error = null;
    try {
      camStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });
      camOpen = true;
      // Defer attach until the <video> element is rendered.
      requestAnimationFrame(() => {
        if (videoEl && camStream) {
          videoEl.srcObject = camStream;
          videoEl.play().catch(() => { /* user-gesture issue, harmless */ });
        }
      });
    } catch (err) {
      error = (err as Error).message || 'Camera unavailable';
    }
  }

  function closeCamera() {
    camOpen = false;
    camStream?.getTracks().forEach((t) => t.stop());
    camStream = null;
    if (videoEl) videoEl.srcObject = null;
  }

  function snap() {
    if (!videoEl || !camStream) return;
    snapping = true;
    try {
      const w = videoEl.videoWidth || 1280;
      const h = videoEl.videoHeight || 720;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(videoEl, 0, 0, w, h);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.86);
      // Strip the data: prefix — Ollama vision wants raw base64.
      const idx = dataUrl.indexOf(',');
      image = idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
      closeCamera();
    } finally {
      snapping = false;
    }
  }

  // ─── TTS ────────────────────────────────────────────────────────────────

  export async function speak(t: string) {
    if (!t || speaking) return;
    speaking = true;
    error = null;
    try {
      const res = await fetch('/api/ai/forge/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: t.slice(0, 4000) })
      });
      if (!res.ok) throw new Error(await res.text());
      const j = await res.json() as { artifact?: { url?: string } };
      const url = j.artifact?.url;
      if (!url) throw new Error('No audio returned');
      audioEl?.pause();
      audioEl = new Audio(url);
      audioEl.onended = () => { speaking = false; };
      audioEl.onerror = () => { speaking = false; error = 'Playback failed'; };
      void audioEl.play();
    } catch (err) {
      speaking = false;
      error = `TTS failed: ${(err as Error).message}`;
    }
  }

  function stopSpeaking() {
    audioEl?.pause();
    audioEl = null;
    speaking = false;
  }

  function clearImage() { image = null; }

  onDestroy(() => {
    cleanupRecording();
    closeCamera();
    audioEl?.pause();
  });

  const recordSeconds = $derived((elapsed / 1000).toFixed(1));
</script>

<div class="vv-bar" role="toolbar" aria-label="Voice and visual assistant">
  <button
    class="vv-btn"
    class:on={recording}
    onclick={recording ? stopRecording : startRecording}
    disabled={disabled || transcribing}
    aria-pressed={recording}
    title={recording ? 'Stop recording' : 'Voice input'}
  >
    <Icon name={recording ? 'stop-circle' : 'mic'} size="sm" />
    {#if recording}<span class="t">{recordSeconds}s</span>{/if}
    {#if transcribing}<span class="t">…</span>{/if}
  </button>

  <button
    class="vv-btn"
    onclick={openCamera}
    disabled={disabled}
    title="Capture an image"
  >
    <Icon name="camera" size="sm" />
  </button>

  <label class="vv-btn ghost" title="Auto-speak assistant replies">
    <input type="checkbox" bind:checked={autoSpeakReply} disabled={disabled} />
    <Icon name={autoSpeakReply ? 'volume-2' : 'volume-x'} size="sm" />
  </label>

  {#if speaking}
    <button class="vv-btn" onclick={stopSpeaking} title="Stop playback">
      <Icon name="stop-circle" size="sm" />
    </button>
  {/if}

  {#if image}
    <div class="thumb">
      <img src={'data:image/jpeg;base64,' + image} alt="Captured" />
      <button class="x" onclick={clearImage} aria-label="Remove image">×</button>
    </div>
  {/if}
</div>

{#if error}
  <div class="vv-error" role="alert">{error}</div>
{/if}

{#if camOpen}
  <div class="cam-overlay" role="dialog" aria-modal="true">
    <video bind:this={videoEl} playsinline muted></video>
    <div class="cam-actions">
      <button class="cam-btn" onclick={closeCamera}>Cancel</button>
      <button class="cam-btn primary" onclick={snap} disabled={snapping}>
        <Icon name="camera" size="sm" /> Snap
      </button>
    </div>
  </div>
{/if}

<style>
  .vv-bar {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .vv-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 6px 8px;
    border-radius: var(--radius-md);
    background: var(--bg-1);
    border: 1px solid var(--border);
    color: var(--text);
    cursor: pointer;
    font-size: 12px;
  }
  .vv-btn:hover { background: var(--bg-2); }
  .vv-btn.on {
    background: color-mix(in oklab, #ff453a 22%, transparent);
    border-color: #ff453a;
    color: #ff453a;
    animation: pulse 1.4s ease-in-out infinite;
  }
  .vv-btn.ghost { background: transparent; }
  .vv-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .vv-btn input[type="checkbox"] { accent-color: var(--brand); }
  .t { font-variant-numeric: tabular-nums; }
  @keyframes pulse {
    0%,100% { box-shadow: 0 0 0 0 rgba(255,69,58,0.4); }
    50% { box-shadow: 0 0 0 6px rgba(255,69,58,0); }
  }

  .thumb {
    position: relative;
    width: 32px; height: 32px;
    border-radius: 6px;
    overflow: hidden;
    border: 1px solid var(--border);
  }
  .thumb img { width: 100%; height: 100%; object-fit: cover; }
  .thumb .x {
    position: absolute;
    top: -6px; right: -6px;
    width: 16px; height: 16px;
    background: #ff453a;
    color: white; border: 0;
    border-radius: 50%;
    cursor: pointer;
    font-size: 11px; line-height: 1;
  }

  .vv-error {
    margin-top: 6px;
    font-size: 11px;
    color: #ff453a;
  }

  .cam-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.86);
    z-index: 1000;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
  }
  .cam-overlay video {
    max-width: 90vw;
    max-height: 78vh;
    border-radius: var(--radius-lg);
    box-shadow: 0 12px 40px rgba(0,0,0,0.5);
    background: #000;
  }
  .cam-actions { display: flex; gap: 12px; }
  .cam-btn {
    padding: 10px 18px;
    border-radius: var(--radius-full);
    border: 1px solid rgba(255,255,255,0.4);
    background: rgba(255,255,255,0.08);
    color: #fff;
    cursor: pointer;
    font-size: 14px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .cam-btn.primary {
    background: var(--brand);
    border-color: var(--brand);
  }
  .cam-btn:disabled { opacity: 0.5; cursor: progress; }
</style>
