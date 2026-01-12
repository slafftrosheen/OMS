<!-- src/lib/admin/components/builder/ComponentPalette.svelte -->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { GripVertical } from 'lucide-svelte';

  const dispatch = createEventDispatcher();

  const sectionTypes = [
    { type: 'section', label: 'CNC FREZER', icon: '⚙️', color: '#1a1a1a' },
    { type: 'section', label: 'BENDER', icon: '🔧', color: '#4A5568' },
    { type: 'section', label: 'FRONT', icon: '📱', color: '#F7FAFC' },
    { type: 'section', label: 'PAINTING', icon: '🎨', color: '#E53E3E' },
    { type: 'section', label: 'ASSEMBLING', icon: '🔩', color: '#2D3748' },
    { type: 'section', label: 'DELIVERY', icon: '🚚', color: '#1a1a1a' }
  ];

  const fieldTypes = [
    { fieldType: 'material_field', label: 'Material Field', icon: '🔲', description: 'Type → Material → Thickness' },
    { fieldType: 'color_ral', label: 'RAL Color', icon: '🎨', description: 'RAL color selector' },
    { fieldType: 'color_pantone', label: 'PANTONE Color', icon: '🌈', description: 'PANTONE matching' },
    { fieldType: 'oracal_selector', label: 'ORACAL Film', icon: '📋', description: 'ORACAL 8500 series' },
    { fieldType: 'signtrim_selector', label: 'SignTrim', icon: '✨', description: 'SignTrim colors' },
    { fieldType: 'dropdown', label: 'Dropdown', icon: '▼', description: 'Select from options' },
    { fieldType: 'button_group', label: 'Button Group', icon: '🔘', description: 'Visual option buttons' },
    { fieldType: 'toggle', label: 'Toggle', icon: '⚡', description: 'Yes/No switch' },
    { fieldType: 'number', label: 'Number', icon: '🔢', description: 'Numeric input' },
    { fieldType: 'text', label: 'Text', icon: '📝', description: 'Text input' },
    { fieldType: 'textarea', label: 'Text Area', icon: '📄', description: 'Multi-line text' },
    { fieldType: 'date', label: 'Date', icon: '📅', description: 'Date picker' },
    { fieldType: 'multi_select_chips', label: 'Multi-Select', icon: '🏷️', description: 'Multiple choices' },
    { fieldType: 'info_box', label: 'Info Box', icon: 'ℹ️', description: 'Warning/note display' }
  ];

  function startDrag(event: DragEvent, component: any) {
    dispatch('dragstart', { event, component });
  }
</script>

<div class="component-palette">
  <!-- Sections -->
  <div class="palette-section">
    <h3 class="palette-heading">📐 Sections</h3>
    <div class="palette-items">
      {#each sectionTypes as section}
        <div
          class="palette-item section-item"
          draggable="true"
          on:dragstart={(e) => startDrag(e, section)}
          style="border-left: 4px solid {section.color};"
          role="button"
          tabindex="0"
        >
          <GripVertical size={16} class="drag-handle" />
          <span class="item-icon">{section.icon}</span>
          <span class="item-label">{section.label}</span>
        </div>
      {/each}
    </div>
  </div>

  <!-- Fields -->
  <div class="palette-section">
    <h3 class="palette-heading">🧩 Fields</h3>
    <div class="palette-items">
      {#each fieldTypes as field}
        <div
          class="palette-item field-item"
          draggable="true"
          on:dragstart={(e) => startDrag(e, field)}
          title={field.description}
          role="button"
          tabindex="0"
        >
          <GripVertical size={14} class="drag-handle" />
          <span class="item-icon">{field.icon}</span>
          <div class="item-content">
            <span class="item-label">{field.label}</span>
            <span class="item-description">{field.description}</span>
          </div>
        </div>
      {/each}
    </div>
  </div>
</div>

<style>
  .component-palette {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .palette-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .palette-heading {
    margin: 0;
    font-size: 14px;
    font-weight: 700;
    color: #1a1a1a;
    padding: 8px 0;
  }

  .palette-items {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .palette-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    cursor: grab;
    transition: all 0.15s ease;
  }

  .palette-item:hover {
    border-color: #667EEA;
    background: #f9fafb;
    transform: translateX(4px);
  }

  .palette-item:active {
    cursor: grabbing;
  }

  .drag-handle {
    color: #9ca3af;
    flex-shrink: 0;
  }

  .item-icon {
    font-size: 18px;
    flex-shrink: 0;
  }

  .item-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .item-label {
    font-size: 13px;
    font-weight: 600;
    color: #1a1a1a;
  }

  .item-description {
    font-size: 10px;
    color: #6b7280;
    line-height: 1.2;
  }

  .section-item {
    font-weight: 700;
  }

  .field-item {
    padding-left: 16px;
  }
</style>
