<!-- src/lib/profiles/components/fields/MaterialSelector.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { ChevronDown, AlertCircle, CheckCircle, Package } from 'lucide-svelte';
  import type { Material } from '$lib/profiles/types';

  export let value: string = '';
  export let options: string[] = []; // Material codes to filter by
  export let label: string = 'Material';
  export let required: boolean = false;
  export let disabled: boolean = false;
  export let placeholder: string = 'Select material...';
  export let checkInventory: boolean = true;
  export let error: string | null = null;

  let materials: Material[] = [];
  let filteredMaterials: Material[] = [];
  let selectedMaterial: Material | null = null;
  let loading = false;
  let inventoryStatus: Record<string, { inStock: boolean; quantity: number }> = {};
  let isOpen = false;

  onMount(async () => {
    await loadMaterials();
  });

  async function loadMaterials() {
    loading = true;
    try {
      const response = await fetch('/api/materials');
      const data = await response.json();
      materials = data.items || data;

      // Filter by provided options
      if (options.length > 0) {
        filteredMaterials = materials.filter(m => options.includes(m.code));
      } else {
        filteredMaterials = materials;
      }

      // Load inventory status if enabled
      if (checkInventory) {
        await loadInventoryStatus();
      }

      // Set selected material if value is provided
      if (value) {
        selectedMaterial = filteredMaterials.find(m => m.code === value) || null;
      }
    } catch (err) {
      console.error('Failed to load materials:', err);
    } finally {
      loading = false;
    }
  }

  async function loadInventoryStatus() {
    try {
      const codes = filteredMaterials.map(m => m.code).join(',');
      const response = await fetch(`/api/inventory/status?codes=${codes}`);
      inventoryStatus = await response.json();
    } catch (err) {
      console.error('Failed to load inventory status:', err);
    }
  }

  function selectMaterial(material: Material) {
    selectedMaterial = material;
    value = material.code;
    isOpen = false;
  }

  function toggleDropdown() {
    if (!disabled) {
      isOpen = !isOpen;
    }
  }

  function getMaterialColor(material: Material): string {
    return material.metadata?.color || '#CCCCCC';
  }

  function getInventoryStatusIcon(materialCode: string) {
    const status = inventoryStatus[materialCode];
    if (!status) return null;
    return status.inStock ? CheckCircle : AlertCircle;
  }
</script>

<div class="material-selector" class:disabled class:error={!!error}>
  <label class="label">
    {label}
    {#if required}
      <span class="required">*</span>
    {/if}
  </label>

  <div class="selector-wrapper">
    <button 
      type="button"
      class="selector-button" 
      class:open={isOpen}
      on:click={toggleDropdown}
      {disabled}
    >
      {#if loading}
        <span class="loading-spinner"></span>
        Loading materials...
      {:else if selectedMaterial}
        <div class="selected-material">
          <div 
            class="material-swatch" 
            style="background-color: {getMaterialColor(selectedMaterial)}"
          ></div>
          <div class="material-details">
            <span class="material-name">{selectedMaterial.name.en}</span>
            <span class="material-code">{selectedMaterial.code}</span>
          </div>
          {#if checkInventory}
            {@const status = inventoryStatus[selectedMaterial.code]}
            {#if status}
              <div class="inventory-badge" class:in-stock={status.inStock}>
                <svelte:component 
                  this={getInventoryStatusIcon(selectedMaterial.code)} 
                  size={14} 
                />
                {status.inStock ? 'In Stock' : 'Low Stock'}
              </div>
            {/if}
          {/if}
        </div>
      {:else}
        <span class="placeholder">{placeholder}</span>
      {/if}
      <ChevronDown size={20} class="chevron" />
    </button>

    {#if isOpen && !loading}
      <div class="dropdown-menu">
        {#each filteredMaterials as material (material.id)}
          <button
            type="button"
            class="material-option"
            class:selected={material.code === value}
            on:click={() => selectMaterial(material)}
          >
            <div 
              class="material-swatch" 
              style="background-color: {getMaterialColor(material)}"
            ></div>
            <div class="material-info">
              <div class="material-name">{material.name.en}</div>
              <div class="material-meta">
                <span class="material-code">{material.code}</span>
                {#if material.metadata?.supplier}
                  <span class="material-brand">{material.metadata.supplier}</span>
                {/if}
              </div>
              {#if material.thicknessOptions?.length}
                <div class="thickness-options">
                  Thicknesses: {material.thicknessOptions.join(', ')}mm
                </div>
              {/if}
            </div>
            {#if checkInventory}
              {@const status = inventoryStatus[material.code]}
              {#if status}
                <div class="stock-indicator" class:low={!status.inStock}>
                  <Package size={14} />
                  {status.quantity}
                </div>
              {/if}
            {/if}
          </button>
        {:else}
          <div class="no-options">No materials available</div>
        {/each}
      </div>
    {/if}
  </div>

  {#if error}
    <div class="error-message">
      <AlertCircle size={14} />
      {error}
    </div>
  {/if}
</div>

<style>
  .material-selector {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs, 4px);
    position: relative;
  }

  .label {
    font-size: var(--text-sm, 0.875rem);
    font-weight: 600;
    color: var(--text-primary, #1a1a1a);
  }

  .required {
    color: var(--danger, #dc2626);
    margin-left: 2px;
  }

  .selector-wrapper {
    position: relative;
  }

  .selector-button {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-sm, 8px) var(--space-md, 12px);
    background: var(--bg-1, #ffffff);
    border: 1px solid var(--border, #e5e7eb);
    border-radius: var(--radius-md, 6px);
    cursor: pointer;
    transition: all 0.2s ease;
    min-height: 44px;
  }

  .selector-button:hover:not(:disabled) {
    border-color: var(--primary, #3b82f6);
    background: var(--bg-2, #f9fafb);
  }

  .selector-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .selector-button.open {
    border-color: var(--primary, #3b82f6);
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
  }

  .selected-material {
    display: flex;
    align-items: center;
    gap: var(--space-sm, 8px);
    flex: 1;
  }

  .material-swatch {
    width: 24px;
    height: 24px;
    border-radius: var(--radius-sm, 4px);
    border: 1px solid var(--border, #e5e7eb);
    flex-shrink: 0;
  }

  .material-details {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    flex: 1;
  }

  .material-name {
    font-size: var(--text-sm, 0.875rem);
    font-weight: 600;
  }

  .material-code {
    font-size: var(--text-xs, 0.75rem);
    color: var(--text-muted, #6b7280);
    font-family: var(--font-mono, monospace);
  }

  .inventory-badge {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: var(--radius-full, 9999px);
    font-size: var(--text-xs, 0.75rem);
    font-weight: 600;
    background: var(--warning-bg, #fef3c7);
    color: var(--warning, #f59e0b);
  }

  .inventory-badge.in-stock {
    background: var(--success-bg, #d1fae5);
    color: var(--success, #10b981);
  }

  .placeholder {
    color: var(--text-muted, #6b7280);
    font-size: var(--text-sm, 0.875rem);
  }

  .chevron {
    color: var(--text-muted, #6b7280);
    transition: transform 0.2s ease;
  }

  .selector-button.open :global(.chevron) {
    transform: rotate(180deg);
  }

  .dropdown-menu {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: var(--bg-1, #ffffff);
    border: 1px solid var(--primary, #3b82f6);
    border-top: none;
    border-bottom-left-radius: var(--radius-md, 6px);
    border-bottom-right-radius: var(--radius-md, 6px);
    max-height: 320px;
    overflow-y: auto;
    z-index: 100;
    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.15);
  }

  .material-option {
    width: 100%;
    display: flex;
    align-items: center;
    gap: var(--space-sm, 8px);
    padding: var(--space-sm, 8px) var(--space-md, 12px);
    background: none;
    border: none;
    border-bottom: 1px solid var(--border, #e5e7eb);
    cursor: pointer;
    transition: background 0.15s ease;
    text-align: left;
  }

  .material-option:hover {
    background: var(--bg-2, #f9fafb);
  }

  .material-option.selected {
    background: var(--primary-bg, #dbeafe);
  }

  .material-option:last-child {
    border-bottom: none;
  }

  .material-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
  }

  .material-meta {
    display: flex;
    gap: var(--space-sm, 8px);
    font-size: var(--text-xs, 0.75rem);
    color: var(--text-muted, #6b7280);
  }

  .material-brand {
    font-weight: 600;
  }

  .thickness-options {
    font-size: var(--text-xs, 0.75rem);
    color: var(--text-muted, #6b7280);
    margin-top: 2px;
  }

  .stock-indicator {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    border-radius: var(--radius-sm, 4px);
    background: var(--success-bg, #d1fae5);
    color: var(--success, #10b981);
    font-size: var(--text-xs, 0.75rem);
    font-weight: 600;
  }

  .stock-indicator.low {
    background: var(--warning-bg, #fef3c7);
    color: var(--warning, #f59e0b);
  }

  .no-options {
    padding: var(--space-lg, 16px);
    text-align: center;
    color: var(--text-muted, #6b7280);
    font-size: var(--text-sm, 0.875rem);
  }

  .error-message {
    display: flex;
    align-items: center;
    gap: var(--space-xs, 4px);
    color: var(--danger, #dc2626);
    font-size: var(--text-xs, 0.75rem);
    margin-top: 2px;
  }

  .material-selector.error .selector-button {
    border-color: var(--danger, #dc2626);
  }

  .loading-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid var(--border, #e5e7eb);
    border-top-color: var(--primary, #3b82f6);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Scrollbar styling */
  .dropdown-menu::-webkit-scrollbar {
    width: 8px;
  }

  .dropdown-menu::-webkit-scrollbar-track {
    background: var(--bg-2, #f9fafb);
    border-radius: var(--radius-sm, 4px);
  }

  .dropdown-menu::-webkit-scrollbar-thumb {
    background: var(--border, #e5e7eb);
    border-radius: var(--radius-sm, 4px);
  }

  .dropdown-menu::-webkit-scrollbar-thumb:hover {
    background: var(--text-muted, #6b7280);
  }
</style>
