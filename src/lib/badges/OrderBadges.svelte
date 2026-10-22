<script lang="ts">
  import SemanticBadge from './SemanticBadge.svelte';
  import { buildOrderBadges } from './catalog';
  import { currentDay } from './current-day';
  let { order, size = 'sm', lifecycle = true, priority = true, schedule = true, flags = true }: {
    order: unknown; size?: 'sm' | 'md'; lifecycle?: boolean; priority?: boolean; schedule?: boolean; flags?: boolean;
  } = $props();
  let badges = $derived(buildOrderBadges(order, $currentDay, {
    includeLifecycle: lifecycle, includePriority: priority, includeSchedule: schedule, includeFlags: flags
  }));
</script>

<span class="order-badges">
  {#each badges as badge (badge.id)}<SemanticBadge {badge} {size} />{/each}
</span>

<style>
  .order-badges { display:inline-flex;flex-wrap:wrap;align-items:center;gap:5px;min-width:0;max-width:100%; }
</style>
