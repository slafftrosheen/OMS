<script lang="ts">
  import { t } from 'svelte-i18n';
  import { TERMS } from '$lib/order/names';
  import type { StationTag } from '$lib/order/stages';
  import Icon from '$lib/ui/Icon.svelte';

  interface Props {
    station?: StationTag | null | undefined;
    label?: string | null;
    size?: 'sm' | 'md';
    tone?: 'default' | 'highlight';
  }

  let { station = null, label = null, size = 'sm', tone = 'default' }: Props = $props();

  const icons: Record<StationTag, typeof PenTool> = {
    CAD: PenTool,
    CNC: Settings2,
    SANDING: Sparkles,
    BENDING: Component,
    WELDING: Flame,
    PAINT: Paintbrush,
    ASSEMBLY: PackageCheck,
    QC: ShieldCheck,
    LOGISTICS: Truck,
    FILM_COATING: CircleDashed,
    GLUEING: CircleDashed
  };

  let icon = $derived(station ? icons[station] ?? CircleDashed : CircleDashed);
  let text = $derived(label ?? (station ? $t(TERMS.stations[station]) : ''));
  let show = $derived(Boolean(station || label));
  let sizeClass = $derived(size === 'md' ? 'station-badge--md' : 'station-badge--sm');
</script>

{#if show}
  {@const SvelteComponent = icon}
  <span class={`station-badge ${sizeClass}`} data-tone={tone} data-station={station || 'generic'}>
    <SvelteComponent size={size === 'md' ? 16 : 14} aria-hidden="true" />
    <span class="station-badge__label">{text}</span>
  </span>
{/if}

<style>
  .station-badge{ display:inline-flex; align-items:center; gap:6px; padding:4px 8px; border-radius:999px; font-size:.75rem; font-weight:600; background:color-mix(in oklab,var(--bg-2) 70%, transparent); border:1px solid color-mix(in oklab,var(--border) 85%, transparent); color:var(--muted); letter-spacing:.01em; }
  .station-badge--md{ font-size:.8rem; padding:6px 12px }
  .station-badge :global(svg){ flex:0 0 auto }
  .station-badge[data-tone='highlight']{ background:color-mix(in oklab,var(--accent-2) 30%, transparent); color:var(--accent-2); border-color:color-mix(in oklab,var(--accent-2) 50%, transparent) }
  .station-badge[data-station='LOGISTICS']{ color:var(--info); border-color:color-mix(in oklab,var(--info) 40%, transparent) }
  .station-badge[data-station='QC']{ color:var(--ok); border-color:color-mix(in oklab,var(--ok) 45%, transparent) }
  .station-badge[data-station='WELDING']{ color:var(--danger); border-color:color-mix(in oklab,var(--danger) 40%, transparent) }
  .station-badge[data-station='PAINT']{ color:color-mix(in oklab,var(--accent-1) 55%, var(--accent-2)); border-color:color-mix(in oklab,var(--accent-1) 45%, transparent) }
  .station-badge__label{ white-space:nowrap }
</style>
