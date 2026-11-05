<script lang="ts">
  import { base } from '$app/paths';
  import { goto } from '$app/navigation';
  import { t } from 'svelte-i18n';
  import { currentUser } from '$lib/auth/authState.svelte';
  import { can } from '$lib/auth/permission-utils';
  import Button from '$lib/components/ui/Button.svelte';
  import Modal from '$lib/components/ui/Modal.svelte';
  import { notifications } from '$lib/notify/store';

  let { orderId, status, updatedAt, disabled = false, onDeleted }: {
    orderId: string; status: string; updatedAt: string | null; disabled?: boolean;
    onDeleted?: () => void;
  } = $props();
  let open = $state(false);
  let busy = $state(false);
  let failure = $state('');
  const deletable = ['DRAFT','PENDING_REVIEW','CONFIRMED','IN_PRODUCTION','READY_TO_LOAD','ON_HOLD'];
  let allowed = $derived(can($currentUser, 'deleteOrder') && deletable.includes(status.toUpperCase()));

  async function remove() {
    if (busy || !allowed || !updatedAt) return;
    busy = true; failure = '';
    try {
      const response = await fetch(`${base}/api/orders/${encodeURIComponent(orderId)}`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedUpdatedAt: updatedAt })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || result.error || $t('orderDeletion.failed'));
      open = false;
      onDeleted?.();
      notifications.success($t('orderDeletion.deleted'));
      await goto(`${base}/orders`);
    } catch (error) {
      failure = error instanceof Error ? error.message : $t('orderDeletion.failed');
    } finally { busy = false; }
  }
</script>

{#if allowed}
  <Button variant="danger" disabled={disabled || busy || !updatedAt} onclick={() => { failure = ''; open = true; }}>
    {$t('orderDeletion.button')}
  </Button>
{/if}
<Modal bind:open closeOnClickOutside={!busy} closeOnEscape={!busy} showCloseButton={!busy} title={$t('orderDeletion.title')}>
  <p>{$t('orderDeletion.description')}</p>
  {#if failure}<p role="alert">{failure}</p>{/if}
  {#snippet footer()}
    <Button variant="ghost" disabled={busy} onclick={() => open = false}>{$t('common.cancel')}</Button>
    <Button variant="danger" loading={busy} onclick={remove}>{$t('orderDeletion.button')}</Button>
  {/snippet}
</Modal>
