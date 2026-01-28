<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { AlertTriangle, RefreshCw, Home } from 'lucide-svelte';
  import { base } from '$app/paths';
  
  export let componentName = 'Component';
  
  let hasError = false;
  let errorMessage = '';
  let errorStack = '';
  
  function handleError(event: ErrorEvent) {
    console.error(`Error in ${componentName}:`, event.error);
    hasError = true;
    errorMessage = event.error?.message || 'An unexpected error occurred';
    errorStack = event.error?.stack || '';
    event.preventDefault();
  }
  
  function handlePromiseRejection(event: PromiseRejectionEvent) {
    console.error(`Unhandled promise rejection in ${componentName}:`, event.reason);
    hasError = true;
    errorMessage = event.reason?.message || 'An unexpected error occurred';
    errorStack = event.reason?.stack || '';
    event.preventDefault();
  }
  
  function reset() {
    hasError = false;
    errorMessage = '';
    errorStack = '';
  }
  
  function reload() {
    window.location.reload();
  }
  
  onMount(() => {
    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handlePromiseRejection);
  });
  
  onDestroy(() => {
    window.removeEventListener('error', handleError);
    window.removeEventListener('unhandledrejection', handlePromiseRejection);
  });
</script>

{#if hasError}
  <div class="error-boundary">
    <div class="error-boundary-content">
      <AlertTriangle size={64} class="error-icon" />
      <h1>Something went wrong</h1>
      <p class="error-message">{errorMessage}</p>
      
      <details class="error-details">
        <summary>Technical Details</summary>
        <pre class="error-stack">{errorStack}</pre>
      </details>
      
      <div class="error-actions">
        <button class="btn btn-primary" on:click={reload}>
          <RefreshCw size={18} />
          Reload Page
        </button>
        <a href="{base}/" class="btn btn-secondary">
          <Home size={18} />
          Go Home
        </a>
        <button class="btn btn-ghost" on:click={reset}>
          Dismiss
        </button>
      </div>
      
      <p class="error-help">
        If this problem persists, please contact support with the error details above.
      </p>
    </div>
  </div>
{:else}
  <slot />
{/if}

<style>
  .error-boundary {
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: var(--bg-0);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-lg);
  }

  .error-boundary-content {
    max-width: 600px;
    width: 100%;
    text-align: center;
  }

  .error-icon {
    color: var(--danger);
    margin-bottom: var(--space-lg);
  }

  h1 {
    font-size: var(--font-size-3xl);
    font-weight: var(--font-weight-bold);
    color: var(--text);
    margin-bottom: var(--space-md);
  }

  .error-message {
    font-size: var(--font-size-lg);
    color: var(--text-1);
    margin-bottom: var(--space-xl);
  }

  .error-details {
    text-align: left;
    margin-bottom: var(--space-xl);
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: var(--space-md);
  }

  .error-details summary {
    cursor: pointer;
    font-weight: var(--font-weight-semibold);
    color: var(--text-1);
    padding: var(--space-sm);
  }

  .error-details summary:hover {
    color: var(--primary);
  }

  .error-stack {
    margin-top: var(--space-md);
    padding: var(--space-md);
    background: var(--bg-1);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-xs);
    font-family: 'Courier New', monospace;
    color: var(--text-2);
    overflow-x: auto;
    max-height: 200px;
  }

  .error-actions {
    display: flex;
    gap: var(--space-sm);
    justify-content: center;
    flex-wrap: wrap;
    margin-bottom: var(--space-lg);
  }

  .btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-sm) var(--space-md);
    border-radius: var(--radius-md);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    cursor: pointer;
    transition: all var(--transition-fast);
    text-decoration: none;
    border: 1px solid transparent;
  }

  .btn-primary {
    background: var(--primary);
    color: white;
    border-color: var(--primary);
  }

  .btn-primary:hover {
    background: var(--primary-hover);
    border-color: var(--primary-hover);
  }

  .btn-secondary {
    background: var(--bg-2);
    color: var(--text);
    border-color: var(--border);
  }

  .btn-secondary:hover {
    background: var(--bg-3);
  }

  .btn-ghost {
    background: transparent;
    color: var(--text-muted);
  }

  .btn-ghost:hover {
    background: var(--bg-2);
    color: var(--text);
  }

  .error-help {
    font-size: var(--font-size-sm);
    color: var(--text-muted);
  }
</style>