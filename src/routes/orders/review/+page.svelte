<script lang="ts">
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import { goto } from '$app/navigation';
  import { t } from 'svelte-i18n';
  import { currentUser } from '$lib/auth/authState.svelte';
  import { can } from '$lib/auth/permission-utils';
  import Icon from '$lib/ui/Icon.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { notifications } from '$lib/notify/store';

  type PendingOrder = {
    id: string;
    internal_ref: string | null;
    po_number: string | null;
    client: string;
    title: string | null;
    due_date: string | null;
    loading_date: string | null;
    priority: string | null;
    status: string | null;
    notes: string | null;
    created_at: string;
    created_by_name: string | null;
    created_by_username: string | null;
    created_by_role: string | null;
    file_count: number;
    profile_count: number;
  };

  let orders = $state<PendingOrder[]>([]);
  let loading = $state(true);
  let error = $state('');
  let confirmTarget = $state<PendingOrder | null>(null);
  let poInput = $state('');
  let confirming = $state(false);
  let confirmError = $state('');

  let rejectTarget = $state<PendingOrder | null>(null);
  let rejectReason = $state('');
  let rejecting = $state(false);

  let canReview = $derived(can($currentUser, 'reviewQueue'));
  let canAssignPo = $derived(can($currentUser, 'assignPoNumber'));

  onMount(async () => {
    if (!canReview) {
      goto(`${base}/orders`);
      return;
    }
    await load();
  });

  async function load() {
    loading = true;
    error = '';
    try {
      const res = await fetch(`${base}/api/orders/pending-review`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      orders = Array.isArray(data) ? data : [];
    } catch (err: any) {
      console.error('Failed to load pending review orders:', err);
      error = err?.message ?? 'Failed to load';
    } finally {
      loading = false;
    }
  }

  function openConfirm(order: PendingOrder) {
    confirmTarget = order;
    poInput = order.po_number ?? '';
    confirmError = '';
  }

  function closeConfirm() {
    confirmTarget = null;
    poInput = '';
    confirmError = '';
  }

  async function submitConfirm() {
    if (!confirmTarget) return;
    confirming = true;
    confirmError = '';
    try {
      const res = await fetch(`${base}/api/draft-orders/${confirmTarget.id}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poNumber: poInput.trim() }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        confirmError = payload?.error ?? `HTTP ${res.status}`;
        return;
      }
      closeConfirm();
      await load();
    } catch (err: any) {
      confirmError = err?.message ?? 'Failed to confirm';
    } finally {
      confirming = false;
    }
  }

  function openReject(order: PendingOrder) {
    rejectTarget = order;
    rejectReason = '';
  }

  function closeReject() {
    rejectTarget = null;
    rejectReason = '';
  }

  async function submitReject() {
    if (!rejectTarget || !rejectReason.trim()) return;
    rejecting = true;
    try {
      const res = await fetch(`${base}/api/draft-orders/${rejectTarget.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectReason.trim() }),
      });
      if (!res.ok) {
        const p = await res.json().catch(() => ({}));
        notifications.error(p?.message ?? 'Failed to reject');
        return;
      }
      notifications.success('Order rejected');
      closeReject();
      await load();
    } catch (err) {
      console.error(err);
      notifications.error('Failed to reject order');
    } finally {
      rejecting = false;
    }
  }

  function formatDate(value: string | null): string {
    if (!value) return '—';
    return new Date(value).toLocaleDateString();
  }

  function priorityTone(p: string | null): string {
    const norm = (p ?? '').toUpperCase();
    if (norm === 'URGENT') return 'urgent';
    if (norm === 'HIGH') return 'high';
    if (norm === 'LOW') return 'low';
    return 'normal';
  }
</script>

<svelte:head>
  <title>Review queue · OMS</title>
</svelte:head>

<div class="review-page">
  <header class="review-header">
    <div>
      <h1>{$t('orders.review.title', { default: 'Review queue' })}</h1>
      <p class="subtitle">
        {$t('orders.review.subtitle', {
          default: 'Drafts awaiting Head of Production review and PO assignment',
        })}
      </p>
    </div>
    <Button variant="secondary" onclick={load} disabled={loading}>
      <Icon name="refresh-cw" size="sm" />
      {$t('actions.refresh', { default: 'Refresh' })}
    </Button>
  </header>

  {#if error}
    <div class="banner error">
      <Icon name="alert-circle" size="sm" />
      <span>{error}</span>
    </div>
  {/if}

  {#if loading}
    <div class="empty">
      <Icon name="loader" size="lg" />
      <p>{$t('actions.loading', { default: 'Loading…' })}</p>
    </div>
  {:else if orders.length === 0}
    <div class="empty">
      <Icon name="check-circle" size="lg" />
      <p>{$t('orders.review.empty', { default: 'No drafts awaiting review.' })}</p>
    </div>
  {:else}
    <ul class="review-list">
      {#each orders as order (order.id)}
        <li class="review-card">
          <div class="card-row top">
            <div class="ref">
              <span class="internal-ref">{order.internal_ref ?? order.id.slice(0, 8)}</span>
              <span class="priority pri-{priorityTone(order.priority)}">{order.priority ?? 'NORMAL'}</span>
            </div>
            <div class="actions">
              <Button variant="secondary" onclick={() => goto(`${base}/orders/${order.id}`)}>
                {$t('actions.open', { default: 'Open' })}
              </Button>
              <Button variant="primary" onclick={() => openConfirm(order)} disabled={!canAssignPo && !order.po_number}>
                <Icon name="check" size="sm" />
                {$t('orders.review.confirm', { default: 'Confirm & assign PO' })}
              </Button>
              <Button variant="ghost" onclick={() => openReject(order)}>
                <Icon name="x" size="sm" />
                {$t('orders.review.reject', { default: 'Reject' })}
              </Button>
            </div>
          </div>

          <div class="card-row body">
            <div class="field">
              <span class="label">{$t('orders.review.client', { default: 'Client' })}</span>
              <span class="value">{order.client}</span>
            </div>
            <div class="field">
              <span class="label">{$t('orders.review.title_label', { default: 'Title' })}</span>
              <span class="value">{order.title ?? '—'}</span>
            </div>
            <div class="field">
              <span class="label">{$t('orders.review.due', { default: 'Deadline' })}</span>
              <span class="value">{formatDate(order.due_date)}</span>
            </div>
            <div class="field">
              <span class="label">{$t('orders.review.loading', { default: 'Loading' })}</span>
              <span class="value">{formatDate(order.loading_date)}</span>
            </div>
            <div class="field">
              <span class="label">{$t('orders.review.created_by', { default: 'Created by' })}</span>
              <span class="value">
                {order.created_by_name ?? order.created_by_username ?? '—'}
                {#if order.created_by_role}
                  <small>({order.created_by_role})</small>
                {/if}
              </span>
            </div>
            <div class="field">
              <span class="label">{$t('orders.review.attachments', { default: 'Files / Profiles' })}</span>
              <span class="value">{order.file_count} / {order.profile_count}</span>
            </div>
          </div>

          {#if order.notes}
            <div class="notes">{order.notes}</div>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>

{#if confirmTarget}
  <div
    class="modal-backdrop"
    onclick={closeConfirm}
    onkeydown={(e) => e.key === 'Escape' && closeConfirm()}
    role="dialog"
    aria-modal="true"
    aria-labelledby="confirm-title"
    tabindex="-1"
  >
    <div class="modal" onclick={(e) => e.stopPropagation()} role="document">
      <header class="modal-header">
        <h2 id="confirm-title">{$t('orders.review.confirm_title', { default: 'Confirm order' })}</h2>
        <button class="icon-btn" onclick={closeConfirm} aria-label="Close">
          <Icon name="x" size="sm" />
        </button>
      </header>

      <div class="modal-body">
        <p class="muted">
          {confirmTarget.internal_ref} · {confirmTarget.client}
        </p>
        <label for="po-input">
          {$t('orders.review.po_label', { default: 'PO number (provided by Boss)' })}
        </label>
        <input
          id="po-input"
          type="text"
          bind:value={poInput}
          maxlength="16"
          placeholder="e.g. PO-2026-00042"
          autocomplete="off"
        />
        <p class="hint">
          {$t('orders.review.po_hint', {
            default: 'Up to 16 characters. Letters, digits, and - _ . / are allowed.',
          })}
        </p>
        {#if !canAssignPo}
          <p class="hint warn">
            {$t('orders.review.po_boss_only', {
              default: 'Only Boss may assign a new PO number. HoP can re-confirm a row that already has one.',
            })}
          </p>
        {/if}
        {#if confirmError}
          <div class="banner error inline">
            <Icon name="alert-circle" size="sm" />
            <span>{confirmError}</span>
          </div>
        {/if}
      </div>

      <footer class="modal-footer">
        <Button variant="secondary" onclick={closeConfirm}>
          {$t('actions.cancel', { default: 'Cancel' })}
        </Button>
        <Button variant="primary" onclick={submitConfirm} disabled={confirming || !poInput.trim()}>
          {#if confirming}
            <Icon name="loader" size="sm" />
            {$t('actions.confirming', { default: 'Confirming…' })}
          {:else}
            <Icon name="check" size="sm" />
            {$t('orders.review.confirm_submit', { default: 'Confirm order' })}
          {/if}
        </Button>
      </footer>
    </div>
  </div>
{/if}

{#if rejectTarget}
  <div
    class="modal-backdrop"
    onclick={closeReject}
    onkeydown={(e) => e.key === 'Escape' && closeReject()}
    role="dialog"
    aria-modal="true"
    aria-labelledby="reject-title"
    tabindex="-1"
  >
    <div class="modal" onclick={(e) => e.stopPropagation()} role="document">
      <header class="modal-header">
        <h2 id="reject-title">{$t('orders.review.reject_title', { default: 'Reject order' })}</h2>
        <button class="icon-btn" onclick={closeReject} aria-label="Close">
          <Icon name="x" size="sm" />
        </button>
      </header>
      <div class="modal-body">
        <p class="muted">{rejectTarget.internal_ref} · {rejectTarget.client}</p>
        <label for="reject-reason">
          {$t('orders.review.reject_reason', { default: 'Reason for rejection' })}
        </label>
        <textarea
          id="reject-reason"
          bind:value={rejectReason}
          rows="4"
          placeholder={$t('orders.review.reject_placeholder', { default: 'Describe why this order is being rejected…' })}
        ></textarea>
      </div>
      <footer class="modal-footer">
        <Button variant="secondary" onclick={closeReject}>
          {$t('actions.cancel', { default: 'Cancel' })}
        </Button>
        <Button variant="ghost" onclick={submitReject} disabled={rejecting || !rejectReason.trim()}>
          {#if rejecting}
            <Icon name="loader" size="sm" />
            {$t('actions.rejecting', { default: 'Rejecting…' })}
          {:else}
            <Icon name="x" size="sm" />
            {$t('orders.review.reject_submit', { default: 'Reject order' })}
          {/if}
        </Button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .review-page {
    padding: var(--space-md, 16px);
    max-width: var(--content-max, 1280px);
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .review-header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
  }
  .review-header h1 {
    margin: 0;
    font-size: 24px;
    font-weight: 700;
  }
  .subtitle {
    margin: 4px 0 0;
    color: var(--ink-tertiary);
    font-size: 14px;
  }
  .banner {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    border-radius: var(--radius-sm, 8px);
  }
  .banner.error {
    background: color-mix(in oklab, var(--brand) 12%, transparent);
    border: 1px solid color-mix(in oklab, var(--brand) 30%, transparent);
    color: var(--brand);
  }
  .banner.inline { margin-top: 8px; }
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 48px 0;
    color: var(--ink-tertiary);
  }
  .review-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 12px;
  }
  .review-card {
    background: var(--glass-bg);
    -webkit-backdrop-filter: var(--glass-blur);
    backdrop-filter: var(--glass-blur);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-md, 16px);
    box-shadow: var(--glass-shadow);
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .card-row.top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .ref {
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: var(--font-mono, ui-monospace, monospace);
    font-weight: 600;
  }
  .internal-ref {
    color: var(--ink-secondary);
  }
  .priority {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 2px 8px;
    border-radius: var(--radius-full, 999px);
    background: color-mix(in oklab, var(--ink-primary) 8%, transparent);
  }
  .priority.pri-urgent {
    background: color-mix(in oklab, var(--brand) 18%, transparent);
    color: var(--brand);
  }
  .priority.pri-high {
    background: color-mix(in oklab, #ff9500 18%, transparent);
    color: #ff9500;
  }
  .priority.pri-low {
    background: color-mix(in oklab, var(--ink-primary) 6%, transparent);
    color: var(--ink-tertiary);
  }
  .actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .card-row.body {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 12px;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--ink-tertiary);
  }
  .value {
    font-size: 14px;
    color: var(--ink-primary);
  }
  .value small {
    color: var(--ink-tertiary);
    margin-left: 4px;
  }
  .notes {
    font-size: 13px;
    color: var(--ink-secondary);
    background: color-mix(in oklab, var(--ink-primary) 4%, transparent);
    border-radius: var(--radius-sm, 8px);
    padding: 8px 12px;
    white-space: pre-wrap;
  }

  /* Modal */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: color-mix(in oklab, black 50%, transparent);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    z-index: 1000;
  }
  .modal {
    background: var(--surface-elevated, var(--glass-bg));
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-lg, 24px);
    width: 100%;
    max-width: 480px;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.32);
    display: flex;
    flex-direction: column;
  }
  .modal-header,
  .modal-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    gap: 8px;
  }
  .modal-header { border-bottom: 1px solid var(--glass-border); }
  .modal-footer { border-top: 1px solid var(--glass-border); justify-content: flex-end; }
  .modal-body {
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .modal-body label {
    font-size: 13px;
    color: var(--ink-secondary);
  }
  .modal-body input {
    font-size: 16px;
    padding: 10px 12px;
    border-radius: var(--radius-sm, 8px);
    border: 1px solid var(--glass-border);
    background: var(--surface-soft, color-mix(in oklab, var(--ink-primary) 4%, transparent));
    color: var(--ink-primary);
    font-family: var(--font-mono, ui-monospace, monospace);
  }
  .modal-body input:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  .hint {
    margin: 4px 0 0;
    font-size: 12px;
    color: var(--ink-tertiary);
  }
  .hint.warn {
    color: var(--brand);
  }
  .icon-btn {
    background: transparent;
    border: none;
    padding: 6px;
    border-radius: var(--radius-sm, 8px);
    cursor: pointer;
    color: var(--ink-secondary);
  }
  .icon-btn:hover {
    background: color-mix(in oklab, var(--ink-primary) 8%, transparent);
  }
  .muted {
    margin: 0 0 8px;
    font-size: 13px;
    color: var(--ink-tertiary);
    font-family: var(--font-mono, ui-monospace, monospace);
  }
  .modal-body textarea {
    font-size: 14px;
    padding: 10px 12px;
    border-radius: var(--radius-sm, 8px);
    border: 1px solid var(--glass-border);
    background: var(--surface-soft, color-mix(in oklab, var(--ink-primary) 4%, transparent));
    color: var(--ink-primary);
    font-family: inherit;
    resize: vertical;
    width: 100%;
    box-sizing: border-box;
  }
  .modal-body textarea:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
</style>
