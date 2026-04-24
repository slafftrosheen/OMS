<script lang="ts">
  import { notifications } from './store';
  import { fly } from 'svelte/transition';
  import Icon from '$lib/ui/Icon.svelte';

  let toasts = $derived($notifications);
</script>

<div class="toast-container">
  {#each toasts as toast (toast.id)}
    <div
      class="toast {toast.type}"
      in:fly={{ y: 20, duration: 300 }}
      out:fly={{ x: 100, duration: 300 }}
      role="alert"
    >
      <div class="content">
        <span class="message">{toast.message}</span>
      </div>
      <button class="close" onclick={() => notifications.remove(toast.id)}>
        <X size={16} />
      </button>
    </div>
  {/each}
</div>

<style>
  .toast-container {
    position: fixed;
    bottom: 24px;
    right: 24px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    z-index: var(--z-tooltip);
    pointer-events: none; /* Let clicks pass through container */
  }

  .toast {
    pointer-events: auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-width: 300px;
    max-width: 400px;
    padding: 16px;
    border-radius: 8px;
    background: var(--bg-2);
    box-shadow: 0 4px 12px color-mix(in oklab, var(--bg-0) 45%, transparent);
    border-left: 4px solid var(--accent-1);
    color: var(--text);
    font-size: 14px;
    backdrop-filter: blur(8px);
  }

  .toast.success { border-left-color: var(--ok, var(--ok)); }
  .toast.error { border-left-color: var(--error); }
  .toast.warning { border-left-color: var(--warn, var(--warn)); }
  .toast.info { border-left-color: var(--brand); }

  .content {
    flex: 1;
    margin-right: 12px;
  }

  .close {
    background: none;
    border: none;
    color: var(--muted);
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
    border-radius: 4px;
    transition: all 0.2s;
  }

  .close:hover {
    background: color-mix(in oklab, var(--bg-0) 1%, transparent);
    color: var(--text);
  }
</style>
