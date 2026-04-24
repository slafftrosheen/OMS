<script lang="ts">
  /**
   * Unified icon wrapper around lucide-svelte.
   *
   * Usage:
   *   <Icon name="bell" />
   *   <Icon name="user" size="lg" />
   *   <Icon name="check" size={20} stroke={2} label="Completed" />
   *
   * Props:
   *   - name:   IconName    — required, enumerated in $lib/ui/icons.ts
   *   - size:   keyword | px — 'xs' (12) | 'sm' (16) | 'md' (18, default) | 'lg' (22) | 'xl' (28) | number
   *   - stroke: number      — stroke width (default 1.5, Apple SF-like)
   *   - label:  string      — accessibility label. If omitted, icon is aria-hidden.
   *   - class:  string      — passthrough to the SVG
   *   - color:  string      — passthrough to Lucide `color` prop; defaults to currentColor
   */
  import { icons, resolveIconSize, resolveIconName, type IconName, type IconSize } from './icons';

  type Props = {
    name: IconName;
    size?: IconSize;
    stroke?: number;
    label?: string;
    class?: string;
    color?: string;
  };

  let {
    name,
    size = 'md',
    stroke = 1.5,
    label,
    class: className = '',
    color
  }: Props = $props();

  const Component = $derived(icons[resolveIconName(name)]);
  const resolvedSize = $derived(resolveIconSize(size));
  const ariaProps = $derived(
    label
      ? { 'aria-label': label, role: 'img' as const }
      : { 'aria-hidden': 'true' as const, focusable: 'false' as const }
  );
</script>

{#if Component}
  <Component
    size={resolvedSize}
    strokeWidth={stroke}
    color={color ?? 'currentColor'}
    class={['rf-icon', className].filter(Boolean).join(' ')}
    {...ariaProps}
  />
{/if}

<style>
  :global(.rf-icon) {
    flex-shrink: 0;
    vertical-align: middle;
  }
</style>
