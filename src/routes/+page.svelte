<!-- src/routes/+page.svelte -->
<script lang="ts">
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';
    import { currentProfile } from '$lib/stores/auth';
    // Removed broken import: import { orders, orderStats } from '$lib/stores/orders';
    import StatCard from '$lib/components/analytics/StatCard.svelte';
    import OrderCard from '$lib/components/orders/OrderCard.svelte';
    import LineChart from '$lib/components/analytics/LineChart.svelte';
    import Button from '$lib/components/ui/Button.svelte';
    import Card from '$lib/components/ui/Card.svelte';

    let recentOrders: any[] = [];
    let orderStats = {
        total: 0,
        active: 0,
        completed: 0,
        overdue: 0
    };
    let chartData = {
        labels: [] as string[],
        datasets: []
    };
    let loading = true;

    async function loadDashboardData() {
        loading = true;

        try {
            // Load recent orders
            const response = await fetch('/api/orders?limit=5&sort_by=created_at&sort_order=desc');
            const result = await response.json();

            // Handle new API format
            if (result.data && Array.isArray(result.data)) {
                recentOrders = result.data;
            } else {
                recentOrders = [];
            }

            // Load analytics data
            try {
                const analyticsResponse = await fetch('/api/orders/analytics?timeframe=30d');
                if (analyticsResponse.ok) {
                    const analyticsData = await analyticsResponse.json();

                    // Calculate stats from analytics data
                    if (analyticsData.orders_by_status) {
                        const byStatus = analyticsData.orders_by_status;
                        orderStats.total = byStatus.reduce((acc: number, curr: any) => acc + curr.count, 0);
                        orderStats.active = byStatus
                            .filter((s: any) => ['active', 'in_progress', 'draft'].includes(s.status.toLowerCase()))
                            .reduce((acc: number, curr: any) => acc + curr.count, 0);
                        orderStats.completed = byStatus
                            .filter((s: any) => s.status.toLowerCase() === 'completed')
                            .reduce((acc: number, curr: any) => acc + curr.count, 0);
                    }

                    if (analyticsData.orders_at_risk) {
                        orderStats.overdue = analyticsData.orders_at_risk.length;
                    }

                    // Chart data (using completion trend as a proxy for revenue/activity for now)
                    if (analyticsData.completion_trend) {
                        chartData = {
                            labels: analyticsData.completion_trend.map((d: any) => d.date),
                            datasets: [
                                {
                                    label: 'Completed Orders',
                                    data: analyticsData.completion_trend.map((d: any) => d.count),
                                    borderColor: '#10b981',
                                    backgroundColor: 'rgba(16, 185, 129, 0.1)'
                                }
                            ]
                        };
                    }
                }
            } catch (analyticsError) {
                console.log('Analytics data not available:', analyticsError);
            }
        } catch (error) {
            console.error('Failed to load dashboard data:', error);
        } finally {
            loading = false;
        }
    }

    function handleOrderClick(event: CustomEvent) {
        goto(`/orders/${event.detail.id}`);
    }

    onMount(() => {
        loadDashboardData();
    });
</script>

<svelte:head>
    <title>Dashboard - OMS</title>
</svelte:head>

<div class="dashboard-container">
    <header class="dashboard-header">
        <div>
            <h1 class="page-title">Dashboard</h1>
            <p class="page-subtitle">Welcome back, {$currentProfile?.username || 'User'}!</p>
        </div>
        <Button variant="primary" on:click={() => goto('/orders')}>
            + New Order
        </Button>
    </header>

    {#if loading}
        <div class="loading-state">
            <div class="spinner"></div>
            <p>Loading dashboard...</p>
        </div>
    {:else}
        <!-- Stats Grid -->
        <div class="stats-grid">
            <StatCard
                title="Total Orders"
                value={orderStats.total}
                icon="📋"
                variant="default"
            />
            <StatCard
                title="Active Orders"
                value={orderStats.active}
                icon="⚡"
                variant="primary"
                trend={{ value: 0, direction: 'up' }}
            />
            <StatCard
                title="Completed"
                value={orderStats.completed}
                icon="✅"
                variant="success"
            />
            <StatCard
                title="Overdue"
                value={orderStats.overdue}
                icon="⚠️"
                variant="danger"
                trend={{ value: 0, direction: 'down' }}
            />
        </div>

        <!-- Charts Section -->
        {#if chartData.datasets.length > 0}
        <div class="charts-section">
            <Card title="Orders Overview" padding="lg">
                <LineChart data={chartData} title="Last 30 Days" height={300} />
            </Card>
        </div>
        {/if}

        <!-- Recent Orders -->
        <section class="recent-orders">
            <div class="section-header">
                <h2 class="section-title">Active Orders</h2>
                <Button variant="ghost" on:click={() => goto('/orders')}>
                    View All →
                </Button>
            </div>

            {#if recentOrders.length === 0}
                <Card>
                    <div class="empty-state">
                        <p class="empty-message">No active orders</p>
                        <Button variant="primary" on:click={() => goto('/orders')}>
                            Create First Order
                        </Button>
                    </div>
                </Card>
            {:else}
                <div class="orders-grid">
                    {#each recentOrders as order (order.id)}
                        <OrderCard {order} on:click={handleOrderClick} showActions={false} />
                    {/each}
                </div>
            {/if}
        </section>

        <!-- Quick Actions -->
        <section class="quick-actions">
            <h2 class="section-title">Quick Actions</h2>
            <div class="actions-grid">
                <button class="action-card" on:click={() => goto('/orders')}>
                    <span class="action-icon">➕</span>
                    <h3 class="action-title">New Order</h3>
                    <p class="action-description">Create a new production order</p>
                </button>

                <button class="action-card" on:click={() => goto('/production')}>
                    <span class="action-icon">🏭</span>
                    <h3 class="action-title">Production Board</h3>
                    <p class="action-description">View production workflow</p>
                </button>

                <button class="action-card" on:click={() => goto('/materials')}>
                    <span class="action-icon">📦</span>
                    <h3 class="action-title">Materials</h3>
                    <p class="action-description">Manage inventory</p>
                </button>

                <button class="action-card" on:click={() => goto('/analytics')}>
                    <span class="action-icon">📊</span>
                    <h3 class="action-title">Analytics</h3>
                    <p class="action-description">View reports</p>
                </button>
            </div>
        </section>
    {/if}
</div>

<style>
    .dashboard-container {
        padding: 2rem;
        max-width: 1400px;
        margin: 0 auto;
        display: flex;
        flex-direction: column;
        gap: 2rem;
    }

    .dashboard-header {
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

    .loading-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 4rem 2rem;
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

    .stats-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        gap: 1.5rem;
    }

    .charts-section {
        display: grid;
        gap: 1.5rem;
    }

    .recent-orders {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    .section-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .section-title {
        font-size: 1.5rem;
        font-weight: 600;
        margin: 0;
        color: var(--color-text, #111827);
    }

    .orders-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
        gap: 1rem;
    }

    .empty-state {
        text-align: center;
        padding: 3rem 2rem;
    }

    .empty-message {
        font-size: 1.125rem;
        color: var(--color-gray-600, #6b7280);
        margin: 0 0 1rem 0;
    }

    .quick-actions {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    .actions-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 1rem;
    }

    .action-card {
        background: white;
        border: 2px solid var(--color-border, #e5e7eb);
        border-radius: 0.5rem;
        padding: 1.5rem;
        text-align: center;
        cursor: pointer;
        transition: all 0.2s ease;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
    }

    .action-card:hover {
        border-color: var(--color-primary, #0066cc);
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        transform: translateY(-2px);
    }

    .action-icon {
        font-size: 2.5rem;
    }

    .action-title {
        font-size: 1.125rem;
        font-weight: 600;
        margin: 0;
        color: var(--color-text, #111827);
    }

    .action-description {
        font-size: 0.875rem;
        color: var(--color-gray-600, #6b7280);
        margin: 0;
    }

    @media (max-width: 768px) {
        .dashboard-container {
            padding: 1rem;
        }

        .dashboard-header {
            flex-direction: column;
            align-items: stretch;
        }

        .stats-grid {
            grid-template-columns: repeat(2, 1fr);
        }
        .orders-grid {
            grid-template-columns: 1fr;
        }

        .actions-grid {
            grid-template-columns: repeat(2, 1fr);
        }
    }
</style>