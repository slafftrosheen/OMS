<script lang="ts">
  import InventoryConsistency from '../../src/routes/inventory/consistency/+page.svelte';
  import StationPage from '../../src/routes/station/[station]/+page.svelte';

  let { surface = 'inventory' }: { surface?: 'inventory' | 'station' } = $props();
</script>

{#if surface === 'station'}
  <StationPage />
{:else}
  <InventoryConsistency />
{/if}
