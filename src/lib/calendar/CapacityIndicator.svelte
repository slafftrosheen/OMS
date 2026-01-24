<script lang="ts">
/**
 * Capacity Indicator Component
 * Visual indicator for loading day capacity status
 */

import { AlertTriangle, Lock, CheckCircle } from 'lucide-svelte';

export let current: number;
export let max: number;
export let warning: number;
export let isLocked = false;
export let unit = 'orders';
export let showDetails = true;

$: percentage = Math.round((current / max) * 100);
$: status = isLocked ? 'locked' : 
             current >= max ? 'full' : 
             current >= warning ? 'warning' : 'ok';

$: statusColor = {
  'locked': 'var(--muted)',
  'full': 'var(--danger)',
  'warning': 'var(--warn)',
  'ok': 'var(--ok)'
}[status];

$: statusIcon = {
  'locked': Lock,
  'full': AlertTriangle,
  'warning': AlertTriangle,
  'ok': CheckCircle
}[status];

$: statusLabel = {
  'locked': 'Locked',
  'full': 'Full',
  'warning': 'Near Capacity',
  'ok': 'Available'
}[status];

function getUnitLabel(count: number) {
  if (unit === 'orders') return count === 1 ? 'order' : 'orders';
  return unit;
}
</script>

<div class="capacity-indicator" class:compact={!showDetails}>
  <div class="capacity-bar-container" title="{percentage}% capacity">
    <div 
      class="capacity-bar-fill" 
      style="width: {Math.min(percentage, 100)}%; background-color: {statusColor};"
      aria-valuenow={current}
      aria-valuemin="0"
      aria-valuemax={max}
      role="progressbar"
      aria-label="Capacity: {current} of {max} {unit}"
    ></div>
  </div>

  {#if showDetails}
    <div class="capacity-details">
      <div class="capacity-status" style="color: {statusColor}">
        <svelte:component this={statusIcon} size={16} />
        <span>{statusLabel}</span>
      </div>
      
      <div class="capacity-count">
        <strong>{current}</strong> / {max} {getUnitLabel(max)}
      </div>
    </div>
  {/if}
</div>

<style>
  .capacity-indicator {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .capacity-indicator.compact {
    gap: 0.25rem;
  }

  .capacity-bar-container {
    width: 100%;
    height: 8px;
    background: var(--bg-2);
    border-radius: 4px;
    overflow: hidden;
  }

  .capacity-bar-fill {
    height: 100%;
    transition: width 0.3s ease, background-color 0.3s ease;
    border-radius: 4px;
  }

  .capacity-details {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.875rem;
  }

  .capacity-status {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-weight: 500;
  }

  .capacity-count {
    color: var(--muted);
  }

  .capacity-count strong {
    color: var(--text);
  }
</style>