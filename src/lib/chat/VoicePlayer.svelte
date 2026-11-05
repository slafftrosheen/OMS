<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { locale } from 'svelte-i18n';
  import type { Attachment } from './types';
  import { voiceCopy } from './voice-copy';
  import { durationLabel, voiceExpired, voicePlaybackURL } from './voice';
  import { claimVoicePlayback, releaseVoicePlayback } from './voice-playback';
  import { conversationCopy } from './conversation-copy';
  let { attachment, previewURL, durationMs = 0, contextKey = '', label }: {
    attachment?: Attachment; previewURL?: string; durationMs?: number; contextKey?: string; label?: string;
  } = $props();
  let c = $derived(voiceCopy($locale));
  let conversation = $derived(conversationCopy($locale));
  let now = $state(Date.now());
  let failed = $state(false);
  let audio = $state<HTMLAudioElement>();
  let rate = $state(1);
  const speedId = $props.id();
  let expired = $derived(!!attachment && voiceExpired(attachment, now));
  let source = $derived(expired ? null : previewURL ?? (attachment ? voicePlaybackURL(attachment) : null));
  let duration = $derived(attachment?.duration ? attachment.duration * 1000 : durationMs);
  let identity = $derived(`${contextKey}:${attachment?.id ?? previewURL ?? ''}`);
  let expiry = $derived(attachment?.expiresAt && Number.isFinite(Date.parse(attachment.expiresAt))
    ? new Intl.DateTimeFormat($locale || 'en', { timeZone: 'Europe/Riga', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }).format(new Date(attachment.expiresAt)) : '');

  $effect.pre(() => {
    const key = identity;
    untrack(() => { void key; failed = false; now = Date.now(); rate = 1; });
  });
  $effect(() => {
    const node = audio, key = identity, currentSource = source;
    if (!currentSource) node?.pause();
    return () => { void key; if (node) { releaseVoicePlayback(node); node.pause(); node.removeAttribute('src'); node.load(); } };
  });
  onMount(() => {
    const timer = setInterval(() => { now = Date.now(); }, 1000);
    return () => { clearInterval(timer); audio?.pause(); };
  });
  function retry() { failed = false; audio?.load(); }
  function play() {
    if (!audio) return;
    if (attachment && voiceExpired(attachment)) { now = Date.now(); audio.pause(); return; }
    claimVoicePlayback(audio); audio.playbackRate = rate;
  }
  function changeRate(value: string) {
    rate = [1, 1.25, 1.5, 2].includes(Number(value)) ? Number(value) : 1;
    if (audio) audio.playbackRate = rate;
  }
</script>

<div class="voice-player" aria-label={label || c.playback}>
  {#if expired}
    <p class="voice-expired">{c.expired}</p><p class="voice-meta">{c.expireDescription}</p>
  {:else if source}
    {#key identity}
      <!-- Voice messages have no text transcript; controls expose pause, seek and volume. -->
      <!-- svelte-ignore a11y_media_has_caption -->
      <audio bind:this={audio} controls preload="none" src={source} aria-label={label || c.playback}
        onplay={play} onpause={event => releaseVoicePlayback(event.currentTarget)} onended={event => releaseVoicePlayback(event.currentTarget)}
        onerror={() => { failed = true; now = Date.now(); }}></audio>
    {/key}
    {#if failed}<p class="voice-error" role="alert">{c.unavailable}</p><button type="button" onclick={retry}>{c.retry}</button>{/if}
    <div class="voice-speed"><label for={speedId}>{conversation.speed}</label><select id={speedId} value={String(rate)} onchange={event => changeRate(event.currentTarget.value)}>
      <option value="1">1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2×</option>
    </select></div>
    <p class="voice-meta">{#if duration > 0}{c.duration}: {durationLabel(duration)}{/if}{#if expiry}<span>{c.expires}: <time datetime={attachment?.expiresAt ?? undefined}>{expiry}</time></span>{/if}</p>
  {:else}<p class="voice-expired">{c.unavailable}</p>{/if}
</div>

<style>
  .voice-player { display: grid; gap: var(--space-xs); min-width: 0; max-width: 100%; padding: var(--space-sm); border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-1); color: var(--ink-primary); overflow-wrap: anywhere; }
  audio { display: block; width: 100%; min-width: 0; max-width: 100%; height: calc(var(--control-size) + var(--space-sm)); }
  p { margin: 0; }
  .voice-meta { display: flex; flex-wrap: wrap; gap: var(--space-xs) var(--space-md); font-size: var(--text-xs); color: var(--ink-tertiary); line-height: var(--leading-normal); }
  .voice-expired { font-size: var(--text-sm); color: var(--ink-secondary); font-weight: 600; }
  .voice-error { color: var(--ink-primary); background: var(--error-soft); padding: var(--space-sm); border-radius: var(--radius-sm); font-size: var(--text-sm); }
  .voice-speed { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: var(--space-sm); font-size: var(--text-xs); color: var(--ink-secondary); }
  .voice-speed select { min-height: var(--control-sm); padding: var(--space-xs) var(--space-sm); border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--ink-primary); background: var(--bg-1); font: inherit; }
  button { justify-self: start; min-height: var(--control-sm); padding: var(--space-xs) var(--space-md); background: var(--bg-2); color: var(--ink-primary); border: 1px solid var(--border); border-radius: var(--radius-sm); cursor: pointer; font: inherit; font-size: var(--text-sm); }
  button:focus-visible, audio:focus-visible, select:focus-visible { outline: 2px solid var(--focus); outline-offset: var(--space-xxs); }
</style>
