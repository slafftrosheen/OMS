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
  import { get } from 'svelte/store';
  import { t } from 'svelte-i18n';

  export let open = false;
  export let onClose: () => void = () => {};

  type MaterialRow = {
    key: string;
    label: string;
    material: string;
    thickness: string;
    color: ColorSpec;
  };

  let id = '';
  let title = '';
  let client = '';
  let due = new Date().toISOString().slice(0, 10);
  let loadingDate = '';
  let pdfPath = '';
  let isRD = false;
  let rdNotes = '';

  function createDefaultMaterials(): MaterialRow[] {
    const translate = get(t);

    return [
      {
        key: 'face',
        label: translate('orderform.defaults.face'),
        material: translate('orderform.defaults.acrylic'),
        thickness: translate('orderform.defaults.thickness_3mm'),
        color: { system: 'RAL', code: 'RAL 9016' }
      },
      {
        key: 'back',
        label: translate('orderform.defaults.back'),
        material: translate('orderform.defaults.acp'),
        thickness: translate('orderform.defaults.thickness_3mm'),
        color: { system: 'RAL', code: 'RAL 9005' }
      },
      {
        key: 'frame',
        label: translate('orderform.defaults.face_frame'),
        material: translate('orderform.defaults.aluminum'),
        thickness: translate('orderform.defaults.thickness_2mm'),
        color: { system: 'Other', code: translate('orderform.defaults.natural') }
      }
    ];
  }

  let materials: MaterialRow[] = createDefaultMaterials();

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
        label: get(t)('orderform.defaults.part'),
        material: '',
        thickness: '',
        color: { system: 'HEX', code: '', hex: '#888888' }
      }
    ];
  }

  function deleteRow(index: number) {
    materials = materials.filter((_, i) => i !== index);
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

  function create() {
    if (!id.trim() || !title.trim() || !client.trim() || !pdfPath.trim()) return;

    const translate = get(t);

    const fields = [
      { key: 'due', label: translate('orderform.due'), value: due },
      { key: 'loading', label: translate('orderform.loading'), value: loadingDate || '' }
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
        name: pdfPath.split('/').pop() || get(t)('orderform.pdf_default_name'),
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
    on:click={handleBackdrop}
    on:keydown={handleBackdropKey}
  >
    <div class="panel" role="dialog" aria-modal="true" aria-label={$t('orderform.title')}>
      <header>
        <h3>{$t('orderform.title')}</h3>
        <button class="x" on:click={close} aria-label={$t('orderform.close')}>✕</button>
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
                <Input bind:value={row.material} placeholder={$t('orderform.material_label')} />
                <Input bind:value={row.thickness} placeholder={$t('orderform.thickness_placeholder')} />
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
                <button class="tag" type="button" on:click={() => deleteRow(index)} aria-label={$t('orderform.remove')}>
                  {$t('orderform.remove_short')}
                </button>
                </div>
              {/each}
              <div class="full">
                <button class="tag" type="button" on:click={addRow}>
                  {$t('orderform.add_section')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer class="row" style="justify-content:flex-end; gap:8px; margin-top:10px">
        <Button variant="ghost" on:click={close}>{$t('actions.cancel')}</Button>
        <Button on:click={create}>{$t('orderform.create')}</Button>
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
