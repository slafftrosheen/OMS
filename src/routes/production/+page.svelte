<!-- src/routes/production/+page.svelte -->
<script lang="ts">
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';
    import StationBoard from '$lib/components/production/StationBoard.svelte';
    import QRScanner from '$lib/components/qr/QRScanner.svelte';
    import Button from '$lib/components/ui/Button.svelte';

    const STATIONS = ['CAD', 'CNC', 'EDGE', 'ASSEMBLY', 'PAINT', 'PACKAGING', 'DELIVERY'];

    let stationOrders: Record<string, any[]> = $state({});
    let loading = $state(true);
    let showScanner = $state(false);

    async function loadProductionData() {
        loading = true;

        try {
            const response = await fetch('/api/production/board');
            const data = await response.json();

            if (data.success) {
                stationOrders = data.stations;
            }
        } catch (error) {
            console.error('Failed to load production data:', error);
        } finally {
            loading = false;
        }
    }

    async function handleStatusChange(event: CustomEvent) {
        const { orderId, station, status } = event.detail;

        try {
            await fetch(`/api/orders/${orderId}/stages`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ stage: station, status })
            });

            // Reload data
            await loadProductionData();
        } catch (error) {
            console.error('Failed to update status:', error);
        }
    }

    function handleOrderClick(event: CustomEvent) {
        goto(`/orders/${event.detail.orderId}`);
    }

    function handleQRScan(event: CustomEvent) {
        const { orderId, station } = event.detail;

        if (orderId) {
            goto(`/orders/${orderId}`);
        } else if (station) {
            // Scroll to station
            document.getElementById(`station-${station}`)?.scrollIntoView({ behavior: 'smooth' });
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
    <title>Production Board - OMS</title>
</svelte:head>

<div class="production-container">
    <header class="production-header">
        <div>
            <h1 class="page-title">Production Board</h1>
            <p class="page-subtitle">Real-time production workflow</p>
        </div>
        <div class="header-actions">
            <Button variant="outline" on:click={() => showScanner = true}>
                📱 Scan QR
            </Button>
            <Button variant="primary" on:click={loadProductionData}>
                🔄 Refresh
            </Button>
        </div>
    </header>

    {#if loading}
        <div class="loading-state">
            <div class="spinner"></div>
            <p>Loading production board...</p>
        </div>
    {:else}
        <div class="stations-grid">
            {#each STATIONS as station}
                <div id="station-{station}">
                    <StationBoard
                        {station}
                        orders={stationOrders[station] || []}
                        on:orderClick={handleOrderClick}
                        on:statusChange={handleStatusChange}
                    />
                </div>
            {/each}
        </div>
    {/if}
</div>

<QRScanner bind:open={showScanner} on:scan={handleQRScan} />

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
        color: var(--color-text, #111827);
    }

    .page-subtitle {
        font-size: 1rem;
        color: var(--color-gray-600, #6b7280);
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

    .spinner {
        width: 3rem;
        height: 3rem;
        border: 4px solid var(--color-gray-200, #e5e7eb);
        border-top-color: var(--color-primary, #0066cc);
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
        to { transform: rotate(360deg); }
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