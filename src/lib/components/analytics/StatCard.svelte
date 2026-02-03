<!-- src/lib/components/analytics/StatCard.svelte -->
<script lang="ts">
    let { 
        title, 
        value, 
        subtitle = null, 
        trend = null, 
        icon = null, 
        variant = 'default' 
    }: { 
        title: string;
        value: string | number;
        subtitle?: string | null;
        trend?: { value: number; direction: 'up' | 'down' } | null;
        icon?: string | null;
        variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
    } = $props();

    let trendColor = $derived(trend?.direction === 'up' ? '#10b981' : '#ef4444');
    let trendIcon = $derived(trend?.direction === 'up' ? '↑' : '↓');
</script>

<div class="stat-card stat-{variant}">
    {#if icon}
        <div class="stat-icon">{icon}</div>
    {/if}

    <div class="stat-content">
        <div class="stat-header">
            <h3 class="stat-title">{title}</h3>
            {#if trend}
                <div class="stat-trend" style="color: {trendColor}">
                    <span class="trend-icon">{trendIcon}</span>
                    <span class="trend-value">{Math.abs(trend.value)}%</span>
                </div>
            {/if}
        </div>

        <div class="stat-value">{value}</div>

        {#if subtitle}
            <p class="stat-subtitle">{subtitle}</p>
        {/if}
    </div>
</div>

<style>
    .stat-card {
        background: white;
        padding: 1.5rem;
        border-radius: 0.5rem;
        border: 1px solid var(--color-border, #e5e7eb);
        box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
        display: flex;
        gap: 1rem;
        transition: all 0.2s ease;
    }

    .stat-card:hover {
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    }

    .stat-icon {
        font-size: 2.5rem;
        flex-shrink: 0;
        width: 3.5rem;
        height: 3.5rem;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--color-gray-100, #f3f4f6);
        border-radius: 0.5rem;
    }

    .stat-primary .stat-icon {
        background: #dbeafe;
    }

    .stat-success .stat-icon {
        background: #dcfce7;
    }

    .stat-warning .stat-icon {
        background: #fef3c7;
    }

    .stat-danger .stat-icon {
        background: #fee2e2;
    }

    .stat-content {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    .stat-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .stat-title {
        font-size: 0.875rem;
        font-weight: 500;
        color: var(--color-gray-600, #6b7280);
        margin: 0;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .stat-trend {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        font-size: 0.875rem;
        font-weight: 600;
    }

    .trend-icon {
        font-size: 1rem;
    }

    .stat-value {
        font-size: 2rem;
        font-weight: 700;
        color: var(--color-text, #111827);
        line-height: 1;
    }

    .stat-subtitle {
        font-size: 0.875rem;
        color: var(--color-gray-500, #9ca3af);
        margin: 0;
    }

    @media (max-width: 640px) {
        .stat-value {
            font-size: 1.5rem;
        }

        .stat-icon {
            font-size: 2rem;
            width: 3rem;
            height: 3rem;
        }
    }
</style>