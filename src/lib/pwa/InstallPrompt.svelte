<script lang="ts">
  import Download from 'lucide-svelte/icons/download';
  import X from 'lucide-svelte/icons/x';
/**
 * PWA Install Prompt Component
 */

import Icon from '$lib/ui/Icon.svelte';

let { onInstall, onDismiss }: { onInstall?: () => void; onDismiss?: () => void } = $props();
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
        onclick={() => onInstall?.()}
      >
        Install
      </button>
      
      <button 
        class="btn-ghost"
        onclick={() => onDismiss?.()}
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
    z-index: var(--z-tooltip);
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
    border: 1px solid var(--border, var(--border));
    border-radius: 12px;
    padding: 1rem;
    display: flex;
    align-items: center;
    gap: 1rem;
    box-shadow: 0 10px 25px color-mix(in oklab, var(--bg-0) 15%, transparent);
  }

  .prompt-icon {
    width: 48px;
    height: 48px;
    background: var(--accent-1, var(--brand));
    color: var(--bg-0);
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
    color: var(--text, var(--ink-primary));
    margin-bottom: 0.25rem;
  }

  .prompt-text p {
    margin: 0;
    font-size: 0.875rem;
    color: var(--muted, var(--ink-tertiary));
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
    background: var(--accent-1, var(--brand));
    color: var(--bg-0);
  }

  .btn-primary:hover {
    opacity: 0.9;
  }

  .btn-ghost {
    background: transparent;
    color: var(--muted, var(--ink-tertiary));
    padding: 0.5rem;
  }

  .btn-ghost:hover {
    background: var(--bg-2, var(--bg-2));
  }

  @media (max-width: 640px) {
    .prompt-text p {
      display: none;
    }
  }
</style>
