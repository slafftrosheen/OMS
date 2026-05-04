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
        background: var(--bg-1);
        padding: 1.5rem;
        border-radius: 0.5rem;
        border: 1px solid var(--color-border, var(--border));
        box-shadow: 0 1px 2px 0 color-mix(in oklab, var(--bg-0) 5%, transparent);
        display: flex;
        gap: 1rem;
        transition: background var(--motion-sm) var(--ease-standard), color var(--motion-sm) var(--ease-standard);
    }

    .stat-card:hover {
        box-shadow: 0 4px 6px -1px color-mix(in oklab, var(--bg-0) 10%, transparent);
    }

    .stat-icon {
        font-size: 2.5rem;
        flex-shrink: 0;
        width: 3.5rem;
        height: 3.5rem;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--color-gray-100, var(--bg-2));
        border-radius: 0.5rem;
    }

    .stat-primary .stat-icon {
        background: var(--brand-soft);
    }

    .stat-success .stat-icon {
        background: var(--ok-soft);
    }

    .stat-warning .stat-icon {
        background: var(--warn-soft);
    }

    .stat-danger .stat-icon {
        background: var(--error-soft);
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
        color: var(--color-gray-600, var(--ink-tertiary));
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
        color: var(--color-text, var(--ink-primary));
        line-height: 1;
    }

    .stat-subtitle {
        font-size: 0.875rem;
        color: var(--color-gray-500, var(--muted));
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