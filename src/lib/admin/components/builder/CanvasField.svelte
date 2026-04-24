<!-- src/lib/admin/components/builder/CanvasField.svelte -->
<script lang="ts">
  import { GripVertical, Copy, Trash2 } from "lucide-svelte";

  let {
    field,
    selected = false,
    onselect,
    onduplicate,
    ondelete,
  }: {
    field: any;
    selected?: boolean;
    onselect?: () => void;
    onduplicate?: () => void;
    ondelete?: () => void;
  } = $props();

  const fieldTypeIcons: Record<string, string> = {
    material_selector: "🔲",
    material_field: "🔲",
    thickness_selector: "📏",
    color_ral: "🎨",
    color_pantone: "🌈",
    color_oracal: "📋",
    dropdown: "▼",
    button_group: "🔘",
    toggle: "⚡",
    numeric_input: "🔢",
    number: "🔢",
    text_input: "📝",
    text: "📝",
    textarea: "📄",
    date_input: "📅",
    date: "📅",
    multi_select_chips: "🏷️",
    info_box: "ℹ️",
  };

  function handleClick(event: MouseEvent) {
    event.stopPropagation();
    onselect?.();
  }

  let fieldLabel = $derived(field.label?.en || field.label_en || "Field");
  let fieldType = $derived(field.fieldType || field.field_type || "unknown");
  let isRequired = $derived(field.isRequired || field.is_required || false);
</script>

<div
  class="canvas-field"
  class:selected
  draggable="true"
  onclick={handleClick}
  role="button"
  tabindex="0"
>
  <GripVertical size={12} class="drag-handle" />

  <span class="field-icon">
    {fieldTypeIcons[fieldType] || "❓"}
  </span>

  <div class="field-info">
    <span class="field-label">{fieldLabel}</span>
    <span class="field-type">{fieldType}</span>
  </div>

  <div class="field-actions">
    <button
      class="field-action-btn"
      onclick={(e: MouseEvent) => {
        e.stopPropagation();
        onduplicate?.();
      }}
      title="Duplicate"
    >
      <Copy size={12} />
    </button>
    <button
      class="field-action-btn danger"
      onclick={(e: MouseEvent) => {
        e.stopPropagation();
        ondelete?.();
      }}
      title="Delete"
    >
      <Trash2 size={12} />
    </button>
  </div>

  {#if isRequired}
    <span class="required-badge">*</span>
  {/if}
</div>

<style>
  .canvas-field {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px;
    background: white;
    border: 2px solid var(--border);
    border-radius: 8px;
    cursor: pointer;
    transition: background var(--motion-sm) var(--ease-standard), color var(--motion-sm) var(--ease-standard);
  }

  .canvas-field:hover {
    border-color: var(--brand);
    box-shadow: 0 2px 8px color-mix(in oklab, var(--bg-0) 10%, transparent);
  }

  .canvas-field.selected {
    border-color: var(--brand);
    background: var(--brand-soft);
    box-shadow: 0 0 0 3px color-mix(in oklab, var(--brand) 20%, transparent);
  }

  .drag-handle {
    color: var(--muted);
    opacity: 0.4;
    flex-shrink: 0;
    cursor: grab;
  }

  .canvas-field:active .drag-handle {
    cursor: grabbing;
  }

  .field-icon {
    font-size: 16px;
    flex-shrink: 0;
  }

  .field-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .field-label {
    font-size: 13px;
    font-weight: 600;
    color: var(--ink-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .field-type {
    font-size: 10px;
    color: var(--ink-tertiary);
    font-family: "Courier New", monospace;
  }

  .field-actions {
    display: flex;
    gap: 4px;
    opacity: 0;
    transition: opacity 0.15s ease;
  }

  .canvas-field:hover .field-actions {
    opacity: 1;
  }

  .field-action-btn {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 4px;
    cursor: pointer;
    color: var(--ink-tertiary);
    transition: background var(--motion-sm) var(--ease-standard), color var(--motion-sm) var(--ease-standard);
  }

  .field-action-btn:hover {
    border-color: var(--brand);
    color: var(--brand);
  }

  .field-action-btn.danger:hover {
    border-color: var(--error);
    color: var(--error);
  }

  .required-badge {
    position: absolute;
    top: -6px;
    right: -6px;
    width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--error);
    color: var(--bg-0);
    border-radius: 50%;
    font-size: 12px;
    font-weight: 700;
  }
</style>
