<!-- src/routes/production/+page.svelte -->
<script lang="ts">
    import { ALL_STATIONS } from '$lib/order/workflow';
    import { onMount } from "svelte";
    import { goto } from "$app/navigation";
    import { t } from "svelte-i18n";
    import StationBoard from "$lib/components/production/StationBoard.svelte";
    import QRScanner from "$lib/components/qr/QRScanner.svelte";
    import Button from "$lib/components/ui/Button.svelte";
    import { buildStagePatch } from "$lib/order/stage-contract";
    import { notifyError } from "$lib/notify/toast";

    const STATIONS = ALL_STATIONS;

    let stationOrders: Record<string, any[]> = $state({});
    let boardError = $state<string | null>(null);
    let loading = $state(true);
    let showScanner = $state(false);

    async function loadProductionData() {
        loading = true;

        try {
            const response = await fetch("/api/production/board");
            if (!response.ok) {
                throw new Error(`Board fetch failed: HTTP ${response.status}`);
            }
            const data = await response.json();

            if (data.success) {
                stationOrders = data.stations;
            }
        } catch (error) {
            console.error("Failed to load production data:", error);
            boardError = error instanceof Error ? error.message : "Failed to load production board";
        } finally {
            loading = false;
        }
    }

    async function handleStatusChange(data: {
        orderId: string;
        station: string;
        status: string;
    }) {
        const { orderId, station, status } = data;

        try {
            // Handler contract: PATCH ?station=<station> with body {state}.
            const patch = buildStagePatch(station, status);
            const res = await fetch(`/api/orders/${orderId}/stages${patch.url}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(patch.body),
            });

            if (!res.ok) {
                const payload = await res.json().catch(() => ({}));
                notifyError(payload?.error || payload?.message || `Failed to update ${station} stage`);
                return;
            }

            // Reload data
            await loadProductionData();
        } catch (error) {
            console.error("Failed to update status:", error);
            notifyError(`Failed to update ${station} stage`);
        }
    }

    function handleOrderClick(data: { orderId: string }) {
        goto(`/orders/${data.orderId}`);
    }

    function handleQRScan(data: { orderId?: string; station?: string }) {
        const { orderId, station } = data;

        if (orderId) {
            goto(`/orders/${orderId}`);
        } else if (station) {
            // Scroll to station
            document
                .getElementById(`station-${station}`)
                ?.scrollIntoView({ behavior: "smooth" });
        }
    }

    onMount(() => {
        loadProductionData();

        // Auto-refresh every 30 seconds
        const interval = setInterval(() => {
            loadProductionData();
        }, 30000);

        return () => clearInterval(interval);
    });
</script>

<svelte:head>
    <title>{$t('production.title')} — OMS</title>
</svelte:head>

<div class="production-container">
    <header class="production-header">
        <div>
            <h1 class="page-title">{$t('production.title')}</h1>
            <p class="page-subtitle">{$t('production.subtitle')}</p>
        </div>
        <div class="header-actions">
            <Button variant="outline" onclick={() => (showScanner = true)}>
                {$t('stationView.scan_qr')}
            </Button>
            <Button variant="primary" onclick={loadProductionData}>
                {$t('common.refresh')}
            </Button>
        </div>
    </header>

    {#if loading}
        <div class="loading-state">
            <div class="rf-spinner"></div>
            <p>{$t('production.loading', { default: 'Loading production board…' })}</p>
        </div>
    {:else if boardError}
        <div class="error-state" role="alert">
            <p>{boardError}</p>
            <Button variant="secondary" onclick={loadProductionData}>
                {$t('common.retry', { default: 'Retry' })}
            </Button>
        </div>
    {:else}
        <div class="stations-grid">
            {#each STATIONS as station}
                <div id="station-{station}">
                    <StationBoard
                        {station}
                        orders={stationOrders[station] || []}
                        onorderclick={handleOrderClick}
                        onstatuschange={handleStatusChange}
                    />
                </div>
            {/each}
        </div>
    {/if}
</div>

<QRScanner bind:open={showScanner} onscan={handleQRScan} />

<style>
    .production-container {
        padding: 2rem;
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
        height: 100vh;
    }

    .production-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 1rem;
    }

    .page-title {
        font-size: 2rem;
        font-weight: 700;
        margin: 0 0 0.25rem 0;
        color: var(--color-text, var(--ink-primary));
    }

    .page-subtitle {
        font-size: 1rem;
        color: var(--color-gray-600, var(--ink-tertiary));
        margin: 0;
    }

    .header-actions {
        display: flex;
        gap: 0.75rem;
    }

    .loading-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        flex: 1;
        gap: 1rem;
    }

    .error-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        flex: 1;
        gap: 1rem;
        color: var(--danger, #b3261e);
    }

    .stations-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
        gap: 1.5rem;
        flex: 1;
        overflow-y: auto;
        padding-bottom: 2rem;
    }

    @media (max-width: 768px) {
        .production-container {
            padding: 1rem;
        }

        .production-header {
            flex-direction: column;
            align-items: stretch;
        }

        .header-actions {
            width: 100%;
        }

        .stations-grid {
            grid-template-columns: 1fr;
        }
    }
</style>
