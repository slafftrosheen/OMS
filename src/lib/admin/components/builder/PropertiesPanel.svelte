<!-- src/lib/admin/components/builder/PropertiesPanel.svelte -->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { Settings } from 'lucide-svelte';

  export let element: any;
  export let elementType: 'template' | 'section' | 'field' | null;

  const dispatch = createEventDispatcher();

  let localElement = { ...element };

  $: localElement = { ...element };

  function updateProperty(key: string, value: any) {
    dispatch('update', { [key]: value });
  }

  function updateNestedProperty(path: string[], value: any) {
    const updates: any = {};
    let current = updates;
    for (let i = 0; i < path.length - 1; i++) {
      current[path[i]] = { ...(element[path[i]] || {}) };
      current = current[path[i]];
    }
    current[path[path.length - 1]] = value;
    dispatch('update', updates);
  }
</script>

<div class="properties-panel">
  <div class="panel-header">
    <Settings size={20} />
    <h3>Properties</h3>
  </div>

  <div class="panel-content">
    {#if elementType === 'template'}
      <!-- Template Properties -->
      <div class="property-group">
        <h4>Template Info</h4>
        <div class="form-field">
          <label>Code</label>
          <input
            type="text"
            value={localElement.code || ''}
            on:input={(e) => updateProperty('code', e.currentTarget.value)}
            placeholder="P9"
          />
        </div>
        <div class="form-field">
          <label>Name</label>
          <input
            type="text"
            value={localElement.name || ''}
            on:input={(e) => updateProperty('name', e.currentTarget.value)}
            placeholder="Profile Name"
          />
        </div>
        <div class="form-field">
          <label>Description</label>
          <textarea
            value={localElement.description || ''}
            on:input={(e) => updateProperty('description', e.currentTarget.value)}
            rows="3"
          ></textarea>
        </div>
        <div class="form-field">
          <label>Version</label>
          <input
            type="text"
            value={localElement.version || '1.0'}
            on:input={(e) => updateProperty('version', e.currentTarget.value)}
          />
        </div>
      </div>

    {:else if elementType === 'section'}
      <!-- Section Properties -->
      <div class="property-group">
        <h4>Section Info</h4>
        <div class="form-field">
          <label>Name (Key)</label>
          <input
            type="text"
            value={localElement.name || ''}
            on:input={(e) => updateProperty('name', e.currentTarget.value)}
            placeholder="SECTION_NAME"
          />
        </div>
        <div class="form-field">
          <label>Display Name (EN)</label>
          <input
            type="text"
            value={localElement.displayName?.en || localElement.display_name_en || ''}
            on:input={(e) => updateNestedProperty(['displayName', 'en'], e.currentTarget.value)}
          />
        </div>
        <div class="form-field">
          <label>Display Name (RU)</label>
          <input
            type="text"
            value={localElement.displayName?.ru || localElement.display_name_ru || ''}
            on:input={(e) => updateNestedProperty(['displayName', 'ru'], e.currentTarget.value)}
          />
        </div>
        <div class="form-field">
          <label>Display Name (LV)</label>
          <input
            type="text"
            value={localElement.displayName?.lv || localElement.display_name_lv || ''}
            on:input={(e) => updateNestedProperty(['displayName', 'lv'], e.currentTarget.value)}
          />
        </div>
        <div class="form-field">
          <label>
            <input
              type="checkbox"
              checked={localElement.isRequired || localElement.is_required || false}
              on:change={(e) => updateProperty('isRequired', e.currentTarget.checked)}
            />
            Required Section
          </label>
        </div>
        <div class="form-field">
          <label>Icon</label>
          <input
            type="text"
            value={localElement.icon || ''}
            on:input={(e) => updateProperty('icon', e.currentTarget.value)}
            placeholder="⚙️"
          />
        </div>
      </div>

    {:else if elementType === 'field'}
      <!-- Field Properties -->
      <div class="property-group">
        <h4>Field Info</h4>
        <div class="form-field">
          <label>Field Key</label>
          <input
            type="text"
            value={localElement.fieldKey || localElement.field_key || ''}
            on:input={(e) => updateProperty('fieldKey', e.currentTarget.value)}
            placeholder="field_name"
          />
        </div>
        <div class="form-field">
          <label>Field Type</label>
          <select
            value={localElement.fieldType || localElement.field_type || 'text_input'}
            on:change={(e) => updateProperty('fieldType', e.currentTarget.value)}
          >
            <option value="material_selector">Material Selector</option>
            <option value="thickness_selector">Thickness Selector</option>
            <option value="color_ral">RAL Color</option>
            <option value="color_pantone">PANTONE Color</option>
            <option value="color_oracal">ORACAL Film</option>
            <option value="dropdown">Dropdown</option>
            <option value="button_group">Button Group</option>
            <option value="toggle">Toggle</option>
            <option value="numeric_input">Number</option>
            <option value="text_input">Text</option>
            <option value="textarea">Text Area</option>
            <option value="date_input">Date</option>
            <option value="multi_select_chips">Multi-Select</option>
            <option value="info_box">Info Box</option>
          </select>
        </div>
        <div class="form-field">
          <label>Label (EN)</label>
          <input
            type="text"
            value={localElement.label?.en || localElement.label_en || ''}
            on:input={(e) => updateNestedProperty(['label', 'en'], e.currentTarget.value)}
          />
        </div>
        <div class="form-field">
          <label>Label (RU)</label>
          <input
            type="text"
            value={localElement.label?.ru || localElement.label_ru || ''}
            on:input={(e) => updateNestedProperty(['label', 'ru'], e.currentTarget.value)}
          />
        </div>
        <div class="form-field">
          <label>Label (LV)</label>
          <input
            type="text"
            value={localElement.label?.lv || localElement.label_lv || ''}
            on:input={(e) => updateNestedProperty(['label', 'lv'], e.currentTarget.value)}
          />
        </div>
        <div class="form-field">
          <label>
            <input
              type="checkbox"
              checked={localElement.isRequired || localElement.is_required || false}
              on:change={(e) => updateProperty('isRequired', e.currentTarget.checked)}
            />
            Required Field
          </label>
        </div>

        <!-- Type-specific configs -->
        {#if ['dropdown', 'button_group', 'multi_select_chips', 'thickness_selector'].includes(localElement.fieldType || localElement.field_type)}
          <div class="form-field">
            <label>Options (one per line)</label>
            <textarea
              value={(localElement.options || []).join('\n')}
              on:input={(e) => updateProperty('options', e.currentTarget.value.split('\n').filter(Boolean))}
              rows="5"
              placeholder="Option 1&#10;Option 2&#10;Option 3"
            ></textarea>
          </div>
        {/if}

        {#if ['numeric_input', 'number', 'dimension_input', 'thickness_selector'].includes(localElement.fieldType || localElement.field_type)}
          <div class="form-field">
            <label>Min Value</label>
            <input
              type="number"
              value={localElement.config?.min || 0}
              on:input={(e) => updateNestedProperty(['config', 'min'], parseFloat(e.currentTarget.value))}
            />
          </div>
          <div class="form-field">
            <label>Max Value</label>
            <input
              type="number"
              value={localElement.config?.max || 100}
              on:input={(e) => updateNestedProperty(['config', 'max'], parseFloat(e.currentTarget.value))}
            />
          </div>
          <div class="form-field">
            <label>Step</label>
            <input
              type="number"
              value={localElement.config?.step || 1}
              on:input={(e) => updateNestedProperty(['config', 'step'], parseFloat(e.currentTarget.value))}
            />
          </div>
          <div class="form-field">
            <label>Unit</label>
            <input
              type="text"
              value={localElement.config?.unit || 'mm'}
              on:input={(e) => updateNestedProperty(['config', 'unit'], e.currentTarget.value)}
            />
          </div>
        {/if}

        {#if localElement.fieldType === 'info_box' || localElement.field_type === 'info_box'}
          <div class="form-field">
            <label>Info Content</label>
            <textarea
              value={localElement.config?.content || ''}
              on:input={(e) => updateNestedProperty(['config', 'content'], e.currentTarget.value)}
              rows="4"
            ></textarea>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .properties-panel {
    display: flex;
    flex-direction: column;
    background: white;
  }

  .panel-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px 24px;
    border-bottom: 1px solid #e5e7eb;
    background: #f9fafb;
  }

  .panel-header h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 700;
  }

  .panel-content {
    overflow-y: auto;
  }

  .property-group {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
  }

  .property-group h4 {
    margin: 0 0 8px 0;
    font-size: 14px;
    font-weight: 700;
    color: #1a1a1a;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .form-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .form-field label {
    font-size: 13px;
    font-weight: 600;
    color: #4b5563;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .form-field input[type="text"],
  .form-field input[type="number"],
  .form-field select,
  .form-field textarea {
    padding: 8px 12px;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    font-size: 14px;
    font-family: inherit;
    transition: border-color 0.15s ease;
  }

  .form-field input[type="text"]:focus,
  .form-field input[type="number"]:focus,
  .form-field select:focus,
  .form-field textarea:focus {
    outline: none;
    border-color: #667EEA;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
  }

  .form-field input[type="color"] {
    width: 100%;
    height: 40px;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    cursor: pointer;
  }

  .form-field input[type="checkbox"] {
    width: 18px;
    height: 18px;
    cursor: pointer;
  }

  .form-field textarea {
    resize: vertical;
    font-family: inherit;
  }
</style>
