<!-- src/lib/admin/components/builder/CanvasField.svelte -->
<script lang="ts">
  import { GripVertical, Copy, Trash2 } from 'lucide-svelte';

  let {
    field,
    selected = false,
    onselect,
    onduplicate,
    ondelete
  }: {
    field: any;
    selected?: boolean;
    onselect?: () => void;
    onduplicate?: () => void;
    ondelete?: () => void;
  } = $props();

  const fieldTypeIcons: Record<string, string> = {
    'material_selector': '🔲',
    'material_field': '🔲',
    'thickness_selector': '📏',
    'color_ral': '🎨',
    'color_pantone': '🌈',
    'color_oracal': '📋',
    'dropdown': '▼',
    'button_group': '🔘',
    'toggle': '⚡',
    'numeric_input': '🔢',
    'number': '🔢',
    'text_input': '📝',
    'text': '📝',
    'textarea': '📄',
    'date_input': '📅',
    'date': '📅',
    'multi_select_chips': '🏷️',
    'info_box': 'ℹ️'
  };

  function handleClick(event: MouseEvent) {
    event.stopPropagation();
    onselect?.();
  }

  let fieldLabel = $derived(field.label?.en || field.label_en || 'Field');
  let fieldType = $derived(field.fieldType || field.field_type || 'unknown');
  let isRequired = $derived(field.isRequired || field.is_required || false);
</script>

<div 
  class="canvas-field"
  class:selected
  draggable="true"
  on:click={handleClick}
  role="button"
  tabindex="0"
>
  <GripVertical size={12} class="drag-handle" />
  
  <span class="field-icon">
    {fieldTypeIcons[fieldType] || '❓'}
  </span>

  <div class="field-info">
    <span class="field-label">{fieldLabel}</span>
    <span class="field-type">{fieldType}</span>
  </div>

  <div class="field-actions">
    <button 
      class="field-action-btn"
      onclick={(e: MouseEvent) => { e.stopPropagation(); onduplicate?.(); }}
      title="Duplicate"
    >
      <Copy size={12} />
    </button>
    <button 
      class="field-action-btn danger"
      onclick={(e: MouseEvent) => { e.stopPropagation(); ondelete?.(); }}
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
    border: 2px solid #e5e7eb;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .canvas-field:hover {
    border-color: #667EEA;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .canvas-field.selected {
    border-color: #667EEA;
    background: #EEF2FF;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.2);
  }

  .drag-handle {
    color: #9ca3af;
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
    color: #1a1a1a;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .field-type {
    font-size: 10px;
    color: #6b7280;
    font-family: 'Courier New', monospace;
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
    background: #f3f4f6;
    border: 1px solid #e5e7eb;
    border-radius: 4px;
    cursor: pointer;
    color: #6b7280;
    transition: all 0.15s ease;
  }

  .field-action-btn:hover {
    border-color: #667EEA;
    color: #667EEA;
  }

  .field-action-btn.danger:hover {
    border-color: #ef4444;
    color: #ef4444;
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
    background: #ef4444;
    color: white;
    border-radius: 50%;
    font-size: 12px;
    font-weight: 700;
  }
</style>
