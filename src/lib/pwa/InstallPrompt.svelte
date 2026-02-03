<script lang="ts">
/**
 * PWA Install Prompt Component
 */

import { Download, X } from 'lucide-svelte';

let { oninstall, ondismiss }: { oninstall?: () => void; ondismiss?: () => void } = $props();
</script>

<div class="install-prompt">
  <div class="prompt-content">
    <div class="prompt-icon">
      <Download size={24} />
    </div>
    
    <div class="prompt-text">
      <strong>Install OMS App</strong>
      <p>Install this app on your device for quick access and offline support</p>
    </div>

    <div class="prompt-actions">
      <button 
        class="btn-primary"
        on:click={() => oninstall?.()}
      >
        Install
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
  .install-prompt {
    position: fixed;
    bottom: 1rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 9999;
    max-width: 500px;
    width: calc(100% - 2rem);
    animation: slideUp 0.3s ease-out;
  }

  @keyframes slideUp {
    from {
      transform: translateX(-50%) translateY(100%);
      opacity: 0;
    }
    to {
      transform: translateX(-50%) translateY(0);
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
    width: 48px;
    height: 48px;
    background: var(--accent-1, #3b82f6);
    color: white;
    border-radius: 12px;
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
    font-size: 1rem;
    color: var(--text, #111827);
    margin-bottom: 0.25rem;
  }

  .prompt-text p {
    margin: 0;
    font-size: 0.875rem;
    color: var(--muted, #6b7280);
    line-height: 1.4;
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
    background: var(--accent-1, #3b82f6);
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

  @media (max-width: 640px) {
    .prompt-text p {
      display: none;
    }
  }
</style>