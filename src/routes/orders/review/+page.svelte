<script lang="ts">
  import { onMount, tick } from 'svelte';
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
  let confirmRevision = $state<string|null>(null);
  let confirmFiles = $state<number|null>(null);
  let confirmDocumentNames=$state<string[]>([]);
  let confirmLoading = $state(false);
  let confirmLoadSequence = 0;

  let rejectTarget = $state<PendingOrder | null>(null);
  let rejectReason = $state('');
  let rejecting = $state(false);
  let previousFocus: HTMLElement | null = null;

  function rememberFocus(): void {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }
  function restoreFocus(): void {
    const target = previousFocus;
    previousFocus = null;
    void tick().then(() => target?.focus());
  }
  function handleDialogKeys(e: KeyboardEvent, close: () => void): void {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') return;
    const dialog = e.currentTarget as HTMLElement;
    const elements = [...dialog.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href]'
    )].filter(el => el.getAttribute('aria-hidden') !== 'true');
    const first = elements[0], last = elements[elements.length - 1];
    if (!first || !last) { e.preventDefault(); dialog.focus(); return; }
    if (e.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
      e.preventDefault(); first.focus();
    }
  }

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

  async function openConfirm(order: PendingOrder) {
    rememberFocus();
    const sequence=++confirmLoadSequence;
    confirmTarget=order;
    void tick().then(() => document.getElementById('po-input')?.focus());
    poInput=order.po_number??'';
    confirmError='';
    confirmRevision=null;confirmFiles=null;confirmDocumentNames=[];confirmLoading=true;
    try{
      // The queue is a summary; obtain a current, versioned snapshot before
      // allowing this manager to release the order to production.
      const response=await fetch(
        `${base}/api/draft-orders/${encodeURIComponent(order.id)}`,
        {cache:'no-store'}
      );
      if(!response.ok)throw new Error($t('orderWorkspace.confirmReloadRequired'));
      const latest=await response.json();
      if(sequence!==confirmLoadSequence||confirmTarget?.id!==order.id)return;
      if(!['DRAFT','draft','PENDING_REVIEW'].includes(latest.status) ||
         typeof latest.updatedAt!=='string')
        throw new Error($t('orderWorkspace.confirmReloadRequired'));
      if(!Array.isArray(latest.files))
        throw new Error($t('orderWorkspace.confirmFilesUnknown'));
      confirmRevision=latest.updatedAt;
      confirmFiles=latest.files.length;
      confirmDocumentNames=latest.files.slice(0,8).map((file:{originalName?:string;displayName?:string;filename?:string})=>
        String(file.originalName??file.displayName??file.filename??'').slice(0,180));
      confirmTarget={...order,status:latest.status,
        client:String(latest.clientName??order.client),
        title:latest.title??order.title,
        due_date:latest.deadline??order.due_date,
        file_count:latest.files.length,
        profile_count:Array.isArray(latest.profiles)?latest.profiles.length:order.profile_count};
      if(confirmFiles===0)confirmError=$t('orderWorkspace.confirmFilesMissing');
    }catch(err){
      if(sequence===confirmLoadSequence)
        confirmError=err instanceof Error?err.message:$t('orderWorkspace.confirmReloadRequired');
    }finally{
      if(sequence===confirmLoadSequence)confirmLoading=false;
    }
  }

  function closeConfirm() {
    if(confirming)return;
    ++confirmLoadSequence;
    confirmTarget=null;
    poInput='';
    confirmError='';
    confirmRevision=null;confirmFiles=null;confirmDocumentNames=[];confirmLoading=false;
    restoreFocus();
  }

  async function submitConfirm() {
    if (!confirmTarget||confirming||confirmLoading)return;
    if(!confirmRevision || !confirmFiles){
      confirmError=$t(confirmFiles===0
        ?'orderWorkspace.confirmFilesMissing':'orderWorkspace.confirmReloadRequired');
      return;
    }
    confirming = true;
    confirmError = '';
    try {
      const res = await fetch(`${base}/api/draft-orders/${encodeURIComponent(confirmTarget.id)}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poNumber:poInput.trim(),expectedUpdatedAt:confirmRevision
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        confirmError = res.status===409||res.status===428
          ?$t('orderWorkspace.confirmReloadRequired')
          :payload?.error ?? `HTTP ${res.status}`;
        return;
      }
      // The reply reflects an authorized, atomic release (or an idempotent
      // retry). Clear the dialog only after the server accepts it.
      ++confirmLoadSequence;
      confirmTarget=null;
      poInput='';
      confirmRevision=null;confirmFiles=null;confirmDocumentNames=[];
      restoreFocus();
      await load();
    } catch (err: any) {
      confirmError = err?.message ?? 'Failed to confirm';
    } finally {
      confirming = false;
    }
  }

  function openReject(order: PendingOrder) {
    rememberFocus();
    rejectTarget = order;
    rejectReason = '';
    void tick().then(() => document.getElementById('reject-reason')?.focus());
  }

  function clearReject(): void {
    rejectTarget = null;
    rejectReason = '';
    restoreFocus();
  }
  function closeReject(): void {
    if (rejecting) return;
    clearReject();
  }

  async function submitReject() {
    if (!rejectTarget || !rejectReason.trim() || rejecting) return;
    rejecting = true;
    try {
      const res = await fetch(`${base}/api/draft-orders/${rejectTarget.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectReason.trim() }),
      });
      if (!res.ok) {
        const p = await res.json().catch(() => ({}));
        notifications.error(p?.message ?? $t('orders.review.rejectFailed'));
        return;
      }
      notifications.success($t('orders.review.rejected'));
      clearReject();
      await load();
    } catch (err) {
      console.error(err);
      notifications.error($t('orders.review.rejectFailed'));
    } finally {
      rejecting = false;
    }
  }

  function formatDate(value: string | null): string {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
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
  <title>{$t('orders.review.title')} · OMS</title>
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
    <div class="banner error" role="alert">
      <Icon name="alert-circle" size="sm" />
      <span>{error}</span>
    </div>
  {/if}

  {#if loading}
    <div class="empty">
      <Icon name="loader" size="lg" />
      <p>{$t('actions.loading', { default: 'Loading…' })}</p>
    </div>
  {:else if error && orders.length === 0}
    <div class="empty" role="alert">
      <Icon name="alert-circle" size="lg" />
      <p>{$t('orders.review.loadFailed')}</p>
      <Button variant="secondary" onclick={load}>{$t('common.retry')}</Button>
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
              <Button variant="primary" onclick={() => void openConfirm(order)} disabled={!canAssignPo && !order.po_number}>
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
    onkeydown={(e) => handleDialogKeys(e,closeConfirm)}
    role="dialog"
    aria-modal="true"
    aria-labelledby="confirm-title"
    tabindex="-1"
  >
    <div class="modal" onclick={(e) => e.stopPropagation()} role="document">
      <header class="modal-header">
        <h2 id="confirm-title">{$t('orders.review.confirm_title', { default: 'Confirm order' })}</h2>
        <button class="icon-btn" onclick={closeConfirm} aria-label={$t('common.close')}>
          <Icon name="x" size="sm" />
        </button>
      </header>

      <div class="modal-body">
        <p class="muted">
          {confirmTarget.internal_ref} · {confirmTarget.client}
        </p>
        {#if confirmLoading}
          <p class="muted" role="status">{$t('orderWorkspace.confirmChecking')}</p>
        {:else if confirmFiles!==null}
          <p class="muted">
            {$t('orderWorkspace.confirmLinkedFiles',{values:{count:confirmFiles}})}
          </p>
        {/if}
        {#if confirmTarget.status==='DRAFT' || confirmTarget.status==='draft'}
          <p class="muted" role="status">{$t('orderWorkspace.confirmDirectDraft')}</p>
        {/if}
        {#if confirmFiles!==null}
          <p class="muted">
            {$t('orders.review.due')}: {formatDate(confirmTarget.due_date)}
            · {$t('orderWorkspace.confirmProfilesCount',{values:{count:confirmTarget.profile_count}})}
          </p>
          {#if confirmDocumentNames.length}
            <ul class="confirm-drawings">
              {#each confirmDocumentNames as filename,i (i)}
                <li>{filename || '—'}</li>
              {/each}
            </ul>
          {/if}
        {/if}
        <label for="po-input">
          {$t('orders.review.po_label', { default: 'PO number (provided by Boss)' })}
        </label>
        <input
          id="po-input"
          type="text"
          bind:value={poInput}
          readonly={!canAssignPo}
          aria-readonly={!canAssignPo}
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
          <div class="banner error inline" role="alert">
            <Icon name="alert-circle" size="sm" />
            <span>{confirmError}</span>
          </div>
        {/if}
      </div>

      <footer class="modal-footer">
        <Button variant="secondary" onclick={closeConfirm}>
          {$t('actions.cancel', { default: 'Cancel' })}
        </Button>
        <Button variant="primary" onclick={submitConfirm} disabled={
          confirming || confirmLoading || !confirmRevision || !confirmFiles || !poInput.trim()
        }>
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
    onkeydown={(e) => handleDialogKeys(e,closeReject)}
    role="dialog"
    aria-modal="true"
    aria-labelledby="reject-title"
    tabindex="-1"
  >
    <div class="modal" onclick={(e) => e.stopPropagation()} role="document">
      <header class="modal-header">
        <h2 id="reject-title">{$t('orders.review.reject_title', { default: 'Reject order' })}</h2>
        <button class="icon-btn" onclick={closeReject} aria-label={$t('common.close')}>
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
  .confirm-drawings {
    display:grid;gap:4px;margin:2px 0 8px;padding:8px 10px 8px 26px;
    max-height:120px;overflow:auto;border:1px solid var(--glass-border);
    border-radius:var(--radius-sm,8px);font-size:12px;
    color:var(--ink-secondary);overflow-wrap:anywhere;
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

  /* LUMIGRID review queue: actionable, readable, no heavy glass on data. */
  .review-page {max-width:1440px;padding:var(--space-lg) 0 var(--space-2xl);gap:var(--space-md);}
  .review-header {position:relative;padding:var(--space-lg) 0;
    border-bottom:1px solid var(--divider);align-items:center;}
  .review-header::before {content:'';position:absolute;top:0;left:0;
    width:90px;height:2px;background:linear-gradient(90deg,var(--brand),var(--brand-2),transparent);}
  .review-header h1 {font-size:clamp(1.5rem,2.7vw,2rem);letter-spacing:var(--tracking-tight);}
  .subtitle {color:var(--ink-secondary);max-width:70ch;}
  .banner.error {background:var(--error-soft);border-color:var(--error);color:var(--error);}
  .review-list {gap:var(--space-md);}
  .review-card {background:var(--glass-bg-strong);border:1px solid var(--glass-border);
    border-radius:var(--radius-lg);box-shadow:var(--glass-shadow-sm);
    padding:var(--space-lg);gap:var(--space-md);backdrop-filter:none;}
  .card-row.top {gap:var(--space-md);border-bottom:1px solid var(--divider);
    padding-bottom:var(--space-sm);}
  .ref {gap:var(--space-sm);flex-wrap:wrap;min-width:0;}
  .internal-ref {font-variant-numeric:tabular-nums;color:var(--ink-primary);}
  .priority {border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--bg-2);}
  .priority.pri-urgent {color:var(--error);background:var(--error-soft);
    border-color:color-mix(in oklab,var(--error) 30%,var(--border));}
  .priority.pri-high {color:var(--warn);background:var(--warn-soft);
    border-color:color-mix(in oklab,var(--warn) 30%,var(--border));}
  .actions {align-items:center;gap:var(--space-xs);flex-wrap:wrap;}
  .actions :global(button) {border-radius:var(--radius-sm);min-height:42px;}
  .card-row.body {grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--space-md);}
  .field {min-width:0;gap:var(--space-xs);}
  .label {font-size:var(--text-xs);letter-spacing:.03em;color:var(--ink-tertiary);}
  .value {color:var(--ink-primary);overflow-wrap:anywhere;font-size:var(--text-sm);}
  .notes {background:var(--bg-2);border-left:2px solid var(--brand);border-radius:var(--radius-sm);}
  .modal-backdrop {padding:var(--space-md);}
  .modal {background:var(--bg-1);border:1px solid var(--border);
    border-radius:var(--radius-lg);max-height:calc(100dvh - 30px);overflow:auto;}
  .modal-body input,.modal-body textarea {background:var(--bg-2);border-color:var(--border);
    color:var(--ink-primary);min-height:44px;}
  .modal-body input:focus-visible,.modal-body textarea:focus-visible,.icon-btn:focus-visible {
    outline:2px solid var(--focus);outline-offset:2px;box-shadow:none;}
  .icon-btn {width:40px;min-height:40px;display:inline-grid;place-items:center;}
  .hint.warn {color:var(--warn);}
  @media(max-width:850px){.card-row.body{grid-template-columns:repeat(2,minmax(0,1fr));}}
  @media(max-width:600px){.review-page{padding:var(--space-sm) 0 var(--space-xl);}
    .review-header{align-items:stretch;}.card-row.body{grid-template-columns:1fr 1fr;}
    .review-card{padding:var(--space-md);}.actions {width:100%;}
    .actions :global(button) {flex:1 1 120px;}
    .modal-footer{flex-wrap:wrap;}.modal-footer :global(button){flex:1 1 130px;}}
  @media(prefers-reduced-transparency:reduce){.review-card{background:var(--bg-1);}}
</style>
