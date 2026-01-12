<!-- src/lib/admin/components/builder/HorizontalPalette.svelte -->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { GripVertical } from 'lucide-svelte';

  const dispatch = createEventDispatcher();

  let activeTab: 'sections' | 'fields' = 'sections';

  const sectionTypes = [
    { type: 'section', label: 'CNC FREZER', icon: '⚙️', color: '#1a1a1a', desc: 'CNC milling operations' },
    { type: 'section', label: 'BENDER', icon: '🔧', color: '#4A5568', desc: 'Aluminum bending' },
    { type: 'section', label: 'FRONT', icon: '📱', color: '#F7FAFC', desc: 'Front face operations' },
    { type: 'section', label: 'PAINTING', icon: '🎨', color: '#E53E3E', desc: 'Painting and colors' },
    { type: 'section', label: 'ASSEMBLING', icon: '🔩', color: '#2D3748', desc: 'LED and assembly' },
    { type: 'section', label: 'DELIVERY', icon: '🚚', color: '#1a1a1a', desc: 'Delivery info' },
    { type: 'section', label: 'CUSTOM', icon: '✨', color: '#9333EA', desc: 'Custom section' }
  ];

  const fieldTypes = [
    { fieldType: 'material_field', label: 'Material', icon: '🔲', category: 'Materials' },
    { fieldType: 'color_ral', label: 'RAL Color', icon: '🎨', category: 'Colors' },
    { fieldType: 'color_pantone', label: 'PANTONE', icon: '🌈', category: 'Colors' },
    { fieldType: 'oracal_selector', label: 'ORACAL', icon: '📋', category: 'Colors' },
    { fieldType: 'signtrim_selector', label: 'SignTrim', icon: '✨', category: 'Colors' },
    { fieldType: 'dropdown', label: 'Dropdown', icon: '▼', category: 'Basic' },
    { fieldType: 'button_group', label: 'Buttons', icon: '🔘', category: 'Basic' },
    { fieldType: 'toggle', label: 'Toggle', icon: '⚡', category: 'Basic' },
    { fieldType: 'number', label: 'Number', icon: '🔢', category: 'Basic' },
    { fieldType: 'text', label: 'Text', icon: '📝', category: 'Basic' },
    { fieldType: 'textarea', label: 'Text Area', icon: '📄', category: 'Basic' },
    { fieldType: 'date', label: 'Date', icon: '📅', category: 'Basic' },
    { fieldType: 'multi_select_chips', label: 'Multi-Select', icon: '🏷️', category: 'Advanced' },
    { fieldType: 'info_box', label: 'Info Box', icon: 'ℹ️', category: 'Advanced' },
    { fieldType: 'computed_field', label: 'Computed', icon: '⚙️', category: 'Advanced' }
  ];

  function startDrag(event: DragEvent, component: any) {
    if (!event.dataTransfer) return;
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('text/plain', JSON.stringify(component));
    dispatch('componentdrag', component);
  }

  $: groupedFields = fieldTypes.reduce((acc, field) => {
    if (!acc[field.category]) acc[field.category] = [];
    acc[field.category].push(field);
    return acc;
  }, {} as Record<string, typeof fieldTypes>);
</script>

<div class="horizontal-palette">
  <!-- Tabs -->
  <div class="palette-tabs">
    <button 
      class="tab"
      class:active={activeTab === 'sections'}
      on:click={() => activeTab = 'sections'}
    >
      📐 Sections
    </button>
    <button 
      class="tab"
      class:active={activeTab === 'fields'}
      on:click={() => activeTab = 'fields'}
    >
      🧩 Fields
    </button>
  </div>

  <!-- Content -->
  <div class="palette-content">
    {#if activeTab === 'sections'}
      <div class="components-row">
        {#each sectionTypes as section}
          <div
            class="component-card section-card"
            draggable="true"
            on:dragstart={(e) => startDrag(e, section)}
            style="border-top: 4px solid {section.color};"
            title={section.desc}
            role="button"
            tabindex="0"
          >
            <GripVertical size={14} class="drag-handle" />
            <span class="card-icon">{section.icon}</span>
            <span class="card-label">{section.label}</span>
          </div>
        {/each}
      </div>

    {:else}
      {#each Object.entries(groupedFields) as [category, fields]}
        <div class="field-category">
          <h4 class="category-label">{category}</h4>
          <div class="components-row">
            {#each fields as field}
              <div
                class="component-card field-card"
                draggable="true"
                on:dragstart={(e) => startDrag(e, field)}
                title={field.fieldType}
                role="button"
                tabindex="0"
              >
                <GripVertical size={12} class="drag-handle" />
                <span class="card-icon">{field.icon}</span>
                <span class="card-label">{field.label}</span>
              </div>
            {/each}
          </div>
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .horizontal-palette {
    display: flex;
    flex-direction: column;
    background: var(--bg-2, #f3f4f6);
  }

  /* Tabs */
  .palette-tabs {
    display: flex;
    gap: 4px;
    padding: var(--space-sm, 8px) var(--space-lg, 24px);
    background: var(--bg-1, #e5e7eb);
    border-bottom: 1px solid var(--border, #d1d5db);
  }

  .tab {
    padding: var(--space-sm, 8px) var(--space-lg, 24px);
    background: transparent;
    border: none;
    border-radius: var(--radius-md, 8px) var(--radius-md, 8px) 0 0;
    cursor: pointer;
    transition: all 0.15s ease;
    font-weight: 600;
    font-size: var(--text-sm, 14px);
    color: var(--text-muted, #6b7280);
  }

  .tab:hover {
    background: var(--bg-2, #f3f4f6);
    color: var(--text-primary, #1a1a1a);
  }

  .tab.active {
    background: var(--bg-2, #f3f4f6);
    color: var(--primary, #667EEA);
    border-bottom: 3px solid var(--primary, #667EEA);
  }

  /* Content */
  .palette-content {
    padding: var(--space-md, 16px) var(--space-lg, 24px);
    overflow-x: auto;
    overflow-y: hidden;
  }

  .field-category {
    margin-bottom: var(--space-lg, 24px);
  }

  .field-category:last-child {
    margin-bottom: 0;
  }

  .category-label {
    margin: 0 0 var(--space-sm, 8px) 0;
    font-size: var(--text-xs, 11px);
    font-weight: 700;
    text-transform: uppercase;
    color: var(--text-muted, #6b7280);
    letter-spacing: 0.5px;
  }

  .components-row {
    display: flex;
    gap: var(--space-sm, 8px);
    padding-bottom: var(--space-sm, 8px);
  }

  /* Component Cards */
  .component-card {
    display: flex;
    align-items: center;
    gap: var(--space-xs, 6px);
    padding: var(--space-sm, 8px) var(--space-md, 16px);
    background: white;
    border: 2px solid var(--border, #e5e7eb);
    border-radius: var(--radius-md, 8px);
    cursor: grab;
    transition: all 0.15s ease;
    flex-shrink: 0;
    min-width: 120px;
    user-select: none;
  }

  .component-card:hover {
    border-color: var(--primary, #667EEA);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .component-card:active {
    cursor: grabbing;
    transform: translateY(0);
  }

  .section-card {
    background: linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%);
    font-weight: 700;
  }

  .field-card {
    background: white;
  }

  .drag-handle {
    color: var(--text-muted, #9ca3af);
    opacity: 0.4;
    flex-shrink: 0;
  }

  .card-icon {
    font-size: 18px;
    flex-shrink: 0;
  }

  .card-label {
    font-size: var(--text-sm, 13px);
    font-weight: 600;
    white-space: nowrap;
    color: var(--text-primary, #1a1a1a);
  }

  /* Scrollbar styling */
  .palette-content::-webkit-scrollbar,
  .components-row::-webkit-scrollbar {
    height: 8px;
  }

  .palette-content::-webkit-scrollbar-track,
  .components-row::-webkit-scrollbar-track {
    background: var(--bg-1, #e5e7eb);
  }

  .palette-content::-webkit-scrollbar-thumb,
  .components-row::-webkit-scrollbar-thumb {
    background: var(--border, #9ca3af);
    border-radius: var(--radius-full, 12px);
  }

  .palette-content::-webkit-scrollbar-thumb:hover,
  .components-row::-webkit-scrollbar-thumb:hover {
    background: var(--border-strong, #6b7280);
  }

  /* Responsive */
  @media (max-width: 768px) {
    .palette-tabs {
      padding: var(--space-xs, 4px) var(--space-md, 16px);
    }

    .palette-content {
      padding: var(--space-sm, 8px) var(--space-md, 16px);
    }

    .component-card {
      min-width: 100px;
      padding: var(--space-xs, 6px) var(--space-sm, 8px);
    }

    .card-label {
      font-size: var(--text-xs, 11px);
    }
  }
</style>
