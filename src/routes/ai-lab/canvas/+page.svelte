<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import TldrawWrapper from '$lib/components/canvas/TldrawWrapper.svelte';

  let editorRef: any = null;
  let loaded = $state(false);

  onMount(() => {
    loaded = true;
  });

  function handleEditorReady(editor: any) {
    editorRef = editor;
  }

  function addShape(type: 'maker' | 'chat' | 'forge' | 'document' | 'swarm') {
    if (!editorRef) return;

    const center = editorRef.getViewportPageCenter();
    
    let props = {};
    if (type === 'document') {
        props = { title: 'New Document', content: 'Drop text here...', status: 'ready' };
    } else if (type === 'swarm') {
        props = { agentName: 'AI Node ' + Math.floor(Math.random()*10), caps: ['reasoning', 'vision'] };
    }

    editorRef.createShape({
      type,
      x: center.x - 150,
      y: center.y - 150,
      props
    });
  }
</script>

<div class="canvas-fullscreen">
  <div class="toolbar">
    <button class="btn ghost" onclick={() => addShape('maker')} title="Add Maker.js Code Block"><Icon name="code" size="sm" /> Maker</button>
    <button class="btn ghost" onclick={() => addShape('chat')} title="Add Contextual Chat"><Icon name="message-square" size="sm" /> Chat</button>
    <button class="btn ghost" onclick={() => addShape('forge')} title="Add Generative Image"><Icon name="image" size="sm" /> Forge</button>
    <button class="btn ghost" onclick={() => addShape('document')} title="Add Document Node"><Icon name="library" size="sm" /> Document</button>
    <button class="btn ghost" onclick={() => addShape('swarm')} title="Add Swarm Node"><Icon name="network" size="sm" /> Swarm</button>
  </div>

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
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--bg-0);
    z-index: 10;
  }
  
  .toolbar {
    display: flex;
    gap: 8px;
    background: var(--glass-bg);
    padding: 12px;
    border-bottom: 1px solid var(--glass-border);
    backdrop-filter: blur(10px);
    z-index: 20;
  }

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
    font-size: 0.9rem;
  }
  
  .btn {
    padding: 7px 14px;
    border-radius: var(--radius-md);
    background: var(--brand);
    color: white;
    border: 0;
    cursor: pointer;
    font: inherit;
    display: inline-flex;
    gap: 6px;
    align-items: center;
    font-size: 13px;
  }
  
  .btn.ghost {
    background: transparent;
    color: var(--text);
    border: 1px solid var(--border);
  }
  
  .btn.ghost:hover {
    background: var(--bg-2);
  }
</style>
