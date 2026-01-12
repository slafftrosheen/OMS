<script lang="ts">
  import { X } from 'lucide-svelte';
  import MaterialSelector from '../form-elements/MaterialSelector.svelte';
  import DimensionInput from '../form-elements/DimensionInput.svelte';
  import ColorSwatchSelector from '../form-elements/ColorSwatchSelector.svelte';
  import Input from '$lib/ui/Input.svelte';

  export let data: any = {};
  export let onRemove: () => void = () => {};
  export let showRemove: boolean = true;

  // Initialize data structure with defaults
  $: if (!data.lineFreezer) data.lineFreezer = { alu13: false, alu15: false, thickness: '', size: '', opalMaterial: '' };
  $: if (!data.benderSides) data.benderSides = { opalMaterial: '', frontMaterial: '', sidesMaterial: '', color: '', print: false };
  $: if (!data.painting) data.painting = { frameType: '', backMaterial: '', color: '', noLed: false, print: false };
  $: if (!data.assembling) data.assembling = { ledType: '', waterproof: [], frameOptions: [], specialRequirements: [] };
  $: if (!data.delivery) data.delivery = { deliveryDate: '' };

  // Material options
  const materialOptions = ['OPAL', 'ALU 1.3', 'ALU 1.5', 'FRONT', 'SIDES', 'BACK'];
  const frameTypes = ['NO FRAME', 'WITH FRAME', 'HALF FRAME', 'CUSTOM'];
  const ledTypes = ['Bell LED', 'SLOAN', 'REGULAR', 'WARM WHITE'];
  
  // Color options with RAL codes
  const colors = [
    { code: '3020', hex: '#cc2a1f', name: 'Traffic Red' },
    { code: '9005', hex: '#0a0a0a', name: 'Jet Black' },
    { code: '9006', hex: '#a5a5a6', name: 'White Aluminium' },
    { code: '1023', hex: '#f8b000', name: 'Traffic Yellow' },
    { code: '5015', hex: '#2271b3', name: 'Sky Blue' },
  ];

  // Waterproof options
  const waterproofOptions = [
    { id: 'ip65', label: 'IP65' },
    { id: 'ip67', label: 'IP67' },
    { id: 'outdoor', label: 'OUTDOOR' },
  ];

  // Frame options
  const frameOptionsList = [
    { id: 'trace', label: 'TRACE' },
    { id: 'cable', label: 'CABLE' },
  ];

  // Special requirements
  const specialRequirementsList = [
    { id: '9006_silver', label: '9006 SILVER' },
    { id: 'distance', label: 'DISTANCE' },
    { id: 'custom_mount', label: 'CUSTOM MOUNT' },
  ];

  function formatDate(dateStr: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }
</script>

<div class="profile-7st">
  <div class="profile-header">
    <h3>Profile 7st - Outdoor/Indoor Sign</h3>
    {#if showRemove}
      <button
        type="button"
        class="remove-btn"
        on:click={onRemove}
        aria-label="Remove profile"
      >
        <X size={20} />
      </button>
    {/if}
  </div>

  <div class="profile-sections">
    <!-- Line/Freezer Section -->
    <section class="profile-section">
      <h4>Line/Freezer</h4>
      <div class="section-grid">
        <div class="checkbox-group">
          <label class="checkbox-label">
            <input type="checkbox" bind:checked={data.lineFreezer.alu13} />
            <span>ALU 1.3</span>
          </label>
          <label class="checkbox-label">
            <input type="checkbox" bind:checked={data.lineFreezer.alu15} />
            <span>ALU 1.5</span>
          </label>
        </div>
        <div class="input-row">
          <Input
            type="text"
            bind:value={data.lineFreezer.thickness}
            placeholder="e.g., 3mm"
            ariaLabel="Thickness"
          />
        </div>
        <DimensionInput
          bind:value={data.lineFreezer.size}
          label="Size"
          unit="mm"
          placeholder="60"
        />
        <MaterialSelector
          bind:value={data.lineFreezer.opalMaterial}
          label="OPAL Material"
          options={materialOptions}
        />
      </div>
    </section>

    <!-- Bender/Sides Section -->
    <section class="profile-section">
      <h4>Bender/Sides</h4>
      <div class="section-grid">
        <MaterialSelector
          bind:value={data.benderSides.opalMaterial}
          label="OPAL"
          options={materialOptions}
        />
        <MaterialSelector
          bind:value={data.benderSides.frontMaterial}
          label="FRONT"
          options={materialOptions}
        />
        <MaterialSelector
          bind:value={data.benderSides.sidesMaterial}
          label="SIDES"
          options={materialOptions}
        />
        <ColorSwatchSelector
          bind:value={data.benderSides.color}
          label="Color"
          {colors}
          allowCustom={true}
        />
        <label class="checkbox-label">
          <input type="checkbox" bind:checked={data.benderSides.print} />
          <span>PRINT</span>
        </label>
      </div>
    </section>

    <!-- Painting Section -->
    <section class="profile-section">
      <h4>Painting</h4>
      <div class="section-grid">
        <MaterialSelector
          bind:value={data.painting.frameType}
          label="Frame Type"
          options={frameTypes}
        />
        <MaterialSelector
          bind:value={data.painting.backMaterial}
          label="Back Material"
          options={materialOptions}
        />
        <ColorSwatchSelector
          bind:value={data.painting.color}
          label="Color"
          {colors}
          allowCustom={true}
        />
        <div class="checkbox-group">
          <label class="checkbox-label">
            <input type="checkbox" bind:checked={data.painting.noLed} />
            <span>NO LED</span>
          </label>
          <label class="checkbox-label">
            <input type="checkbox" bind:checked={data.painting.print} />
            <span>PRINT</span>
          </label>
        </div>
      </div>
    </section>

    <!-- Assembling Section -->
    <section class="profile-section">
      <h4>Assembling</h4>
      <div class="section-grid">
        <MaterialSelector
          bind:value={data.assembling.ledType}
          label="LED Type"
          options={ledTypes}
        />
        
        <div class="options-section">
          <label class="section-label">Waterproof Options</label>
          <div class="checkbox-grid">
            {#each waterproofOptions as option}
              <label class="checkbox-label">
                <input
                  type="checkbox"
                  checked={data.assembling.waterproof.includes(option.id)}
                  on:change={(e) => {
                    const checked = e.currentTarget.checked;
                    if (checked) {
                      data.assembling.waterproof = [...data.assembling.waterproof, option.id];
                    } else {
                      data.assembling.waterproof = data.assembling.waterproof.filter(id => id !== option.id);
                    }
                  }}
                />
                <span>{option.label}</span>
              </label>
            {/each}
          </div>
        </div>

        <div class="options-section">
          <label class="section-label">Frame Options</label>
          <div class="checkbox-grid">
            {#each frameOptionsList as option}
              <label class="checkbox-label">
                <input
                  type="checkbox"
                  checked={data.assembling.frameOptions.includes(option.id)}
                  on:change={(e) => {
                    const checked = e.currentTarget.checked;
                    if (checked) {
                      data.assembling.frameOptions = [...data.assembling.frameOptions, option.id];
                    } else {
                      data.assembling.frameOptions = data.assembling.frameOptions.filter(id => id !== option.id);
                    }
                  }}
                />
                <span>{option.label}</span>
              </label>
            {/each}
          </div>
        </div>

        <div class="options-section">
          <label class="section-label">Special Requirements</label>
          <div class="checkbox-grid">
            {#each specialRequirementsList as option}
              <label class="checkbox-label">
                <input
                  type="checkbox"
                  checked={data.assembling.specialRequirements.includes(option.id)}
                  on:change={(e) => {
                    const checked = e.currentTarget.checked;
                    if (checked) {
                      data.assembling.specialRequirements = [...data.assembling.specialRequirements, option.id];
                    } else {
                      data.assembling.specialRequirements = data.assembling.specialRequirements.filter(id => id !== option.id);
                    }
                  }}
                />
                <span>{option.label}</span>
              </label>
            {/each}
          </div>
        </div>
      </div>
    </section>

    <!-- Delivery Section -->
    <section class="profile-section">
      <h4>Delivery</h4>
      <div class="section-grid">
        <div class="date-input-group">
          <label class="section-label">Delivery Date</label>
          <input
            type="date"
            bind:value={data.delivery.deliveryDate}
            class="date-input"
          />
          {#if data.delivery.deliveryDate}
            <div class="date-display">
              {formatDate(data.delivery.deliveryDate)}
            </div>
          {/if}
        </div>
      </div>
    </section>
  </div>
</div>

<style>
  .profile-7st {
    border: 2px solid var(--accent-1);
    border-radius: var(--radius-md);
    padding: var(--space-lg);
    background: color-mix(in oklab, var(--accent-1) 3%, var(--bg-0));
  }

  .profile-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-lg);
    padding-bottom: var(--space-md);
    border-bottom: 1px solid var(--border);
  }

  .profile-header h3 {
    margin: 0;
    font-size: 1.125rem;
    color: var(--text);
  }

  .remove-btn {
    background: transparent;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: var(--space-xs);
    cursor: pointer;
    color: var(--text);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
  }

  .remove-btn:hover {
    background: var(--danger);
    border-color: var(--danger);
    color: white;
  }

  .profile-sections {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .profile-section {
    background: var(--bg-0);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: var(--space-md);
  }

  .profile-section h4 {
    margin: 0 0 var(--space-md) 0;
    font-size: 0.875rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted);
    font-weight: 600;
  }

  .section-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--space-md);
  }

  .checkbox-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .checkbox-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: var(--space-sm);
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    cursor: pointer;
    font-size: 0.875rem;
  }

  .checkbox-label input[type="checkbox"] {
    cursor: pointer;
  }

  .input-row {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .options-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .section-label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--muted);
  }

  .date-input-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .date-input {
    width: 100%;
    padding: var(--space-sm) var(--space-md);
    border-radius: var(--radius-md);
    border: 1px solid var(--border);
    background: var(--bg-0);
    color: var(--text);
    font: inherit;
    line-height: 1.4;
  }

  .date-input:focus-visible {
    border-color: var(--focus);
    box-shadow: 0 0 0 2px color-mix(in oklab, var(--focus) 28%, transparent);
    outline: none;
  }

  .date-display {
    font-size: 0.875rem;
    color: var(--muted);
    padding: var(--space-xs);
  }
</style>
