<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';

  type Column = {
    key: string;
    label: string;
    width?: string;
    align?: 'left' | 'center' | 'right';
    numeric?: boolean;
    sortable?: boolean;
    cell?: Snippet<[{ row: any; value: any }]>;
  };

  interface Props {
    columns?: Column[];
    rows?: any[];
    filterKey?: string | null;
    filterText?: string;
    rowKey?: string;
    striped?: boolean;
    stickyHeader?: boolean;
    emptyText?: string;
  }

  let {
    columns = [],
    rows = [],
    filterKey = null,
    filterText = '',
    rowKey = 'id',
    striped = false,
    stickyHeader = false,
    emptyText = 'No data'
  }: Props = $props();

  let sortKey: string | null = $state(null);
  let sortAsc = $state(true);

  function setSort(k: string) {
    if (sortKey === k) sortAsc = !sortAsc;
    else { sortKey = k; sortAsc = true; }
  }

  let filtered = $derived(rows.filter(r => {
    if (!filterKey || !filterText) return true;
    return String(r[filterKey] ?? '').toLowerCase().includes(filterText.toLowerCase());
  }));

  let sorted = $derived([...filtered].sort((a, b) => {
    if (!sortKey) return 0;
    const av = a[sortKey], bv = b[sortKey];
    return (av > bv ? 1 : av < bv ? -1 : 0) * (sortAsc ? 1 : -1);
  }));

  function rowId(r: any, i: number): string {
    return String(r[rowKey] ?? i);
  }
</script>

<div class="rf-table-wrap">
  <table class="rf-table" data-striped={striped || null}>
    <thead class="rf-table__head" data-sticky={stickyHeader || null}>
      <tr>
        {#each columns as col}
          <th
            class="rf-table__th"
            style={col.width ? `width:${col.width}` : undefined}
            data-align={col.align ?? (col.numeric ? 'right' : 'left')}
            data-sortable={col.sortable !== false ? '' : null}
            onclick={col.sortable !== false ? () => setSort(col.key) : undefined}
            aria-sort={sortKey === col.key ? (sortAsc ? 'ascending' : 'descending') : undefined}
          >
            <span class="rf-table__th-inner">
              {col.label}
              {#if col.sortable !== false}
                <span class="rf-table__sort-icon" aria-hidden="true">
                  {#if sortKey === col.key}
                    <Icon name={sortAsc ? 'chevron-up' : 'chevron-down'} size="xs" />
                  {:else}
                    <Icon name="chevrons-up-down" size="xs" />
                  {/if}
                </span>
              {/if}
            </span>
          </th>
        {/each}
      </tr>
    </thead>
    <tbody class="rf-table__body">
      {#if sorted.length === 0}
        <tr>
          <td colspan={columns.length} class="rf-table__empty">{emptyText}</td>
        </tr>
      {:else}
        {#each sorted as r, i (rowId(r, i))}
          <tr class="rf-table__row">
            {#each columns as col}
              <td
                class="rf-table__td"
                data-align={col.align ?? (col.numeric ? 'right' : 'left')}
                style={col.numeric ? 'font-variant-numeric:tabular-nums' : undefined}
              >
                {#if col.cell}
                  {@render col.cell({ row: r, value: r[col.key] })}
                {:else}
                  {r[col.key] ?? '—'}
                {/if}
              </td>
            {/each}
          </tr>
        {/each}
      {/if}
    </tbody>
  </table>
</div>

<style>
  .rf-table-wrap {
    width: 100%;
    overflow-x: auto;
    border-radius: var(--radius-md);
    border: 1px solid var(--border);
    background: var(--bg-0);
  }

  .rf-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-sm);
  }

  /* Head */
  .rf-table__head {
    background: color-mix(in oklab, var(--bg-1) 60%, var(--bg-0));
  }
  .rf-table__head[data-sticky] {
    position: sticky;
    top: 0;
    z-index: var(--z-sticky);
    backdrop-filter: var(--glass-material-thin);
    -webkit-backdrop-filter: var(--glass-material-thin);
  }

  .rf-table__th {
    padding: var(--space-sm) var(--space-md);
    text-align: left;
    font-size: var(--text-xs);
    font-weight: 700;
    letter-spacing: var(--tracking-wide);
    text-transform: uppercase;
    color: var(--ink-tertiary);
    border-bottom: 1px solid var(--divider);
    white-space: nowrap;
    user-select: none;
  }
  .rf-table__th[data-align="right"]  { text-align: right; }
  .rf-table__th[data-align="center"] { text-align: center; }
  .rf-table__th[data-sortable] { cursor: pointer; }
  .rf-table__th[data-sortable]:hover { color: var(--ink-primary); }

  .rf-table__th-inner {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xxs);
  }

  .rf-table__sort-icon {
    display: inline-flex;
    opacity: 0.5;
    transition: opacity var(--motion-sm) var(--ease-standard);
  }
  .rf-table__th[aria-sort] .rf-table__sort-icon { opacity: 1; color: var(--brand); }

  /* Body */
  .rf-table__td {
    padding: var(--space-sm) var(--space-md);
    border-bottom: 1px solid var(--divider);
    color: var(--ink-primary);
    vertical-align: middle;
  }
  .rf-table__td[data-align="right"]  { text-align: right; }
  .rf-table__td[data-align="center"] { text-align: center; }

  .rf-table__row:last-child .rf-table__td { border-bottom: none; }

  .rf-table__row:hover .rf-table__td {
    background: color-mix(in oklab, var(--brand) 5%, transparent);
  }

  .rf-table[data-striped] .rf-table__row:nth-child(even) .rf-table__td {
    background: color-mix(in oklab, var(--bg-1) 35%, transparent);
  }
  .rf-table[data-striped] .rf-table__row:nth-child(even):hover .rf-table__td {
    background: color-mix(in oklab, var(--brand) 5%, transparent);
  }

  .rf-table__empty {
    padding: var(--space-2xl) var(--space-md);
    text-align: center;
    color: var(--ink-tertiary);
    font-size: var(--text-sm);
  }
</style>
