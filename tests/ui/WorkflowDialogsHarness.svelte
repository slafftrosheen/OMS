<script lang="ts">
  import InventoryConsistency from '../../src/routes/inventory/consistency/+page.svelte';
  import { page } from './app-state';
  import StationLayout from '../../src/routes/station/[station]/+layout.svelte';
  import StationPage from '../../src/routes/station/[station]/+page.svelte';

  let { surface = 'inventory' }: { surface?: 'inventory' | 'station' } = $props();
</script>

{#if surface === 'station'}
  {#if page.url.searchParams.has('switch')}
    <button onclick={() => { page.params = {station:'PAINT'}; }}>Switch to paint fixture</button>
  {/if}
  <StationLayout><StationPage /></StationLayout>
{:else}
  <InventoryConsistency />
{/if}
