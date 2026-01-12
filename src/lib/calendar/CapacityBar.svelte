<script lang="ts">
  import { t } from 'svelte-i18n';
  import { TrendingUp, AlertTriangle } from 'lucide-svelte';
  
  export let current: number = 0;
  export let capacity: number = 100;
  export let unit: string = 'orders';
  
  $: percentage = capacity > 0 ? Math.min((current / capacity) * 100, 100) : 0;
  $: status = percentage >= 100 ? 'over' : percentage >= 80 ? 'high' : 'normal';
  $: statusColor = 
    status === 'over' ? 'var(--danger)' : 
    status === 'high' ? 'var(--warn)' : 
    'var(--ok)';
</script>

<div class="capacity-bar" role="meter" 
     aria-valuenow={current} 
     aria-valuemin="0" 
     aria-valuemax={capacity}
     aria-label={`Capacity: ${current} of ${capacity} ${unit}`}>
  <div class="capacity-header">
    <div class="capacity-info">
      <TrendingUp size={14} aria-hidden="true" />
      <span class="capacity-text">
        <strong>{current}</strong> / {capacity} {unit}
      </span>
    </div>
    {#if status !== 'normal'}
      <div class="capacity-status" class:warning={status === 'high'} class:danger={status === 'over'}>
        <AlertTriangle size={12} aria-hidden="true" />
        <span>{status === 'over' ? $t('calendar.over_capacity') : $t('calendar.near_capacity')}</span>
      </div>
    {/if}
  </div>
  
  <div class="capacity-track">
    <div 
      class="capacity-fill" 
      class:over={status === 'over'}
      class:high={status === 'high'}
      style="--capacity: {percentage}%; --status-color: {statusColor}"
    >
      <span class="capacity-percentage">{Math.round(percentage)}%</span>
    </div>
  </div>
</div>

<style>
  .capacity-bar {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
    background: var(--bg-0);
    border-radius: var(--radius-md);
    border: 1px solid var(--border);
  }
  
  .capacity-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }
  
  .capacity-info {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.85rem;
    color: var(--text);
  }
  
  .capacity-status {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    padding: 2px 6px;
    border-radius: var(--radius-full);
  }
  
  .capacity-status.warning {
    background: color-mix(in srgb, var(--warn) 15%, transparent);
    color: var(--warn);
  }
  
  .capacity-status.danger {
    background: color-mix(in srgb, var(--danger) 15%, transparent);
    color: var(--danger);
  }
  
  .capacity-track {
    position: relative;
    height: 8px;
    background: var(--bg-2);
    border-radius: var(--radius-full);
    overflow: hidden;
  }
  
  .capacity-fill {
    position: relative;
    height: 100%;
    width: var(--capacity);
    background: var(--status-color);
    border-radius: var(--radius-full);
    transition: width 0.3s ease, background 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding-right: 6px;
  }
  
  .capacity-percentage {
    font-size: 0.65rem;
    font-weight: 700;
    color: white;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
    opacity: 0;
    transition: opacity 0.2s ease;
  }
  
  .capacity-fill:hover .capacity-percentage {
    opacity: 1;
  }
  
  @media (prefers-reduced-motion: reduce) {
    .capacity-fill {
      transition: none;
    }
  }
</style>
