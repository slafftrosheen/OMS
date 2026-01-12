<script lang="ts">
  export let title = '';
  export let value: string | number = '';
  export let icon: any = null;
  export let trend: 'up' | 'down' | 'neutral' | null = null;
  export let trendValue: string = '';
</script>

<div class="kpi-card">
  {#if icon}
    <div class="kpi-icon">
      <svelte:component this={icon} size={22} />
    </div>
  {/if}
  <div class="kpi-content">
    <div class="kpi-value">{value}</div>
    <div class="kpi-title">{title}</div>
    {#if trend && trendValue}
      <div class="kpi-trend" data-trend={trend}>
        {#if trend === 'up'}↑{:else if trend === 'down'}↓{/if}
        {trendValue}
      </div>
    {/if}
  </div>
</div>

<style>
.kpi-card {
  display: flex;
  gap: var(--space-md, 12px);
  align-items: center;
  padding: var(--space-lg, 16px);
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg, 12px);
  transition: all 0.2s ease;
}

.kpi-card:hover {
  border-color: color-mix(in oklab, var(--border) 60%, var(--accent-1, #3b82f6));
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}

.kpi-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  background: color-mix(in oklab, var(--accent-1, #3b82f6) 10%, transparent);
  border-radius: var(--radius-md, 8px);
  color: var(--accent-1, #3b82f6);
  flex-shrink: 0;
}

.kpi-content {
  flex: 1;
  min-width: 0;
}

.kpi-value {
  font-weight: 800;
  font-size: 1.5rem;
  line-height: 1.2;
  color: var(--text);
}

.kpi-title {
  font-size: 0.8125rem;
  color: var(--muted);
  margin-top: 2px;
}

.kpi-trend {
  font-size: 0.75rem;
  font-weight: 600;
  margin-top: 4px;
}

.kpi-trend[data-trend="up"] {
  color: var(--success, #16a34a);
}

.kpi-trend[data-trend="down"] {
  color: var(--danger, #dc2626);
}

.kpi-trend[data-trend="neutral"] {
  color: var(--muted);
}
</style>
