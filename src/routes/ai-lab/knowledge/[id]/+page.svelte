<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import Icon from '$lib/ui/Icon.svelte';

  type Source = {
    id: string; title: string; kind: string; status: string;
    summary: string | null; tags: string[]; mime_type: string | null;
    page_count: number | null; size_bytes: number | null; error: string | null;
  };
  type Chunk = { id: string; page: number | null; chunk_index: number; content: string };

  let source = $state<Source | null>(null);
  let chunks = $state<Chunk[]>([]);
  let chunk_total = $state(0);

  async function load() {
    const id = page.params.id;
    if (!id) return;
    const j = await (await fetch(`/api/ai/knowledge/${id}`)).json();
    source = j.source ?? null;
    chunks = j.chunks ?? [];
    chunk_total = j.chunk_total ?? 0;
  }

  onMount(() => {
    void load();
    const t = setInterval(load, 4_000);
    return () => clearInterval(t);
  });
</script>

{#if source}
  <article class="src">
    <header>
      <h2>{source.title}</h2>
      <div class="meta">
        <span class="pill">{source.kind}</span>
        <span class="pill" data-status={source.status}>{source.status}</span>
        {#if source.page_count}<span class="muted">{source.page_count} pages</span>{/if}
        <span class="muted">{chunk_total} chunks</span>
      </div>
      {#if source.summary}<p class="summary">{source.summary}</p>{/if}
      {#if source.error}<p class="err"><Icon name="alert-triangle" size="sm" /> {source.error}</p>{/if}
    </header>

    <section class="chunks">
      {#each chunks as c (c.id)}
        <div class="chunk">
          <div class="chunk-head">
            <span>chunk #{c.chunk_index}</span>
            {#if c.page != null}<span>page {c.page}</span>{/if}
          </div>
          <pre>{c.content}</pre>
        </div>
      {/each}
    </section>
  </article>
{:else}
  <p class="muted">Loading…</p>
{/if}

<style>
  .src { display: flex; flex-direction: column; gap: 16px; }
  h2 { margin: 0; }
  .meta { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-top: 8px; }
  .pill {
    font-size: 0.7rem; padding: 1px 10px; border-radius: var(--radius-full);
    border: 1px solid var(--glass-border);
  }
  .pill[data-status="ready"]    { color: #34c759; border-color: color-mix(in oklab, #34c759 40%, transparent); }
  .pill[data-status="failed"]   { color: #ff453a; border-color: color-mix(in oklab, #ff453a 40%, transparent); }
  .pill[data-status="queued"], .pill[data-status="extracting"], .pill[data-status="embedding"] {
    color: #ffd60a; border-color: color-mix(in oklab, #ffd60a 40%, transparent);
  }
  .muted { color: var(--text-muted, #888); }
  .summary { margin-top: 6px; color: var(--text-muted, #888); }
  .err { color: #ff453a; }
  .chunks { display: flex; flex-direction: column; gap: 10px; }
  .chunk {
    background: var(--glass-bg);
    backdrop-filter: var(--glass-blur);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-md);
    padding: 12px;
  }
  .chunk-head { display: flex; gap: 12px; font-size: 0.75rem; color: var(--text-muted, #888); margin-bottom: 8px; }
  .chunk pre { white-space: pre-wrap; margin: 0; font: inherit; }
</style>
