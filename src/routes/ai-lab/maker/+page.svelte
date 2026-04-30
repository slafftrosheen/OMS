<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import Icon from '$lib/ui/Icon.svelte';
  import { base } from '$app/paths';

  type Sketch = { id: string; title: string; updated_at: string; description?: string };
  let sketches = $state<Sketch[]>([]);
  let loading = $state(true);

  async function load() {
    loading = true;
    try {
      const j = await (await fetch('/api/ai/maker')).json();
      sketches = j.items ?? [];
    } finally {
      loading = false;
    }
  }

  async function create() {
    const r = await fetch('/api/ai/maker', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'New Sketch' })
    });
    const j = await r.json();
    if (j.sketch?.id) goto(`${base}/ai-lab/maker/${j.sketch.id}`);
  }

  async function remove(id: string) {
    if (!confirm('Delete this sketch?')) return;
    await fetch(`/api/ai/maker?id=${id}`, { method: 'DELETE' });
    await load();
  }

  onMount(() => { void load(); });
</script>

<div class="maker-list">
  <header>
    <div class="title-area">
      <h2>Technical Sketches</h2>
      <p class="muted">Precision 2D drafting with Maker.js. Parametric models for CNC, laser, and ideas.</p>
    </div>
    <button class="btn primary" onclick={create}><Icon name="plus" size="sm" /> New sketch</button>
  </header>

  {#if loading}
    <div class="loading">Loading sketches...</div>
  {:else}
    <div class="grid">
      {#each sketches as s (s.id)}
        <div class="card">
          <a href="{base}/ai-lab/maker/{s.id}" class="card-content">
            <div class="card-icon">
              <Icon name="ruler" size="lg" />
            </div>
            <div class="card-info">
              <strong>{s.title}</strong>
              <span class="muted small">{new Date(s.updated_at).toLocaleDateString()}</span>
              {#if s.description}
                <p class="desc small">{s.description}</p>
              {/if}
            </div>
          </a>
          <button
            class="delete-btn"
            aria-label="Delete"
            onclick={() => void remove(s.id)}
          ><Icon name="trash-2" size="sm" /></button>
        </div>
      {:else}
        <div class="empty">
          <Icon name="ruler" size="xl" />
          <p>No technical sketches yet.</p>
          <button class="btn secondary" onclick={create}>Create your first one</button>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .maker-list { display: flex; flex-direction: column; gap: 20px; }
  header { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; }
  .title-area h2 { margin: 0 0 4px 0; }
  .muted { color: var(--text-muted, #888); margin: 0; }
  .small { font-size: 0.75rem; }
  
  .grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
  
  .card {
    position: relative;
    background: var(--glass-bg);
    backdrop-filter: var(--glass-blur);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-lg);
    transition: transform var(--transition-fast), border-color var(--transition-fast);
  }
  .card:hover { transform: translateY(-2px); border-color: var(--brand); }
  
  .card-content {
    display: flex;
    gap: 16px;
    padding: 16px;
    color: inherit;
    text-decoration: none;
  }
  
  .card-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    background: color-mix(in oklab, var(--brand) 10%, transparent);
    color: var(--brand);
    border-radius: var(--radius-md);
  }
  
  .card-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
  }
  
  .desc { margin: 4px 0 0 0; color: var(--text-muted); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  
  .delete-btn {
    position: absolute; top: 12px; right: 12px;
    background: transparent; border: 0; color: var(--text-muted);
    cursor: pointer; opacity: 0; transition: opacity var(--transition-fast);
  }
  .card:hover .delete-btn { opacity: 0.6; }
  .delete-btn:hover { color: #ff453a; opacity: 1 !important; }
  
  .btn {
    padding: 10px 18px; border-radius: var(--radius-full);
    cursor: pointer; display: inline-flex; gap: 8px; align-items: center; font: inherit; font-weight: 500;
  }
  .btn.primary { background: var(--brand); color: white; border: 0; }
  .btn.secondary { background: var(--glass-bg); color: var(--text); border: 1px solid var(--glass-border); }
  
  .empty {
    grid-column: 1 / -1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px;
    gap: 12px;
    color: var(--text-muted);
    background: var(--glass-bg);
    border: 2px dashed var(--glass-border);
    border-radius: var(--radius-xl);
  }
  
  .loading { text-align: center; padding: 40px; color: var(--text-muted); }
</style>
