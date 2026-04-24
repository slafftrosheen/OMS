<script lang="ts">
  type Tone = 'brand' | 'ok' | 'warn' | 'error';

  interface Props {
    value?: number | string;
    label?: string;
    valueText?: string;
    tone?: Tone;
    showLabel?: boolean;
    size?: 'sm' | 'md' | 'lg';
  }

  let { value = 0, label = '', valueText, tone = 'brand', showLabel = true, size = 'md' }: Props = $props();

  function clamp(n: number) { return Math.min(100, Math.max(0, n)); }
  function toNum(v: unknown): number {
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    if (typeof v === 'string') { const p = parseFloat(v); return isFinite(p) ? p : 0; }
    return 0;
  }

  const num = $derived(clamp(toNum(value)));
  const display = $derived(Number.isInteger(num) ? `${Math.trunc(num)}` : num.toFixed(1));
  const computedValueText = $derived(valueText ?? `${display}% complete`);
  const ariaLabel = $derived(label ? `${label} – ${computedValueText}` : computedValueText);
  const visibleSummary = $derived(label ? `${label} ${display}%` : `${display}%`);
</script>

<div class="rf-progress" data-size={size}>
  {#if showLabel && (label || valueText)}
    <div class="rf-progress__header">
      {#if label}<span class="rf-progress__label">{label}</span>{/if}
      <span class="rf-progress__value">{valueText ?? `${display}%`}</span>
    </div>
  {/if}

  <div
    class="rf-progress__track"
    role="progressbar"
    aria-valuenow={num}
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuetext={computedValueText}
    aria-label={ariaLabel}
  >
    <div
      class="rf-progress__fill"
      data-tone={tone}
      style="width:{num}%"
    ></div>
  </div>
</div>

<style>
  .rf-progress {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    width: 100%;
  }

  .rf-progress__header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .rf-progress__label {
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--ink-secondary);
    letter-spacing: var(--tracking-tight);
  }
  .rf-progress__value {
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--ink-tertiary);
    font-variant-numeric: tabular-nums;
  }

  .rf-progress__track {
    width: 100%;
    background: var(--bg-2);
    border-radius: var(--radius-full);
    overflow: hidden;
  }
  .rf-progress[data-size="sm"] .rf-progress__track { height: 4px; }
  .rf-progress[data-size="md"] .rf-progress__track { height: 6px; }
  .rf-progress[data-size="lg"] .rf-progress__track { height: 10px; }

  .rf-progress__fill {
    height: 100%;
    border-radius: var(--radius-full);
    transition: width var(--motion-lg) var(--ease-standard);
  }
  .rf-progress__fill[data-tone="brand"] { background: var(--brand); }
  .rf-progress__fill[data-tone="ok"]    { background: var(--ok); }
  .rf-progress__fill[data-tone="warn"]  { background: var(--warn); }
  .rf-progress__fill[data-tone="error"] { background: var(--error); }
</style>
