<script lang="ts">
  import { base } from '$app/paths';
  import Input from '$lib/ui/Input.svelte';
  import Button from '$lib/ui/Button.svelte';
  import PdfFrame from '$lib/pdf/PdfFrame.svelte';
  import ColorSwatch from '$lib/colors/ColorSwatch.svelte';
  import type { ColorSpec } from '$lib/colors/color-systems';
  import { isKnownRal } from '$lib/colors/color-systems';
  import LoadingDatePicker from '$lib/order/LoadingDatePicker.svelte';
  import { createOrder } from '$lib/order/signage-store';
  import { blankStages } from '$lib/order/stages';
  import { t } from 'svelte-i18n';
  import { materials as materialsStore } from '$lib/materials/materialsStore';
  import { onMount } from 'svelte';

  let {
    open = $bindable(false),
    onClose = () => {}
  } = $props<{
    open?: boolean;
    onClose?: () => void;
  }>();

  type MaterialRow = {
    key: string;
    label: string;
    material: string;
    thickness: string;
    color: ColorSpec;
  };

  // Define Material type to match the store
  type Material = {
    id: string;
    category: string;
    code: string;
    name_en: string;
    name_ru?: string;
    name_lv?: string;
    thickness_options: number[];
    metadata: Record<string, any>;
  };

  let id = $state('');
  let title = $state('');
  let client = $state('');
  let due = $state(new Date().toISOString().slice(0, 10));
  let loadingDate = $state('');
  let pdfPath = $state('');
  let isRD = $state(false);
  let rdNotes = $state('');

  const defaultMaterials = $derived([
    {
      key: 'face',
      label: $t('orderform.defaults.face'),
      material: $t('orderform.defaults.acrylic'),
      thickness: $t('orderform.defaults.thickness_3mm'),
      color: { system: 'RAL', code: 'RAL 9016' }
    },
    {
      key: 'back',
      label: $t('orderform.defaults.back'),
      material: $t('orderform.defaults.acp'),
      thickness: $t('orderform.defaults.thickness_3mm'),
      color: { system: 'RAL', code: 'RAL 9005' }
    },
    {
      key: 'frame',
      label: $t('orderform.defaults.face_frame'),
      material: $t('orderform.defaults.aluminum'),
      thickness: $t('orderform.defaults.thickness_2mm'),
      color: { system: 'Other', code: $t('orderform.defaults.natural') }
    }
  ]);

  function createDefaultMaterials(): MaterialRow[] {
    // Return a copy of the reactive default materials
    return defaultMaterials.map(material => ({ ...material }));
  }

  let materials: MaterialRow[] = $state(createDefaultMaterials());
  let availableMaterials: Material[] = $state([]);
  let allMaterialsLoaded = $state(false);

  onMount(async () => {
    // Load materials from the store
    await materialsStore.load();
    const unsub = materialsStore.subscribe((loadedMaterials) => {
      availableMaterials = loadedMaterials;
      allMaterialsLoaded = true;
    });
    return unsub;
  });

  function resetForm() {
    id = '';
    title = '';
    client = '';
    due = new Date().toISOString().slice(0, 10);
    loadingDate = '';
    pdfPath = '';
    isRD = false;
    rdNotes = '';
    materials = createDefaultMaterials();
  }

  function addRow() {
    const index = materials.length + 1;
    materials = [
      ...materials,
      {
        key: `part_${index}`,
        label: $t('orderform.defaults.part'),
        material: '',
        thickness: '',
        color: { system: 'HEX', code: '', hex: '#888888' }
      }
    ];
  }

  function deleteRow(index: number) {
    materials = materials.filter((_, i) => i !== index);
  }

  function getThicknessOptionsForMaterial(materialCode: string): number[] {
    if (!allMaterialsLoaded) return [];
    
    const material = availableMaterials.find(m => 
      m.code === materialCode || m.name_en === materialCode
    );
    
    return material ? material.thickness_options || [] : [];
  }

  function updateMaterialAndThickness(rowIndex: number, newMaterial: string) {
    materials[rowIndex].material = newMaterial;
    
    // Automatically select the lowest available thickness when material changes
    const availableThicknesses = getThicknessOptionsForMaterial(newMaterial);
    if (availableThicknesses.length > 0) {
      // Sort thicknesses numerically and select the lowest
      const lowestThickness = Math.min(...availableThicknesses);
      materials[rowIndex].thickness = String(lowestThickness);
    } else {
      materials[rowIndex].thickness = '';
    }
  }

  function updateThicknessDisplay(rowIndex: number) {
    // This function can be used to update any display logic if needed
  }

  function isHexValid(value: string | undefined) {
    if (!value) return true;
    return /^#?[0-9a-f]{6}$/i.test(value.trim());
  }

  function needsRalWarning(code: string | undefined) {
    if (!code) return false;
    return !isKnownRal(code.trim());
  }

  function close() {
    open = false;
    onClose();
  }

  async function create() {
    if (!id.trim() || !title.trim() || !client.trim() || !pdfPath.trim()) return;

    // For Svelte 5, we need to handle translations differently
    // We'll use the global $t function which should be available
    // This requires the t store to be properly configured globally
    const fields = [
      { key: 'due', label: $t('orderform.due'), value: due },
      { key: 'loading', label: $t('orderform.loading'), value: loadingDate || '' }
    ];

    const mats = materials.map((item) => ({
      key: item.key,
      label: `${item.label} (${item.material} ${item.thickness})`,
      value: `${item.material} ${item.thickness} – ${item.color.system} ${item.color.code}`
    }));

    const stages = blankStages();

    createOrder({
      id,
      title,
      client,
      due,
      badges: isRD ? ['OPEN', 'R&D'] : ['OPEN', 'IN_PROGRESS'],
      fields,
      materials: mats,
      isRD,
      rdNotes,
      stages,
      cycles: [],
      loadingDate,
      file: {
        id: crypto.randomUUID(),
        name: pdfPath.split('/').pop() || $t('orderform.pdf_default_name'),
        path: pdfPath,
        kind: 'pdf'
      }
    });

    resetForm();
    close();
  }

  function handleBackdrop(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      close();
    }
  }

  function handleBackdropKey(event: KeyboardEvent) {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      close();
    }
  }
</script>

{#if open}
  <div
    class="shade"
    role="button"
    tabindex="0"
    aria-label={$t('orderform.close')}
    onclick={handleBackdrop}
    onkeydown={handleBackdropKey}
  >
    <div class="panel" role="dialog" aria-modal="true" aria-label={$t('orderform.title')}>
      <header>
        <h3>{$t('orderform.title')}</h3>
        <button class="x" onclick={close} aria-label={$t('orderform.close')}>✕</button>
      </header>

      <section class="grid" style="grid-template-columns:1.2fr 1fr; gap:12px">
        <div class="pdf-stack">
          <PdfFrame src={pdfPath} />
          <div class="card">
            <h4>{$t('orderform.pdf_source')}</h4>
            <div class="muted" style="font-size:.85rem;margin-bottom:6px">
              {@html $t('orderform.pdf_hint', { path: `<code>${base}/files/</code>` })}
            </div>
            <Input
              bind:value={pdfPath}
              placeholder={$t('orderform.pdf_placeholder', { base })}
              ariaLabel={$t('orderform.pdf_path_label')}
            />
          </div>
        </div>

        <div class="grid">
          <div class="card">
            <h4>{$t('orderform.basics')}</h4>
            <div class="grid" style="grid-template-columns:1fr 1fr">
              <Input bind:value={id} placeholder={$t('orderform.po')} />
              <Input bind:value={client} placeholder={$t('orderform.client')} />
              <div style="grid-column:span 2">
                <Input bind:value={title} placeholder={$t('orderform.order_title')} />
              </div>
              <div>
                <label class="muted" for="order-due-input">{$t('orderform.due')}</label>
                <input id="order-due-input" class="rf-input" type="date" bind:value={due} />
              </div>
              <div>
                <label class="muted" for="order-loading-input">{$t('orderform.loading')}</label>
                <LoadingDatePicker id="order-loading-input" bind:selected={loadingDate} ariaLabel={$t('orderform.loading')} />
              </div>
              <div style="grid-column:span 2" class="row">
                <label class="tag">
                  <input type="checkbox" bind:checked={isRD} /> {$t('rd.flag')}
                </label>
              </div>
              {#if isRD}
                <div style="grid-column:span 2">
                  <label class="muted" for="order-rd-notes">{$t('rd.notes')}</label>
                  <textarea id="order-rd-notes" class="rf-input" rows="3" bind:value={rdNotes}></textarea>
                </div>
              {/if}
            </div>
          </div>

          <div class="card">
            <h4>{$t('orderform.materials')}</h4>
            <div class="materials-grid">
              {#each materials as row, index}
                <Input bind:value={row.label} placeholder={$t('orderform.section_label')} />
                
                <!-- Material selection dropdown -->
                <select 
                  class="rf-select" 
                  bind:value={row.material}
                  onchange={() => updateMaterialAndThickness(index, row.material)}
                >
                  <option value="">{$t('orderform.material_label')}</option>
                  {#if allMaterialsLoaded}
                    {#each availableMaterials as material}
                      <option value={material.code || material.name_en}>
                        {material.name_en} ({material.code})
                      </option>
                    {/each}
                  {:else}
                    <option value="">Loading materials...</option>
                  {/if}
                </select>
                
                <!-- Thickness selection dropdown, populated based on selected material -->
                <select 
                  class="rf-select" 
                  bind:value={row.thickness}
                  disabled={!row.material}
                  onchange={() => updateThicknessDisplay(index)}
                >
                  <option value="">{$t('orderform.thickness_placeholder')}</option>
                  {#if row.material && allMaterialsLoaded}
                    {#each getThicknessOptionsForMaterial(row.material) as thickness}
                      <option value={thickness}>
                        {thickness}mm
                      </option>
                    {/each}
                  {/if}
                </select>
                
                <select class="rf-select" bind:value={row.color.system}>
                  <option value="RAL">{$t('orderform.color_system.ral')}</option>
                  <option value="Pantone">{$t('orderform.color_system.pantone')}</option>
                  <option value="HEX">{$t('orderform.color_system.hex')}</option>
                  <option value="Other">{$t('orderform.color_system.other')}</option>
                </select>
                <Input
                  bind:value={row.color.code}
                  placeholder={row.color.system === 'HEX' ? '#RRGGBB' : $t('orderform.color_placeholder')}
                />

                {#if row.color.system === 'HEX' && row.color.code && !isHexValid(row.color.code)}
                  <div class="full warn">{$t('orderform.invalid_hex')}</div>
                {/if}

                {#if row.color.system !== 'HEX'}
                  <div class="full-block">
                    <Input bind:value={row.color.hex} placeholder={$t('orderform.optional_hex')} />
                    {#if row.color.hex && !isHexValid(row.color.hex)}
                      <div class="warn">{$t('orderform.invalid_hex')}</div>
                    {/if}
                    {#if row.color.system === 'RAL' && row.color.code && needsRalWarning(row.color.code)}
                      <div class="warn">{$t('orderform.unknown_ral')}</div>
                    {/if}
                  </div>
                {/if}

                <div class="row full" style="align-items:center; gap:6px">
                  <ColorSwatch color={row.color} />
                <button class="tag" type="button" onclick={() => deleteRow(index)} aria-label={$t('orderform.remove')}>
                  {$t('orderform.remove_short')}
                </button>
                </div>
              {/each}
              <div class="full">
                <button class="tag" type="button" onclick={addRow}>
                  {$t('orderform.add_section')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer class="row" style="justify-content:flex-end; gap:8px; margin-top:10px">
        <Button variant="ghost" onclick={close}>{$t('actions.cancel')}</Button>
        <Button onclick={create}>{$t('orderform.create')}</Button>
      </footer>
    </div>
  </div>
{/if}

<style>
.shade{position:fixed;inset:0;background:rgba(0,0,0,.45);display:grid;place-items:center;z-index:99}
.panel{background:var(--bg-1);border:1px solid var(--border);border-radius:14px;min-width:920px;max-width:95vw;max-height:90vh;padding:14px;overflow:auto}
header{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
.x{background:transparent;border:none;color:var(--text);cursor:pointer;font-size:1.1rem}
.pdf-stack{display:grid;gap:12px}
.materials-grid{
  display:grid;
  grid-template-columns:repeat(5,minmax(0,1fr));
  gap:8px;
}
.materials-grid .full{grid-column:1 / -1}
.materials-grid .full-block{
  grid-column:1 / -1;
  display:flex;
  flex-direction:column;
  gap:4px;
}
.warn{color:var(--danger);font-size:.8rem}
</style>
