<script lang="ts">
  import SemanticBadge from '$lib/badges/SemanticBadge.svelte';
  import { legacyOrderBadge } from '$lib/badges/catalog';
  import type { Badge } from '$lib/order/types';
  let { badge, size = 'sm' }: { badge: Badge; size?: 'sm' | 'md' } = $props();
  let descriptor = $derived(legacyOrderBadge(badge));
</script>

{#if descriptor}<SemanticBadge badge={descriptor} {size} />{/if}
