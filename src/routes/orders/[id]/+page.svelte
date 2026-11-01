<!-- src/routes/orders/[id]/+page.svelte -->
<script lang="ts">
    import { page } from "$app/state";
    import { base } from "$app/paths";
    import { goto } from "$app/navigation";
    import { onDestroy, untrack } from "svelte";
    import { getAssistantContext, GENERAL_ASSISTANT_TOOL } from '$lib/assistant/context';
    import { t } from "svelte-i18n";
    import Button from "$lib/components/ui/Button.svelte";
    import Card from "$lib/components/ui/Card.svelte";
    import OrderBadges from "$lib/badges/OrderBadges.svelte";
    import SemanticBadge from "$lib/badges/SemanticBadge.svelte";
    import { stageBadge } from "$lib/badges/catalog";
    import Tabs from "$lib/components/ui/Tabs.svelte";
    import ChatContainer from "$lib/components/chat/ChatContainer.svelte";
    import OrderFiles from "$lib/order/OrderFiles.svelte";
    import OrderProfileSheet from "$lib/order/OrderProfileSheet.svelte";
    import { mayEditOrderSheet, orderSheetAccountKey, readOrderSheetSnapshot, type OrderSheetSnapshot } from '$lib/order/order-sheet';
    import { AlertTriangle, LockKeyhole } from 'lucide-svelte';
    import {fetchOrderFilesCount} from "$lib/order/order-files-client";
    import {
      workspaceUrl, stageProgressPercent, stageProgressSummary, mayControlStage
    } from "$lib/order/workspace-navigation";

    import QRCodeDisplay from "$lib/components/qr/QRCodeDisplay.svelte";
    import Modal from "$lib/components/ui/Modal.svelte";
    import OrderTimeline from "$lib/order/OrderTimeline.svelte";
    import { currentUser } from "$lib/auth/authState.svelte";
    import { can, normaliseStatus } from "$lib/auth/permission-utils";
    import { notifications } from "$lib/notify/store";
    import { buildStagePatch } from '$lib/order/stage-contract';

    let orderId = $derived(page.params.id);
    let ownerKey = $derived(orderSheetAccountKey($currentUser));
    const formatTimestamp = (value: unknown) => typeof value === 'string' && !Number.isNaN(Date.parse(value))
      ? new Date(value).toLocaleString() : '—';
    const assistant = getAssistantContext();
    $effect(() => {
      const id = orderId, owner = ownerKey;
      return untrack(() => assistant.register({
        id: `order-detail:${id}:${owner}`, title: () => currentOrderVisible
          ? order?.po_number || order?.title || $t('assistant.screen.orders') : $t('assistant.screen.orders'),
        defaultToolId: GENERAL_ASSISTANT_TOOL,
        tools: () => mayAskOrderAssistant ? [{ id: 'review', label: $t('orderWorkspace.title') }] : [],
        content: orderDetailAssistant,
        context: () => ({ orderId: id, section: activeTab, loading,
          unavailable: loadFailed || (!loading && !currentOrderVisible),
          order: !loading && currentOrderVisible ? { reference: order.po_number, title: order.title,
            client: order.client, status: order.status, dueDate: order.due_date, loadingDate: order.loading_date,
            priority: order.priority, stages: (order.stages ?? []).slice(0,15).map((stage: any) => ({
              station: stage.station, state: stage.state })) } : null,
          fileCount: !loading && currentOrderVisible ? fileCount : null, fileContentsProvided: false })
      }));
    });

    let order: any = $state(null);
    let draftSheet = $state<OrderSheetSnapshot | null>(null);
    let sheetIssue = $state<'denied' | 'failed' | ''>('');
    let loadedOrderId = $state<string | null>(null);
    let loadedAccountId = $state<string | null>(null);
    let loadFailed = $state(false);
    let currentOrderVisible = $derived(order?.id === orderId && loadedOrderId === orderId &&
      !!ownerKey && loadedAccountId === ownerKey);
    let stageSummary=$derived(stageProgressSummary(order?.stages));
    let mayEditSpecification = $derived(currentOrderVisible && !!draftSheet && mayEditOrderSheet($currentUser, draftSheet));
    let mayAskOrderAssistant=$derived(!!$currentUser&&currentOrderVisible&&(
      (['RD','Boss','HeadOfProduction'].includes($currentUser.role??'')&&
        ['DRAFT','PENDING_REVIEW','CONFIRMED','IN_PRODUCTION','READY_TO_LOAD','ON_HOLD']
          .includes(normaliseStatus(order.status)))
      ||(order.created_by===$currentUser.id&&
          ['DRAFT','PENDING_REVIEW'].includes(normaliseStatus(order.status)))
    ));
    let fileCount: number | null = $state(null);
    let loading = $state(true);
    let showQRModal = $state(false);
    let activeTab = $state("stages");

    let tabs = $derived([
        { id: "stages",       label: $t("orderDetail.tabs.stages") },
        { id: "files",        label: $t("orderDetail.tabs.files") },
        { id: "consumption",  label: $t("orderDetail.tabs.consumption", { default: "Consumption" }) },
        { id: "chat",         label: $t("orderDetail.tabs.chat") },
        { id: "timeline",     label: $t("orderDetail.tabs.timeline") },
    ]);

    type ConsumptionRow = {
        order_id: string;
        station: string;
        item_id: string;
        sku: string | null;
        name: string | null;
        total_quantity: number;
        first_logged_at: string;
        last_logged_at: string;
    };
    let consumption = $state<ConsumptionRow[]>([]);
    let consumptionLoading = $state(false);
    let requestVersion = 0;
    let consumptionVersion = 0;
    let routeController = new AbortController();

    async function loadConsumption() {
        if (!orderId || !currentOrderVisible) return;
        const id = orderId;
        const account = ownerKey;
        const version = ++consumptionVersion;
        const isCurrent = () => version === consumptionVersion && orderId === id && ownerKey === account;
        consumptionLoading = true;
        consumption = [];
        try {
            const res = await fetch(`${base}/api/orders/${encodeURIComponent(id)}/consumption`, { cache: 'no-store' });
            const rows = res.ok ? await res.json() : [];
            if (isCurrent()) consumption = Array.isArray(rows) ? rows : [];
        } catch (err) {
            console.error('Failed to load consumption:', err);
        } finally {
            if (isCurrent()) consumptionLoading = false;
        }
    }

    $effect(() => {
        if (activeTab === 'consumption' && currentOrderVisible) untrack(() => void loadConsumption());
    });

    let lifecycleBusy = $state(false);

    // Confirmation dialog state
    let confirmModal = $state<{
        open: boolean;
        title: string;
        body: string;
        action: () => Promise<void>;
    }>({ open: false, title: '', body: '', action: async () => {} });

    // Void & reissue modal state
    let voidModal = $state(false);
    let voidReason = $state('');

    function openConfirm(title: string, body: string, action: () => Promise<void>) {
        confirmModal = { open: true, title, body, action };
    }

    async function runConfirmedAction() {
        confirmModal = { ...confirmModal, open: false };
        await confirmModal.action();
    }

    async function doDispatch() {
        lifecycleBusy = true;
        try {
            const res = await fetch(`/api/orders/${orderId}/dispatch`, { method: 'POST' });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) {
                notifications.error(payload?.error ?? $t('orderDetail.dispatch_error', { default: 'Failed to dispatch' }));
                return;
            }
            notifications.success($t('orderDetail.dispatched', { default: 'Order dispatched' }));
            await loadOrderData();
        } finally {
            lifecycleBusy = false;
        }
    }

    function dispatchOrder() {
        openConfirm(
            $t('orderDetail.dispatch_title', { default: 'Dispatch Order' }),
            $t('orderDetail.dispatch_confirm', { default: 'Mark this order as dispatched?' }),
            doDispatch
        );
    }

    async function doArchive() {
        lifecycleBusy = true;
        try {
            const res = await fetch(`/api/orders/${orderId}/archive`, { method: 'POST' });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) {
                notifications.error(payload?.error ?? $t('orderDetail.archive_error', { default: 'Failed to archive' }));
                return;
            }
            notifications.success($t('orderDetail.archived', { default: 'Order archived' }));
            await loadOrderData();
        } finally {
            lifecycleBusy = false;
        }
    }

    function archiveOrder() {
        openConfirm(
            $t('orderDetail.archive_title', { default: 'Archive Order' }),
            $t('orderDetail.archive_confirm', { default: 'Archive this order? Files stay attached.' }),
            doArchive
        );
    }

    async function submitVoidAndReissue() {
        if (!voidReason.trim()) return;
        voidModal = false;
        lifecycleBusy = true;
        try {
            const res = await fetch(`/api/orders/${orderId}/void-reissue`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason: voidReason }),
            });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) {
                notifications.error(payload?.error ?? $t('orderDetail.void_error', { default: 'Failed to void & reissue' }));
                return;
            }
            notifications.success(
                $t('orderDetail.voided', { default: `Voided. New draft: ${payload.reissuedInternalRef}`, values: { ref: payload.reissuedInternalRef } })
            );
            goto(`${base}/orders/${encodeURIComponent(payload.reissuedId)}`);
        } finally {
            lifecycleBusy = false;
            voidReason = '';
        }
    }

    function voidAndReissue() {
        voidReason = '';
        voidModal = true;
    }

    async function loadOrderData() {
        const requestedId = orderId;
        const requestedAccount = ownerKey;
        const version = ++requestVersion;
        routeController.abort();
        routeController = new AbortController();
        const signal = routeController.signal;
        const isCurrent = () => !signal.aborted && version === requestVersion
          && orderId === requestedId && ownerKey === requestedAccount;
        loading = true;
        loadFailed = false;
        sheetIssue = '';
        draftSheet = null;
        order = null;
        fileCount = null;
        consumption = [];
        consumptionVersion++;
        if (!requestedAccount) { loading = false; return; }

        try {
            const [orderRes, sheetRes, count] = await Promise.all([
                fetch(`${base}/api/orders/${encodeURIComponent(requestedId)}`, { signal, cache: 'no-store' }),
                fetch(`${base}/api/draft-orders/${encodeURIComponent(requestedId)}`, { signal, cache: 'no-store' }).catch(() => null),
                fetchOrderFilesCount(requestedId, (input, options) => fetch(input, { ...options, signal })).catch(() => null),
            ]);
            if (!isCurrent()) return;

            if (orderRes.ok) {
                const orderData = await orderRes.json();
                const sheetData = sheetRes?.ok ? await sheetRes.json().catch(() => null) : null;
                if (!isCurrent()) return;
                // API returns the order fields at top level (with stages, materials,
                // assignees, rework_cycles, revisions, activity_log).
                order = orderData?.order ?? orderData;
                if (order?.id !== requestedId) throw new Error('Order response does not match the requested order');
                draftSheet = readOrderSheetSnapshot(sheetData, requestedId);
                if (!draftSheet) sheetIssue = sheetRes?.status === 401 || sheetRes?.status === 403 ? 'denied' : 'failed';
                fileCount = count;
                loadedOrderId = requestedId;
                loadedAccountId = requestedAccount;
            } else {
                order = null;
                fileCount = null;
                loadFailed = true;
            }

        } catch (error) {
            if (!isCurrent()) return;
            loadFailed = true;
            order = null;
            draftSheet = null;
            fileCount = null;
            console.error("Failed to load order:", error);
        } finally {
            if (isCurrent()) loading = false;
        }
    }

    async function updateStageStatus(stage: string, status: string) {
        const patch = buildStagePatch(stage, status);
        const reason = status === 'BLOCKED' ? window.prompt(
            $t('orderWorkspace.blockReasonPrompt')) : null;
        if(status === 'BLOCKED' && !reason?.trim()) return;
        const stageRow = (order?.stages ?? []).find((s:any)=>s.station===stage);
        if (!stageRow?.updated_at) {
            notifications.error($t('productionFloor.staleStage'));
            await loadOrderData();
            return;
        }
        const patchBody = {
            ...patch.body, expectedUpdatedAt: stageRow.updated_at,
            ...(reason ? {blocked_reason: reason.trim()} : {})
        };
        try {
            const response = await fetch(`/api/orders/${orderId}/stages${patch.url}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(patchBody),
            });

            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                notifications.error(response.status === 409 || response.status === 428
                    ? $t('productionFloor.staleStage')
                    : payload?.message || payload?.error || `Failed to update ${stage} stage`);
                await loadOrderData();
                return;
            }

            await loadOrderData();
        } catch (error) {
            console.error("Failed to update stage:", error);
            notifications.error(`Failed to update ${stage} stage`);
        }
    }

    async function refreshFileList() {
        const id=orderId, account=ownerKey, version=requestVersion;
        const isCurrent=()=>orderId===id && ownerKey===account && requestVersion===version;
        try {
            const count=await fetchOrderFilesCount(id);
            if (isCurrent()) fileCount=count;
        } catch {
            if (isCurrent()) fileCount=null;
        }
    }

    function getStatusColor(status: string): string {
        const colors: Record<string, string> = {
            NOT_STARTED: "var(--ink-3)",
            IN_PROGRESS: "var(--brand)",
            COMPLETED:   "var(--ok)",
            BLOCKED:     "var(--error)",
            SKIPPED:     "var(--warn)",
        };
        return colors[status] || "var(--ink-3)";
    }

    $effect(() => {
        orderId;
        ownerKey;
        untrack(() => {
          activeTab = 'stages';
          showQRModal = false;
          voidModal = false;
          confirmModal = { open: false, title: '', body: '', action: async () => {} };
          void loadOrderData();
        });
    });
    onDestroy(() => { requestVersion++; consumptionVersion++; routeController.abort(); });
</script>

{#snippet orderDetailAssistant(toolId: string)}
  {#if toolId === 'review' && mayAskOrderAssistant}
    <div class="detail-assistant-tools">
      <p>{$t('orderAssistant.savedOnly')}</p>
      <button type="button" class="entry-link" onclick={() => goto(base + workspaceUrl(orderId,'chat'))}>
        {$t('orderGuide.askButton')}
      </button>
      {#if ['DRAFT','PENDING_REVIEW'].includes(normaliseStatus(order.status))}
        <button type="button" class="entry-link" onclick={() => goto(base + workspaceUrl(orderId,'intake'))}>
          {$t('orderAssistant.openFileAnalysis')}
        </button>
      {/if}
    </div>
  {/if}
{/snippet}

<svelte:head>
    <title>{$t("orderDetail.title_prefix", { default: "Order" })} {orderId} — OMS</title>
</svelte:head>

<div class="order-detail-container">
    {#if loading}
        <div class="loading-state">
            <div class="rf-spinner"></div>
            <p>{$t("orderDetail.loading")}</p>
        </div>
    {:else if !currentOrderVisible}
        <div class="error-state">
            <p class="error-message">{$t("orderDetail.not_found")}</p>
            <Button variant="primary" onclick={() => goto(`${base}/orders`)}>
                {$t("orderDetail.back_to_orders")}
            </Button>
        </div>
    {:else}
        <!-- Header -->
        {#if normaliseStatus(order.status) === 'PENDING_REVIEW' && can($currentUser, 'reviewQueue')}
            <div class="lifecycle-banner">
                <span>
                    {$t('orderDetail.pending_review_msg', {
                      default: 'This draft is awaiting Head of Production review and PO assignment.',
                    })}
                </span>
                <Button variant="primary" onclick={() => goto(`${base}/orders/review`)}>
                    {$t('orderDetail.go_to_review', { default: 'Go to review queue' })}
                </Button>
            </div>
        {/if}
        <header class="order-header">
            <div class="header-left">
                <Button variant="ghost" onclick={() => goto(`${base}/orders`)}>
                    ← {$t("common.back")}
                </Button>
                <div class="header-info">
                    <h1 class="order-title">{order.title}</h1>
                    <OrderBadges {order} size="md" />
                </div>
            </div>
            <div class="header-actions">
                <Button variant="outline" onclick={() => (showQRModal = true)}>
                    {$t("orderDetail.qr_code")}
                </Button>
                {#if mayEditSpecification}
                  <Button
                    variant="primary"
                    onclick={() => goto(base + workspaceUrl(orderId,'details'))}
                  >
                    {$t("common.edit")}
                  </Button>
                {/if}
                {#if (normaliseStatus(order.status) === 'READY_TO_LOAD' || normaliseStatus(order.status) === 'IN_PRODUCTION' || normaliseStatus(order.status) === 'CONFIRMED') && can($currentUser, 'markDispatched')}
                    <Button variant="primary" onclick={dispatchOrder} disabled={lifecycleBusy}>
                        {$t('orderDetail.mark_dispatched', { default: 'Mark dispatched' })}
                    </Button>
                {/if}
                {#if normaliseStatus(order.status) === 'DISPATCHED' && can($currentUser, 'markDispatched')}
                    <Button variant="outline" onclick={archiveOrder} disabled={lifecycleBusy}>
                        {$t('orderDetail.archive', { default: 'Archive' })}
                    </Button>
                {/if}
                {#if can($currentUser, 'voidAndReissue') && normaliseStatus(order.status) !== 'VOIDED' && normaliseStatus(order.status) !== 'ARCHIVED'}
                    <Button variant="ghost" onclick={voidAndReissue} disabled={lifecycleBusy}>
                        {$t('orderDetail.void_reissue', { default: 'Void & reissue' })}
                    </Button>
                {/if}
            </div>
        </header>

        <!-- The original draft production form remains the primary order surface. -->
        {#if draftSheet}
          <section class="order-specification" aria-label={$t('orderSheet.title')}>
            <p class="sheet-status" role="note">
              {#if !mayEditSpecification}<LockKeyhole size={16} aria-hidden="true" />{/if}
              {$t(mayEditSpecification ? 'orderSheet.editHint' : 'orderSheet.locked')}
            </p>
            {#key `${loadedAccountId}:${draftSheet.id}:${draftSheet.updatedAt}`}
              <OrderProfileSheet profiles={draftSheet.profiles} />
            {/key}
          </section>

          <div class="client-delivery-row">
            <section class="sheet-details-card">
              <h2>{$t('orders.new.sections.details')}
                {#if draftSheet.notes?.trim() || draftSheet.rdNotes?.trim()}
                  <a class="sheet-note-badge" href="#order-sheet-notes"><AlertTriangle size={14} aria-hidden="true" /> {$t('orderSheet.note')}</a>
                {/if}
              </h2>
              <div class="sheet-field-grid">
                <label>{$t('orders.new.details.po')}<input readonly value={draftSheet.poNumber || draftSheet.internalRef || '—'} /></label>
                <label>{$t('orders.new.details.priority')}<input readonly value={$t(`orderForm.priority.${draftSheet.priority || 'NORMAL'}`)} /></label>
                <label>{$t('orders.new.details.client')}<input readonly value={draftSheet.clientName || ''} /></label>
                <label>{$t('orderWorkspace.editor.title')}<input readonly value={draftSheet.title || ''} /></label>
                <label>{$t('orders.new.details.deadline')}<input readonly value={draftSheet.deadline?.slice(0, 10) || '—'} /></label>
                <label>{$t('orders.new.details.loading')}<input readonly value={draftSheet.loadingDate?.slice(0, 10) || '—'} /></label>
              </div>
              {#if draftSheet.notes?.trim() || draftSheet.rdNotes?.trim()}
                <div class="sheet-notes" id="order-sheet-notes" tabindex="-1">
                  {#if draftSheet.notes?.trim()}<strong>{$t('orders.new.details.notes')}</strong><p>{draftSheet.notes}</p>{/if}
                  {#if draftSheet.isRd && draftSheet.rdNotes?.trim()}<strong>{$t('orderForm.rdNotes')}</strong><p>{draftSheet.rdNotes}</p>{/if}
                </div>
              {/if}
            </section>
            <section class="sheet-details-card">
              <h2>{$t('orders.new.sections.delivery')}</h2>
              <div class="sheet-field-grid">
                <div class="sheet-field wide-field"><span>{$t('orderWorkspace.editor.deliveryAddress')}</span><div class="readonly-field">{draftSheet.deliveryAddress || '—'}</div></div>
                <label>{$t('orderWorkspace.editor.deliveryContact')}<input readonly value={draftSheet.deliveryContact || ''} /></label>
                <label>{$t('orderWorkspace.editor.deliveryPhone')}<input readonly value={draftSheet.deliveryPhone || ''} /></label>
                <label class="wide-field">{$t('orderWorkspace.editor.deliveryEmail')}<input readonly value={draftSheet.deliveryEmail || ''} /></label>
              </div>
            </section>
          </div>
        {:else}
          <section class="sheet-unavailable" role="alert">
            <h2>{$t('orderSheet.title')}</h2>
            <p>{$t(sheetIssue === 'denied' ? 'orderSheet.accessDenied' : 'orderSheet.loadFailed')}</p>
            <Button variant="outline" onclick={() => void loadOrderData()}>{$t('orderSheet.retry')}</Button>
          </section>
        {/if}

        <section class="supporting-work" aria-label={$t('orderSheet.supportTitle')}>
          <header class="supporting-heading">
            <div><h2>{$t('orderSheet.supportTitle')}</h2><p>{$t('orderSheet.supportHint')}</p></div>
            <div class="workspace-entry-links">
              <button type="button" onclick={() => goto(base + workspaceUrl(orderId,'layers'))} class="entry-link">
                {$t('orderWorkspace.sections.layers')}
              </button>
              {#if mayAskOrderAssistant}
                <button type="button" onclick={() => goto(base + workspaceUrl(orderId,'readiness'))} class="entry-link">
                  {$t('orderWorkspace.sections.readiness')}
                </button>
                <button type="button" onclick={() => goto(base + workspaceUrl(orderId,'revisions'))} class="entry-link">
                  {$t('orderWorkspace.sections.revisions')}
                </button>
              {/if}
            </div>
          </header>
          <Tabs {tabs} bind:activeTab>
            {#if activeTab === "stages"}
                <div class="tab-content">
                    <Card title={$t("orderDetail.tabs.stages")} padding="lg">
                        <p class="stage-progress-context">
                          {stageSummary.total > 0 ? `${stageProgressPercent(order.stages)}% · ` : ''}
                          {$t('productionPacket.progressSummary', { values: { completed: stageSummary.completed, total: stageSummary.total } })}
                        </p>
                        {#if stageSummary.blocked > 0 || stageSummary.rework > 0}
                          <p class="stage-progress-alert" role="status">{$t('productionPacket.progressHeld', { values: { blocked: stageSummary.blocked, rework: stageSummary.rework } })}</p>
                        {/if}
                        <div class="stages-grid">
                            {#each (Array.isArray(order.stages) ? order.stages : []) as stageRow (stageRow.id ?? stageRow.station)}
                                <div class="stage-card"
                                    style="border-left-color: {getStatusColor(String(stageRow.state))}">
                                    <div class="stage-header">
                                        <h4 class="stage-name">{stageRow.station}</h4>
                                        <SemanticBadge badge={stageBadge(stageRow.state)} />
                                    </div>
                                    {#if (stageRow.state==='BLOCKED'||stageRow.state==='REWORK')}
                                      <p class="stage-hint stage-progress-alert" role="status">
                                        {$t('productionPacket.held')}
                                        {#if stageRow.blocked_reason} — {stageRow.blocked_reason}{/if}
                                      </p>
                                    {/if}
                                    {#if mayControlStage($currentUser,stageRow.station) &&
                                        ['CONFIRMED','IN_PRODUCTION'].includes(normaliseStatus(order.status)) &&
                                        !['COMPLETED','SKIPPED','REWORK'].includes(stageRow.state)}
                                        <label class="station-control">
                                          {$t('orderWorkspace.stationAction')}
                                          <select class="stage-status-select" value={stageRow.state}
                                              onchange={e => updateStageStatus(stageRow.station,e.currentTarget.value)}>
                                              <option value="NOT_STARTED">{$t("orderDetail.stage_status.NOT_STARTED")}</option>
                                              <option value="QUEUED">{$t('orderWorkspace.stageQueued')}</option>
                                              <option value="IN_PROGRESS">{$t("orderDetail.stage_status.IN_PROGRESS")}</option>
                                              <option value="BLOCKED">{$t("orderDetail.stage_status.BLOCKED")}</option>
                                          </select>
                                        </label>
                                        <p class="stage-hint">{$t('orderWorkspace.stageCompletionHint')}</p>
                                    {/if}
                                </div>
                            {/each}
                        </div>
                    </Card>
                </div>
            {:else if activeTab === "files"}
                <div class="tab-content">
                    <Card title={$t("orderDetail.uploaded_files")} padding="lg">
                        <OrderFiles {orderId} onChanged={() => { void refreshFileList(); }}
                            canUpload={!!$currentUser && (
                                (['DRAFT','PENDING_REVIEW'].includes(normaliseStatus(order.status)) &&
                                  (can($currentUser,'editOrder') || order.created_by === $currentUser.id)) ||
                                (['CONFIRMED','IN_PRODUCTION','READY_TO_LOAD','ON_HOLD'].includes(normaliseStatus(order.status)) &&
                                  can($currentUser,'addProductionFiles'))
                            )} />
                    </Card>
                </div>
            {:else if activeTab === "consumption"}
                <div class="tab-content">
                    <Card title={$t("orderDetail.tabs.consumption", { default: "Consumption" })} padding="lg">
                        {#if consumptionLoading}
                            <p class="muted">{$t('actions.loading', { default: 'Loading…' })}</p>
                        {:else if consumption.length === 0}
                            <p class="muted">
                                {$t('orderDetail.consumption_empty', {
                                    default: 'No materials have been declared yet.',
                                })}
                            </p>
                        {:else}
                            <table class="consumption-table">
                                <thead>
                                    <tr>
                                        <th>{$t('orderDetail.consumption.station', { default: 'Station' })}</th>
                                        <th>{$t('orderDetail.consumption.sku', { default: 'SKU' })}</th>
                                        <th>{$t('orderDetail.consumption.item', { default: 'Item' })}</th>
                                        <th class="num">{$t('orderDetail.consumption.qty', { default: 'Qty' })}</th>
                                        <th>{$t('orderDetail.consumption.last_logged', { default: 'Last logged' })}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {#each consumption as row}
                                        <tr>
                                            <td>{row.station}</td>
                                            <td class="mono">{row.sku ?? '—'}</td>
                                            <td>{row.name ?? '—'}</td>
                                            <td class="num">{row.total_quantity}</td>
                                            <td>{new Date(row.last_logged_at).toLocaleString()}</td>
                                        </tr>
                                    {/each}
                                </tbody>
                            </table>
                        {/if}
                    </Card>
                </div>
            {:else if activeTab === "chat"}
                <div class="tab-content-full">
                    <ChatContainer {orderId} />
                </div>
            {:else if activeTab === "timeline"}
                <div class="tab-content">
                    <Card title={$t("orderDetail.details")} padding="lg">
                        {#if order.description && order.description !== draftSheet?.notes}
                          <p class="saved-description">{order.description}</p>
                        {/if}
                        <dl class="order-history-details">
                          <div><dt>{$t('orderDetail.order_id')}</dt><dd>{order.id}</dd></div>
                          <div><dt>{$t('common.created')}</dt><dd>{formatTimestamp(order.created_at)}</dd></div>
                          <div><dt>{$t('common.last_updated')}</dt><dd>{formatTimestamp(order.updated_at)}</dd></div>
                          <div><dt>{$t('common.price')}</dt><dd>{order.price == null ? '—' : `€${order.price.toLocaleString()}`}</dd></div>
                          <div><dt>{$t('orderDetail.reworks')}</dt><dd>{order.rework_count ?? '—'}</dd></div>
                        </dl>
                    </Card>
                    <Card title={$t("orderDetail.timeline")} padding="lg">
                        <OrderTimeline {order} {consumption} />
                    </Card>
                </div>
            {/if}
          </Tabs>
        </section>
    {/if}
</div>

<!-- QR Code Modal -->
<Modal bind:open={showQRModal} title={$t("orderDetail.qr_modal_title")} size="sm">
    <QRCodeDisplay {orderId} />
</Modal>

<!-- Generic Confirm Modal -->
{#if confirmModal.open}
<Modal bind:open={confirmModal.open} title={confirmModal.title} size="sm">
    <p class="confirm-body">{confirmModal.body}</p>
    <div class="confirm-actions">
        <Button variant="outline" onclick={() => confirmModal = { ...confirmModal, open: false }}>
            {$t('actions.cancel', { default: 'Cancel' })}
        </Button>
        <Button variant="primary" onclick={runConfirmedAction} disabled={lifecycleBusy}>
            {$t('actions.confirm', { default: 'Confirm' })}
        </Button>
    </div>
</Modal>
{/if}

<!-- Void & Reissue Modal -->
{#if voidModal}
<Modal bind:open={voidModal} title={$t('orderDetail.void_title', { default: 'Void & Reissue' })} size="sm">
    <p class="confirm-body">{$t('orderDetail.void_body', { default: 'This will void the current order and create a new draft. Please provide a reason.' })}</p>
    <label class="void-label">
        {$t('orderDetail.void_reason_label', { default: 'Reason' })}
        <textarea
            class="void-textarea"
            bind:value={voidReason}
            rows="3"
            placeholder={$t('orderDetail.void_reason_placeholder', { default: 'e.g. Client requested changes after sign-off' })}
        ></textarea>
    </label>
    <div class="confirm-actions">
        <Button variant="outline" onclick={() => voidModal = false}>
            {$t('actions.cancel', { default: 'Cancel' })}
        </Button>
        <Button variant="danger" onclick={submitVoidAndReissue} disabled={!voidReason.trim() || lifecycleBusy}>
            {$t('orderDetail.void_confirm_btn', { default: 'Void & Reissue' })}
        </Button>
    </div>
</Modal>
{/if}

<style>
    .order-specification, .supporting-work { min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-md); }
    .sheet-status { display: flex; align-items: flex-start; gap: var(--space-sm); margin: 0; color: var(--ink-secondary); font-size: var(--text-sm); line-height: var(--leading-normal); }
    .sheet-status :global(svg) { flex-shrink: 0; }
    .client-delivery-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-lg); min-width: 0; }
    .sheet-details-card, .sheet-unavailable { min-width: 0; padding: var(--space-lg); border: 1px solid var(--glass-border); border-radius: var(--radius-lg); background: var(--glass-bg-strong); box-shadow: var(--glass-shadow-sm); }
    .sheet-details-card h2 { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-sm); font-size: var(--text-lg); margin: 0 0 var(--space-md); }
    .sheet-field-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-md); min-width: 0; }
    .sheet-field-grid label, .sheet-field { display: grid; gap: var(--space-xs); min-width: 0; font-size: var(--text-sm); color: var(--ink-secondary); }
    .sheet-field-grid input, .readonly-field { box-sizing: border-box; min-width: 0; width: 100%; min-height: var(--control-sm); padding: var(--space-sm); border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-1); color: var(--ink-primary); font: inherit; white-space: pre-wrap; overflow-wrap: anywhere; }
    .sheet-field-grid .wide-field { grid-column: 1 / -1; }
    .sheet-note-badge { display: inline-flex; align-items: center; gap: var(--space-xs); padding: var(--space-xs) var(--space-sm); background: var(--warn-soft); color: var(--ink-primary); border: 1px solid var(--warn); border-radius: var(--radius-sm); font-size: var(--text-sm); text-decoration: none; }
    .sheet-notes { margin-top: var(--space-md); padding: var(--space-md); border: 1px solid var(--warn); border-radius: var(--radius-sm); color: var(--ink-primary); }
    .sheet-notes p { margin: var(--space-xs) 0 var(--space-sm); white-space: pre-wrap; overflow-wrap: anywhere; line-height: var(--leading-normal); }
    .sheet-notes:focus, .sheet-note-badge:focus-visible, .sheet-field-grid input:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .saved-description { white-space: pre-wrap; overflow-wrap: anywhere; color: var(--ink-primary); }
    .order-history-details { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 15rem), 1fr)); gap: var(--space-md); margin: 0; }
    .order-history-details div { min-width: 0; }
    .order-history-details dt { font-size: var(--text-sm); color: var(--ink-secondary); }
    .order-history-details dd { margin: var(--space-xs) 0 0; overflow-wrap: anywhere; color: var(--ink-primary); }
    .supporting-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-md); flex-wrap: wrap; }
    .supporting-heading h2 { font-size: var(--text-lg); margin: 0; }
    .supporting-heading p { margin: var(--space-xs) 0 0; color: var(--ink-secondary); font-size: var(--text-sm); }
    @media(max-width:900px) { .client-delivery-row { grid-template-columns: minmax(0, 1fr); } }
    @media(max-width:600px) { .sheet-field-grid { grid-template-columns: minmax(0, 1fr); } }
  .detail-assistant-tools { display:flex;flex-direction:column;gap:12px;min-width:0; }
  .detail-assistant-tools p { margin:0;font-size:13px;line-height:1.5;color:var(--ink-secondary); }
    .station-control{display:grid;gap:6px;font-size:11px;margin-top:10px}
    .stage-hint{font-size:11px;color:var(--text-muted);margin:8px 0 0}
    .stage-progress-context{font-size:11px;color:var(--text-muted)}
    .stage-progress-alert{color:var(--error);font-size:12px;overflow-wrap:anywhere}

    .workspace-entry-links { display: flex; gap: var(--space-sm); flex-wrap: wrap; align-items: center; }
    .entry-link { display: inline-flex; align-items: center; justify-content: center; cursor: pointer;
      min-height: var(--control-size); border: 1px solid var(--border); border-radius: var(--radius-sm);
      padding: var(--space-sm) var(--space-md); color: var(--ink-secondary); background: var(--bg-1);
      font: inherit; font-size: var(--text-sm); font-weight: 600; }
    .entry-link:hover { background: var(--bg-2); color: var(--ink-primary); }
    .entry-link:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }

    .order-detail-container {
        padding: var(--space-lg) 0;
        max-width: 100%;
        margin: 0 auto;
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
    }

    .loading-state,
    .error-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 4rem 2rem;
        gap: 1rem;
    }

    .error-message {
        font-size: var(--text-lg);
        color: var(--error);
        margin: 0;
    }

    .confirm-body {
        margin: 0 0 var(--space-lg);
        color: var(--ink-secondary);
        line-height: 1.5;
    }

    .confirm-actions {
        display: flex;
        justify-content: flex-end;
        gap: var(--space-sm);
    }

    .void-label {
        display: flex;
        flex-direction: column;
        gap: var(--space-xs);
        font-size: var(--text-sm);
        font-weight: 600;
        margin-bottom: var(--space-lg);
    }

    .void-textarea {
        padding: var(--space-sm) var(--space-md);
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        background: var(--bg-0);
        color: var(--text);
        font-size: var(--text-sm);
        font-family: inherit;
        resize: vertical;
    }
    .void-textarea:focus {
        outline: none;
        border-color: var(--brand);
        box-shadow: var(--focus-ring);
    }

    .consumption-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 14px;
    }
    .consumption-table th,
    .consumption-table td {
        text-align: left;
        padding: 8px 10px;
        border-bottom: 1px solid var(--glass-border);
    }
    .consumption-table th {
        font-weight: 600;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--ink-tertiary);
    }
    .consumption-table .num { text-align: right; font-variant-numeric: tabular-nums; }
    .consumption-table .mono { font-family: var(--font-mono, ui-monospace, monospace); font-size: 12px; }
    .muted { color: var(--ink-tertiary); }

    .lifecycle-banner {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 12px 16px;
        border-radius: var(--radius-md, 16px);
        background: color-mix(in oklab, #ff9500 14%, transparent);
        border: 1px solid color-mix(in oklab, #ff9500 30%, transparent);
        color: var(--ink-primary);
        font-size: 14px;
        flex-wrap: wrap;
    }

    .order-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 1rem;
        flex-wrap: wrap;
    }

    .header-left {
        display: flex;
        align-items: center;
        gap: 1rem;
        flex: 1;
        min-width: 0;
    }

    .header-info {
        display: flex;
        align-items: center;
        gap: 1rem;
        flex: 1;
        min-width: 0;
    }

    .order-title {
        font-size: 1.75rem;
        font-weight: 700;
        margin: 0;
        color: var(--color-text, var(--ink-primary));
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .header-actions {
        display: flex;
        gap: 0.75rem;
    }

    .tab-content {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
        padding: 1.5rem 0;
    }

    .tab-content-full {
        padding: 1.5rem 0;
        height: max(52rem, 75dvh);
    }

    .stages-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        gap: 1rem;
    }

    .stage-card {
        padding: 1rem;
        border: 1px solid var(--color-border, var(--border));
        border-left-width: 4px;
        border-radius: 0.375rem;
        background: white;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
    }

    .stage-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .stage-name {
        font-size: 1rem;
        font-weight: 600;
        margin: 0;
        color: var(--color-text, var(--ink-primary));
    }

    .stage-status-select {
        padding: 0.5rem;
        border: 1px solid var(--color-border, var(--border));
        border-radius: 0.375rem;
        font-size: 0.875rem;
        background: white;
        cursor: pointer;
        width: 100%;
    }

    @media (max-width: 768px) {
        .order-detail-container {
            padding: 1rem;
        }

        .order-header {
            flex-direction: column;
            align-items: stretch;
        }

        .header-left {
            flex-direction: column;
            align-items: stretch;
        }

        .header-actions {
            width: 100%;
        }

        .stages-grid {
            grid-template-columns: 1fr;
        }
    }

    /* LUMIGRID R03: content first, semantic state and accessible contrast. */
    .order-detail-container {max-width:100%;padding:var(--space-lg) 0 var(--space-2xl);gap:var(--space-lg);min-width:0}
    .order-header {position:relative;padding:var(--space-xl);background:var(--glass-bg-strong);border:1px solid var(--glass-border);border-radius:var(--radius-lg);gap:var(--space-md)}
    .order-header::before {content:'';position:absolute;top:0;left:0;width:92px;height:2px;background:linear-gradient(90deg,var(--brand),var(--brand-2),transparent)}
    .header-info {min-width:0;flex-wrap:wrap;gap:var(--space-sm)}
    .order-title {font-size:clamp(1.5rem,2.7vw,2rem);letter-spacing:var(--tracking-tight);overflow:visible;white-space:normal;overflow-wrap:anywhere;color:var(--ink-primary)}
    .header-actions {flex-wrap:wrap;gap:var(--space-xs)}
    .header-actions :global(button) {min-height:42px;border-radius:var(--radius-sm)}
    .entry-link {min-height:42px;background:var(--bg-1);border-radius:var(--radius-sm);color:var(--ink-secondary)}
    .entry-link:hover {background:var(--bg-2);color:var(--ink-primary)}
    .entry-link:focus-visible,.stage-status-select:focus-visible {outline:2px solid var(--focus);outline-offset:2px}
    .stage-card {background:var(--bg-1);border:1px solid var(--border);border-left:3px solid var(--brand);border-radius:var(--radius-md);min-width:0}
    .stage-name {color:var(--ink-primary)}
    .stage-status-select {background:var(--bg-2);color:var(--ink-primary);border-color:var(--border);min-height:44px;border-radius:var(--radius-sm)}
    @media(max-width:670px){.order-detail-container {padding:var(--space-sm) 0 var(--space-xl)}.order-header {padding:var(--space-md)}.entry-link {min-width:0}.header-actions :global(button) {flex:1 1 auto}}
    @media(prefers-reduced-transparency:reduce){.order-header {background:var(--bg-1)}}
</style>
