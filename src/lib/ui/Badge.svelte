<script lang="ts">
  export let tone: 'neutral'|'info'|'success'|'warn'|'danger'|'primary' = 'neutral';
  export let label = '';
  export let size: 'sm' | 'md' | 'lg' = 'md';
</script>

<span class="badge" data-tone={tone} data-size={size} role="status" aria-label={label || tone}><slot /></span>

<style>
.badge {
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-full, 9999px);
  font-size: 0.75rem;
  font-weight: 600;
  border: 1px solid var(--border);
  background: var(--bg-2);
  color: var(--text);
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  line-height: 1;
  white-space: nowrap;
  transition: all 0.15s ease;
}

.badge[data-size="sm"] {
  padding: 2px var(--space-xs);
  font-size: 0.6875rem;
}

.badge[data-size="lg"] {
  padding: var(--space-sm) var(--space-md);
  font-size: 0.8125rem;
}

.badge :global(svg) {
  width: 0.875em;
  height: 0.875em;
  flex-shrink: 0;
}

.badge[data-tone="primary"] {
  background: color-mix(in oklab, var(--accent-1, #3b82f6) 12%, transparent);
  color: var(--accent-1, #3b82f6);
  border-color: color-mix(in oklab, var(--accent-1, #3b82f6) 30%, transparent);
}

.badge[data-tone="info"] {
  background: color-mix(in oklab, var(--accent-2, #0ea5e9) 12%, transparent);
  color: var(--accent-2, #0ea5e9);
  border-color: color-mix(in oklab, var(--accent-2, #0ea5e9) 30%, transparent);
}

.badge[data-tone="success"] {
  background: color-mix(in oklab, var(--ok, var(--success, #16a34a)) 12%, transparent);
  color: var(--ok, var(--success, #16a34a));
  border-color: color-mix(in oklab, var(--ok, var(--success, #16a34a)) 30%, transparent);
}

.badge[data-tone="warn"] {
  background: color-mix(in oklab, var(--warn, #f59e0b) 12%, transparent);
  color: color-mix(in oklab, var(--warn, #f59e0b) 80%, black);
  border-color: color-mix(in oklab, var(--warn, #f59e0b) 30%, transparent);
}

.badge[data-tone="danger"] {
  background: color-mix(in oklab, var(--danger, #dc2626) 12%, transparent);
  color: var(--danger, #dc2626);
  border-color: color-mix(in oklab, var(--danger, #dc2626) 30%, transparent);
}
</style>
