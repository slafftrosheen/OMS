<!-- src/lib/admin/components/builder/HorizontalPalette.svelte -->
<script lang="ts">
  import GripVertical from 'lucide-svelte/icons/grip-vertical';
  import Icon from '$lib/ui/Icon.svelte';

  let { oncomponentdrag }: { oncomponentdrag?: (component: any) => void } = $props();

  let activeTab: 'sections' | 'fields' = $state('sections');

  type SectionDef = {
    type: 'section';
    label: string;
    icon: import('$lib/ui/icons').IconName;
    desc: string;
  };
  type FieldDef = {
    fieldType: string;
    label: string;
    icon: import('$lib/ui/icons').IconName;
    category: string;
  };

  const sectionTypes: SectionDef[] = [
    { type: 'section', label: 'CNC FREZER',  icon: 'cog',         desc: 'CNC milling operations' },
    { type: 'section', label: 'BENDER',      icon: 'wrench',      desc: 'Aluminum bending' },
    { type: 'section', label: 'FRONT',       icon: 'smartphone',  desc: 'Front face operations' },
    { type: 'section', label: 'PAINTING',    icon: 'palette',     desc: 'Painting and colors' },
    { type: 'section', label: 'ASSEMBLING',  icon: 'hammer',      desc: 'LED and assembly' },
    { type: 'section', label: 'DELIVERY',    icon: 'truck',       desc: 'Delivery info' },
    { type: 'section', label: 'CUSTOM',      icon: 'sparkles',    desc: 'Custom section' }
  ];

  const fieldTypes: FieldDef[] = [
    { fieldType: 'material_field',     label: 'Material',     icon: 'box',           category: 'Materials' },
    { fieldType: 'color_ral',          label: 'RAL Color',    icon: 'palette',       category: 'Colors' },
    { fieldType: 'color_pantone',      label: 'PANTONE',      icon: 'paintbrush',    category: 'Colors' },
    { fieldType: 'oracal_selector',    label: 'ORACAL',       icon: 'clipboard-list',category: 'Colors' },
    { fieldType: 'signtrim_selector',  label: 'SignTrim',     icon: 'wand-sparkles', category: 'Colors' },
    { fieldType: 'dropdown',           label: 'Dropdown',     icon: 'chevron-down',  category: 'Basic' },
    { fieldType: 'button_group',       label: 'Buttons',      icon: 'square',        category: 'Basic' },
    { fieldType: 'toggle',             label: 'Toggle',       icon: 'zap',           category: 'Basic' },
    { fieldType: 'number',             label: 'Number',       icon: 'hash',          category: 'Basic' },
    { fieldType: 'text',               label: 'Text',         icon: 'type',          category: 'Basic' },
    { fieldType: 'textarea',           label: 'Text Area',    icon: 'file-text',     category: 'Basic' },
    { fieldType: 'date',               label: 'Date',         icon: 'calendar',      category: 'Basic' },
    { fieldType: 'multi_select_chips', label: 'Multi-Select', icon: 'tag',           category: 'Advanced' },
    { fieldType: 'info_box',           label: 'Info Box',     icon: 'info',          category: 'Advanced' },
    { fieldType: 'computed_field',     label: 'Computed',     icon: 'cog',           category: 'Advanced' }
  ];

  function startDrag(event: DragEvent, component: any) {
    if (!event.dataTransfer) return;
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('text/plain', JSON.stringify(component));
    oncomponentdrag?.(component);
  }

  let groupedFields = $derived(fieldTypes.reduce((acc, field) => {
    if (!acc[field.category]) acc[field.category] = [];
    acc[field.category].push(field);
    return acc;
  }, {} as Record<string, typeof fieldTypes>));
</script>

<div class="horizontal-palette">
  <!-- Tabs -->
  <div class="palette-tabs">
    <button
      class="tab"
      class:active={activeTab === 'sections'}
      onclick={() => activeTab = 'sections'}
    >
      <Icon name="layout-grid" size="sm" /> Sections
    </button>
    <button
      class="tab"
      class:active={activeTab === 'fields'}
      onclick={() => activeTab = 'fields'}
    >
      <Icon name="grid" size="sm" /> Fields
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
            ondragstart={(e) => startDrag(e, section)}
            title={section.desc}
            role="button"
            tabindex="0"
          >
            <GripVertical size={14} class="drag-handle" />
            <span class="card-icon"><Icon name={section.icon} size="md" /></span>
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
                ondragstart={(e) => startDrag(e, field)}
                title={field.fieldType}
                role="button"
                tabindex="0"
              >
                <GripVertical size={12} class="drag-handle" />
                <span class="card-icon"><Icon name={field.icon} size="sm" /></span>
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
    background: var(--bg-2, var(--bg-2));
  }

  /* Tabs */
  .palette-tabs {
    display: flex;
    gap: 4px;
    padding: var(--space-sm, 8px) var(--space-lg, 24px);
    background: var(--bg-1, var(--border));
    border-bottom: 1px solid var(--border, var(--border));
  }

  .tab {
    padding: var(--space-sm, 8px) var(--space-lg, 24px);
    background: transparent;
    border: none;
    border-radius: var(--radius-md, 8px) var(--radius-md, 8px) 0 0;
    cursor: pointer;
    transition: background var(--motion-sm) var(--ease-standard), color var(--motion-sm) var(--ease-standard);
    font-weight: 600;
    font-size: var(--text-sm, 14px);
    color: var(--text-muted, var(--ink-tertiary));
  }

  .tab:hover {
    background: var(--bg-2, var(--bg-2));
    color: var(--text-primary, var(--ink-primary));
  }

  .tab.active {
    background: var(--bg-2, var(--bg-2));
    color: var(--brand);
    border-bottom: 3px solid var(--brand);
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
    color: var(--text-muted, var(--ink-tertiary));
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
    border: 2px solid var(--border, var(--border));
    border-radius: var(--radius-md, 8px);
    cursor: grab;
    transition: background var(--motion-sm) var(--ease-standard), color var(--motion-sm) var(--ease-standard);
    flex-shrink: 0;
    min-width: 120px;
    user-select: none;
  }

  .component-card:hover {
    border-color: var(--brand);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px color-mix(in oklab, var(--bg-0) 15%, transparent);
  }

  .component-card:active {
    cursor: grabbing;
    transform: translateY(0);
  }

  .section-card {
    background: linear-gradient(135deg, var(--bg-2) 0%, var(--bg-0) 100%);
    font-weight: 700;
  }

  .field-card {
    background: white;
  }

  .drag-handle {
    color: var(--text-muted, var(--muted));
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
    color: var(--text-primary, var(--ink-primary));
  }

  /* Scrollbar styling */
  .palette-content::-webkit-scrollbar,
  .components-row::-webkit-scrollbar {
    height: 8px;
  }

  .palette-content::-webkit-scrollbar-track,
  .components-row::-webkit-scrollbar-track {
    background: var(--bg-1, var(--border));
  }

  .palette-content::-webkit-scrollbar-thumb,
  .components-row::-webkit-scrollbar-thumb {
    background: var(--border, var(--muted));
    border-radius: var(--radius-full, 12px);
  }

  .palette-content::-webkit-scrollbar-thumb:hover,
  .components-row::-webkit-scrollbar-thumb:hover {
    background: var(--border-strong, var(--ink-tertiary));
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
