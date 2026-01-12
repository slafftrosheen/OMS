<!-- src/lib/admin/components/builder/CanvasSection.svelte -->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { GripVertical, Plus, Copy, Trash2, MoreVertical } from 'lucide-svelte';
  import CanvasField from './CanvasField.svelte';

  export let section: any;
  export let selected: boolean = false;
  export let dropTarget: boolean = false;
  export let selectedFieldId: number | null = null;

  const dispatch = createEventDispatcher();

  let showActions = false;

  function handleSectionClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (target === event.currentTarget || target.closest('.section-header')) {
      dispatch('select');
    }
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    dispatch('drop', { event });
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
  }

  $: sectionDisplayName = section.displayName?.en || section.display_name_en || section.name;
  $: headerColor = section.metadata?.color || section.icon ? '#1a1a1a' : '#1a1a1a';
</script>

<div 
  class="canvas-section"
  class:selected
  class:drop-target={dropTarget}
  on:click={handleSectionClick}
  on:drop={handleDrop}
  on:dragover={handleDragOver}
  role="button"
  tabindex="0"
>
  <!-- Section Header -->
  <div 
    class="section-header"
    style="background-color: {headerColor};"
    draggable="true"
  >
    <GripVertical size={16} class="drag-handle" />
    <span class="section-name">{sectionDisplayName}</span>
    
    <div class="section-header-actions">
      <button 
        class="header-action-btn"
        on:click|stopPropagation={() => showActions = !showActions}
      >
        <MoreVertical size={16} />
      </button>

      {#if showActions}
        <div class="actions-dropdown" on:click|stopPropagation>
          <button on:click={() => { dispatch('delete'); showActions = false; }}>
            <Trash2 size={14} />
            Delete
          </button>
          <button on:click={() => { dispatch('duplicate'); showActions = false; }}>
            <Copy size={14} />
            Duplicate
          </button>
        </div>
      {/if}
    </div>
  </div>

  <!-- Fields Container -->
  <div class="section-content">
    {#if section.fields.length === 0}
      <div class="empty-section">
        <Plus size={24} />
        <p>Drop fields here</p>
      </div>
    {:else}
      <div class="fields-list">
        {#each section.fields as field (field.id)}
          <CanvasField
            {field}
            selected={selectedFieldId === field.id}
            on:select={() => dispatch('selectField', { field })}
            on:delete={() => dispatch('deleteField', { fieldId: field.id })}
            on:duplicate={() => dispatch('duplicateField', { field })}
          />
        {/each}
      </div>
    {/if}

    <!-- Add Field Button -->
    <button class="add-field-btn" on:click|stopPropagation>
      <Plus size={16} />
      Add Field
    </button>
  </div>
</div>

<style>
  .canvas-section {
    min-width: 200px;
    max-width: 300px;
    background: #f9fafb;
    border: 2px solid #e5e7eb;
    border-radius: 12px;
    overflow: hidden;
    transition: all 0.2s ease;
    cursor: pointer;
  }

  .canvas-section.selected {
    border-color: #667EEA;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.2);
  }

  .canvas-section.drop-target {
    border-color: #10b981;
    background: #ecfdf5;
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    color: white;
    font-weight: 700;
    font-size: 13px;
    cursor: move;
    position: relative;
  }

  .drag-handle {
    opacity: 0.6;
    flex-shrink: 0;
  }

  .section-name {
    flex: 1;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .section-header-actions {
    position: relative;
  }

  .header-action-btn {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.2);
    border: none;
    border-radius: 4px;
    color: white;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .header-action-btn:hover {
    background: rgba(255, 255, 255, 0.3);
  }

  .actions-dropdown {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 4px;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
    z-index: 100;
    min-width: 150px;
  }

  .actions-dropdown button {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    background: none;
    border: none;
    cursor: pointer;
    font-size: 13px;
    color: #1a1a1a;
    transition: background 0.15s ease;
  }

  .actions-dropdown button:hover {
    background: #f3f4f6;
  }

  .section-content {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 100px;
  }

  .empty-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 32px;
    border: 2px dashed #e5e7eb;
    border-radius: 8px;
    color: #9ca3af;
    gap: 6px;
  }

  .empty-section p {
    margin: 0;
    font-size: 13px;
  }

  .fields-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .add-field-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px;
    background: white;
    border: 2px dashed #e5e7eb;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s ease;
    font-weight: 600;
    font-size: 13px;
    color: #9ca3af;
  }

  .add-field-btn:hover {
    border-color: #667EEA;
    color: #667EEA;
    background: #EEF2FF;
  }
</style>
