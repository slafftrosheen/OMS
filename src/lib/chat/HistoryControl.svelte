<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import { locale } from 'svelte-i18n';
  import { conversationCopy } from './conversation-copy';
  import type { ConversationHistory } from './history';
  let { state, onRetry, onOlder, scroller, contextKey = '', hasMessages = false }: {
    state?: ConversationHistory; onRetry: () => Promise<void>; onOlder: () => Promise<void>;
    scroller?: HTMLElement | null; contextKey?: string; hasMessages?: boolean;
  } = $props();
  let c = $derived(conversationCopy($locale));
  let stopTracking: (() => void) | undefined;
  onDestroy(() => stopTracking?.());

  function visibleAnchor(node: HTMLElement) {
    const viewport = node.getBoundingClientRect();
    const message = Array.from(node.querySelectorAll<HTMLElement>('[data-chat-message-id]')).find(element => {
      const box = element.getBoundingClientRect();
      return box.bottom > viewport.top && box.top < viewport.bottom;
    });
    return message ? { message, offset: message.getBoundingClientRect().top - viewport.top } : undefined;
  }

  async function older() {
    const node = scroller, key = contextKey;
    stopTracking?.();
    let anchor = node ? visibleAnchor(node) : undefined;
    // Follow the reader's position while the request is pending. A message
    // anchor excludes new content appended below and respects native anchoring.
    const rememberPosition = () => { if (node) anchor = visibleAnchor(node) ?? anchor; };
    node?.addEventListener('scroll', rememberPosition, { passive: true });
    const stop = () => node?.removeEventListener('scroll', rememberPosition);
    stopTracking = stop;
    try { await onOlder(); } finally {
      stop();
      if (stopTracking === stop) stopTracking = undefined;
    }
    await tick();
    if (node?.isConnected && key === contextKey && node === scroller && anchor?.message.isConnected && node.contains(anchor.message)) {
      const offset = anchor.message.getBoundingClientRect().top - node.getBoundingClientRect().top;
      node.scrollTop += offset - anchor.offset;
    }
  }
</script>

<div class="history-control" aria-live="polite" aria-busy={state?.loading || state?.loadingOlder}>
  {#if state?.failed}
    <p class="history-error">{c.loadFailed}</p>
    <button type="button" disabled={state.loading} onclick={() => void onRetry()}>{state.loading ? c.loading : c.retry}</button>
  {:else if state?.loading && !state.initialized}
    <p>{c.loading}</p>
  {/if}
  {#if state?.olderFailed}<p class="history-error">{c.olderFailed}</p>{/if}
  {#if state?.hasMore}
    <button type="button" disabled={state.loadingOlder || state.loading} onclick={older}>{state.loadingOlder ? c.loadingOlder : state.olderFailed ? c.retry : c.loadOlder}</button>
  {:else if state?.initialized && hasMessages && !state.failed}
    <p class="history-beginning">{c.beginning}</p>
  {/if}
</div>

<style>
  .history-control { display: grid; justify-items: center; gap: var(--space-sm); min-width: 0; text-align: center; color: var(--ink-secondary); font-size: var(--text-sm); line-height: var(--leading-normal); }
  .history-control:not(:empty) { padding: var(--space-sm); }
  p { margin: 0; overflow-wrap: anywhere; }
  button { min-height: var(--control-sm); max-width: 100%; padding: var(--space-xs) var(--space-md); background: var(--bg-1); color: var(--ink-primary); border: 1px solid var(--border); border-radius: var(--radius-sm); font: inherit; cursor: pointer; white-space: normal; }
  button:disabled { opacity: 1; color: var(--ink-secondary); background: var(--bg-2); cursor: wait; }
  button:focus-visible { outline: 2px solid var(--focus); outline-offset: var(--space-xxs); }
  .history-error { color: var(--ink-primary); background: var(--error-soft); padding: var(--space-sm); border-radius: var(--radius-sm); }
  .history-beginning { font-size: var(--text-xs); }
</style>
