<script lang="ts">
  export let params = {};
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { getOrder } from '$lib/order/signage-store';
  import { STATIONS, STATE_LABEL } from '$lib/order/stages';
  import { t } from 'svelte-i18n';
  import type { Order } from '$lib/order/types.signage';
  
  $: id = $page.params.id;
  
  let o: Order | null = null;
  
  onMount(async () => {
    o = await getOrder(id);
  });
  
  $: materials = o?.materials || [];
  $: stages = o?.stages ? STATIONS.map(s => ({ station: s, state: o.stages[s] })) : [];
</script>

{#if !o}
  <p>Loading...</p>
{:else}
<article class="print-pack">
  <header>
    <img src="{base}/static/brand/logo.png" alt="Reclame Fabriek" height="42" />
    <div>
      <h1>{o?.id} — {o?.title}</h1>
      <p>{o?.client} • {$t('print.due_label')}: {o?.due || '—'} • {$t('print.loading_label')}: {o?.loadingDate || '—'} ({o?.carrier || '—'})</p>
    </div>
  </header>

  <section>
    <h2>{$t('print.materials_title')}</h2>
    <table>
      <thead>
        <tr>
          <th>{$t('print.label_header')}</th>
          <th>{$t('print.value_header')}</th>
        </tr>
      </thead>
      <tbody>
        {#each materials as m}
          <tr>
            <td>{m.label}</td>
            <td>{m.value}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </section>

  <section>
    <h2>{$t('print.stages_checklist_title')}</h2>
    <ul class="checklist">
      {#each stages as s}
        <li>
          <input type="checkbox" checked={s.state === 'COMPLETED'} /> 
          {s.station}: {$t(STATE_LABEL[s.state])}
        </li>
      {/each}
    </ul>
  </section>
</article>
{/if}

<style>
  @media print {
    :global(:root) {
      --bg-0: white;
      --ink-0: black;
      --text: black;
      --border: #999;
    }
    :global(nav),
    :global(.topbar),
    :global(.rf-topbar),
    :global(.no-print) {
      display: none !important;
    }
    .print-pack {
      padding: 0;
    }
  }
  
  .print-pack {
    background: var(--bg-0);
    color: var(--text);
    padding: 20px;
    max-width: 210mm;
    margin: 0 auto;
  }
  
  header {
    display: flex;
    align-items: center;
    gap: 12px;
    border-bottom: 1px solid var(--border);
    padding-bottom: 8px;
    margin-bottom: 10px;
  }
  
  header h1 {
    margin: 0;
    font-size: 1.5rem;
  }
  
  header p {
    margin: 0;
    color: var(--muted, var(--text));
  }
  
  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 20px;
  }
  
  th,
  td {
    border: 1px solid var(--border);
    padding: 6px;
    text-align: left;
  }
  
  th {
    background: var(--bg-2, var(--bg-0));
  }
  
  .checklist {
    columns: 2;
    list-style: none;
    padding: 0;
  }
  
  .checklist li {
    break-inside: avoid;
    margin-bottom: 8px;
  }
  
  section {
    margin-bottom: 24px;
  }
  
  section h2 {
    margin-top: 0;
    margin-bottom: 12px;
    font-size: 1.25rem;
  }
</style>
