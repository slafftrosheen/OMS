<script lang="ts">
  import { t } from 'svelte-i18n';
  import Icon from '$lib/ui/Icon.svelte';
  import { stationIcon } from './station-icon';

  interface Props {
    station?: string | null;
    label?: string | null;
    size?: 'sm' | 'md';
    tone?: 'default' | 'highlight';
  }

  let { station = null, label = null, size = 'sm', tone = 'default' }: Props = $props();

  let code = $derived(station?.trim().toUpperCase() ?? '');
  let icon = $derived(code ? stationIcon(code) : 'circle-dashed');
  let text = $derived(label ?? (code ? $t(`stations.${code}`, { default: code }) : ''));
  let show = $derived(Boolean(code || label));
  let sizeClass = $derived(size === 'md' ? 'station-badge--md' : 'station-badge--sm');
</script>

{#if show}
  <span class={`station-badge ${sizeClass}`} data-tone={tone} data-station={code || 'generic'}>
    <Icon name={icon} size={size === 'md' ? 16 : 14} />
    <span class="station-badge__label">{text}</span>
  </span>
{/if}

<style>
  /* Machined chip: square-ish, condensed caps, station identity on a 3px leading bar.
     tone=highlight → solid station colour with white text (all ≥ 4.7:1). */
  .station-badge{ --st:var(--station-color, var(--ink-2)); display:inline-flex; align-items:center; gap:6px; padding:3px 8px 3px 6px;
    border-radius:var(--radius-sm); font-family:var(--font-display); font-size:.78rem; font-weight:600;
    letter-spacing:var(--tracking-label); text-transform:uppercase; line-height:1.2;
    background:var(--bg-1); border:1px solid var(--border); box-shadow:inset 3px 0 0 var(--st); color:var(--ink-0); }
  .station-badge--md{ font-size:.86rem; padding:5px 11px 5px 9px }
  .station-badge :global(svg){ flex:0 0 auto; color:var(--st) }
  .station-badge[data-tone='highlight']{ background:var(--st); border-color:var(--st); color:var(--on-station, #fff); box-shadow:none }
  .station-badge[data-tone='highlight'] :global(svg){ color:currentColor }
  .station-badge__label{ white-space:nowrap }
</style>
