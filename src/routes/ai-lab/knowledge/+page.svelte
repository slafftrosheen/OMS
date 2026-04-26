<script lang="ts">
  // Knowledge Hub — drag/drop upload, list, status, search.
  import { onMount } from 'svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { base } from '$app/paths';

  type Source = {
    id: string; title: string; kind: string; status: string;
    summary: string | null; tags: string[]; size_bytes: number | null;
    page_count: number | null; created_at: string; error: string | null;
  };

  let items = $state<Source[]>([]);
  let total = $state(0);
  let loading = $state(false);
  let dragOver = $state(false);
  let q = $state('');
  let pasteTitle = $state('');
  let pasteText = $state('');
  let tagsInput = $state('');
  let visibility = $state<'private' | 'team' | 'global'>('team');

  async function load() {
    loading = true;
    const res = await fetch(`/api/ai/knowledge?limit=200${q ? `&q=${encodeURIComponent(q)}` : ''}`);
    const j = await res.json();
    items = j.items ?? [];
    total = j.total ?? items.length;
    loading = false;
  }

  async function uploadFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;
    const fd = new FormData();
    for (const f of list) fd.append('file', f);
    if (tagsInput) fd.append('tags', tagsInput);
    fd.append('visibility', visibility);
    await fetch('/api/ai/knowledge/upload', { method: 'POST', body: fd });
    await load();
  }

  async function pasteSubmit() {
    if (!pasteText.trim()) return;
    const fd = new FormData();
    fd.append('text', pasteText);
    fd.append('title', pasteTitle || 'Pasted note');
    if (tagsInput) fd.append('tags', tagsInput);
    fd.append('visibility', visibility);
    await fetch('/api/ai/knowledge/upload', { method: 'POST', body: fd });
    pasteText = '';
    pasteTitle = '';
    await load();
  }

  async function remove(id: string) {
    if (!confirm('Delete this source and all its chunks?')) return;
    await fetch(`/api/ai/knowledge?id=${id}`, { method: 'DELETE' });
    await load();
  }

  function fmt(bytes: number | null): string {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 ** 2) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / 1024 ** 2).toFixed(1) + ' MB';
  }

  onMount(() => {
    void load();
    const t = setInterval(load, 5_000);
    return () => clearInterval(t);
  });

  function onDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    if (e.dataTransfer?.files) void uploadFiles(e.dataTransfer.files);
  }
</script>

<div class="kn">
  <header class="kn-head">
    <h2>Feed knowledge to the AI Lab</h2>
    <p class="muted">
      Drop PDFs, drawings, photos, manuals, datasheets, voice memos. Files are
      stored in the <code>knowledge</code> bucket and processed through a
      multi-model pipeline (vision extract → bge-m3 embed → cross-modal index).
    </p>
  </header>

  <section class="grid">
    <div
      class="drop"
      class:over={dragOver}
      role="button"
      tabindex="0"
      onclick={() => document.getElementById('kn-file')?.click()}
      onkeydown={(e) => { if (e.key === 'Enter') document.getElementById('kn-file')?.click(); }}
      ondragover={(e) => { e.preventDefault(); dragOver = true; }}
      ondragleave={() => (dragOver = false)}
      ondrop={onDrop}
    >
      <Icon name="upload-cloud" size="lg" />
      <strong>Drop files or click to browse</strong>
      <p class="muted small">PDF · image · audio · video · txt · md · csv · docx</p>
      <input
        id="kn-file"
        type="file"
        multiple
        hidden
        onchange={(e) => uploadFiles((e.currentTarget as HTMLInputElement).files ?? new FileList())}
      />
    </div>

    <div class="paste card">
      <strong>Paste a note</strong>
      <input class="ipt" placeholder="Title" bind:value={pasteTitle} />
      <textarea class="ipt" rows="6" placeholder="Notes, specs, conversation transcripts…" bind:value={pasteText}></textarea>
      <div class="row">
        <input class="ipt" placeholder="tags, comma, separated" bind:value={tagsInput} />
        <select class="ipt" bind:value={visibility}>
          <option value="private">private</option>
          <option value="team">team</option>
          <option value="global">global</option>
        </select>
        <button class="btn" onclick={pasteSubmit} disabled={!pasteText.trim()}>Add note</button>
      </div>
    </div>
  </section>

  <section class="search">
    <input
      class="ipt grow"
      placeholder="Filter by title…"
      bind:value={q}
      onkeydown={(e) => { if (e.key === 'Enter') load(); }}
    />
    <button class="btn ghost" onclick={() => load()}>
      <Icon name="search" size="sm" /> Search
    </button>
    <span class="muted small">{total} sources</span>
  </section>

  <section class="list">
    {#each items as s (s.id)}
      <article class="src" data-status={s.status}>
        <div class="src-head">
          <a href="{base}/ai-lab/knowledge/{s.id}"><strong>{s.title}</strong></a>
          <span class="kind">{s.kind}</span>
          <span class="status">{s.status}</span>
          <span class="muted small">{fmt(s.size_bytes)}{s.page_count ? ` · ${s.page_count} pages` : ''}</span>
          <button class="btn ghost danger" onclick={() => remove(s.id)} aria-label="Delete">
            <Icon name="trash-2" size="sm" />
          </button>
        </div>
        {#if s.summary}<p class="summary">{s.summary}</p>{/if}
        {#if s.tags.length > 0}
          <div class="tags">{#each s.tags as t}<span class="tag">{t}</span>{/each}</div>
        {/if}
        {#if s.error}<p class="err"><Icon name="alert-triangle" size="sm" /> {s.error}</p>{/if}
      </article>
    {/each}
    {#if items.length === 0 && !loading}
      <p class="muted">No knowledge sources yet. Drop a file above to begin.</p>
    {/if}
  </section>
</div>

<style>
  .kn { display: grid; gap: calc(var(--space-md) * var(--density, 1)); }
  .muted { color: var(--text-muted, #888); }
  .small { font-size: 0.8rem; }
  code {
    background: color-mix(in oklab, var(--brand) 10%, transparent);
    padding: 1px 6px; border-radius: var(--radius-sm);
  }
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: calc(var(--space-md) * var(--density, 1));
  }
  @media (max-width: 700px) { .grid { grid-template-columns: 1fr; } }
  .drop {
    border: 2px dashed var(--glass-border);
    border-radius: var(--radius-lg);
    padding: 32px;
    display: flex; flex-direction: column; align-items: center; gap: 8px;
    background: var(--glass-bg);
    backdrop-filter: var(--glass-blur);
    cursor: pointer;
    transition: background var(--transition-fast), border-color var(--transition-fast);
  }
  .drop.over { border-color: var(--brand); background: color-mix(in oklab, var(--brand) 8%, transparent); }
  .paste { display: flex; flex-direction: column; gap: 8px; padding: calc(var(--space-md) * var(--density, 1)); }
  .card {
    background: var(--glass-bg);
    backdrop-filter: var(--glass-blur);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--glass-shadow);
  }
  .ipt {
    background: var(--surface, transparent);
    color: var(--text);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-md);
    padding: 8px 12px;
    font: inherit;
  }
  .ipt:focus { outline: none; border-color: var(--brand); box-shadow: var(--focus-ring); }
  .row { display: flex; gap: 8px; }
  .row .ipt { flex: 1; }
  .grow { flex: 1; }
  .btn {
    padding: 8px 14px; border-radius: var(--radius-full);
    background: var(--brand); color: white; border: 0;
    cursor: pointer; font: inherit;
    display: inline-flex; align-items: center; gap: 6px;
  }
  .btn:hover { filter: brightness(1.1); }
  .btn.ghost {
    background: transparent;
    color: var(--text);
    border: 1px solid var(--glass-border);
  }
  .btn.danger { color: #ff453a; border-color: color-mix(in oklab, #ff453a 30%, transparent); }
  .search { display: flex; gap: 8px; align-items: center; }
  .list { display: flex; flex-direction: column; gap: 10px; }
  .src {
    background: var(--glass-bg);
    backdrop-filter: var(--glass-blur);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-md);
    padding: calc(var(--space-sm) * var(--density, 1)) calc(var(--space-md) * var(--density, 1));
  }
  .src-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .src-head a { color: inherit; text-decoration: none; }
  .src-head a:hover { color: var(--brand); }
  .src-head .btn { margin-left: auto; }
  .kind, .status {
    font-size: 0.7rem; padding: 1px 8px; border-radius: var(--radius-full);
    border: 1px solid var(--glass-border);
  }
  .src[data-status="ready"] .status { color: #34c759; border-color: color-mix(in oklab, #34c759 40%, transparent); }
  .src[data-status="failed"] .status { color: #ff453a; border-color: color-mix(in oklab, #ff453a 40%, transparent); }
  .src[data-status="queued"] .status,
  .src[data-status="extracting"] .status,
  .src[data-status="embedding"] .status {
    color: #ffd60a; border-color: color-mix(in oklab, #ffd60a 40%, transparent);
  }
  .summary { margin: 6px 0 0; color: var(--text-muted); font-size: 0.9rem; }
  .tags { display: flex; gap: 4px; margin-top: 6px; }
  .tag {
    font-size: 0.7rem; padding: 1px 8px; border-radius: var(--radius-full);
    background: color-mix(in oklab, var(--brand) 8%, transparent);
    border: 1px solid color-mix(in oklab, var(--brand) 30%, transparent);
  }
  .err { color: #ff453a; font-size: 0.85rem; margin-top: 6px; display: flex; align-items: center; gap: 4px; }
</style>
