<!-- src/lib/inventory/components/MaterialStockCard.svelte -->
<script lang="ts">
  import type { InventoryStock } from '$lib/inventory/types';
  import { AlertTriangle, TrendingDown, Package, Plus, Minus } from 'lucide-svelte';

  export let stock: InventoryStock;

  $: stockPercentage = stock.minimumStockLevel
    ? (stock.quantityInStock / stock.minimumStockLevel) * 100
    : 100;

  $: stockStatus = stockPercentage <= 25
    ? 'critical'
    : stockPercentage <= 50
    ? 'low'
    : stockPercentage <= 100
    ? 'warning'
    : 'good';

  function handleAdjustStock(type: 'add' | 'remove') {
    // Dispatch event for stock adjustment
    console.log(`${type} stock for`, stock);
  }

  function handleReorder() {
    // Dispatch event to create purchase order
    console.log('Reorder', stock);
  }
</script>

<div class="stock-card" data-status={stockStatus}>
  <div class="stock-header">
    <div class="material-info">
      <h3>{stock.material?.name_en || stock.material?.code}</h3>
      {#if stock.thickness}
        <span class="thickness">{stock.thickness}mm</span>
      {/if}
    </div>
    <div class="stock-badge" data-status={stockStatus}>
      {#if stockStatus === 'critical'}
        <AlertTriangle size={16} />
        Critical
      {:else if stockStatus === 'low'}
        <TrendingDown size={16} />
        Low
      {:else if stockStatus === 'warning'}
        <Package size={16} />
        Warning
      {:else}
        <Package size={16} />
        Good
      {/if}
    </div>
  </div>

  <div class="stock-details">
    <div class="quantity">
      <span class="label">In Stock:</span>
      <span class="value">{stock.quantityInStock} {stock.unitOfMeasure}</span>
    </div>

    <div class="quantity-bar">
      <div
        class="bar-fill"
        data-status={stockStatus}
        style="width: {Math.min(stockPercentage, 100)}%"
      ></div>
    </div>

    <div class="thresholds">
      <div class="threshold">
        <span class="label">Minimum:</span>
        <span class="value">{stock.minimumStockLevel || 'N/A'}</span>
      </div>
      <div class="threshold">
        <span class="label">Reorder at:</span>
        <span class="value">{stock.reorderPoint || 'N/A'}</span>
      </div>
    </div>

    {#if stock.location}
      <div class="location">
        <span class="label">Location:</span>
        <span class="value">{stock.location}</span>
      </div>
    {/if}

    {#if stock.totalValue}
      <div class="value-info">
        <span class="label">Total Value:</span>
        <span class="value">€{stock.totalValue.toFixed(2)}</span>
      </div>
    {/if}
  </div>

  <div class="stock-actions">
    <button class="tag" on:click={() => handleAdjustStock('add')}>
      <Plus size={14} />
      Add Stock
    </button>
    <button class="tag" on:click={() => handleAdjustStock('remove')}>
      <Minus size={14} />
      Remove
    </button>
    {#if stockStatus === 'critical' || stockStatus === 'low'}
      <button class="rf-btn" on:click={handleReorder}>
        Reorder Now
      </button>
    {/if}
  </div>
</div>

<style>
  .stock-card {
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: var(--space-lg);
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    transition: all 0.2s ease;
  }

  .stock-card:hover {
    border-color: var(--primary);
    box-shadow: 0 4px 12px rgba(var(--shadow-rgb), 0.1);
  }

  .stock-card[data-status="critical"] {
    border-left: 4px solid var(--danger);
  }

  .stock-card[data-status="low"] {
    border-left: 4px solid var(--warning);
  }

  .stock-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }

  .material-info h3 {
    font-size: var(--text-md);
    font-weight: 600;
    margin: 0 0 var(--space-xs) 0;
  }

  .thickness {
    display: inline-block;
    padding: 2px 8px;
    background: var(--bg-3);
    border-radius: var(--radius-sm);
    font-size: var(--text-xs);
  }

  .stock-badge {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    padding: 4px 12px;
    border-radius: var(--radius-full);
    font-size: var(--text-xs);
    font-weight: 600;
  }

  .stock-badge[data-status="critical"] {
    background: var(--danger-bg);
    color: var(--danger);
  }

  .stock-badge[data-status="low"] {
    background: var(--warning-bg);
    color: var(--warning);
  }

  .stock-badge[data-status="warning"] {
    background: var(--info-bg);
    color: var(--info);
  }

  .stock-badge[data-status="good"] {
    background: var(--success-bg);
    color: var(--success);
  }

  .stock-details {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .quantity {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .quantity .value {
    font-size: var(--text-xl);
    font-weight: 700;
  }

  .quantity-bar {
    height: 8px;
    background: var(--bg-3);
    border-radius: var(--radius-full);
    overflow: hidden;
  }

  .bar-fill {
    height: 100%;
    transition: width 0.3s ease;
  }

  .bar-fill[data-status="critical"] {
    background: var(--danger);
  }

  .bar-fill[data-status="low"] {
    background: var(--warning);
  }

  .bar-fill[data-status="warning"] {
    background: var(--info);
  }

  .bar-fill[data-status="good"] {
    background: var(--success);
  }

  .thresholds {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-md);
  }

  .threshold,
  .location,
  .value-info {
    display: flex;
    justify-content: space-between;
    font-size: var(--text-sm);
  }

  .label {
    color: var(--text-muted);
  }

  .value {
    font-weight: 600;
  }

  .stock-actions {
    display: flex;
    gap: var(--space-sm);
    padding-top: var(--space-sm);
    border-top: 1px solid var(--border);
  }

  .tag {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
  }
</style>
