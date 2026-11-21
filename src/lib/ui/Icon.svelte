<script lang="ts">
  /**
   * Reclame Fabriek icon — custom 24px set (square caps, chamfered corners, "lit" pixels).
   * API unchanged: <Icon name="bell" size="lg" stroke={1.75} label="Alerts" />
   */
  import { iconGlyph, resolveIconSize, type IconName, type IconSize } from './icons';
  type Props = { name: IconName; size?: IconSize; stroke?: number; label?: string; class?: string; color?: string };
  let { name, size = 'md', stroke = 1.75, label, class: className = '', color }: Props = $props();
  const g = $derived(iconGlyph(name));
  const px = $derived(resolveIconSize(size));
</script>

<svg
  xmlns="http://www.w3.org/2000/svg" width={px} height={px} viewBox="0 0 24 24"
  fill="none" stroke={color ?? 'currentColor'} stroke-width={stroke}
  stroke-linecap="square" stroke-linejoin="miter" stroke-miterlimit="2"
  class={['rf-icon', className].filter(Boolean).join(' ')}
  {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': 'true', focusable: 'false' })}
>
  {#if g.s}<path d={g.s} />{/if}
  {#if g.f}<path d={g.f} fill={color ?? 'currentColor'} stroke="none" />{/if}
</svg>

<style>
  :global(.rf-icon) { flex-shrink: 0; vertical-align: middle; }
</style>
