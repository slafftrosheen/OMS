<script lang="ts">
  // Drop-in for lucide-svelte components (aliased in vite.config.js).
  import { RF_ICONS } from './data';
  let { name, size = 24, strokeWidth = 1.75, color = 'currentColor', absoluteStrokeWidth = false, class: className = '', ...rest }:
    { name: string; size?: number | string; strokeWidth?: number | string; color?: string; absoluteStrokeWidth?: boolean; class?: string; [k: string]: unknown } = $props();
  const g = $derived(RF_ICONS[name] ?? RF_ICONS['help-circle']);
  const sw = $derived(absoluteStrokeWidth ? (Number(strokeWidth) * 24) / Number(size) : strokeWidth);
</script>
<svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
  stroke-width={sw} stroke-linecap="square" stroke-linejoin="miter" stroke-miterlimit="2" class={['rf-icon', 'lucide', className].filter(Boolean).join(' ')} {...rest}>
  {#if g.s}<path d={g.s} />{/if}
  {#if g.f}<path d={g.f} fill={color} stroke="none" />{/if}
</svg>
