<script lang="ts">
  export let columns: { key: string; label: string; width?: string }[] = [];
  export let rows: any[] = [];
  export let filterKey: string | null = null;
  export let filterText: string = '';

  let sortKey: string | null = null;
  let sortAsc = true;

  function setSort(k: string) {
    if (sortKey === k) sortAsc = !sortAsc;
    else { sortKey = k; sortAsc = true; }
  }

  $: filtered = rows.filter(r => {
    if (!filterKey || !filterText) return true;
    const v = String(r[filterKey] ?? '').toLowerCase();
    return v.includes(filterText.toLowerCase());
  });

  $: sorted = [...filtered].sort((a, b) => {
    if (!sortKey) return 0;
    const av = a[sortKey], bv = b[sortKey];
    return (av > bv ? 1 : av < bv ? -1 : 0) * (sortAsc ? 1 : -1);
  });
</script>

<table class="rf-table">
  <thead>
    <tr>
      {#each columns as c}
        <th style={`width:${c.width || 'auto'}`} on:click={() => setSort(c.key)} role="button" aria-label={`sort by ${c.label}`}>
          {c.label} {#if sortKey===c.key}{sortAsc?'▲':'▼'}{/if}
        </th>
      {/each}
    </tr>
  </thead>
  <tbody>
    {#each sorted as r (r.id || JSON.stringify(r))}
      <tr>
        {#each columns as c}
          <td>{r[c.key]}</td>
        {/each}
      </tr>
    {/each}
  </tbody>
</table>

<style>
.rf-table{width:100%;border-collapse:collapse}
th,td{padding:10px;border-bottom:1px solid var(--border);text-align:left}
th{cursor:pointer;color:var(--muted)}
tr:hover td{background:color-mix(in oklab,var(--border) 20%, transparent)}
</style>
