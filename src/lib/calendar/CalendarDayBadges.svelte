<script lang="ts">
  import SemanticBadge from '$lib/badges/SemanticBadge.svelte';
  import type { BadgeDescriptor } from '$lib/badges/catalog';
  import type { CalendarDaySummary, CalendarBadgeKind } from './day-summary';

  let { summary, compact = false }: { summary: CalendarDaySummary; compact?: boolean } = $props();
  const appearance: Record<CalendarBadgeKind, Pick<BadgeDescriptor, 'icon' | 'tone'>> = {
    closed: { icon: 'lock', tone: 'danger' }, overdue: { icon: 'alert-triangle', tone: 'danger' },
    due: { icon: 'clock', tone: 'warn' }, loading: { icon: 'truck', tone: 'neutral' },
    meeting: { icon: 'users', tone: 'info' }, note: { icon: 'file-text', tone: 'neutral' }
  };
</script>

<span class="day-badges" class:compact>
  {#each summary.badges as badge (badge.kind)}
    <SemanticBadge class="day-badge" {compact} dataBadge={badge.kind} badge={{
      id: badge.kind, ...appearance[badge.kind], count: badge.count,
      labelKey: `calendar.badges.${badge.kind === 'loading' && badge.count === 0 ? 'loading_day' : badge.kind}`
    }} />
  {/each}
</span>

<style>
  .day-badges { display:flex;flex-wrap:wrap;gap:5px;min-width:0; }
  .compact { flex-direction:column;gap:4px;width:100%; }
</style>
