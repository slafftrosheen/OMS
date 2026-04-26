<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from '$lib/ui/Icon.svelte';

  type Run = {
    id: string; kind: string; status: string;
    node_label: string | null; model: string | null;
    cost_seconds: number | null; tokens_in: number | null; tokens_out: number | null;
    error: string | null; created_at: string;
  };
  let runs = $state<Run[]>([]);
  let kindFilter = $state('');

  async function load() {
    const url = `/api/ai/runs?limit=200${kindFilter ? `&kind=${kindFilter}` : ''}`;
    const j = await (await fetch(url)).json();
    runs = j.items ?? [];
  }
  onMount(() => {
    void load();
    const t = setInterval(load, 5_000);
    return () => clearInterval(t);
  });
</script>

<div class="runs">
  <header class="head">
    <h2>AI runs</h2>
    <select bind:value={kindFilter} onchange={() => load()}>
      <option value="">all kinds</option>
      {#each ['chat','embed','extract','rerank','image-gen','mesh-gen','asr','tts','matting','tool'] as k}
        <option value={k}>{k}</option>
      {/each}
    </select>
  </header>
  <table>
    <thead>
      <tr><th>when</th><th>kind</th><th>status</th><th>node</th><th>model</th><th>secs</th><th>tokens</th><th>error</th></tr>
    </thead>
    <tbody>
      {#each runs as r (r.id)}
        <tr data-status={r.status}>
          <td title={r.created_at}>{new Date(r.created_at).toLocaleTimeString()}</td>
          <td>{r.kind}</td>
          <td>{r.status}</td>
          <td>{r.node_label ?? ''}</td>
          <td class="trunc">{r.model ?? ''}</td>
          <td>{r.cost_seconds?.toFixed(1) ?? ''}</td>
          <td>{(r.tokens_in ?? 0) + (r.tokens_out ?? 0) || ''}</td>
          <td class="trunc">{r.error ?? ''}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .runs { display: flex; flex-direction: column; gap: 12px; }
  .head { display: flex; align-items: center; gap: 12px; }
  select {
    background: var(--surface, transparent);
    border: 1px solid var(--glass-border); color: inherit;
    padding: 6px 10px; border-radius: var(--radius-full); font: inherit;
  }
  table {
    width: 100%; border-collapse: collapse;
    background: var(--glass-bg);
    backdrop-filter: var(--glass-blur);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-lg);
    overflow: hidden;
  }
  th, td { padding: 8px 10px; text-align: left; font-size: 0.85rem; border-bottom: 1px solid var(--glass-border); }
  th { font-weight: 600; opacity: 0.7; background: color-mix(in oklab, #ffffff 4%, transparent); }
  tr[data-status="done"] td:nth-child(3)   { color: #34c759; }
  tr[data-status="failed"] td:nth-child(3) { color: #ff453a; }
  tr[data-status="running"] td:nth-child(3) { color: #ffd60a; }
  .trunc { max-width: 320px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
