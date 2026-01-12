<script lang="ts">
  import { AlertCircle, Beaker, Truck, Lock, CheckCircle, Clock } from 'lucide-svelte';
  import type { Badge } from '$lib/order/types';
  
  export let badge: Badge;
  export let size: 'sm' | 'md' = 'sm';
  
  const badgeConfig: Record<Badge, { icon: any; color: string; label: string }> = {
    URGENT: { icon: AlertCircle, color: 'var(--danger)', label: 'Urgent' },
    'R&D': { icon: Beaker, color: 'var(--accent-2)', label: 'R&D' },
    READY_TO_SHIP: { icon: Truck, color: 'var(--ok)', label: 'Ready' },
    BLOCKED: { icon: Lock, color: 'var(--warn)', label: 'Blocked' },
    DONE: { icon: CheckCircle, color: 'var(--ok)', label: 'Done' },
    IN_PROGRESS: { icon: Clock, color: 'var(--accent)', label: 'In Progress' },
    OPEN: { icon: Clock, color: 'var(--muted)', label: 'Open' },
    LOW_STOCK: { icon: AlertCircle, color: 'var(--warn)', label: 'Low Stock' },
    DRAFT: { icon: Clock, color: 'var(--muted)', label: 'Draft' }
  };
  
  $: config = badgeConfig[badge] || { icon: Clock, color: 'var(--muted)', label: badge };
  $: iconSize = size === 'sm' ? 12 : 14;
</script>

<span 
  class="order-badge" 
  class:sm={size === 'sm'}
  class:md={size === 'md'}
  style="--badge-color: {config.color}"
  title={config.label}
  aria-label={`Order badge: ${config.label}`}
>
  <svelte:component this={config.icon} size={iconSize} aria-hidden="true" />
  <span class="badge-label">{config.label}</span>
</span>

<style>
  .order-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 6px;
    border-radius: var(--radius-full);
    background: color-mix(in srgb, var(--badge-color) 15%, transparent);
    border: 1px solid var(--badge-color);
    color: var(--badge-color);
    font-size: 0.7rem;
    font-weight: 600;
    white-space: nowrap;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    transition: all 0.2s ease;
  }
  
  .order-badge.sm {
    font-size: 0.65rem;
    padding: 1px 4px;
  }
  
  .order-badge.md {
    font-size: 0.75rem;
    padding: 3px 8px;
  }
  
  @media (prefers-reduced-motion: reduce) {
    .order-badge {
      transition: none;
    }
  }
  
  @media (max-width: 560px) {
    .badge-label {
      display: none;
    }
  }
</style>
