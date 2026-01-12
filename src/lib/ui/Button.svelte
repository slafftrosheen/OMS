<script lang="ts">
  export let variant: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' = 'primary';
  export let size: 'sm' | 'md' | 'lg' = 'md';
  export let disabled = false;
  export let type: 'button' | 'submit' = 'button';
  export let loading = false;
</script>

<button {type} disabled={disabled || loading}
  class="btn-root"
  data-variant={variant}
  data-size={size}>
  {#if loading}
    <span class="spinner"></span>
  {/if}
  <slot />
</button>

<style>
.btn-root {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  border-radius: var(--radius-md, 0.5rem);
  transition: all 0.2s ease;
  white-space: nowrap;
  line-height: 1.4;
}

/* Sizes */
.btn-root[data-size="sm"] {
  padding: 0.4rem 0.75rem;
  font-size: 0.8125rem;
  border-radius: var(--radius-sm, 0.375rem);
}

.btn-root[data-size="md"] {
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
}

.btn-root[data-size="lg"] {
  padding: 0.75rem 1.5rem;
  font-size: 1rem;
  border-radius: var(--radius-lg, 0.625rem);
}

/* Variants */
.btn-root[data-variant="primary"] {
  background: linear-gradient(135deg, var(--accent-1, #3b82f6), var(--accent-2, #2563eb));
  color: white;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.1);
}

.btn-root[data-variant="primary"]:hover:not(:disabled) {
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.1);
  transform: translateY(-1px);
}

.btn-root[data-variant="secondary"] {
  background: var(--bg-1);
  color: var(--text);
  border-color: var(--border);
}

.btn-root[data-variant="secondary"]:hover:not(:disabled) {
  background: var(--bg-2);
  border-color: var(--accent-1, #3b82f6);
}

.btn-root[data-variant="ghost"] {
  background: transparent;
  color: var(--text);
  border-color: transparent;
}

.btn-root[data-variant="ghost"]:hover:not(:disabled) {
  background: var(--bg-2);
}

.btn-root[data-variant="danger"] {
  background: var(--danger, #dc2626);
  color: white;
}

.btn-root[data-variant="danger"]:hover:not(:disabled) {
  background: color-mix(in oklab, var(--danger, #dc2626) 85%, black);
  box-shadow: 0 4px 12px rgba(220, 38, 38, 0.35);
  transform: translateY(-1px);
}

.btn-root[data-variant="success"] {
  background: var(--success, #16a34a);
  color: white;
}

.btn-root[data-variant="success"]:hover:not(:disabled) {
  background: color-mix(in oklab, var(--success, #16a34a) 85%, black);
  box-shadow: 0 4px 12px rgba(22, 163, 74, 0.35);
  transform: translateY(-1px);
}

/* Disabled state */
.btn-root:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none !important;
  box-shadow: none !important;
}

/* Loading spinner */
.spinner {
  width: 1em;
  height: 1em;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Focus state */
.btn-root:focus-visible {
  outline: 2px solid var(--accent-1, #3b82f6);
  outline-offset: 2px;
}
</style>
