<script lang="ts">
  // Canvas — list saved canvases + create. (Full tldraw integration is loaded
  // lazily on the [id] route; this page is the index.)
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import Icon from '$lib/ui/Icon.svelte';
  import { base } from '$app/paths';

  type Doc = { id: string; title: string; updated_at: string };
  let docs = $state<Doc[]>([]);

  async function load() {
    const j = await (await fetch('/api/ai/canvas')).json();
    docs = j.items ?? [];
  }

  async function create() {
    const r = await fetch('/api/ai/canvas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Untitled canvas' })
    });
    const j = await r.json();
    if (j.canvas?.id) goto(`${base}/ai-lab/canvas/${j.canvas.id}`);
  }

  async function remove(id: string) {
    if (!confirm('Delete this canvas?')) return;
    await fetch(`/api/ai/canvas?id=${id}`, { method: 'DELETE' });
    await load();
  }

  onMount(() => { void load(); });
</script>

<div class="canvas-list">
  <header>
    <h2>Canvas</h2>
    <button class="btn" onclick={create}><Icon name="plus" size="sm" /> New canvas</button>
  </header>
  <p class="muted">
    Wire AI nodes together on an infinite board: PDF → extract → search → image →
    annotate → export. Each canvas persists as a tldraw snapshot.
  </p>
  <div class="grid">
    {#each docs as d (d.id)}
      <a class="doc" href="{base}/ai-lab/canvas/{d.id}">
        <Icon name="layout-grid" size="md" />
        <strong>{d.title}</strong>
        <span class="muted small">{new Date(d.updated_at).toLocaleString()}</span>
        <button
          class="x"
          aria-label="Delete"
          onclick={(e) => { e.preventDefault(); void remove(d.id); }}
        ><Icon name="trash-2" size="sm" /></button>
      </a>
    {:else}
      <p class="muted">No canvases yet.</p>
    {/each}
  </div>
</div>

<style>
  .canvas-list { display: flex; flex-direction: column; gap: 12px; }
  header { display: flex; align-items: center; gap: 12px; }
  .muted { color: var(--text-muted, #888); }
  .small { font-size: 0.75rem; }
  .grid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); }
  .doc {
    position: relative;
    display: flex; flex-direction: column; gap: 4px;
    padding: 14px;
    background: var(--glass-bg);
    backdrop-filter: var(--glass-blur);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-lg);
    color: inherit; text-decoration: none;
    transition: transform var(--transition-fast);
  }
  .doc:hover { transform: translateY(-2px); border-color: color-mix(in oklab, var(--brand) 40%, transparent); }
  .x {
    position: absolute; top: 8px; right: 8px;
    background: transparent; border: 0; color: var(--text-muted, #888);
    cursor: pointer; opacity: 0.6;
  }
  .x:hover { color: #ff453a; opacity: 1; }
  .btn {
    padding: 8px 14px; border-radius: var(--radius-full);
    background: var(--brand); color: white; border: 0;
    cursor: pointer; display: inline-flex; gap: 6px; align-items: center; font: inherit;
  }
</style>
