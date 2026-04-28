<script lang="ts">
  // Hands-free voice station — continuous VAD loop: record → ASR → chat → TTS.
  // Designed for production floor use: large controls, high-contrast output,
  // no keyboard needed.
  import { onMount } from 'svelte';
  import VoiceInput from '$lib/components/VoiceInput.svelte';
  import Icon from '$lib/ui/Icon.svelte';

  type Turn = {
    role: 'user' | 'assistant';
    text: string;
    ts: string;
  };

  let sessionId = $state<string | null>(null);
  let turns = $state<Turn[]>([]);
  let busy = $state(false);
  let ttsEnabled = $state(true);
  let autoLoop = $state(false);
  let persona = $state('cnc-operator');
  let status = $state<'idle' | 'thinking' | 'speaking'>('idle');

  // Audio element for TTS playback.
  let audioEl: HTMLAudioElement | undefined = $state();

  async function ensureSession() {
    if (sessionId) return;
    const r = await fetch('/api/ai/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Voice session', persona })
    });
    const j = await r.json();
    sessionId = j.session?.id ?? null;
  }

  async function handleTranscription(text: string) {
    if (busy) return;
    busy = true;
    status = 'thinking';
    turns = [...turns, { role: 'user', text, ts: new Date().toLocaleTimeString() }];

    try {
      await ensureSession();
      const r = await fetch(`/api/ai/sessions/${sessionId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text, persona })
      });
      const j = await r.json();
      const reply: string = j.content ?? '(no response)';
      turns = [...turns, { role: 'assistant', text: reply, ts: new Date().toLocaleTimeString() }];

      if (ttsEnabled) {
        status = 'speaking';
        await speakReply(reply);
      }
    } catch (err) {
      turns = [...turns, {
        role: 'assistant',
        text: `Error: ${(err as Error).message}`,
        ts: new Date().toLocaleTimeString()
      }];
    } finally {
      busy = false;
      status = 'idle';
    }
  }

  async function speakReply(text: string) {
    try {
      const r = await fetch('/api/ai/forge/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.slice(0, 800) })
      });
      const j = await r.json();
      const url: string | undefined = j.artifact?.url ?? j.url;
      if (url && audioEl) {
        audioEl.src = url;
        await audioEl.play().catch(() => {/* autoplay blocked */});
        await new Promise<void>((res) => {
          if (!audioEl) { res(); return; }
          audioEl.onended = () => res();
          audioEl.onerror = () => res();
        });
      }
    } catch {
      // TTS failure is non-fatal — text already shown on screen.
    }
  }

  function clearTurns() {
    turns = [];
    sessionId = null;
  }

  onMount(() => {
    audioEl = new Audio();
  });
</script>

<div class="voice-station">
  <header class="station-head">
    <span class="station-icon">
      <Icon name="mic" size="lg" />
    </span>
    <div class="station-title">
      <h2>Voice Station</h2>
      <p>Hands-free AI assistant for the production floor</p>
    </div>
    <div class="controls">
      <label class="toggle-row">
        <input type="checkbox" bind:checked={ttsEnabled} />
        <span>Read replies aloud</span>
      </label>
      <label class="toggle-row">
        <input type="checkbox" bind:checked={autoLoop} />
        <span>Auto re-listen</span>
      </label>
      <select bind:value={persona} class="persona-pick" onchange={() => { sessionId = null; }}>
        <option value="cnc-operator">CNC operator</option>
        <option value="engineer">Engineering</option>
        <option value="paint-shop">Paint / finishing</option>
        <option value="logistics">Logistics</option>
        <option value="sales">Sales</option>
        <option value="">Default</option>
      </select>
    </div>
  </header>

  <!-- Status indicator -->
  <div class="status-bar" data-status={status}>
    {#if status === 'thinking'}
      <Icon name="loader" size="sm" /> Thinking…
    {:else if status === 'speaking'}
      <Icon name="volume-2" size="sm" /> Speaking…
    {:else}
      <Icon name="circle" size="sm" /> Ready
    {/if}
  </div>

  <!-- Transcript scroll area -->
  <div class="transcript" aria-live="polite" aria-atomic="false">
    {#each turns as t, i (i)}
      <div class="turn" data-role={t.role}>
        <span class="turn-role">
          {t.role === 'user' ? 'You' : 'Reclame AI'}
        </span>
        <span class="turn-ts">{t.ts}</span>
        <p class="turn-text">{t.text}</p>
      </div>
    {/each}
    {#if busy}
      <div class="turn" data-role="assistant">
        <span class="turn-role">Reclame AI</span>
        <p class="turn-text thinking-dots">…</p>
      </div>
    {/if}
  </div>

  <!-- Main action area -->
  <div class="action-area">
    <VoiceInput
      onTranscription={(t) => void handleTranscription(t)}
      vad={true}
      size="md"
      class="main-mic-btn"
    />
    {#if autoLoop && !busy}
      <p class="hint muted small">Listening automatically after each reply…</p>
    {:else}
      <p class="hint muted small">Press the mic button and speak. Recording stops on silence.</p>
    {/if}
    {#if turns.length > 0}
      <button class="btn-ghost small" onclick={clearTurns}>
        <Icon name="trash-2" size="sm" /> Clear session
      </button>
    {/if}
  </div>
</div>

<style>
  .voice-station {
    display: flex;
    flex-direction: column;
    gap: calc(var(--space-md) * var(--density, 1));
    min-height: 60vh;
  }

  .station-head {
    display: flex;
    align-items: flex-start;
    gap: calc(var(--space-md) * var(--density, 1));
    background: var(--glass-bg);
    backdrop-filter: var(--glass-blur);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-lg);
    padding: calc(var(--space-md) * var(--density, 1)) calc(var(--space-lg) * var(--density, 1));
    flex-wrap: wrap;
  }
  .station-icon {
    color: var(--brand);
    display: flex;
    align-items: center;
  }
  .station-title h2 { margin: 0; font-size: calc(1.3rem * var(--font-scale, 1)); }
  .station-title p { margin: 4px 0 0; color: var(--text-muted, #888); font-size: calc(0.85rem * var(--font-scale, 1)); }

  .controls {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: calc(var(--space-sm) * var(--density, 1));
    flex-wrap: wrap;
  }
  .toggle-row {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: calc(0.85rem * var(--font-scale, 1));
    cursor: pointer;
    white-space: nowrap;
  }
  .persona-pick {
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-full);
    color: inherit;
    padding: 5px 10px;
    font: inherit;
    font-size: calc(0.85rem * var(--font-scale, 1));
  }

  .status-bar {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 14px;
    border-radius: var(--radius-full);
    border: 1px solid var(--glass-border);
    font-size: calc(0.85rem * var(--font-scale, 1));
    align-self: flex-start;
    transition: background var(--transition-fast), border-color var(--transition-fast);
  }
  .status-bar[data-status="thinking"] {
    background: color-mix(in oklab, #ffd60a 10%, transparent);
    border-color: color-mix(in oklab, #ffd60a 40%, transparent);
  }
  .status-bar[data-status="speaking"] {
    background: color-mix(in oklab, var(--brand) 10%, transparent);
    border-color: color-mix(in oklab, var(--brand) 40%, transparent);
  }

  .transcript {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 10px;
    overflow-y: auto;
    max-height: 40vh;
    padding: 4px;
  }
  .turn {
    border-radius: var(--radius-md);
    padding: 12px 16px;
    border: 1px solid var(--glass-border);
  }
  .turn[data-role="user"]      { background: color-mix(in oklab, var(--brand) 10%, transparent); }
  .turn[data-role="assistant"] { background: color-mix(in oklab, #ffffff 4%, transparent); }
  .turn-role {
    font-weight: 600;
    font-size: calc(0.8rem * var(--font-scale, 1));
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .turn-ts {
    margin-left: 8px;
    font-size: calc(0.75rem * var(--font-scale, 1));
    color: var(--text-muted, #888);
  }
  .turn-text {
    margin: 6px 0 0;
    font-size: calc(1.05rem * var(--font-scale, 1));
    line-height: 1.55;
    white-space: pre-wrap;
  }
  .thinking-dots {
    animation: blink 1.2s steps(3, end) infinite;
  }
  @keyframes blink {
    0%,100% { opacity: 0.3; }
    50%      { opacity: 1; }
  }

  .action-area {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: calc(var(--space-lg) * var(--density, 1));
    background: var(--glass-bg);
    backdrop-filter: var(--glass-blur);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-lg);
  }
  /* Override VoiceInput button to be larger in station mode */
  :global(.main-mic-btn) {
    padding: 16px 32px !important;
    font-size: calc(1.1rem * var(--font-scale, 1)) !important;
  }
  :global(.main-mic-btn .ring) {
    inset: -6px !important;
  }

  .hint { text-align: center; }
  .btn-ghost {
    background: transparent;
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-full);
    color: inherit;
    cursor: pointer;
    font: inherit;
    padding: 5px 12px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    opacity: 0.7;
    transition: opacity var(--transition-fast);
  }
  .btn-ghost:hover { opacity: 1; }
  .muted { color: var(--text-muted, #888); }
  .small { font-size: calc(0.8rem * var(--font-scale, 1)); }
</style>
