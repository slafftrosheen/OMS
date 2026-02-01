<script lang="ts">
  import { items, lowStock, createItem, updateItem, removeItem } from '$lib/inventory/store';
  import type { Item, Section } from '$lib/inventory/types';
  import { base } from '$app/paths';
  import { t } from 'svelte-i18n';
  import { onDestroy } from 'svelte';
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

  let q = '';
  let list: Item[] = [];
  let low: Item[] = [];

  const unsubItems = items.subscribe((value) => (list = value));
  const unsubLow = lowStock.subscribe((value) => (low = value));

  onDestroy(() => {
    unsubItems?.();
    unsubLow?.();
  });

  const tabs = [
    {id:'materials', label: $t('inventory.materials')},
    {id:'leftovers', label: $t('inventory.leftovers')},
    {id:'paints', label: $t('inventory.paints')},
    {id:'tools', label: $t('inventory.tools')},
    {id:'cons', label: $t('inventory.consumables')},
    {id:'electronics', label: $t('inventory.electronics', { default: 'Electronics' })},
    {id:'3dprinting', label: $t('inventory.3dprinting', { default: '3D Printing' })}
  ];
  
  let currentTab: Section = 'materials';
  
  function handleTabChange(id: string) {
    currentTab = id as Section;
  }
  
  function buildStructure(section: Section) {
    const sectionItems = filtered.filter((item) => (item.section || 'materials') === section);
    const groupMap = new Map<string, Map<string, Item[]>>();
    for (const item of sectionItems) {
      const group = item.group || 'General';
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
            items: items.sort((a, b) => a.name.localeCompare(b.name))
          }))
          .sort((a, b) => a.title.localeCompare(b.title))
      }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }

  $: filtered = list.filter((it) =>
    [it.sku, it.name, it.category, it.location, it.colorCode, it.group, it.subgroup]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(q.toLowerCase())
  );

  $: grouped = buildStructure(currentTab);

  let editing: any = null;
  let showImport = false;
  let showScan = false;

  function handleCreateItem(section: Section, group: string, subgroup = '') {
    editing = { section, group, subgroup };
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
      <button class="tag" on:click={()=>showImport=!showImport}>
        <Upload size={14} aria-hidden="true" />
        {$t('inv.import') || 'Bulk import'}
      </button>
      <button class="tag" on:click={()=>showScan=!showScan}>
        <ScanBarcodeIcon size={14} aria-hidden="true" />
        {$t('inv.scan') || 'Scan barcode'}
      </button>
      <button class="tag" on:click={exportCSV}>
        <Download size={14} aria-hidden="true" />
        Export CSV
      </button>
      <a class="tag" href={`${base}/inventory/new`}>
        <PackagePlus size={14} aria-hidden="true" />
        {$t('inventory.add_item')}
      </a>
      <a class="tag" href={`${base}/inventory/movements`}>
        <ArrowRightLeft size={14} aria-hidden="true" />
        {$t('inventory.movements')}
      </a>
    </div>
  </div>
</section>

{#if showImport}<ImportCSV/>{/if}
{#if showScan}<ScanBarcode/>{/if}

{#if low.length}
  <section class="card">
    <strong>{$t('inventory.low_stock')}</strong>
    <div class="row" style="flex-wrap:wrap;gap:8px">
      {#each low as it}
        <span class="tag" title={$t('inventory.minimum_label', { value: it.min })}>
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
    {#if grouped.length === 0}
      <div class="muted">{$t('inventory.empty_filter')}</div>
    {/if}
    {#each grouped as g (g.id)}
      <details class="group-section" open>
        <summary class="group-summary">
          <span>{g.title}</span>
          <button class="tag" on:click|stopPropagation={() => handleCreateItem(currentTab, g.title)}><Plus size={14} aria-hidden="true"/> {$t('inventory.add')}</button>
        </summary>
        {#each g.subgroups as sub (sub.id)}
          <details class="sub-section" open>
            <summary class="sub-summary">
              <span>{sub.title}</span>
              <button class="tag" on:click|stopPropagation={() => handleCreateItem(currentTab, g.title, sub.title)}><Plus size={14} aria-hidden="true"/> {$t('inventory.add')}</button>
            </summary>
            <div class="table-wrap">
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
                    <tr class:low-stock={it.stock <= it.min}>
                      <td data-label={$t('inventory.headers.sku')}>
                        <a href={`${base}/inventory/${it.id}`} class="sku-link">
                          {#if it.hexColor}
                            <span class="color-swatch" style="background-color: {it.hexColor}"></span>
                          {/if}
                          {it.sku}
                        </a>
                      </td>
                      <td data-label={$t('inventory.headers.name')}>{it.name}</td>
                      <td data-label={$t('inventory.headers.unit')}>{it.unit}</td>
                      <td data-label={$t('inventory.headers.stock')} class:stock-low={it.stock <= it.min}>{it.stock}</td>
                      <td data-label={$t('inventory.headers.minimum')}>{it.min}</td>
                      <td data-label={$t('inventory.headers.location')}>{it.location || '—'}</td>
                      <td class="actions-cell">
                        <a href={`${base}/inventory/${it.id}`} class="icon-btn" aria-label={`Edit ${it.name}`}><Edit size={16} aria-hidden="true"/></a>
                        <button class="icon-btn warn" aria-label={`Delete ${it.name}`} on:click={() => { if (confirm(`Delete ${it.name}?`)) removeItem(it.id); }}><Trash size={16} aria-hidden="true"/></button>
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

{#if editing}
  <ItemModal bind:item={editing} onClose={() => editing = null} />
{/if}

<style>
.table-wrap{overflow:auto}
.rf-table thead th{position:sticky;top:0;background:var(--bg-1);z-index:1}
.rf-table thead th:first-child{left:0}
.link{color:inherit;text-decoration:underline}
.icon{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  padding:4px;
  border-radius:6px;
  border:1px solid var(--border);
  background:var(--bg-0);
  color:var(--text);
  cursor:pointer;
  text-decoration:none;
}
.icon:hover{
  background:var(--bg-2);
}
.icon.warn{
  color:var(--danger);
  border-color:var(--danger);
}
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
  transition: all 0.15s ease;
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

</style>
