<script lang="ts">
/**
 * PWA Update Available Prompt Component
 */

import { RefreshCw, X } from 'lucide-svelte';

let { onupdate, ondismiss }: { onupdate?: () => void; ondismiss?: () => void } = $props();
</script>

<div class="update-prompt">
  <div class="prompt-content">
    <div class="prompt-icon">
      <RefreshCw size={20} />
    </div>
    
    <div class="prompt-text">
      <strong>Update Available</strong>
      <p>A new version is available. Refresh to update.</p>
    </div>

    <div class="prompt-actions">
      <button 
        class="btn-primary"
        on:click={() => onupdate?.()}
      >
        <RefreshCw size={16} />
        Refresh
      </button>
      
      <button 
        class="btn-ghost"
        on:click={() => ondismiss?.()}
        aria-label="Dismiss"
      >
        <X size={20} />
      </button>
    </div>
  </div>
</div>

<style>
  .update-prompt {
    position: fixed;
    top: 1rem;
    right: 1rem;
    z-index: 9999;
    max-width: 400px;
    animation: slideDown 0.3s ease-out;
  }

  @keyframes slideDown {
    from {
      transform: translateY(-100%);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  .prompt-content {
    background: var(--bg-0, white);
    border: 1px solid var(--border, #e5e7eb);
    border-radius: 12px;
    padding: 1rem;
    display: flex;
    align-items: center;
    gap: 1rem;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
  }

  .prompt-icon {
    width: 40px;
    height: 40px;
    background: var(--ok, #10b981);
    color: white;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .prompt-text {
    flex: 1;
    min-width: 0;
  }

  .prompt-text strong {
    display: block;
    font-size: 0.9375rem;
    color: var(--text, #111827);
    margin-bottom: 0.25rem;
  }

  .prompt-text p {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--muted, #6b7280);
  }

  .prompt-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  button {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .btn-primary {
    background: var(--ok, #10b981);
    color: white;
  }

  .btn-primary:hover {
    opacity: 0.9;
  }

  .btn-ghost {
    background: transparent;
    color: var(--muted, #6b7280);
    padding: 0.5rem;
  }

  .btn-ghost:hover {
    background: var(--bg-2, #f3f4f6);
  }
</style>