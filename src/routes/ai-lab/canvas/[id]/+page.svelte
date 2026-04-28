<script lang="ts">
  // tldraw drop-in canvas — mounts the React Tldraw component inside SvelteKit
  // via ReactDOM.createRoot(), persists editor.store.getSnapshot() to
  // canvas_documents via PATCH /api/ai/canvas/[id].
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import Icon from '$lib/ui/Icon.svelte';

  let containerEl: HTMLDivElement | undefined = $state();
  let title = $state('Untitled canvas');
  let dirty = $state(false);
  let savedAt = $state<string | null>(null);
  let saving = $state(false);
  let loadError = $state<string | null>(null);

  // Held across renders — tldraw Editor instance.
  let editorRef: {
    store: {
      getSnapshot: () => unknown;
      listen: (cb: () => void, opts?: { scope?: string }) => () => void;
    };
  } | null = null;
  let reactRoot: { unmount: () => void } | null = null;

  const id = $derived(page.params.id ?? '');

  async function save() {
    if (!id || !editorRef || saving) return;
    saving = true;
    try {
      const snapshot = editorRef.store.getSnapshot();
      await fetch(`/api/ai/canvas/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, payload: snapshot })
      });
      savedAt = new Date().toLocaleTimeString();
      dirty = false;
    } finally {
      saving = false;
    }
  }

  function isOldStrokeFormat(p: unknown): boolean {
    return (
      p != null &&
      typeof p === 'object' &&
      'strokes' in (p as object)
    );
  }

  onMount(() => {
    if (!containerEl) return;

    let autoSaveTimer: ReturnType<typeof setInterval> | null = null;
    let unlisten: (() => void) | null = null;

    (async () => {
      try {
        // Dynamic imports keep tldraw + React out of the SSR bundle.
        const [
          React,
          { createRoot },
          { Tldraw }
        ] = await Promise.all([
          import('react'),
          import('react-dom/client'),
          import('@tldraw/tldraw')
        ]);
        // CSS side-effect import — vite bundles it.
        await import('@tldraw/tldraw/tldraw.css');

        // Load saved snapshot.
        let initialSnapshot: unknown = undefined;
        if (id) {
          const resp = await fetch(`/api/ai/canvas/${id}`);
          const j = await resp.json();
          if (j.canvas) {
            title = j.canvas.title ?? title;
            const p = j.canvas.payload;
            // Gracefully skip legacy stroke payloads — tldraw format is different.
            if (p && !isOldStrokeFormat(p) && p.store) {
              initialSnapshot = p;
            }
          }
        }

        const root = createRoot(containerEl!);
        reactRoot = root;

        root.render(
          React.createElement(Tldraw as React.ComponentType<{
            snapshot?: unknown;
            onMount?: (editor: typeof editorRef) => void;
          }>, {
            snapshot: initialSnapshot,
            onMount(editor) {
              editorRef = editor as typeof editorRef;
              unlisten = (editor as typeof editorRef)!.store.listen(
                () => { dirty = true; },
                { scope: 'document' }
              );
            }
          })
        );

        autoSaveTimer = setInterval(() => { if (dirty && !saving) void save(); }, 5_000);
      } catch (err) {
        loadError = (err as Error).message;
      }
    })();

    return () => {
      if (autoSaveTimer) clearInterval(autoSaveTimer);
      unlisten?.();
      reactRoot?.unmount();
    };
  });
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

  {#if !containerEl && !loadError}
    <div class="placeholder">Loading tldraw…</div>
  {/if}

  <div class="tldraw-shell" bind:this={containerEl}></div>
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
  }
  .title:focus { outline: none; border-color: var(--brand); box-shadow: var(--focus-ring); }
  .spacer { flex: 1; }
  .tldraw-shell {
    flex: 1;
    border-radius: var(--radius-lg);
    overflow: hidden;
    border: 1px solid var(--glass-border);
    /* tldraw manages its own background */
    position: relative;
  }
  /* tldraw mounts a full-height React tree — let it fill the shell */
  :global(.tldraw-shell > *) { height: 100% !important; }
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
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .muted { color: var(--text-muted, #888); }
  .small { font-size: 0.75rem; }
  .error { color: #f66; }
</style>
