<!-- src/routes/orders/[id]/+page.svelte -->
<script lang="ts">
    import { page } from "$app/state";
    import { goto } from "$app/navigation";
    import { onMount } from "svelte";
    import { t } from "svelte-i18n";
    import Button from "$lib/components/ui/Button.svelte";
    import Card from "$lib/components/ui/Card.svelte";
    import Badge from "$lib/components/ui/Badge.svelte";
    import Tabs from "$lib/components/ui/Tabs.svelte";
    import ChatContainer from "$lib/components/chat/ChatContainer.svelte";
    import FileUpload from "$lib/components/files/FileUpload.svelte";
    import FileList from "$lib/components/files/FileList.svelte";
    import QRCodeDisplay from "$lib/components/qr/QRCodeDisplay.svelte";
    import Modal from "$lib/components/ui/Modal.svelte";
    import { currentUser } from "$lib/auth/authState.svelte";
    import { can, normaliseStatus, ORDER_STATUS_LABELS } from "$lib/auth/permission-utils";

    let orderId = $derived(page.params.id);

    let order: any = $state(null);
    let files: any[] = $state([]);
    let loading = $state(true);
    let showQRModal = $state(false);
    let activeTab = $state("overview");

    let tabs = $derived([
        { id: "overview",  label: $t("orderDetail.tabs.overview") },
        { id: "stages",    label: $t("orderDetail.tabs.stages") },
        { id: "files",     label: $t("orderDetail.tabs.files") },
        { id: "chat",      label: $t("orderDetail.tabs.chat") },
        { id: "timeline",  label: $t("orderDetail.tabs.timeline") },
    ]);

    async function loadOrderData() {
        loading = true;

        try {
            const [orderRes, filesRes] = await Promise.all([
                fetch(`/api/orders/${orderId}`),
                fetch(`/api/files?order_id=${orderId}`),
            ]);

            const orderData = await orderRes.json();
            const filesData = await filesRes.json();

            if (orderData.success) {
                order = orderData.order;
            }

            if (filesData.success) {
                files = filesData.files;
            }
        } catch (error) {
            console.error("Failed to load order:", error);
        } finally {
            loading = false;
        }
    }

    async function updateStageStatus(stage: string, status: string) {
        try {
            const response = await fetch(`/api/orders/${orderId}/stages`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ stage, status }),
            });

            if (response.ok) {
                order.stages[stage] = status;
                order = order; // Trigger reactivity
            }
        } catch (error) {
            console.error("Failed to update stage:", error);
        }
    }

    function handleFileUploaded(file: { id: string } & Record<string, unknown>) {
        files = [...files, file] as typeof files;
    }

    function handleDeleteFile(file: { id: string }) {
        files = files.filter((f) => f.id !== file.id);
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

    onMount(() => {
        loadOrderData();
    });
</script>

<svelte:head>
    <title>{$t("orderDetail.title_prefix", { default: "Order" })} {orderId} — OMS</title>
</svelte:head>

<div class="order-detail-container">
    {#if loading}
        <div class="loading-state">
            <div class="rf-spinner"></div>
            <p>{$t("orderDetail.loading")}</p>
        </div>
    {:else if !order}
        <div class="error-state">
            <p class="error-message">{$t("orderDetail.not_found")}</p>
            <Button variant="primary" onclick={() => goto("/orders")}>
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
                <Button variant="primary" onclick={() => goto('/orders/review')}>
                    {$t('orderDetail.go_to_review', { default: 'Go to review queue' })}
                </Button>
            </div>
        {/if}
        <header class="order-header">
            <div class="header-left">
                <Button variant="ghost" onclick={() => goto("/orders")}>
                    ← {$t("common.back")}
                </Button>
                <div class="header-info">
                    <h1 class="order-title">{order.title}</h1>
                    <Badge
                        variant={normaliseStatus(order.status) === 'CONFIRMED' || normaliseStatus(order.status) === 'IN_PRODUCTION' ? 'info' : normaliseStatus(order.status) === 'DISPATCHED' || normaliseStatus(order.status) === 'ARCHIVED' ? 'success' : 'warning'}
                    >
                        {ORDER_STATUS_LABELS[normaliseStatus(order.status)]}
                    </Badge>
                </div>
            </div>
            <div class="header-actions">
                <Button variant="outline" onclick={() => (showQRModal = true)}>
                    {$t("orderDetail.qr_code")}
                </Button>
                <Button
                    variant="primary"
                    onclick={() => goto(`/orders/${orderId}/edit`)}
                >
                    {$t("common.edit")}
                </Button>
            </div>
        </header>

        <!-- Quick Info Cards -->
        <div class="info-cards">
            <Card padding="md">
                <div class="info-card-content">
                    <span class="info-label">{$t("common.client")}</span>
                    <span class="info-value">{order.client}</span>
                </div>
            </Card>
            <Card padding="md">
                <div class="info-card-content">
                    <span class="info-label">{$t("common.due_date")}</span>
                    <span class="info-value"
                        >{new Date(order.due_date).toLocaleDateString()}</span
                    >
                </div>
            </Card>
            <Card padding="md">
                <div class="info-card-content">
                    <span class="info-label">{$t("common.price")}</span>
                    <span class="info-value"
                        >€{order.price?.toLocaleString() || "—"}</span
                    >
                </div>
            </Card>
            <Card padding="md">
                <div class="info-card-content">
                    <span class="info-label">{$t("common.progress")}</span>
                    <span class="info-value">
                        {Math.round(
                            (Object.values(order.stages).filter(
                                (s) => s === "COMPLETED",
                            ).length /
                                Object.keys(order.stages).length) *
                                100,
                        )}%
                    </span>
                </div>
            </Card>
        </div>

        <!-- Tabs Content -->
        <Tabs {tabs} bind:activeTab>
            {#if activeTab === "overview"}
                <div class="tab-content">
                    <Card title={$t("orderDetail.description")} padding="lg">
                        <p class="description-text">
                            {order.description || $t("common.no_description")}
                        </p>
                    </Card>

                    <Card title={$t("orderDetail.details")} padding="lg">
                        <dl class="details-list">
                            <div class="detail-item">
                                <dt>{$t("orderDetail.order_id")}</dt>
                                <dd>{order.id}</dd>
                            </div>
                            <div class="detail-item">
                                <dt>{$t("common.created")}</dt>
                                <dd>
                                    {new Date(
                                        order.created_at,
                                    ).toLocaleString()}
                                </dd>
                            </div>
                            <div class="detail-item">
                                <dt>{$t("common.last_updated")}</dt>
                                <dd>
                                    {new Date(
                                        order.updated_at,
                                    ).toLocaleString()}
                                </dd>
                            </div>
                            <div class="detail-item">
                                <dt>{$t("orderDetail.reworks")}</dt>
                                <dd>{order.rework_count}</dd>
                            </div>
                        </dl>
                    </Card>
                </div>
            {:else if activeTab === "stages"}
                <div class="tab-content">
                    <Card title={$t("orderDetail.tabs.stages")} padding="lg">
                        <div class="stages-grid">
                            {#each Object.entries(order.stages) as [stage, status]}
                                <div
                                    class="stage-card"
                                    style="border-left-color: {getStatusColor(
                                        String(status),
                                    )}"
                                >
                                    <div class="stage-header">
                                        <h4 class="stage-name">{stage}</h4>
                                        <Badge
                                            variant={status === "COMPLETED"
                                                ? "success"
                                                : "info"}
                                            size="sm"
                                        >
                                            {$t(`orderDetail.stage_status.${status}`, { default: String(status).replace("_", " ") })}
                                        </Badge>
                                    </div>
                                    <select
                                        class="stage-status-select"
                                        value={status}
                                        onchange={(e) =>
                                            updateStageStatus(
                                                stage,
                                                e.currentTarget.value,
                                            )}
                                    >
                                        <option value="NOT_STARTED">{$t("orderDetail.stage_status.NOT_STARTED")}</option>
                                        <option value="IN_PROGRESS">{$t("orderDetail.stage_status.IN_PROGRESS")}</option>
                                        <option value="COMPLETED">{$t("orderDetail.stage_status.COMPLETED")}</option>
                                        <option value="BLOCKED">{$t("orderDetail.stage_status.BLOCKED")}</option>
                                        <option value="SKIPPED">{$t("orderDetail.stage_status.SKIPPED")}</option>
                                    </select>
                                </div>
                            {/each}
                        </div>
                    </Card>
                </div>
            {:else if activeTab === "files"}
                <div class="tab-content">
                    <Card title={$t("orderDetail.upload_files")} padding="lg">
                        <FileUpload
                            {orderId}
                            onuploaded={handleFileUploaded}
                        />
                    </Card>

                    <Card title={$t("orderDetail.uploaded_files")} padding="lg">
                        <FileList {files} ondelete={handleDeleteFile} />
                    </Card>
                </div>
            {:else if activeTab === "chat"}
                <div class="tab-content-full">
                    <ChatContainer {orderId} />
                </div>
            {:else if activeTab === "timeline"}
                <div class="tab-content">
                    <Card title={$t("orderDetail.timeline")} padding="lg">
                        <p class="coming-soon">
                            {$t("orderDetail.timeline_coming_soon")}
                        </p>
                    </Card>
                </div>
            {/if}
        </Tabs>
    {/if}
</div>

<!-- QR Code Modal -->
<Modal bind:open={showQRModal} title={$t("orderDetail.qr_modal_title")} size="sm">
    <QRCodeDisplay {orderId} />
</Modal>

<style>
    .order-detail-container {
        padding: 2rem;
        max-width: 1400px;
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

    .info-cards {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 1rem;
    }

    .info-card-content {
        display: flex;
        flex-direction: column;
        gap: 0.375rem;
    }

    .info-label {
        font-size: 0.875rem;
        font-weight: 500;
        color: var(--color-gray-600, var(--ink-tertiary));
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .info-value {
        font-size: 1.5rem;
        font-weight: 700;
        color: var(--color-text, var(--ink-primary));
    }

    .tab-content {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
        padding: 1.5rem 0;
    }

    .tab-content-full {
        padding: 1.5rem 0;
        min-height: 600px;
    }

    .description-text {
        margin: 0;
        line-height: 1.6;
        color: var(--color-gray-700, var(--ink-secondary));
    }

    .details-list {
        display: grid;
        gap: 1rem;
    }

    .detail-item {
        display: grid;
        grid-template-columns: 150px 1fr;
        gap: 1rem;
        padding: 0.75rem 0;
        border-bottom: 1px solid var(--color-border, var(--border));
    }

    .detail-item:last-child {
        border-bottom: none;
    }

    .detail-item dt {
        font-weight: 600;
        color: var(--color-gray-700, var(--ink-secondary));
    }

    .detail-item dd {
        margin: 0;
        color: var(--color-gray-600, var(--ink-tertiary));
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

    .coming-soon {
        text-align: center;
        padding: 2rem;
        color: var(--color-gray-500, var(--muted));
        font-style: italic;
        margin: 0;
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

        .info-cards {
            grid-template-columns: repeat(2, 1fr);
        }

        .stages-grid {
            grid-template-columns: 1fr;
        }

        .detail-item {
            grid-template-columns: 1fr;
        }
    }
</style>
