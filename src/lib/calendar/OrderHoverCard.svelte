<script lang="ts">
  import { fade } from 'svelte/transition';
  import { t } from 'svelte-i18n';
  import type { Order } from '$lib/order/types';
  import OrderBadge from './OrderBadge.svelte';
  import { User, Calendar, Package, FileText, AlertCircle } from 'lucide-svelte';
  
  export let order: Order;
  export let x: number = 0;
  export let y: number = 0;
  
  $: activeMaterials = order.materials?.filter(m => m.value) || [];
  $: activeStages = Object.entries(order.stages || {})
    .filter(([_, state]) => state === 'IN_PROGRESS' || state === 'COMPLETED')
    .map(([station, state]) => ({ station, state }));
</script>

<div 
  class="order-hover-card" 
  style="--x: {x}px; --y: {y}px"
  transition:fade={{ duration: 150 }}
  role="tooltip"
  aria-live="polite"
>
  <div class="card-header">
    <div class="card-title">
      <FileText size={16} aria-hidden="true" />
      <h4>PO-{order.id}</h4>
    </div>
    <div class="card-badges">
      {#each order.badges as badge}
        <OrderBadge {badge} size="sm" />
      {/each}
    </div>
  </div>
  
  <div class="card-content">
    <div class="info-row">
      <User size={14} aria-hidden="true" />
      <span class="info-label">{$t('orders.client')}:</span>
      <span class="info-value">{order.client}</span>
    </div>
    
    <div class="info-row">
      <FileText size={14} aria-hidden="true" />
      <span class="info-label">{$t('orders.title')}:</span>
      <span class="info-value">{order.title}</span>
    </div>
    
    <div class="info-row">
      <Calendar size={14} aria-hidden="true" />
      <span class="info-label">{$t('orders.due')}:</span>
      <span class="info-value">{order.due}</span>
    </div>
    
    {#if activeMaterials.length > 0}
      <div class="info-row materials">
        <Package size={14} aria-hidden="true" />
        <span class="info-label">{$t('orders.materials')}:</span>
        <div class="materials-list">
          {#each activeMaterials.slice(0, 3) as material}
            <span class="material-chip">{material.label}</span>
          {/each}
          {#if activeMaterials.length > 3}
            <span class="material-chip more">+{activeMaterials.length - 3} more</span>
          {/if}
        </div>
      </div>
    {/if}
    
    {#if activeStages.length > 0}
      <div class="stages-section">
        <div class="section-label">{$t('orders.active_stages')}</div>
        <div class="stages-grid">
          {#each activeStages as { station, state }}
            <div class="stage-pill" class:completed={state === 'COMPLETED'}>
              {station}
              {#if state === 'COMPLETED'}
                <span class="stage-check">✓</span>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/if}
    
    {#if order.isRD}
      <div class="rd-notice">
        <AlertCircle size={14} aria-hidden="true" />
        <span>{$t('orders.rd_project')}</span>
      </div>
    {/if}
  </div>
</div>

<style>
  .order-hover-card {
    position: fixed;
    top: var(--y);
    left: var(--x);
    width: 320px;
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15),
                0 2px 8px rgba(0, 0, 0, 0.1);
    z-index: 1000;
    pointer-events: none;
    overflow: hidden;
  }
  
  .card-header {
    padding: 12px;
    background: var(--bg-0);
    border-bottom: 1px solid var(--border);
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 8px;
  }
  
  .card-title {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  
  .card-title h4 {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--text);
  }
  
  .card-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  
  .card-content {
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  
  .info-row {
    display: grid;
    grid-template-columns: 16px auto 1fr;
    gap: 6px;
    align-items: start;
    font-size: 0.85rem;
  }
  
  .info-row.materials {
    grid-template-columns: 16px auto 1fr;
    align-items: start;
  }
  
  .info-label {
    font-weight: 600;
    color: var(--muted);
    white-space: nowrap;
  }
  
  .info-value {
    color: var(--text);
    word-break: break-word;
  }
  
  .materials-list {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  
  .material-chip {
    display: inline-block;
    padding: 2px 6px;
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-size: 0.7rem;
    color: var(--text);
  }
  
  .material-chip.more {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
  }
  
  .stages-section {
    margin-top: 4px;
  }
  
  .section-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 6px;
  }
  
  .stages-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  
  .stage-pill {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    background: color-mix(in srgb, var(--accent) 15%, transparent);
    border: 1px solid var(--accent);
    border-radius: var(--radius-full);
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--accent);
  }
  
  .stage-pill.completed {
    background: color-mix(in srgb, var(--ok) 15%, transparent);
    border-color: var(--ok);
    color: var(--ok);
  }
  
  .stage-check {
    font-weight: 700;
  }
  
  .rd-notice {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px;
    background: color-mix(in srgb, var(--accent-2) 10%, transparent);
    border: 1px solid var(--accent-2);
    border-radius: var(--radius-md);
    font-size: 0.8rem;
    color: var(--accent-2);
    font-weight: 600;
  }
</style>
