<script lang="ts">
  import { onMount } from 'svelte';
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
  let filter = $state<'all' | 'in' | 'out' | 'order' | 'adjustment'>('all');

  async function load() {
    loading = true;
    try {
      const params = new URLSearchParams({ limit: '200' });
      if (filter !== 'all') params.set('kind', filter);
      const res = await fetch(`/api/inventory/movements?${params.toString()}`);
      if (res.ok) movements = await res.json();
    } catch (err) {
      console.error('Failed to load movements:', err);
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    void filter;
    load();
  });

  onMount(load);

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
      <button class="tag" onclick={load} disabled={loading}>
        <Icon name="refresh-cw" size="sm" />
        {$t('common.refresh', { default: 'Refresh' })}
      </button>
    </div>
  </header>

  {#if loading}
    <p class="muted">{$t('actions.loading', { default: 'Loading…' })}</p>
  {:else if movements.length === 0}
    <p class="muted">
      {$t('inventory.movements_page.empty', { default: 'No movements recorded.' })}
    </p>
  {:else}
    <div class="table-wrap">
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
                  <a href="/orders/{m.refPO}">{m.refPO.slice(0, 8)}…</a>
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
  .kind-out, .kind-order { color: var(--brand); background: color-mix(in oklab, var(--brand) 14%, transparent); }
  .kind-in { color: #34c759; background: color-mix(in oklab, #34c759 14%, transparent); }
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
</style>
