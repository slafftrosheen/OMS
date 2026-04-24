<script lang="ts">
  import type { Snippet } from 'svelte';

  type Tone = 'neutral' | 'info' | 'success' | 'warn' | 'danger' | 'primary' | 'brand';
  type Size = 'sm' | 'md' | 'lg';
  type Variant = 'soft' | 'solid' | 'outline';

  let {
    tone = 'neutral',
    size = 'md',
    variant = 'soft',
    label = '',
    children
  }: {
    tone?: Tone;
    size?: Size;
    variant?: Variant;
    label?: string;
    children?: Snippet;
  } = $props();
</script>

<span
  class="rf-badge"
  data-tone={tone === 'primary' ? 'brand' : tone}
  data-size={size}
  data-variant={variant}
  role="status"
  aria-label={label || tone}
>
  {#if children}{@render children()}{/if}
</span>

<style>
  .rf-badge {
    --c: var(--ink-2);
    --bg: var(--bg-2);
    --border: transparent;

    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    padding: calc(var(--space-xxs) + 2px) var(--space-sm);
    border-radius: var(--radius-full);
    font-size: var(--text-xs);
    font-weight: 600;
    letter-spacing: var(--tracking-wide);
    line-height: 1;
    white-space: nowrap;
    color: var(--c);
    background: var(--bg);
    border: 1px solid var(--border);
    transition: background var(--motion-sm) var(--ease-standard);
  }

  .rf-badge[data-size="sm"] { font-size: calc(var(--text-xs) - 1px); padding: 2px var(--space-xs); }
  .rf-badge[data-size="lg"] { font-size: var(--text-sm); padding: var(--space-xs) var(--space-md); }

  .rf-badge :global(svg) { width: 0.9em; height: 0.9em; }

  /* Soft (default) — low-saturation tint on theme-aware bg */
  .rf-badge[data-tone="neutral"][data-variant="soft"]  { --c: var(--ink-secondary); --bg: var(--bg-2); }
  .rf-badge[data-tone="brand"][data-variant="soft"]    { --c: var(--brand);         --bg: var(--brand-soft); }
  .rf-badge[data-tone="info"][data-variant="soft"]     { --c: var(--link);          --bg: color-mix(in oklab, var(--link) 14%, var(--bg-1)); }
  .rf-badge[data-tone="success"][data-variant="soft"]  { --c: var(--ok);            --bg: var(--ok-soft); }
  .rf-badge[data-tone="warn"][data-variant="soft"]     { --c: var(--warn);          --bg: var(--warn-soft); }
  .rf-badge[data-tone="danger"][data-variant="soft"]   { --c: var(--error);         --bg: var(--error-soft); }

  /* Solid — filled badge, ink color chosen for contrast */
  .rf-badge[data-variant="solid"] { --c: var(--bg-0); }
  .rf-badge[data-tone="brand"][data-variant="solid"]   { --bg: var(--brand); }
  .rf-badge[data-tone="info"][data-variant="solid"]    { --bg: var(--link); }
  .rf-badge[data-tone="success"][data-variant="solid"] { --bg: var(--ok); }
  .rf-badge[data-tone="warn"][data-variant="solid"]    { --bg: var(--warn); --c: var(--bg-0); }
  .rf-badge[data-tone="danger"][data-variant="solid"]  { --bg: var(--error); }
  .rf-badge[data-tone="neutral"][data-variant="solid"] { --bg: var(--ink-secondary); --c: var(--bg-0); }

  /* Outline — ring only */
  .rf-badge[data-variant="outline"] { --bg: transparent; }
  .rf-badge[data-tone="brand"][data-variant="outline"]   { --c: var(--brand);   --border: color-mix(in oklab, var(--brand) 45%, transparent); }
  .rf-badge[data-tone="info"][data-variant="outline"]    { --c: var(--link);    --border: color-mix(in oklab, var(--link) 45%, transparent); }
  .rf-badge[data-tone="success"][data-variant="outline"] { --c: var(--ok);      --border: color-mix(in oklab, var(--ok) 45%, transparent); }
  .rf-badge[data-tone="warn"][data-variant="outline"]    { --c: var(--warn);    --border: color-mix(in oklab, var(--warn) 45%, transparent); }
  .rf-badge[data-tone="danger"][data-variant="outline"]  { --c: var(--error);   --border: color-mix(in oklab, var(--error) 45%, transparent); }
  .rf-badge[data-tone="neutral"][data-variant="outline"] { --c: var(--ink-secondary); --border: var(--border-strong); }
</style>
