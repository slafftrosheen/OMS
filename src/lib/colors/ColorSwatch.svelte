<script lang="ts">
  import type { ColorSpec } from './color-systems';
  import { resolveHex } from './color-systems';

  export let color: ColorSpec;

  $: hex = resolveHex(color);
</script>

<div class="sw" aria-label={`${color.system} ${color.code}`}>
  <div class="color-chip" style={`background:${hex}`}></div>
  <div class="meta">
    <div><b>{color.system}</b> {color.code}</div>
    {#if color.hex && color.system !== 'HEX'}
      <div class="muted">{color.hex}</div>
    {/if}
  </div>
</div>

<style>
.sw{ display:flex; gap:8px; align-items:center }
.meta .muted{ font-size:.85rem }
</style>
