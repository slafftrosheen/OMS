<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import TldrawWrapper from '$lib/components/canvas/TldrawWrapper.svelte';
  import { runAll, runShape, type NodeKind } from '$lib/components/canvas/node-runner';

  let editorRef: any = null;
  let loaded = $state(false);
  let busy = $state(false);
  let toast = $state<{ kind: 'info' | 'error'; text: string } | null>(null);

  onMount(() => { loaded = true; });

  function handleEditorReady(editor: any) {
    editorRef = editor;
  }

  type ShapeMenuItem = {
    type: NodeKind | 'maker' | 'chat' | 'document' | 'swarm';
    label: string;
    group: 'AI' | 'Web' | 'Signage' | 'Engineering';
    icon: string;
  };

  const menu: ShapeMenuItem[] = [
    // AI
    { type: 'chat',        label: 'Chat',        group: 'AI',        icon: 'message-square' },
    { type: 'document',    label: 'Document',    group: 'AI',        icon: 'file-text' },
    { type: 'swarm',       label: 'Swarm node',  group: 'AI',        icon: 'network' },
    // Web
    { type: 'web-search',  label: 'Web search',  group: 'Web',       icon: 'search' },
    { type: 'crawl',       label: 'Crawl URL',   group: 'Web',       icon: 'globe' },
    // Signage (the company's bread and butter)
    { type: 'lumigrid',    label: 'LumiGrid PWM', group: 'Signage',  icon: 'sliders' },
    { type: 'led-strip',   label: 'LED strip',   group: 'Signage',   icon: 'lightbulb' },
    { type: 'led-matrix',  label: 'LED matrix',  group: 'Signage',   icon: 'grid' },
    { type: 'boxletter',   label: 'Box letter',  group: 'Signage',   icon: 'type' },
    // Engineering
    { type: 'maker',       label: 'Maker.js',    group: 'Engineering', icon: 'code' }
  ];

  function addShape(type: ShapeMenuItem['type']) {
    if (!editorRef) return;
    const center = editorRef.getViewportPageBounds().center;

    let props: Record<string, unknown> = {};
    if (type === 'document') {
      props = { title: 'New Document', content: 'Drop text here…', status: 'ready' };
    } else if (type === 'swarm') {
      props = { agentName: 'AI Node ' + Math.floor(Math.random() * 10), caps: ['reasoning', 'vision'] };
    }

    editorRef.createShape({
      type,
      x: center.x - 180,
      y: center.y - 160,
      props
    });
  }

  async function runSelected() {
    if (!editorRef || busy) return;
    const ids = (editorRef.getSelectedShapeIds?.() ?? []) as string[];
    if (ids.length === 0) {
      toast = { kind: 'info', text: 'Select one or more nodes to run.' };
      return;
    }
    busy = true;
    toast = { kind: 'info', text: `Running ${ids.length} node(s)…` };
    try {
      let ok = 0;
      let failed = 0;
      for (const id of ids) {
        try {
          await runShape(editorRef, id);
          ok++;
        } catch {
          failed++;
        }
      }
      toast = failed > 0
        ? { kind: 'error', text: `${ok} ok · ${failed} failed` }
        : { kind: 'info', text: `Ran ${ok} node(s) ✓` };
    } finally {
      busy = false;
    }
  }

  async function runEverything() {
    if (!editorRef || busy) return;
    busy = true;
    toast = { kind: 'info', text: 'Running graph…' };
    try {
      await runAll(editorRef);
      toast = { kind: 'info', text: 'Graph executed ✓' };
    } catch (err) {
      toast = { kind: 'error', text: (err as Error).message };
    } finally {
      busy = false;
    }
  }

  const groups = $derived(
    Array.from(new Set(menu.map((m) => m.group))).map((g) => ({
      name: g,
      items: menu.filter((m) => m.group === g)
    }))
  );
</script>

<div class="canvas-fullscreen">
  <div class="toolbar">
    {#each groups as g (g.name)}
      <div class="group">
        <span class="group-label">{g.name}</span>
        {#each g.items as item (item.type)}
          <button class="btn ghost" onclick={() => addShape(item.type)} title={`Add ${item.label}`}>
            <Icon name={item.icon as any} size="sm" />
            <span>{item.label}</span>
          </button>
        {/each}
      </div>
    {/each}

    <div class="spacer"></div>

    <button class="btn" onclick={runSelected} disabled={busy} title="Run selected nodes (gathers inputs from arrows)">
      <Icon name="play" size="sm" />
      <span>Run selected</span>
    </button>
    <button class="btn primary" onclick={runEverything} disabled={busy} title="Run every AI node on the page in topo order">
      <Icon name="zap" size="sm" />
      <span>Run all</span>
    </button>
  </div>

  {#if toast}
    <div class="toast" class:error={toast.kind === 'error'}>{toast.text}</div>
  {/if}

  {#if loaded}
    <div class="tldraw-shell">
      <TldrawWrapper onReady={handleEditorReady} />
    </div>
  {:else}
    <div class="placeholder">Loading canvas…</div>
  {/if}
</div>

<style>
  .canvas-fullscreen {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    background: var(--bg-0);
    z-index: 10;
  }

  .toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 10px 12px;
    background: var(--glass-bg);
    border-bottom: 1px solid var(--glass-border);
    backdrop-filter: var(--glass-blur);
    z-index: 20;
    align-items: center;
  }

  .group {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 6px 2px 8px;
    border-radius: var(--radius-md);
    border: 1px solid var(--glass-border);
    background: color-mix(in oklab, var(--bg-0) 60%, transparent);
  }

  .group-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted, #888);
    padding-right: 4px;
    border-right: 1px solid var(--glass-border);
    margin-right: 4px;
  }

  .spacer { flex: 1; }

  .btn {
    padding: 6px 10px;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--text);
    border: 1px solid var(--border);
    cursor: pointer;
    font: inherit;
    display: inline-flex;
    gap: 6px;
    align-items: center;
    font-size: 12px;
    transition: background var(--transition-fast), border-color var(--transition-fast);
  }
  .btn:hover { background: var(--bg-2); }
  .btn:disabled { opacity: 0.5; cursor: progress; }
  .btn.ghost { border-color: transparent; }
  .btn.ghost:hover { border-color: var(--border); }
  .btn.primary {
    background: var(--brand);
    color: white;
    border-color: var(--brand);
  }
  .btn.primary:hover { background: color-mix(in oklab, var(--brand) 85%, white); }

  .tldraw-shell {
    flex: 1;
    width: 100%;
    height: 100%;
    position: relative;
  }

  .placeholder {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted, #888);
  }

  .toast {
    position: absolute;
    top: 56px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--glass-bg-strong);
    backdrop-filter: var(--glass-material-thick);
    -webkit-backdrop-filter: var(--glass-material-thick);
    border: 1px solid var(--glass-border);
    box-shadow: var(--glass-shadow-lg), var(--glass-border-highlight);
    padding: var(--space-sm) var(--space-lg);
    border-radius: var(--radius-full);
    font-size: var(--text-sm);
    z-index: 30;
    color: var(--text);
    animation: rf-slide-down var(--motion-md) var(--ease-emphasized) both;
  }
  .toast.error {
    border-color: color-mix(in oklab, var(--error) 40%, var(--glass-border));
    color: var(--error);
    background: color-mix(in oklab, var(--error) 8%, var(--glass-bg-strong));
  }
</style>
