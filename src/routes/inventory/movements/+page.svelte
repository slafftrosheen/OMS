<script lang="ts">
  import { scrollRegion } from '$lib/a11y/scroll-region';
  import {base} from '$app/paths';
  import { t } from 'svelte-i18n';
  import Icon from '$lib/ui/Icon.svelte';

  type Movement = {
    id: string;
    materialId: string | null;
    sku: string | null;
    name: string | null;
    kind: string;
    qty: number;
    unit: string;
    by: string | null;
    refPO: string | null;
    note: string | null;
    at: string;
  };

  let movements = $state<Movement[]>([]);
  let loading = $state(true);
  let loadError=$state('');
  let filter = $state<'all' | 'in' | 'out' | 'order' | 'adjustment'>('all');
  let sequence=0;
  async function load(nextFilter=filter) {
    const version=++sequence;
    loading=true;loadError='';movements=[];
    try {
      const params=new URLSearchParams({limit:'200'});
      if(nextFilter!=='all')params.set('kind',nextFilter);
      const response=await fetch(`${base}/api/inventory/movements?${params.toString()}`,
        {cache:'no-store'});
      if(!response.ok)throw Error($t('inventoryConsolidation.historyUnavailable'));
      const body=await response.json();
      if(!Array.isArray(body))throw Error($t('inventoryConsolidation.historyUnavailable'));
      if(version===sequence)movements=body;
    }catch(e){
      if(version===sequence){
        movements=[];
        loadError=e instanceof Error?e.message:$t('inventoryConsolidation.historyUnavailable');
      }
    }finally{if(version===sequence)loading=false;}
  }
  $effect(()=>{void load(filter);});

  function kindLabel(k: string) {
    return $t(`inventory.kinds.${k}`, { default: k });
  }
</script>

<svelte:head>
  <title>{$t('inventory.movements_page.title')} · OMS</title>
</svelte:head>

<section class="card">
  <header class="row">
    <div>
      <h1>{$t('inventory.movements_page.title', { default: 'Inventory movements' })}</h1>
      <p class="muted">
        {$t('inventory.movements_page.description', {
          default: 'Audit trail of stock changes — IN/OUT, adjustments, and order consumption.',
        })}
      </p>
    </div>
    <div class="filters">
      <label for="kind-filter" class="visually-hidden">
        {$t('inventory.movements_page.filter_label', { default: 'Filter by kind' })}
      </label>
      <select id="kind-filter" bind:value={filter}>
        <option value="all">{$t('common.all', { default: 'All' })}</option>
        <option value="in">{kindLabel('in')}</option>
        <option value="out">{kindLabel('out')}</option>
        <option value="order">{kindLabel('order')}</option>
        <option value="adjustment">{kindLabel('adjustment')}</option>
      </select>
      <button class="tag" onclick={()=>void load()} disabled={loading}>
        <Icon name="refresh-cw" size="sm" />
        {$t('common.refresh', { default: 'Refresh' })}
      </button>
    </div>
  </header>

  {#if loading}
    <p class="muted">{$t('actions.loading', { default: 'Loading…' })}</p>
  {:else if loadError}
    <p role="alert" class="muted">{loadError}</p>
  {:else if movements.length === 0}
    <p class="muted">
      {$t('inventory.movements_page.empty', { default: 'No movements recorded.' })}
    </p>
  {:else}
    <div class="table-wrap" role="region" use:scrollRegion aria-label={$t('inventory.movements_page.title')}>
      <table class="rf-table">
        <thead>
          <tr>
            <th>{$t('inventory.movements_page.when', { default: 'When' })}</th>
            <th>{$t('inventory.movements_page.kind', { default: 'Kind' })}</th>
            <th>{$t('inventory.movements_page.sku', { default: 'SKU' })}</th>
            <th>{$t('inventory.movements_page.item', { default: 'Item' })}</th>
            <th class="num">{$t('inventory.movements_page.qty', { default: 'Qty' })}</th>
            <th>{$t('inventory.movements_page.ref', { default: 'Reference' })}</th>
            <th>{$t('inventory.movements_page.note', { default: 'Note' })}</th>
          </tr>
        </thead>
        <tbody>
          {#each movements as m (m.id)}
            <tr>
              <td>{new Date(m.at).toLocaleString()}</td>
              <td>
                <span class="kind kind-{m.kind}">{kindLabel(m.kind)}</span>
              </td>
              <td class="mono">{m.sku ?? '—'}</td>
              <td>{m.name ?? '—'}</td>
              <td class="num">{m.qty} {m.unit}</td>
              <td class="mono">
                {#if m.refPO}
                  <a href={`${base}/orders/${encodeURIComponent(m.refPO)}`}>{m.refPO.slice(0, 8)}…</a>
                {:else}—{/if}
              </td>
              <td>{m.note ?? ''}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>

<style>
  .row { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  h1 { margin: 0 0 4px; font-size: 22px; font-weight: 700; }
  .muted { color: var(--ink-tertiary); margin: 0; }
  .filters { display: flex; gap: 8px; align-items: center; }
  .filters select {
    padding: 8px 10px;
    border-radius: var(--radius-sm, 8px);
    border: 1px solid var(--glass-border);
    background: var(--surface-soft, color-mix(in oklab, var(--ink-primary) 4%, transparent));
    color: var(--ink-primary);
  }
  .table-wrap { overflow-x: auto; margin-top: 12px; }
  .rf-table { width: 100%; border-collapse: collapse; }
  .rf-table th, .rf-table td {
    padding: 8px 12px;
    border-bottom: 1px solid var(--glass-border);
    text-align: left;
    font-size: 14px;
  }
  .rf-table th { font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ink-tertiary); }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .mono { font-family: var(--font-mono, ui-monospace, monospace); font-size: 12px; }
  .kind {
    font-size: 12px;
    padding: 2px 8px;
    border-radius: var(--radius-full, 999px);
    background: color-mix(in oklab, var(--ink-primary) 6%, transparent);
  }
  .kind-out, .kind-order { color: var(--error); background: var(--error-soft); }
  .kind-in { color: var(--ok); background: var(--ok-soft); }
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  /* Movement audit trail: real stock changes, status-specific colours. */
  .card {min-width:0;background:var(--glass-bg-strong);border-color:var(--glass-border);
    border-radius:var(--radius-lg);}
  .row {position:relative;padding:var(--space-md) 0 var(--space-lg);
    border-bottom:1px solid var(--divider);}
  .row::before {content:'';position:absolute;top:0;left:0;height:2px;width:80px;
    background:linear-gradient(90deg,var(--brand),var(--brand-2),transparent);}
  h1 {font-size:clamp(1.5rem,2.5vw,2rem);letter-spacing:var(--tracking-tight);}
  .muted {color:var(--ink-secondary);line-height:1.5;}
  .filters {flex-wrap:wrap;gap:var(--space-sm);}
  .filters select,.filters button {min-height:44px;border-radius:var(--radius-sm);}
  .filters button {background:var(--bg-1);color:var(--ink-primary);
    border:1px solid var(--border);display:inline-flex;align-items:center;gap:var(--space-xs);}
  .table-wrap {margin-top:var(--space-lg);max-width:100%;overflow:auto;scrollbar-width:thin;
    border:1px solid var(--border);border-radius:var(--radius-md);}
  .table-wrap:focus-visible,.filters button:focus-visible,.filters select:focus-visible {
    outline:2px solid var(--focus);outline-offset:2px;}
  .rf-table {min-width:830px;width:100%;font-variant-numeric:tabular-nums;}
  .rf-table th {position:sticky;top:0;background:var(--bg-1);font-size:var(--text-xs);
    color:var(--ink-tertiary);z-index:1;}
  .rf-table th,.rf-table td {border-bottom:1px solid var(--divider);padding:10px 12px;}
  .rf-table tbody tr:hover {background:var(--bg-2);}
  .kind {border-radius:var(--radius-sm);border:1px solid var(--border);}
  .kind-out,.kind-order {border-color:color-mix(in oklab,var(--error) 28%,var(--border));}
  .kind-in {border-color:color-mix(in oklab,var(--ok) 28%,var(--border));}
  .mono {font-variant-numeric:tabular-nums;}
  @media(max-width:650px) {.row{align-items:stretch}.filters{width:100%}.filters select{flex:1;}}
  @media(prefers-reduced-transparency:reduce) {.card{background:var(--bg-1);}}
</style>
