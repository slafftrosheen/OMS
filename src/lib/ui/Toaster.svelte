<script lang="ts">
  import { toasts, type Toast } from '$lib/stores/toast';
  import { fly } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import Icon from './Icon.svelte';
  import type { IconName } from './icons';

  let list: Toast[] = $derived($toasts);

  const kindIcon: Record<string, IconName> = {
    info:    'info',
    success: 'check-circle',
    warning: 'alert-triangle',
    error:   'x-circle',
  };

  const kindTone: Record<string, string> = {
    info:    'var(--link)',
    success: 'var(--ok)',
    warning: 'var(--warn)',
    error:   'var(--error)',
  };
</script>

<div
  id="rf-toasts"
  class="rf-toaster"
  role="region"
  aria-label="Notifications"
  aria-live="polite"
  aria-atomic="false"
>
  {#each list as t (t.id)}
    <div
      class="rf-toast"
      data-kind={t.kind}
      in:fly={{ y: 24, duration: 280, opacity: 0 }}
      out:fly={{ y: 16, duration: 200, opacity: 0 }}
      animate:flip={{ duration: 250 }}
      role="alert"
    >
      <span
        class="rf-toast__bar"
        style="background:{kindTone[t.kind || 'info']}"
        aria-hidden="true"
      ></span>

      <span class="rf-toast__icon" style="color:{kindTone[t.kind || 'info']}" aria-hidden="true">
        <Icon name={kindIcon[t.kind || 'info']} size="md" />
      </span>

      <div class="rf-toast__content">
        {#if t.title}
          <div class="rf-toast__title">{t.title}</div>
        {/if}
        <div class="rf-toast__msg">{t.message}</div>
      </div>

      <button
        class="rf-toast__close"
        type="button"
        aria-label="Dismiss notification"
        onclick={() => toasts.dismiss(t.id)}
      >
        <Icon name="x" size="sm" />
      </button>
    </div>
  {/each}
</div>

<style>
  .rf-toaster {
    position: fixed;
    right: var(--space-lg);
    bottom: var(--space-lg);
    display: grid;
    gap: var(--space-sm);
    z-index: var(--z-toast);
    width: min(calc(360px * var(--font-scale, 1)), calc(100vw - 2 * var(--space-lg)));
    pointer-events: none;
  }

  .rf-toast {
    display: flex;
    align-items: flex-start;
    gap: var(--space-sm);
    padding: var(--space-md);
    background: var(--glass-bg-strong);
    backdrop-filter: var(--glass-material-thick);
    -webkit-backdrop-filter: var(--glass-material-thick);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--glass-shadow-lg), var(--glass-border-highlight, inset 0 1px 0 color-mix(in oklab, white 8%, transparent));
    position: relative;
    overflow: hidden;
    pointer-events: all;
  }

  .rf-toast__bar {
    position: absolute;
    top: 0;
    left: 0;
    width: 3px;
    bottom: 0;
    border-radius: var(--radius-xs) 0 0 var(--radius-xs);
  }

  .rf-toast__icon {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    margin-top: 1px;
  }

  .rf-toast__content {
    flex: 1;
    min-width: 0;
  }

  .rf-toast__title {
    font-weight: 700;
    font-size: var(--text-sm);
    color: var(--ink-primary);
    margin-bottom: var(--space-xxs);
  }

  .rf-toast__msg {
    font-size: var(--text-sm);
    color: var(--ink-secondary);
    line-height: var(--leading-snug);
  }

  .rf-toast__close {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: var(--radius-full);
    border: none;
    background: transparent;
    color: var(--ink-tertiary);
    cursor: pointer;
    transition: background var(--motion-sm) var(--ease-standard), color var(--motion-sm) var(--ease-standard);
  }
  .rf-toast__close:hover {
    background: var(--bg-2);
    color: var(--ink-primary);
  }
  .rf-toast__close:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
</style>
