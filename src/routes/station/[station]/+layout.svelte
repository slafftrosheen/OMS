<script lang="ts">
  import type { Snippet } from 'svelte';
  import { page } from '$app/state';
  import { currentUser } from '$lib/auth/authState.svelte';
  import { orderSheetAccountKey } from '$lib/order/order-sheet';

  let { children }: { children: Snippet } = $props();
</script>

{#key JSON.stringify([page.params.station, orderSheetAccountKey($currentUser)])}
  {@render children()}
{/key}
