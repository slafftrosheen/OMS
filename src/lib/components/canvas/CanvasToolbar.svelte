<script lang="ts">
  import { t } from 'svelte-i18n';
  import { ArrowUpRight, MousePointer2, Pencil, Type, Plus, SlidersHorizontal, Hand,
    Highlighter, Eraser, Square, Circle, Triangle, Diamond, Star, Minus, Frame,
    Upload, Link2, Undo2, Redo2, Scan, Copy, Group, Ungroup, BringToFront, SendToBack,
    Trash2, LayoutGrid, X } from 'lucide-svelte';

  interface Props {
    tool: string; selected: number; runnable: number; canUndo: boolean; canRedo: boolean;
    disabled?: boolean; importing?: boolean; linking?: boolean; running?: boolean;
    onTool: (tool: string) => void; onInsert: (kind: string, value?: string) => void;
    onAction: (action: string) => void; onLink: (url: string) => void;
  }
  let { tool, selected, runnable, canUndo, canRedo, disabled = false, importing = false,
    linking = false, running = false, onTool, onInsert, onAction, onLink }: Props = $props();
  let panel = $state<'insert' | 'tools' | null>(null);
  let linkUrl = $state('');
  let panelElement = $state<HTMLDivElement>();
  let insertButton: HTMLButtonElement;
  let toolsButton: HTMLButtonElement;
  let dockElement: HTMLDivElement;
  const kinds = ['idea', 'research', 'decision', 'task', 'note'];
  function closePanel() {
    const old = panel; panel = null;
    (old === 'insert' ? insertButton : toolsButton)?.focus();
  }
  function insert(kind: string, value?: string) { onInsert(kind, value); closePanel(); }
  function action(name: string) { onAction(name); closePanel(); }
  function selectTool(value: string) { onTool(value); closePanel(); }
  function submitLink(event: SubmitEvent) {
    event.preventDefault(); if (linkUrl.trim()) { onLink(linkUrl.trim()); linkUrl = ''; closePanel(); }
  }
  $effect(() => { if (panel) queueMicrotask(() => panelElement?.focus()); });
</script>

<svelte:window onpointerdown={(event) => {
  if (panel && event.target instanceof Node && !dockElement?.contains(event.target)) panel = null;
}} />

<div class="canvas-dock" bind:this={dockElement} data-testid="canvas-dock">
  {#if panel}
    <div class="dock-panel" bind:this={panelElement} tabindex="-1" role="dialog"
      aria-label={panel === 'insert' ? $t('toolkit.toolbar.insert') : $t('toolkit.toolbar.tools')}
      onkeydown={(event) => { if (event.key === 'Escape') { event.preventDefault(); closePanel(); } }}>
      <div class="panel-title"><strong>{panel === 'insert' ? $t('toolkit.toolbar.insert') : $t('toolkit.toolbar.tools')}</strong>
        <button class="close" type="button" aria-label={$t('toolkit.toolbar.close')} onclick={closePanel}><X size={17} /></button>
      </div>
      {#if panel === 'insert'}
        <div class="insert-primary">
          <button type="button" onclick={() => insert('files')} disabled={importing || disabled}><Upload size={18} />
            {importing ? $t('toolkit.canvas.importing') : $t('toolkit.canvas.addFiles')}</button>
        </div>
        <p class="format-hint">{$t('toolkit.toolbar.formats')}</p>
        <form class="link-form" onsubmit={submitLink}>
          <label for="canvas-link">{$t('toolkit.toolbar.linkLabel')}</label>
          <div><input id="canvas-link" type="url" bind:value={linkUrl} placeholder="https://…" maxlength="2048" required disabled={disabled || linking} />
            <button type="submit" title={$t('toolkit.toolbar.addLink')} aria-label={$t('toolkit.toolbar.addLink')}
              disabled={disabled || linking || !linkUrl.trim()}><Link2 size={18} /></button></div>
          <p>{$t('toolkit.toolbar.linkHint')}</p>
        </form>
        <section><h4>{$t('toolkit.canvas.ideas')}</h4><div class="choice-grid">
          {#each kinds as kind}<button type="button" disabled={disabled} onclick={() => insert('card', kind)}>{$t(`toolkit.kind.${kind}`)}</button>{/each}
        </div></section>
        <details><summary>{$t('toolkit.canvas.materials')}</summary><div class="choice-grid">
          {#each ['brushed-metal','matte','frosted-acrylic','wood-grain','concrete','patina','mesh'] as material}
            <button type="button" disabled={disabled} onclick={() => insert('material', material)}>{$t(`toolkit.nodes.materialPresets.${material}`)}</button>
          {/each}
          <button type="button" disabled={disabled} onclick={() => insert('photo-material')}>{$t('toolkit.canvas.fromImage')}</button>
        </div></details>
        <details><summary>{$t('toolkit.canvas.technical')}</summary><div class="choice-grid">
          {#each [{ type:'web-search', key:'techWeb' }, { type:'crawl', key:'techCrawl' },
            { type:'lumigrid', key:'LumiGrid' }, { type:'led-strip', key:'techStrip' },
            { type:'led-matrix', key:'techMatrix' }, { type:'boxletter', key:'techLetter' },
            { type:'maker', key:'techSketch' }, { type:'document', key:'techDocument' }] as node}
            <button type="button" disabled={disabled} onclick={() => insert('technical', node.type)}>{node.key === 'LumiGrid' ? 'LumiGrid' : $t(`toolkit.nodes.${node.key}`)}</button>
          {/each}
        </div></details>
      {:else}
        <section><h4>{$t('toolkit.toolbar.drawing')}</h4><div class="choice-grid tools-grid">
          {#each [{ id:'hand', icon:Hand, key:'hand' }, { id:'highlight', icon:Highlighter, key:'highlight' },
            { id:'eraser', icon:Eraser, key:'eraser' }, { id:'rectangle', icon:Square, key:'rectangle' },
            { id:'ellipse', icon:Circle, key:'ellipse' }, { id:'triangle', icon:Triangle, key:'triangle' },
            { id:'diamond', icon:Diamond, key:'diamond' }, { id:'star', icon:Star, key:'star' },
            { id:'line', icon:Minus, key:'line' }, { id:'frame', icon:Frame, key:'frame' }] as item}
            <button type="button" disabled={disabled} onclick={() => selectTool(item.id)}><item.icon size={17} />{$t(`toolkit.toolbar.${item.key}`)}</button>
          {/each}
        </div></section>
        <section><h4>{$t('toolkit.toolbar.editView')}</h4><div class="choice-grid tools-grid">
          <button type="button" disabled={disabled || !canUndo} onclick={() => action('undo')}><Undo2 size={17} />{$t('toolkit.canvas.undoTitle')}</button>
          <button type="button" disabled={disabled || !canRedo} onclick={() => action('redo')}><Redo2 size={17} />{$t('toolkit.canvas.redoTitle')}</button>
          <button type="button" disabled={disabled} onclick={() => action('fit')}><Scan size={17} />{$t('toolkit.canvas.fit')}</button>
          <button type="button" disabled={disabled} onclick={() => action('arrange')}><LayoutGrid size={17} />{$t('toolkit.canvas.arrangeIdeas')}</button>
          <button type="button" disabled={disabled || !selected} onclick={() => action('duplicate')}><Copy size={17} />{$t('toolkit.toolbar.duplicate')}</button>
          <button type="button" disabled={disabled || selected < 2} onclick={() => action('group')}><Group size={17} />{$t('toolkit.toolbar.group')}</button>
          <button type="button" disabled={disabled || !selected} onclick={() => action('ungroup')}><Ungroup size={17} />{$t('toolkit.toolbar.ungroup')}</button>
          <button type="button" disabled={disabled || !selected} onclick={() => action('front')}><BringToFront size={17} />{$t('toolkit.toolbar.front')}</button>
          <button type="button" disabled={disabled || !selected} onclick={() => action('back')}><SendToBack size={17} />{$t('toolkit.toolbar.back')}</button>
          <button type="button" disabled={disabled || !selected} onclick={() => action('delete')}><Trash2 size={17} />{$t('toolkit.canvas.deleteSelected')}</button>
        </div></section>
        <button type="button" class="run-tool" disabled={disabled || running || !runnable} onclick={() => action('run')}>
          {running ? $t('toolkit.canvas.working') : $t('toolkit.canvas.runTool')}
        </button>
      {/if}
    </div>
  {/if}
  <div class="dock-tools" role="toolbar" aria-label={$t('toolkit.toolbar.label')}>
    {#each [{ id:'select', icon:MousePointer2, key:'selectTitle' }, { id:'draw', icon:Pencil, key:'drawTitle' },
      { id:'arrow', icon:ArrowUpRight, key:'arrowTitle' }, { id:'text', icon:Type, key:'textTitle' }] as item}
      <button type="button" disabled={disabled} class:chosen={tool === item.id} aria-pressed={tool === item.id}
        title={$t(`toolkit.draw.${item.key}`)} aria-label={$t(`toolkit.draw.${item.key}`)}
        onclick={() => { onTool(item.id); panel = null; }}><item.icon size={20} /></button>
    {/each}
    <span class="divider" aria-hidden="true"></span>
    <button type="button" bind:this={insertButton} disabled={disabled} class:chosen={panel === 'insert'}
      aria-expanded={panel === 'insert'} aria-haspopup="dialog" title={$t('toolkit.toolbar.insert')} aria-label={$t('toolkit.toolbar.insert')}
      onclick={() => panel = panel === 'insert' ? null : 'insert'}><Plus size={21} /></button>
    <button type="button" bind:this={toolsButton} disabled={disabled} class:chosen={panel === 'tools' || !['select','draw','arrow','text'].includes(tool)}
      aria-expanded={panel === 'tools'} aria-haspopup="dialog" title={$t('toolkit.toolbar.tools')} aria-label={$t('toolkit.toolbar.tools')}
      onclick={() => panel = panel === 'tools' ? null : 'tools'}><SlidersHorizontal size={20} /></button>
  </div>
</div>

<style>
  .canvas-dock { position:absolute;z-index:300;bottom:16px;left:50%;transform:translateX(-50%);max-width:calc(100% - 16px);pointer-events:auto; }
  .dock-tools { display:flex;align-items:center;gap:3px;padding:6px;background:var(--bg-1);border:1px solid var(--border);border-radius:14px;box-shadow:var(--glass-shadow-lg,0 6px 24px #0002); }
  button { font:inherit;font-size:12px;color:var(--text);background:var(--bg-1);border:1px solid var(--border);border-radius:7px;min-height:40px;padding:8px;cursor:pointer; }
  button:hover:not(:disabled) { background:var(--bg-2);border-color:var(--brand); }
  button:disabled { opacity:.45;cursor:not-allowed; }
  button:focus-visible,input:focus-visible,summary:focus-visible { outline:2px solid var(--focus);outline-offset:2px; }
  .dock-tools button { display:grid;place-items:center;width:42px;height:42px;flex-shrink:0;border-color:transparent; }
  .dock-tools .chosen { color:var(--brand);background:var(--brand-soft);border-color:var(--brand); }
  .divider { width:1px;height:23px;background:var(--border);margin:0 2px; }
  .dock-panel { position:absolute;bottom:calc(100% + 10px);left:50%;transform:translateX(-50%);width:390px;max-width:min(calc(100vw - 32px),calc(100cqw - 24px));max-height:min(520px,65dvh);overflow:auto;overscroll-behavior:contain;background:var(--bg-1);border:1px solid var(--border);border-radius:12px;padding:14px;box-shadow:var(--glass-shadow-lg,0 6px 24px #0002);color:var(--text); }
  .panel-title { display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px; }
  .panel-title strong { font-size:14px; }.close { border:0;display:grid;place-items:center;min-height:32px;width:32px;padding:4px; }
  section,details { margin-top:14px;border-top:1px solid var(--border);padding-top:10px; }
  h4,summary { font-size:12px;font-weight:700;margin:0 0 8px; }summary { cursor:pointer;min-height:32px;display:flex;align-items:center; }
  .choice-grid { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px; }.choice-grid button { text-align:left;overflow-wrap:anywhere; }
  .tools-grid button { display:flex;align-items:center;gap:8px; }.tools-grid :global(svg) { flex-shrink:0; }
  .insert-primary button { display:flex;align-items:center;justify-content:center;gap:8px;width:100%;border-color:var(--brand); }
  .format-hint,.link-form p { margin:6px 0;font-size:11px;line-height:1.5;color:var(--ink-secondary); }
  .link-form { display:grid;gap:6px;margin-top:14px; }.link-form label { font-size:12px;font-weight:650; }
  .link-form>div { display:flex;gap:6px;min-width:0; }.link-form input { min-width:0;width:100%;flex:1;height:40px;border:1px solid var(--border);border-radius:7px;background:var(--bg-0);color:var(--text);font:inherit;font-size:12px;padding:8px; }
  .link-form button { width:40px;flex-shrink:0;display:grid;place-items:center; }.run-tool { width:100%;margin-top:12px; }
  @media(max-width:420px) { .canvas-dock { bottom:12px; }.dock-tools { gap:1px;padding:4px; }.dock-tools button { width:40px;height:42px; }.dock-panel { padding:12px; } }
</style>
