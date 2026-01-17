<script lang="ts">
  import { notifications } from './store';
  import { fly } from 'svelte/transition';
  import { X } from 'lucide-svelte';

  // Auto-subscribe to the store
  $: toasts = $notifications;
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
      <button class="close" on:click={() => notifications.remove(toast.id)}>
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
    z-index: 9999;
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
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    border-left: 4px solid var(--accent-1);
    color: var(--text);
    font-size: 14px;
    backdrop-filter: blur(8px);
  }

  .toast.success { border-left-color: var(--ok, #10B981); }
  .toast.error { border-left-color: var(--danger, #EF4444); }
  .toast.warning { border-left-color: var(--warn, #F59E0B); }
  .toast.info { border-left-color: var(--accent-1, #3B82F6); }

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
    background: rgba(255, 255, 255, 0.1);
    color: var(--text);
  }
</style>
