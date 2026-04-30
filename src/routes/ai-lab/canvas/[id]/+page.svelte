<script lang="ts">
  // tldraw drop-in canvas — mounts the React Tldraw component inside SvelteKit
  // via TldrawWrapper, persists to canvas_documents via PATCH /api/ai/canvas/[id].
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import Icon from '$lib/ui/Icon.svelte';
  import TldrawWrapper from '$lib/components/canvas/TldrawWrapper.svelte';

  let title = $state('Untitled canvas');
  let dirty = $state(false);
  let savedAt = $state<string | null>(null);
  let saving = $state(false);
  let loadError = $state<string | null>(null);

  let initialSnapshot = $state<unknown>(undefined);
  let currentSnapshot = $state<unknown>(undefined);
  let loaded = $state(false);
  let wrapperRef: ReturnType<typeof TldrawWrapper> | null = $state(null);

  const id = $derived(page.params.id ?? '');

  async function save() {
    if (!id || saving || !dirty || !currentSnapshot) return;
    saving = true;
    try {
      await fetch(`/api/ai/canvas/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, payload: currentSnapshot })
      });
      savedAt = new Date().toLocaleTimeString();
      dirty = false;
    } finally {
      saving = false;
    }
  }

  function handleSaveSnapshot(snap: unknown) {
    currentSnapshot = snap;
    dirty = true;
  }

  function isOldStrokeFormat(p: unknown): boolean {
    return (
      p != null &&
      typeof p === 'object' &&
      'strokes' in (p as object)
    );
  }

  onMount(() => {
    let autoSaveTimer: ReturnType<typeof setInterval> | null = null;

    (async () => {
      try {
        if (id) {
          const resp = await fetch(`/api/ai/canvas/${id}`);
          const j = await resp.json();
          if (j.canvas) {
            title = j.canvas.title ?? title;
            const p = j.canvas.payload;
            if (p && !isOldStrokeFormat(p) && p.store) {
              initialSnapshot = p;
            }
          }
        }
        loaded = true;
        autoSaveTimer = setInterval(() => { if (dirty && !saving) void save(); }, 5_000);
      } catch (err) {
        loadError = (err as Error).message;
        loaded = true;
      }
    })();

    return () => {
      if (autoSaveTimer) clearInterval(autoSaveTimer);
    };
  });

  function addShape(type: 'maker' | 'chat' | 'forge') {
    if (!wrapperRef) return;
    const editor = (wrapperRef as any).getEditor?.();
    if (!editor) return;

    const center = editor.getViewportPageCenter();
    
    editor.createShape({
      type,
      x: center.x - 150,
      y: center.y - 150,
    });
  }
</script>

<div class="canvas-page">
  <header>
    <input
      bind:value={title}
      onchange={() => (dirty = true)}
      class="title"
      aria-label="Canvas title"
    />
    <span class="spacer"></span>
    
    <div class="toolbar">
      <button class="btn ghost" onclick={() => addShape('maker')} title="Add Maker.js Code Block"><Icon name="code" size="sm" /> Maker</button>
      <button class="btn ghost" onclick={() => addShape('chat')} title="Add Contextual Chat"><Icon name="message-square" size="sm" /> Chat</button>
      <button class="btn ghost" onclick={() => addShape('forge')} title="Add Generative Image"><Icon name="image" size="sm" /> Forge</button>
    </div>

    <span class="spacer"></span>

    {#if loadError}
      <span class="error small">⚠ {loadError}</span>
    {/if}
    {#if savedAt}
      <span class="muted small">saved {savedAt}</span>
    {/if}
    <button
      class="btn"
      onclick={save}
      disabled={!dirty || saving}
      aria-label="Save canvas"
    >
      <Icon name={saving ? 'loader' : 'save'} size="sm" />
      {saving ? 'Saving…' : 'Save'}
    </button>
  </header>

  {#if !loaded && !loadError}
    <div class="placeholder">Loading canvas…</div>
  {:else if loadError}
    <div class="placeholder error">Failed to load canvas: {loadError}</div>
  {:else}
    <div class="tldraw-shell">
      <TldrawWrapper bind:this={wrapperRef} snapshot={initialSnapshot} onSave={handleSaveSnapshot} />
    </div>
  {/if}
</div>

<style>
  .canvas-page {
    display: flex;
    flex-direction: column;
    gap: 8px;
    height: calc(100vh - var(--topbar-h, 56px) - 120px);
    min-height: 480px;
  }
  header {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .title {
    flex: 1;
    min-width: 180px;
    background: transparent;
    color: inherit;
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-md);
    padding: 7px 10px;
    font: inherit;
    max-width: 300px;
  }
  .title:focus { outline: none; border-color: var(--brand); box-shadow: var(--focus-ring); }
  .spacer { flex: 1; min-width: 8px; }
  
  .toolbar {
    display: flex;
    gap: 8px;
    background: var(--glass-bg);
    padding: 4px;
    border-radius: var(--radius-md);
    border: 1px solid var(--glass-border);
  }

  .tldraw-shell {
    flex: 1;
    border-radius: var(--radius-lg);
    overflow: hidden;
    border: 1px solid var(--glass-border);
    position: relative;
    background: var(--bg-0);
  }
  .placeholder {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted, #888);
    font-size: 0.9rem;
  }
  .btn {
    padding: 7px 14px;
    border-radius: var(--radius-full);
    background: var(--brand);
    color: white;
    border: 0;
    cursor: pointer;
    font: inherit;
    display: inline-flex;
    gap: 6px;
    align-items: center;
  }
  .btn.ghost {
    background: transparent;
    color: var(--text);
  }
  .btn.ghost:hover {
    background: var(--bg-2);
  }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .muted { color: var(--text-muted, #888); }
  .small { font-size: 0.75rem; }
  .error { color: #f66; }
</style>
