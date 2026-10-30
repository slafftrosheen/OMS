<script lang="ts">
  import { scrollRegion } from '$lib/a11y/scroll-region';
  import { materials, catalogError, isLoading as catalogLoading, removeMaterial, loadMaterials, getLowStockMaterials } from '$lib/inventory/store';
  import type { Material, Section } from '$lib/inventory/types';
  import { base } from '$app/paths';
  import {currentUser} from '$lib/auth/authState.svelte';
  import { t } from 'svelte-i18n';
  import { onMount, untrack } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { getAssistantContext } from '$lib/assistant/context';
  import { createScreenReadScope, inventoryListScreenContext, screenOwnerKey, type InventoryEditorSnapshot } from '$lib/assistant/operational-context';
  import { toCSV, downloadCSV } from '$lib/inventory/export';
  import Tabs from '$lib/ui/Tabs.svelte';
  import ItemModal from '$lib/inventory/ItemModal.svelte';
  import ImportCSV from '$lib/inventory/ImportCSV.svelte';
  import ScanBarcode from '$lib/inventory/ScanBarcode.svelte';
  import Plus from 'lucide-svelte/icons/plus';
  import Edit from 'lucide-svelte/icons/pencil';
  import Trash from 'lucide-svelte/icons/trash-2';
  import Upload from 'lucide-svelte/icons/upload';
  import ScanBarcodeIcon from 'lucide-svelte/icons/scan-barcode';
  import Download from 'lucide-svelte/icons/download';
  import PackagePlus from 'lucide-svelte/icons/package-plus';
  import ArrowRightLeft from 'lucide-svelte/icons/arrow-right-left';
  import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';
  import { emptyConfirm, type ConfirmState } from '$lib/components/ui/confirm-types';

  let canManage=$derived(['RD','Boss','HeadOfProduction'].includes($currentUser?.role??''));
  const assistant = getAssistantContext();
  const catalogReads = createScreenReadScope();
  let accountScope = $derived(screenOwnerKey($currentUser));
  let loadedScope = $state('');
  let editorSnapshot = $state<InventoryEditorSnapshot | null>(null);
  let collapsedGroups = $state(new SvelteSet<string>());
  let confirmState = $state<ConfirmState>(emptyConfirm());
  function askDelete(it: Material) {
    confirmState = {
      open: true,
      title: $t('inventory.delete_title', { default: 'Delete material' }),
      body: $t('inventory.delete_confirm', {
        default: 'Permanently delete "{name}"?',
        values: { name: it.name_en || it.code }
      }),
      tone: 'danger',
      action: async () => { await removeMaterial(it.id); }
    };
  }

  let inventoryError=$state<string|null>(null);
  let q = $state('');
  let list: Material[] = $state([]);
  let low: Material[] = $state([]);

  // Load materials and subscribe to store updates
  onMount(() => {
    const unsub=materials.subscribe(value=>{
      if (loadedScope !== accountScope) return;
      list=value;
      low=getLowStockMaterials();
    });
    const unsubError=catalogError.subscribe(value=>inventoryError=value);
    return()=>{unsub();unsubError();};
  });

  async function refreshInventory() {
    const owner = accountScope;
    if (!owner) return;
    const request = catalogReads.begin(owner);
    const result = await loadMaterials({ signal: request.signal, accept: () => request.accepts(accountScope) });
    if (!request.accepts(accountScope)) return;
    loadedScope = owner; list = result;
    low = result.filter(row => row.stock <= row.min_stock);
  }
  $effect(() => {
    const owner = accountScope;
    return untrack(() => {
      loadedScope = ''; list = []; low = []; inventoryError = null;
      editing = null; editorSnapshot = null; confirmState = emptyConfirm();
      showImport = false; showScan = false;
      const unregister = assistant.register({
        id: `inventory:${owner}`, title: () => $t('assistant.screen.inventory'), tools: () => [],
        context: () => inventoryListScreenContext({
          current: loadedScope === accountScope, loading: $catalogLoading || loadedScope !== accountScope,
          error: !!inventoryError, section: currentTab, search: q, matchingAllSections: filtered.length,
          rows: grouped.filter(group => !collapsedGroups.has(group.id)).flatMap(group => group.subgroups
            .filter(subgroup => !collapsedGroups.has(subgroup.id)).flatMap(subgroup => subgroup.items)),
          lowStock: low, canManage, editor: editing ? editorSnapshot : null,
          importOpen: showImport, scannerOpen: showScan
        })
      });
      void refreshInventory();
      return () => { catalogReads.cancel(); unregister(); };
    });
  });
  function rememberGroup(id: string, open: boolean) {
    if (open) collapsedGroups.delete(id); else collapsedGroups.add(id);
  }

  const tabs = [
    {id:'materials', label: $t('inventory.materials')},
    {id:'leftovers', label: $t('inventory.leftovers')},
    {id:'paints', label: $t('inventory.paints')},
    {id:'tools', label: $t('inventory.tools')},
    {id:'cons', label: $t('inventory.consumables')},
    {id:'electronics', label: $t('inventory.electronics', { default: 'Electronics' })},
    {id:'3dprinting', label: $t('inventory.3dprinting', { default: '3D Printing' })}
  ];

  let currentTab: Section = $state('materials');

  function handleTabChange(id: string) {
    currentTab = id as Section;
  }

  function buildStructure(section: Section) {
    const sectionItems = filtered.filter((item) => (item.section || 'materials') === section);
    const groupMap = new Map<string, Map<string, Material[]>>();
    for (const item of sectionItems) {
      const group = item.item_group || 'General';
      const subgroup = item.subgroup || 'General';
      if (!groupMap.has(group)) {
        groupMap.set(group, new Map());
      }
      const subgroupMap = groupMap.get(group)!;
      if (!subgroupMap.has(subgroup)) {
        subgroupMap.set(subgroup, []);
      }
      subgroupMap.get(subgroup)!.push(item);
    }
    return Array.from(groupMap.entries())
      .map(([groupName, subgroupMap]) => ({
        id: `${section}-${groupName}`,
        title: groupName,
        subgroups: Array.from(subgroupMap.entries())
          .map(([subName, items]) => ({
            id: `${section}-${groupName}-${subName}`,
            title: subName,
            items: items.sort((a, b) => (a.name_en || '').localeCompare(b.name_en || ''))
          }))
          .sort((a, b) => a.title.localeCompare(b.title))
      }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }

  let filtered = $derived(list.filter((it) =>
    [it.sku, it.name_en, it.category, it.location, it.color_code, it.item_group, it.subgroup]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(q.toLowerCase())
  ));

  let grouped = $derived(buildStructure(currentTab));

  let editing: any = $state(null);
  let showImport = $state(false);
  let showScan = $state(false);

  function handleCreateItem(section: Section, group: string, subgroup = '') {
    editing = { section, item_group: group, subgroup };
  }
  function exportCSV(){ downloadCSV(`inventory-${new Date().toISOString().slice(0,10)}.csv`, toCSV(list)); }
</script>

<section class="card">
  <div class="row" style="justify-content:space-between;align-items:end">
    <div style="flex:1;min-width:220px">
      <label class="muted" for="inventory-search">{$t('inventory.search')}</label>
      <input
        id="inventory-search"
        class="rf-input"
        bind:value={q}
        placeholder={$t('inventory.search_placeholder')}
        type="search"
      />
    </div>
    <div class="row">
      {#if canManage}
        <button class="tag" type="button" aria-expanded={showImport} onclick={()=>showImport=!showImport}>
          <Upload size={14} aria-hidden="true" />
          {$t('inv.import') || 'Bulk import'}
        </button>
      {/if}
      <button class="tag" type="button" aria-expanded={showScan} onclick={()=>showScan=!showScan}>
        <ScanBarcodeIcon size={14} aria-hidden="true" />
        {$t('inv.scan') || 'Scan barcode'}
      </button>
      <button class="tag" onclick={exportCSV}>
        <Download size={14} aria-hidden="true" />
        {$t('inventory.exportCsv')}
      </button>
      {#if canManage}
        <a class="tag" href={`${base}/inventory/new`}>
          <PackagePlus size={14} aria-hidden="true" />
          {$t('inventory.add_item')}
        </a>
      {/if}
      <a class="tag" href={`${base}/inventory/movements`}>
        <ArrowRightLeft size={14} aria-hidden="true" />
        {$t('inventory.movements')}
      </a>
      {#if canManage}
        <a class="tag" href={`${base}/inventory/consistency`}>
          {$t('inventoryConsistency.open')}
        </a>
        <a class="tag" href={`${base}/inventory/replenishment`}>
          {$t('inventoryReplenishment.title')}
        </a>
      {/if}
    </div>
  </div>
</section>

{#if inventoryError}
  <section class="card" role="alert">
    <p>{$t('inventoryConsolidation.catalogUnavailable')}</p>
    <button class="tag" onclick={()=>void refreshInventory()}>
      {$t('common.refresh', {default:'Refresh'})}
    </button>
  </section>
{/if}
{#if showImport && canManage && !inventoryError}<ImportCSV/>{/if}
{#if showScan}<ScanBarcode/>{/if}

{#if low.length}
  <section class="card">
    <strong>{$t('inventory.low_stock')}</strong>
    <div class="row" style="flex-wrap:wrap;gap:8px">
      {#each low as it}
        <span class="tag" title={$t('inventory.minimum_label', { value: it.min_stock })}>
          {it.sku}: {it.stock} {it.unit}
        </span>
      {/each}
    </div>
  </section>
{/if}

<section class="card">
  <header class="row" style="justify-content:space-between;align-items:center;margin-bottom:12px">
    <h1 style="margin:0">{$t('inventory.title')}</h1>
    <span class="muted">{$t('inventory.count', { count: filtered.length })}</span>
  </header>
  
  <Tabs tabs={tabs} active={currentTab} onChange={handleTabChange} />
  
  <div style="margin-top:16px">
    {#if inventoryError}
      <p role="alert">{$t('inventoryConsolidation.catalogUnavailable')}</p>
    {:else if grouped.length === 0}
      <div class="muted">{$t('inventory.empty_filter')}</div>
    {/if}
    {#each grouped as g (g.id)}
      <details class="group-section" open={!collapsedGroups.has(g.id)} ontoggle={event => rememberGroup(g.id, event.currentTarget.open)}>
        <summary class="group-summary">
          <span>{g.title}</span>
          {#if canManage}
            <button class="tag" type="button" onclick={(e) => { e.preventDefault(); e.stopPropagation(); handleCreateItem(currentTab, g.title); }}><Plus size={14} aria-hidden="true"/> {$t('inventory.add')}</button>
          {/if}
        </summary>
        {#each g.subgroups as sub (sub.id)}
          <details class="sub-section" open={!collapsedGroups.has(sub.id)} ontoggle={event => rememberGroup(sub.id, event.currentTarget.open)}>
            <summary class="sub-summary">
              <span>{sub.title}</span>
              {#if canManage}
                <button class="tag" type="button" onclick={(e) => { e.preventDefault(); e.stopPropagation(); handleCreateItem(currentTab, g.title, sub.title); }}><Plus size={14} aria-hidden="true"/> {$t('inventory.add')}</button>
              {/if}
            </summary>
            <div class="table-wrap" role="region" use:scrollRegion aria-label={`${g.title} — ${sub.title}`}>
              <table class="rf-table">
                <thead>
                  <tr>
                    <th scope="col">{$t('inventory.headers.sku')}</th>
                    <th scope="col">{$t('inventory.headers.name')}</th>
                    <th scope="col">{$t('inventory.headers.unit')}</th>
                    <th scope="col">{$t('inventory.headers.stock')}</th>
                    <th scope="col">{$t('inventory.headers.minimum')}</th>
                    <th scope="col">{$t('inventory.headers.location')}</th>
                    <th scope="col"></th>
                  </tr>
                </thead>
                <tbody>
                  {#each sub.items as it (it.id)}
                    <tr class:low-stock={it.stock <= it.min_stock}>
                      <td data-label={$t('inventory.headers.sku')}>
                        <a href={`${base}/inventory/${it.id}`} class="sku-link">
                          {#if it.hex_color}
                            <span class="color-swatch" style="background-color: {it.hex_color}"></span>
                          {/if}
                          {it.sku}
                        </a>
                      </td>
                      <td data-label={$t('inventory.headers.name')}>{it.name_en || it.code}</td>
                      <td data-label={$t('inventory.headers.unit')}>{it.unit}</td>
                      <td data-label={$t('inventory.headers.stock')} class:stock-low={it.stock <= it.min_stock}>{it.stock}</td>
                      <td data-label={$t('inventory.headers.minimum')}>{it.min_stock}</td>
                      <td data-label={$t('inventory.headers.location')}>{it.location || '—'}</td>
                      <td class="actions-cell">
                        <a href={`${base}/inventory/${it.id}`} class="icon-btn" aria-label={`Edit ${it.name_en || it.code}`}><Edit size={16} aria-hidden="true"/></a>
                        {#if canManage}
                          <button class="icon-btn warn" aria-label={`Delete ${it.name_en || it.code}`} onclick={() => askDelete(it)}><Trash size={16} aria-hidden="true"/></button>
                        {/if}
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </details>
        {/each}
      </details>
    {/each}
  </div>

</section>

{#if editing && canManage}
  <ItemModal bind:item={editing} onDraftChange={snapshot => editorSnapshot = snapshot} onClose={() => { editing = null; editorSnapshot = null; }} />
{/if}

<ConfirmModal bind:state={confirmState} />

<style>
.table-wrap{overflow:auto}
.rf-table thead th{position:sticky;top:0;background:var(--bg-1);z-index:1}
.rf-table thead th:first-child{left:0}
.group-section{
  margin-bottom:20px;
  padding:12px;
  border:1px solid color-mix(in oklab,var(--border) 85%, transparent);
  border-radius:12px;
  background:var(--bg-0);
}
.group-summary, .sub-summary{
  display:flex;
  justify-content:space-between;
  align-items:center;
  gap:8px;
  list-style:none;
  cursor:pointer;
}
.group-summary::-webkit-details-marker, .sub-summary::-webkit-details-marker{display:none}
.sub-section{
  margin-top:12px;
  padding:12px;
  border:1px solid color-mix(in oklab,var(--border) 75%, transparent);
  border-radius:10px;
  background:var(--bg-1);
}
.sub-summary{font-weight:600}

/* Modern table styling */
.sku-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--link);
  text-decoration: none;
  font-weight: 500;
}
.sku-link:hover {
  text-decoration: underline;
}
.color-swatch {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  border: 1px solid var(--border);
  flex-shrink: 0;
}
.stock-low {
  color: var(--danger);
  font-weight: 600;
}
tr.low-stock {
  background: color-mix(in oklab, var(--danger) 8%, transparent);
}
.actions-cell {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
}
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg-0);
  color: var(--text);
  cursor: pointer;
  text-decoration: none;
  transition: background var(--motion-sm) var(--ease-standard), color var(--motion-sm) var(--ease-standard);
}
.icon-btn:hover {
  background: var(--bg-2);
  transform: translateY(-1px);
}
.icon-btn.warn {
  color: var(--danger);
  border-color: color-mix(in oklab, var(--danger) 50%, var(--border));
}
.icon-btn.warn:hover {
  background: color-mix(in oklab, var(--danger) 15%, var(--bg-0));
}


  /* Warehouse surfaces: stock/low-stock semantics, faithful product swatches. */
  :global(.rf-main) > .card {min-width:0;}
  .card {border:1px solid var(--glass-border);border-radius:var(--radius-lg);
    background:var(--glass-bg-strong);box-shadow:var(--glass-shadow-sm);}
  .card > .row {gap:var(--space-md);flex-wrap:wrap;}
  .card :global(.rf-input) {min-height:44px;color:var(--ink-primary);background:var(--bg-1);
    border-radius:var(--radius-sm);}
  .card .row .tag {min-height:40px;border-radius:var(--radius-sm);padding:8px 12px;
    color:var(--ink-secondary);border:1px solid var(--border);background:var(--bg-1);
    display:inline-flex;align-items:center;justify-content:center;gap:var(--space-xs);}
  .card .row .tag:hover {color:var(--ink-primary);background:var(--bg-2);}
  .card .row .tag:focus-visible {outline:2px solid var(--focus);outline-offset:2px;}
  .group-section {background:var(--bg-1);border-color:var(--glass-border);
    border-radius:var(--radius-lg);padding:var(--space-md);margin-bottom:var(--space-lg);}
  .group-summary {font-weight:700;font-size:var(--text-md);
    border-bottom:1px solid var(--divider);padding-bottom:var(--space-sm);}
  .sub-section {background:var(--bg-2);border-color:var(--border);
    border-radius:var(--radius-md);padding:var(--space-md);min-width:0;}
  .sub-summary {color:var(--ink-secondary);font-weight:700;}
  .group-summary:focus-visible,.sub-summary:focus-visible {outline:2px solid var(--focus);outline-offset:3px;}
  .group-summary button,.sub-summary button {min-height:36px;}
  .table-wrap {max-width:100%;overflow-x:auto;overscroll-behavior-x:contain;
    scrollbar-width:thin;border:1px solid var(--border);border-radius:var(--radius-sm);
    margin-top:var(--space-sm);}
  .table-wrap:focus-visible {outline:2px solid var(--focus);outline-offset:2px;}
  .rf-table {min-width:690px;width:100%;font-variant-numeric:tabular-nums;}
  .rf-table thead th {background:var(--bg-1);color:var(--ink-tertiary);}
  .rf-table tbody tr:hover {background:var(--bg-1);}
  .rf-table tbody td {border-bottom:1px solid var(--divider);}
  .sku-link {color:var(--link);font-weight:650;}
  .color-swatch {width:18px;height:18px;border-radius:var(--radius-sm);}
  .stock-low {color:var(--error);}
  tr.low-stock {background:var(--error-soft);}
  .icon-btn {width:40px;height:40px;min-height:40px;border-radius:var(--radius-sm);
    color:var(--ink-secondary);background:var(--bg-1);}
  .icon-btn:hover {background:var(--bg-2);color:var(--ink-primary);transform:none;}
  .icon-btn.warn {color:var(--error);}
  .icon-btn:focus-visible {outline:2px solid var(--focus);outline-offset:2px;}
  @media(max-width:700px) {
    .card {padding:var(--space-md);}
    .card > .row {align-items:stretch!important;}
    .group-section,.sub-section {padding:var(--space-sm);}
    .group-summary,.sub-summary {flex-wrap:wrap;}
  }
  @media(prefers-reduced-transparency:reduce) {.card {background:var(--bg-1);}}
</style>
