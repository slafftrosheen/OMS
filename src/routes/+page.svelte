<!-- src/routes/+page.svelte -->
<script lang="ts">
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';
    import { currentUser } from '$lib/auth/authState.svelte';
    import { ordersStore as orders, orderStats } from '$lib/stores/orders';
    import StatCard from '$lib/components/analytics/StatCard.svelte';
    import OrderCard from '$lib/components/orders/OrderCard.svelte';
    import LineChart from '$lib/components/analytics/LineChart.svelte';
    import Button from '$lib/components/ui/Button.svelte';
    import Card from '$lib/components/ui/Card.svelte';
    import { tokenColor } from '$lib/utils/tokenColor';
    import { t } from 'svelte-i18n';

    let recentOrders: any[] = $state([]);
    let chartData = $state({
        labels: [] as string[],
        datasets: []
    });
    let loading = $state(true);

    async function loadDashboardData() {
        loading = true;

        try {
            // Load recent orders - handle paginated response
            const response = await fetch('/api/orders?limit=5&sort=created_at&direction=desc');
            const result = await response.json();
            
            // Handle both paginated format { data: [], pagination: {} } and legacy format { success: true, orders: [] }
            let ordersData = [];
            if (Array.isArray(result.data)) {
                // Paginated response format
                ordersData = result.data;
            } else if (Array.isArray(result.orders)) {
                // Legacy format
                ordersData = result.orders;
            } else if (Array.isArray(result)) {
                // Direct array format
                ordersData = result;
            }
            
            if (ordersData && ordersData.length > 0) {
                orders.setOrders(ordersData);
                recentOrders = ordersData.slice(0, 5);
            } else {
                orders.setOrders([]);
                recentOrders = [];
            }

            // Load analytics data
            try {
                const analyticsResponse = await fetch('/api/analytics/dashboard?preset=month');
                if (analyticsResponse.ok) {
                    const analyticsData = await analyticsResponse.json();

                    if (analyticsData.success && analyticsData.data) {
                        const revenue = analyticsData.data.revenue;
                        if (revenue && revenue.revenueByMonth) {
                            chartData = {
                                labels: revenue.revenueByMonth.map((d: any) => d.month),
                                datasets: [
                                    {
                                        label: 'Revenue',
                                        data: revenue.revenueByMonth.map((d: any) => d.revenue),
                                        borderColor:     tokenColor('--ok', '#34c759'),
                                        backgroundColor: tokenColor('--ok', '#34c759', 0.12)
                                    }
                                ]
                            };
                        }
                    }
                }
            } catch (analyticsError) {
                console.log('Analytics data not available:', analyticsError);
                // Continue without analytics - not critical
            }
        } catch (error) {
            console.error('Failed to load dashboard data:', error);
            orders.setError('Failed to load orders');
        } finally {
            loading = false;
        }
    }

    function handleOrderClick(order: any) {
        goto(`/orders/${order.id}`);
    }

    onMount(() => {
        loadDashboardData();
    });
</script>

<svelte:head>
    <title>{$t('dashboard.title', { default: 'Dashboard' })} - OMS</title>
</svelte:head>

<div class="dashboard-container">
    <header class="dashboard-header">
        <div>
            <h1 class="page-title">{$t('dashboard.title', { default: 'Dashboard' })}</h1>
            <p class="page-subtitle">{$t('dashboard.welcome', { default: 'Welcome back, {name}!', values: { name: $currentUser?.username || '' } })}</p>
        </div>
        <Button variant="primary" onclick={() => goto('/orders/new')}>
            {$t('dashboard.new_order', { default: '+ New Order' })}
        </Button>
    </header>

    {#if loading}
        <div class="loading-state">
            <div class="spinner"></div>
            <p>{$t('dashboard.loading', { default: 'Loading dashboard...' })}</p>
        </div>
    {:else}
        <!-- Stats Grid -->
        <div class="stats-grid">
            <StatCard
                title={$t('dashboard.stat_total', { default: 'Total Orders' })}
                value={$orderStats.total}
                icon="📋"
                variant="default"
            />
            <StatCard
                title={$t('dashboard.stat_active', { default: 'Active Orders' })}
                value={$orderStats.active}
                icon="⚡"
                variant="primary"
                trend={{ value: 12, direction: 'up' }}
            />
            <StatCard
                title={$t('dashboard.stat_completed', { default: 'Completed' })}
                value={$orderStats.completed}
                icon="✅"
                variant="success"
            />
            <StatCard
                title={$t('dashboard.stat_overdue', { default: 'Overdue' })}
                value={$orderStats.overdue}
                icon="⚠️"
                variant="danger"
                trend={{ value: 5, direction: 'down' }}
            />
        </div>

        <!-- Charts Section -->
        {#if chartData.datasets.length > 0}
        <div class="charts-section">
            <Card title={$t('dashboard.chart_overview', { default: 'Orders Overview' })} padding="lg">
                <LineChart data={chartData} title={$t('dashboard.chart_period', { default: 'Last 30 Days' })} height={300} />
            </Card>
        </div>
        {/if}

        <!-- Recent Orders -->
        <section class="recent-orders">
            <div class="section-header">
                <h2 class="section-title">{$t('dashboard.kpi.active', { default: 'Active Orders' })}</h2>
                <Button variant="ghost" onclick={() => goto('/orders')}>
                    {$t('dashboard.view_all', { default: 'View All' })} →
                </Button>
            </div>

            {#if recentOrders.length === 0}
                <Card>
                    <div class="empty-state">
                        <p class="empty-message">{$t('dashboard.no_orders', { default: 'No active orders' })}</p>
                        <Button variant="primary" onclick={() => goto('/orders/new')}>
                            {$t('dashboard.create_first', { default: 'Create First Order' })}
                        </Button>
                    </div>
                </Card>
            {:else}
                <div class="orders-grid">
                    {#each recentOrders as order (order.id)}
                        <OrderCard {order} onclick={handleOrderClick} showActions={false} />
                    {/each}
                </div>
            {/if}
        </section>

        <!-- Quick Actions -->
        <section class="quick-actions">
            <h2 class="section-title">{$t('dashboard.quick_actions', { default: 'Quick Actions' })}</h2>
            <div class="actions-grid">
                <button class="action-card" onclick={() => goto('/orders/new')}>
                    <span class="action-icon">➕</span>
                    <h3 class="action-title">{$t('dashboard.actions.new_order.title', { default: 'New Order' })}</h3>
                    <p class="action-description">{$t('dashboard.actions.new_order.desc', { default: 'Create a new production order' })}</p>
                </button>

                <button class="action-card" onclick={() => goto('/production')}>
                    <span class="action-icon">🏭</span>
                    <h3 class="action-title">{$t('dashboard.actions.production.title', { default: 'Production Board' })}</h3>
                    <p class="action-description">{$t('dashboard.actions.production.desc', { default: 'View production workflow' })}</p>
                </button>

                <button class="action-card" onclick={() => goto('/admin/materials')}>
                    <span class="action-icon">📦</span>
                    <h3 class="action-title">{$t('dashboard.actions.materials.title', { default: 'Materials' })}</h3>
                    <p class="action-description">{$t('dashboard.actions.materials.desc', { default: 'Manage inventory' })}</p>
                </button>

                <button class="action-card" onclick={() => goto('/analytics')}>
                    <span class="action-icon">📊</span>
                    <h3 class="action-title">{$t('dashboard.actions.analytics.title', { default: 'Analytics' })}</h3>
                    <p class="action-description">{$t('dashboard.actions.analytics.desc', { default: 'View reports' })}</p>
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
        color: var(--color-text, var(--ink-primary));
    }

    .page-subtitle {
        font-size: 1rem;
        color: var(--color-gray-600, var(--ink-tertiary));
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
        border: 4px solid var(--color-gray-200, var(--border));
        border-top-color: var(--color-primary, var(--brand));
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
        color: var(--color-text, var(--ink-primary));
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
        color: var(--color-gray-600, var(--ink-tertiary));
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
        border: 2px solid var(--color-border, var(--border));
        border-radius: 0.5rem;
        padding: 1.5rem;
        text-align: center;
        cursor: pointer;
        transition: background var(--motion-sm) var(--ease-standard), color var(--motion-sm) var(--ease-standard);
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
    }

    .action-card:hover {
        border-color: var(--color-primary, var(--brand));
        box-shadow: 0 4px 6px -1px color-mix(in oklab, var(--bg-0) 10%, transparent);
        transform: translateY(-2px);
    }

    .action-icon {
        font-size: 2.5rem;
    }

    .action-title {
        font-size: 1.125rem;
        font-weight: 600;
        margin: 0;
        color: var(--color-text, var(--ink-primary));
    }

    .action-description {
        font-size: 0.875rem;
        color: var(--color-gray-600, var(--ink-tertiary));
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