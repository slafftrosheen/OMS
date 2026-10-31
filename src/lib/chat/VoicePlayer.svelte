<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { locale } from 'svelte-i18n';
  import type { Attachment } from './types';
  import { voiceCopy } from './voice-copy';
  import { durationLabel, voiceExpired, voicePlaybackURL } from './voice';
  let { attachment, previewURL, durationMs = 0, contextKey = '', label }: {
    attachment?: Attachment; previewURL?: string; durationMs?: number; contextKey?: string; label?: string;
  } = $props();
  let c = $derived(voiceCopy($locale));
  let now = $state(Date.now());
  let failed = $state(false);
  let audio = $state<HTMLAudioElement>();
  let expired = $derived(!!attachment && voiceExpired(attachment, now));
  let source = $derived(expired ? null : previewURL ?? (attachment ? voicePlaybackURL(attachment) : null));
  let duration = $derived(attachment?.duration ? attachment.duration * 1000 : durationMs);
  let identity = $derived(`${contextKey}:${attachment?.id ?? previewURL ?? ''}`);
  let expiry = $derived(attachment?.expiresAt && Number.isFinite(Date.parse(attachment.expiresAt))
    ? new Intl.DateTimeFormat($locale || 'en', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(attachment.expiresAt)) : '');

  $effect.pre(() => {
    const key = identity;
    untrack(() => { void key; failed = false; now = Date.now(); });
  });
  $effect(() => {
    const node = audio, key = identity, currentSource = source;
    if (!currentSource) node?.pause();
    return () => { void key; if (node) { node.pause(); node.removeAttribute('src'); node.load(); } };
  });
  onMount(() => {
    const timer = setInterval(() => { now = Date.now(); }, 1000);
    return () => { clearInterval(timer); audio?.pause(); };
  });
  function retry() { failed = false; audio?.load(); }
</script>

<div class="voice-player" aria-label={label || c.playback}>
  {#if expired}
    <p class="voice-expired">{c.expired}</p><p class="voice-meta">{c.expireDescription}</p>
  {:else if source}
    {#key identity}
      <!-- Voice messages have no text transcript; controls expose pause, seek and volume. -->
      <!-- svelte-ignore a11y_media_has_caption -->
      <audio bind:this={audio} controls preload="none" src={source} aria-label={label || c.playback}
        onerror={() => { failed = true; now = Date.now(); }}></audio>
    {/key}
    {#if failed}<p class="voice-error" role="alert">{c.unavailable}</p><button type="button" onclick={retry}>{c.retry}</button>{/if}
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
  button { justify-self: start; min-height: var(--control-sm); padding: var(--space-xs) var(--space-md); background: var(--bg-2); color: var(--ink-primary); border: 1px solid var(--border); border-radius: var(--radius-sm); cursor: pointer; font: inherit; font-size: var(--text-sm); }
  button:focus-visible, audio:focus-visible { outline: 2px solid var(--focus); outline-offset: var(--space-xxs); }
</style>
