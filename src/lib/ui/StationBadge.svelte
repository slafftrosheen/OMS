<script lang="ts">
  import { t } from 'svelte-i18n';
  import { TERMS } from '$lib/order/names';
  import type { StationTag } from '$lib/order/stages';
  import Icon from '$lib/ui/Icon.svelte';
  import type { IconName } from '$lib/ui/icons';

  interface Props {
    station?: StationTag | null | undefined;
    label?: string | null;
    size?: 'sm' | 'md';
    tone?: 'default' | 'highlight';
  }

  let { station = null, label = null, size = 'sm', tone = 'default' }: Props = $props();

  // Round 2: every station gets its own RF glyph and its identity colour (--st-*). Identity only — never status.
  const icons: Record<string, IconName> = {
    CAD: 'station-cad', CNC: 'station-cnc', EDGE: 'station-edge', ASSEMBLY: 'station-assembly',
    PAINT: 'station-paint', PACKAGING: 'station-packaging', DELIVERY: 'station-delivery',
    SANDING: 'sparkles', BENDING: 'component', WELDING: 'weld', QC: 'shield-check',
    LOGISTICS: 'truck', FILM_COATING: 'layers', GLUEING: 'droplets'
  } as Record<string, IconName>;

  let icon = $derived<IconName>((station ? icons[String(station).toUpperCase()] : undefined) ?? ('circle-dashed' as IconName));
  let text = $derived(label ?? (station ? $t(TERMS.stations[station]) : ''));
  let show = $derived(Boolean(station || label));
  let sizeClass = $derived(size === 'md' ? 'station-badge--md' : 'station-badge--sm');
</script>

{#if show}
  <span class={`station-badge ${sizeClass}`} data-tone={tone} data-station={station || 'generic'}>
    <Icon name={icon} size={size === 'md' ? 16 : 14} />
    <span class="station-badge__label">{text}</span>
  </span>
{/if}

<style>
  /* Machined chip: square-ish, condensed caps, station identity on a 3px leading bar.
     tone=highlight → solid station colour with white text (all ≥ 4.7:1). */
  .station-badge{ --st:var(--ink-2); display:inline-flex; align-items:center; gap:6px; padding:3px 8px 3px 6px;
    border-radius:var(--radius-sm); font-family:var(--font-display); font-size:.78rem; font-weight:600;
    letter-spacing:var(--tracking-label); text-transform:uppercase; line-height:1.2;
    background:var(--bg-1); border:1px solid var(--border); box-shadow:inset 3px 0 0 var(--st); color:var(--ink-0); }
  .station-badge--md{ font-size:.86rem; padding:5px 11px 5px 9px }
  .station-badge :global(svg){ flex:0 0 auto; color:var(--st) }
  .station-badge[data-tone='highlight']{ background:var(--st); border-color:var(--st); color:var(--on-station, #fff); box-shadow:none }
  .station-badge[data-tone='highlight'] :global(svg){ color:currentColor }
  .station-badge[data-station='CAD']{ --st:var(--st-cad) }
  .station-badge[data-station='CNC']{ --st:var(--st-cnc) }
  .station-badge[data-station='EDGE']{ --st:var(--st-edge) }
  .station-badge[data-station='ASSEMBLY']{ --st:var(--st-assembly) }
  .station-badge[data-station='PAINT']{ --st:var(--st-paint) }
  .station-badge[data-station='PACKAGING']{ --st:var(--st-packaging) }
  .station-badge[data-station='DELIVERY'],.station-badge[data-station='LOGISTICS']{ --st:var(--st-delivery) }
  .station-badge__label{ white-space:nowrap }
</style>
