<script lang="ts">
  /**
   * ConfirmModal — single dialog primitive for destructive / decision flows.
   * Replaces native window.confirm() across the app.
   *
   * Usage:
   *   let confirm = $state({ open: false, title: '', body: '', action: async () => {} });
   *   ...
   *   confirm = { open: true, title: 'Delete', body: 'Sure?', action: doDelete };
   *
   *   <ConfirmModal bind:state={confirm} />
   */
  import Modal from '$lib/components/ui/Modal.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { t } from 'svelte-i18n';
  import type { ConfirmState } from './confirm-types';

  let {
    state = $bindable<ConfirmState>({ open: false, title: '', body: '' })
  }: {
    state: ConfirmState;
  } = $props();

  async function run() {
    if (!state.action) {
      state = { ...state, open: false };
      return;
    }
    state = { ...state, busy: true };
    try {
      await state.action();
    } finally {
      state = { ...state, open: false, busy: false };
    }
  }

  function cancel() {
    state = { ...state, open: false };
  }
</script>

<Modal bind:open={state.open} title={state.title} size="sm">
  <div class="rf-confirm">
    {#if state.tone === 'danger'}
      <span class="rf-confirm__icon" data-tone="danger" aria-hidden="true">
        <Icon name="alert-triangle" size="lg" />
      </span>
    {/if}
    <p class="rf-confirm__body">{state.body}</p>
  </div>
  <div class="rf-confirm__actions">
    <Button variant="outline" onclick={cancel} disabled={!!state.busy}>
      {state.cancelLabel ?? $t('actions.cancel', { default: 'Cancel' })}
    </Button>
    <Button
      variant={state.tone === 'danger' ? 'danger' : 'primary'}
      onclick={run}
      disabled={!!state.busy}
    >
      {state.confirmLabel ?? (state.tone === 'danger'
        ? $t('actions.delete', { default: 'Delete' })
        : $t('actions.confirm', { default: 'Confirm' }))}
    </Button>
  </div>
</Modal>

<style>
  .rf-confirm {
    display: flex;
    gap: var(--space-md);
    align-items: flex-start;
  }
  .rf-confirm__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    flex-shrink: 0;
    border-radius: var(--radius-full);
    background: var(--error-soft);
    color: var(--error);
    border: 1px solid color-mix(in oklab, var(--error) 30%, transparent);
  }
  .rf-confirm__body {
    margin: var(--space-xs) 0;
    color: var(--ink-secondary);
    line-height: var(--leading-normal);
  }
  .rf-confirm__actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-sm);
    margin-top: var(--space-lg);
  }
</style>
