<script lang="ts">
  export let value: number | string = 0; // 0..100
  export let label = '';
  export let valueText: string | undefined = undefined;

  const clamp = (input: number) => Math.min(100, Math.max(0, input));
  const toFiniteNumber = (input: unknown) => {
    if (typeof input === 'number') return Number.isFinite(input) ? input : 0;
    if (typeof input === 'string') {
      const parsed = Number.parseFloat(input);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  };

  $: rawValue = toFiniteNumber(value);
  $: numericValue = clamp(rawValue);
  $: displayValue = Number.isInteger(numericValue) ? `${Math.trunc(numericValue)}` : numericValue.toFixed(1);
  $: computedValueText = valueText ?? `${displayValue}% complete`;
  $: accessibleLabel = label ? `${label} – ${computedValueText}` : computedValueText;
  $: visibleSummary = label ? `${label} ${displayValue}%` : `${displayValue}%`;
</script>

<div
  aria-label={accessibleLabel}
  class="rf-progress progress-bar"
  role="progressbar"
  aria-valuenow={numericValue}
  aria-valuemin="0"
  aria-valuemax="100"
  aria-valuetext={computedValueText}
>
  <div class="bar" style={`width:${numericValue}%`}></div>
</div>
<div class="muted" style="font-size:.85rem;margin-top:4px">{valueText ?? visibleSummary}</div>

<style>
.progress-bar{margin-top:4px}
</style>
