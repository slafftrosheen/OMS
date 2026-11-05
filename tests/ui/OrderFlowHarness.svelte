<script lang="ts">
  import OrderDeleteButton from '$lib/order/OrderDeleteButton.svelte';
  import OrderFiles from '$lib/order/OrderFiles.svelte';
  import { notifications } from '$lib/notify/store';
  let deleted = $state(false);
</script>
<button onclick={() => notifications.success('Saved successfully', 0)}>Notify success</button>
<button onclick={() => notifications.error('Upload failed', 0)}>Notify error</button>
{#each $notifications as item (item.id)}<p role="status">{item.message}</p>{/each}
<OrderFiles orderId="11111111-1111-4111-8111-111111111111" />
<OrderDeleteButton orderId="11111111-1111-4111-8111-111111111111" status="IN_PRODUCTION"
  updatedAt="2026-11-05T10:00:00.000Z" onDeleted={() => deleted = true} />
{#if deleted}<output>Deleted successfully</output>{/if}
