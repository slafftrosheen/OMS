<!-- src/lib/admin/components/builder/CanvasSection.svelte -->
<script lang="ts">
  import {
    GripVertical,
    Plus,
    Copy,
    Trash2,
    MoreVertical,
  } from "lucide-svelte";
  import CanvasField from "./CanvasField.svelte";

  let {
    section,
    selected = false,
    dropTarget = false,
    selectedFieldId = null,
    onselect,
    ondrop,
    ondelete,
    onduplicate,
    onselectField,
    ondeleteField,
    onduplicateField,
  }: {
    section: any;
    selected?: boolean;
    dropTarget?: boolean;
    selectedFieldId?: number | null;
    onselect?: () => void;
    ondrop?: (data: { event: DragEvent }) => void;
    ondelete?: () => void;
    onduplicate?: () => void;
    onselectField?: (data: { field: any }) => void;
    ondeleteField?: (data: { fieldId: number }) => void;
    onduplicateField?: (data: { field: any }) => void;
  } = $props();

  let showActions = $state(false);

  function handleSectionClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (target === event.currentTarget || target.closest(".section-header")) {
      onselect?.();
    }
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    ondrop?.({ event });
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
  }

  let sectionDisplayName = $derived(
    section.displayName?.en || section.display_name_en || section.name,
  );
  let headerColor = $derived(
    section.metadata?.color || section.icon ? "#1a1a1a" : "#1a1a1a",
  );
</script>

<div
  class="canvas-section"
  class:selected
  class:drop-target={dropTarget}
  onclick={handleSectionClick}
  ondrop={handleDrop}
  ondragover={handleDragOver}
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
        onclick={(e) => {
          e.stopPropagation();
          showActions = !showActions;
        }}
      >
        <MoreVertical size={16} />
      </button>

      {#if showActions}
        <div
          class="actions-dropdown"
          onclick={(e: MouseEvent) => e.stopPropagation()}
        >
          <button
            onclick={() => {
              ondelete?.();
              showActions = false;
            }}
          >
            <Trash2 size={14} />
            Delete
          </button>
          <button
            onclick={() => {
              onduplicate?.();
              showActions = false;
            }}
          >
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
            onselect={() => onselectField?.({ field })}
            ondelete={() => ondeleteField?.({ fieldId: field.id })}
            onduplicate={() => onduplicateField?.({ field })}
          />
        {/each}
      </div>
    {/if}

    <!-- Add Field Button -->
    <button class="add-field-btn" onclick={(e) => e.stopPropagation()}>
      <Plus size={16} />
      Add Field
    </button>
  </div>
</div>

<style>
  .canvas-section {
    min-width: 200px;
    max-width: 300px;
    background: var(--bg-2);
    border: 2px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
    transition: background var(--motion-sm) var(--ease-standard), color var(--motion-sm) var(--ease-standard);
    cursor: pointer;
  }

  .canvas-section.selected {
    border-color: var(--brand);
    box-shadow: 0 0 0 3px color-mix(in oklab, var(--brand) 20%, transparent);
  }

  .canvas-section.drop-target {
    border-color: var(--ok);
    background: var(--ok-soft);
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    color: var(--bg-0);
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
    background: color-mix(in oklab, var(--bg-0) 2%, transparent);
    border: none;
    border-radius: 4px;
    color: var(--bg-0);
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .header-action-btn:hover {
    background: color-mix(in oklab, var(--bg-0) 3%, transparent);
  }

  .actions-dropdown {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 4px;
    background: white;
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 8px 24px color-mix(in oklab, var(--bg-0) 20%, transparent);
    z-index: var(--z-overlay);
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
    color: var(--ink-primary);
    transition: background 0.15s ease;
  }

  .actions-dropdown button:hover {
    background: var(--bg-2);
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
    border: 2px dashed var(--border);
    border-radius: 8px;
    color: var(--muted);
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
    border: 2px dashed var(--border);
    border-radius: 8px;
    cursor: pointer;
    transition: background var(--motion-sm) var(--ease-standard), color var(--motion-sm) var(--ease-standard);
    font-weight: 600;
    font-size: 13px;
    color: var(--muted);
  }

  .add-field-btn:hover {
    border-color: var(--brand);
    color: var(--brand);
    background: var(--brand-soft);
  }
</style>
