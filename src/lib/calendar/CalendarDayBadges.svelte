<script lang="ts">
  import { t } from 'svelte-i18n';
  import Icon from '$lib/ui/Icon.svelte';
  import type { IconName } from '$lib/ui/icons';
  import type { CalendarDaySummary, CalendarBadgeKind } from './day-summary';

  let { summary, compact = false }: { summary: CalendarDaySummary; compact?: boolean } = $props();
  const icons: Record<CalendarBadgeKind, IconName> = {
    closed: 'lock', overdue: 'alert-triangle', due: 'clock', loading: 'truck', meeting: 'users', note: 'file-text'
  };
</script>

<span class="day-badges" class:compact>
  {#each summary.badges as badge (badge.kind)}
    {@const label = $t(`calendar.badges.${badge.kind === 'loading' && badge.count === 0 ? 'loading_day' : badge.kind}`)}
    <span class="day-badge" data-badge={badge.kind} title={`${label}${badge.count > 0 ? `: ${badge.count}` : ''}`}>
      <Icon name={icons[badge.kind]} size={12} />
      <span class="badge-label">{label}</span>
      {#if badge.count > 0}<strong class="badge-count">{badge.count}</strong>{/if}
    </span>
  {/each}
</span>

<style>
  .day-badges { display:flex;flex-wrap:wrap;gap:5px;min-width:0; }
  .day-badge { --badge-tone:var(--muted);display:inline-flex;align-items:center;gap:4px;min-width:0;
    max-width:100%;padding:3px 6px;border:1px solid color-mix(in srgb,var(--badge-tone) 38%,var(--border));
    border-radius:6px;background:color-mix(in srgb,var(--badge-tone) 9%,var(--bg-1));
    color:var(--text);font-size:11px;line-height:1.3;font-weight:600; }
  .day-badge :global(svg) { color:var(--badge-tone); }
  .day-badge[data-badge="loading"] { --badge-tone:var(--ink-secondary); }
  .day-badge[data-badge="due"] { --badge-tone:var(--warn); }
  .day-badge[data-badge="overdue"],.day-badge[data-badge="closed"] { --badge-tone:var(--danger); }
  .day-badge[data-badge="meeting"] { --badge-tone:var(--info); }
  .day-badge[data-badge="note"] { --badge-tone:var(--ink-secondary); }
  .badge-count { margin-left:auto;flex-shrink:0;font-size:11px;font-variant-numeric:tabular-nums; }
  .badge-label { overflow-wrap:anywhere; }
  .compact { display:flex;flex-direction:column;gap:4px;width:100%; }
  .compact .day-badge { padding:3px 4px;justify-content:flex-start; }
  .compact .day-badge :global(svg) { flex-shrink:0; }
  .compact .badge-label { min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
  @media(max-width:600px) {
    .compact .badge-label { position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip-path:inset(50%); }
    .compact .day-badge { padding:3px;gap:2px; }
    .compact .badge-count { font-size:10px; }
  }
</style>
