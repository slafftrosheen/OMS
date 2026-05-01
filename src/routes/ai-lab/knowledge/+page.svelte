<script lang="ts">
  /**
   * AI Lab › Knowledge — manage the RAG knowledge base.
   * Lists knowledge sources, shows status, allows upload & delete.
   */
  import { onMount } from 'svelte';
  import Icon from '$lib/ui/Icon.svelte';

  type KnowledgeSource = {
    id: string;
    title: string;
    kind: string;
    status: 'ready' | 'queued' | 'extracting' | 'embedding' | 'failed';
    mime_type: string | null;
    size_bytes: number | null;
    page_count: number | null;
    tags: string[];
    summary: string | null;
    error: string | null;
    created_at: string;
  };

  let items = $state<KnowledgeSource[]>([]);
  let total = $state(0);
  let loading = $state(true);
  let error = $state('');
  let search = $state('');
  let statusFilter = $state('');
  let uploading = $state(false);
  let uploadError = $state('');
  let fileInput: HTMLInputElement;

  async function load() {
    loading = true;
    error = '';
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (search) params.set('q', search);
      if (statusFilter) params.set('status', statusFilter);

      const res = await fetch(`/api/ai/knowledge?${params}`);
      if (res.ok) {
        const data = await res.json();
        items = data.items ?? [];
        total = data.total ?? items.length;
      } else if (res.status === 401) {
        error = 'Please log in to view the knowledge base.';
      } else {
        error = `Error ${res.status}`;
      }
    } catch {
      error = 'Failed to load knowledge base.';
    } finally {
      loading = false;
    }
  }

  async function deleteItem(id: string, title: string) {
    if (!confirm(`Delete "${title}" from the knowledge base?`)) return;
    try {
      const res = await fetch(`/api/ai/knowledge?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        items = items.filter(i => i.id !== id);
        total = Math.max(0, total - 1);
      } else {
        error = 'Failed to delete item.';
      }
    } catch {
      error = 'Failed to delete item.';
    }
  }

  async function handleUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;

    uploading = true;
    uploadError = '';

    try {
      for (const file of Array.from(input.files)) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('title', file.name);

        const res = await fetch('/api/ai/knowledge/upload', {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          uploadError = data.error || `Upload failed for ${file.name}`;
        }
      }
      await load();
    } catch {
      uploadError = 'Upload failed.';
    } finally {
      uploading = false;
      input.value = '';
    }
  }

  function formatBytes(bytes: number | null) {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function statusColor(status: string) {
    switch (status) {
      case 'ready': return '#34c759';
      case 'queued': case 'extracting': case 'embedding': return '#ff9500';
      case 'failed': return '#ff453a';
      default: return '#888';
    }
  }

  let searchTimeout: ReturnType<typeof setTimeout>;
  function onSearchChange() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(load, 400);
  }

  onMount(load);
</script>

<div class="knowledge-page">
  <!-- Header / controls -->
  <div class="controls">
    <div class="search-wrap">
      <Icon name="search" size="sm" />
      <input
        type="text"
        placeholder="Search knowledge sources…"
        bind:value={search}
        oninput={onSearchChange}
      />
    </div>

    <select bind:value={statusFilter} onchange={load}>
      <option value="">All statuses</option>
      <option value="ready">Ready</option>
      <option value="queued">Queued</option>
      <option value="extracting">Extracting</option>
      <option value="embedding">Embedding</option>
      <option value="failed">Failed</option>
    </select>

    <label class="upload-btn" class:disabled={uploading}>
      <input
        type="file"
        accept=".pdf,.txt,.md,.docx"
        multiple
        bind:this={fileInput}
        onchange={handleUpload}
        style="display:none"
        disabled={uploading}
      />
      <Icon name="upload" size="sm" />
      {uploading ? 'Uploading…' : 'Upload'}
    </label>

    <button class="refresh-btn" onclick={load} disabled={loading} title="Refresh">
      <Icon name="refresh-ccw" size="sm" />
    </button>
  </div>

  {#if uploadError}
    <div class="error-bar"><Icon name="alert-circle" size="sm" /> {uploadError}</div>
  {/if}

  {#if error}
    <div class="error-bar"><Icon name="alert-circle" size="sm" /> {error}</div>
  {/if}

  <!-- Stats -->
  <div class="stats-row">
    <span class="stat">{total} sources total</span>
    <span class="stat ready">{items.filter(i => i.status === 'ready').length} ready</span>
    <span class="stat warn">{items.filter(i => ['queued', 'extracting', 'embedding'].includes(i.status)).length} processing</span>
    <span class="stat err">{items.filter(i => i.status === 'failed').length} failed</span>
  </div>

  <!-- Table -->
  {#if loading}
    <div class="empty-state">Loading knowledge sources…</div>
  {:else if items.length === 0}
    <div class="empty-state">
      <Icon name="library" size="md" />
      <p>No knowledge sources found. Upload PDFs or documents to build the RAG index.</p>
    </div>
  {:else}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Title</th>
            <th>Kind</th>
            <th>Status</th>
            <th>Size</th>
            <th>Pages</th>
            <th>Added</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each items as item (item.id)}
            <tr>
              <td class="title-cell">
                <span class="item-title">{item.title}</span>
                {#if item.tags?.length}
                  <div class="tags">
                    {#each item.tags as tag}<span class="tag">{tag}</span>{/each}
                  </div>
                {/if}
                {#if item.error}
                  <p class="item-error">{item.error}</p>
                {/if}
              </td>
              <td><span class="kind-badge">{item.kind}</span></td>
              <td>
                <span class="status-dot" style="background: {statusColor(item.status)}"></span>
                {item.status}
              </td>
              <td class="mono">{formatBytes(item.size_bytes)}</td>
              <td class="mono">{item.page_count ?? '—'}</td>
              <td class="mono">{new Date(item.created_at).toLocaleDateString()}</td>
              <td>
                <button
                  class="delete-btn"
                  onclick={() => deleteItem(item.id, item.title)}
                  title="Delete"
                >
                  <Icon name="trash-2" size="sm" />
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<style>
  .knowledge-page {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .controls {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
  }

  .search-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 200px;
    padding: 8px 12px;
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text-muted);
  }

  .search-wrap input {
    flex: 1;
    border: none;
    background: transparent;
    color: var(--text);
    font-size: 0.9rem;
  }
  .search-wrap input:focus { outline: none; }

  select {
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg-1);
    color: var(--text);
    font-size: 0.9rem;
  }

  .upload-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    border-radius: 8px;
    background: var(--brand);
    color: white;
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 600;
    transition: opacity var(--transition-fast);
  }
  .upload-btn.disabled { opacity: 0.6; cursor: not-allowed; }

  .refresh-btn {
    width: 36px; height: 36px;
    display: flex; align-items: center; justify-content: center;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
  }
  .refresh-btn:hover { background: var(--bg-2); color: var(--text); }

  .error-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    border-radius: 8px;
    background: color-mix(in oklab, var(--error, #ff453a) 12%, transparent);
    color: var(--error, #ff453a);
    font-size: 0.9rem;
    border: 1px solid color-mix(in oklab, var(--error, #ff453a) 25%, transparent);
  }

  .stats-row {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
    font-size: 0.85rem;
  }
  .stat { color: var(--text-muted); }
  .stat.ready { color: #34c759; }
  .stat.warn { color: #ff9500; }
  .stat.err { color: #ff453a; }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    min-height: 200px;
    color: var(--text-muted);
    font-size: 0.9rem;
    text-align: center;
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-lg);
    padding: 32px;
  }

  .table-wrap {
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-lg);
    overflow: hidden;
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.875rem;
  }

  thead th {
    text-align: left;
    padding: 10px 14px;
    font-weight: 600;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    background: color-mix(in oklab, var(--bg-1) 50%, transparent);
    border-bottom: 1px solid var(--border);
  }

  tbody td {
    padding: 10px 14px;
    border-bottom: 1px solid var(--border);
    vertical-align: top;
  }
  tbody tr:last-child td { border-bottom: none; }
  tbody tr:hover td { background: var(--bg-2); }

  .title-cell { max-width: 320px; }
  .item-title { font-weight: 500; display: block; }
  .item-error { margin: 4px 0 0; font-size: 0.75rem; color: var(--error, #ff453a); }

  .tags { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px; }
  .tag {
    font-size: 0.65rem; padding: 1px 6px;
    border-radius: 4px;
    background: color-mix(in oklab, var(--brand) 10%, transparent);
    color: var(--brand);
    border: 1px solid color-mix(in oklab, var(--brand) 20%, transparent);
  }

  .kind-badge {
    font-size: 0.7rem;
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--bg-2);
    color: var(--text-muted);
    font-family: monospace;
  }

  .status-dot {
    display: inline-block;
    width: 8px; height: 8px;
    border-radius: 50%;
    margin-right: 6px;
    vertical-align: middle;
  }

  .mono { font-family: monospace; font-size: 0.8rem; color: var(--text-muted); }

  .delete-btn {
    background: none; border: none; padding: 4px;
    color: var(--text-muted); cursor: pointer;
    border-radius: 6px;
    transition: color var(--transition-fast), background var(--transition-fast);
  }
  .delete-btn:hover { color: var(--error, #ff453a); background: color-mix(in oklab, var(--error, #ff453a) 10%, transparent); }
</style>
