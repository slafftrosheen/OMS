<script lang="ts">
  import { onDestroy } from 'svelte';
  import { t } from 'svelte-i18n';
  import { ArrowUpRight, MousePointer2, Pencil, Type, Plus, SlidersHorizontal, Hand,
    Highlighter, Eraser, Square, Circle, Triangle, Diamond, Star, Minus, Frame,
    Upload, Link2, Undo2, Redo2, Scan, Focus, Copy, Group, Ungroup, BringToFront, SendToBack,
    Trash2, LayoutGrid, Palette, X } from 'lucide-svelte';
  import type { ToolkitControlsState } from './toolkit-controls';
  import { normalizeCanvasMediaUrl } from './toolkit-media-url';

  interface Props {
    controls: ToolkitControlsState;
    disabled?: boolean; importing?: boolean; linking?: boolean; running?: boolean;
    onTool: (tool: string) => void; onInsert: (kind: string, value?: string) => void;
    onAction: (action: string) => void; onLink: (url: string) => Promise<boolean>;
    onStyleHost: (host: HTMLElement | null) => void;
  }
  let { controls, disabled = false, importing = false, linking = false, running = false,
    onTool, onInsert, onAction, onLink, onStyleHost }: Props = $props();
  let panel = $state<'insert' | 'tools' | null>(null);
  let stylesOpen = $state(false);
  let linkUrl = $state('');
  let linkError = $state('');
  let submittingLink = $state(false);
  let dockIndex = $state(0);
  let panelElement = $state<HTMLDivElement>();
  let insertButton: HTMLButtonElement;
  let toolsButton: HTMLButtonElement;
  let dockElement: HTMLDivElement;
  let disposed = false;
  const kinds = ['idea', 'research', 'decision', 'task', 'note'];
  const primaryTools = [
    { id:'select', icon:MousePointer2, key:'selectTitle' }, { id:'draw', icon:Pencil, key:'drawTitle' },
    { id:'arrow', icon:ArrowUpRight, key:'arrowTitle' }, { id:'text', icon:Type, key:'textTitle' }
  ];
  const moreTools = [
    { id:'hand', icon:Hand, key:'hand' }, { id:'highlight', icon:Highlighter, key:'highlight' },
    { id:'eraser', icon:Eraser, key:'eraser' }, { id:'rectangle', icon:Square, key:'rectangle' },
    { id:'ellipse', icon:Circle, key:'ellipse' }, { id:'triangle', icon:Triangle, key:'triangle' },
    { id:'diamond', icon:Diamond, key:'diamond' }, { id:'star', icon:Star, key:'star' },
    { id:'line', icon:Minus, key:'line' }, { id:'frame', icon:Frame, key:'frame' }
  ];
  const alignments = ['left', 'center', 'right', 'top', 'middle', 'bottom'];
  const editDisabled = $derived(disabled || controls.readOnly);
  const linkBusy = $derived(linking || submittingLink);

  function closePanel(restoreFocus = true) {
    const old = panel;
    panel = null;
    stylesOpen = false;
    if (restoreFocus) (old === 'insert' ? insertButton : toolsButton)?.focus();
  }
  function openPanel(value: 'insert' | 'tools') {
    if (panel === value) closePanel();
    else { panel = value; linkError = ''; }
  }
  function insert(kind: string, value?: string) { closePanel(false); onInsert(kind, value); }
  function action(name: string) { closePanel(false); onAction(name); }
  function selectTool(value: string) { closePanel(false); onTool(value); }
  function mountStyles(node: HTMLDivElement) {
    onStyleHost(node);
    return { destroy() { onStyleHost(null); } };
  }
  async function submitLink(event: SubmitEvent) {
    event.preventDefault();
    if (editDisabled || linkBusy) return;
    const url = normalizeCanvasMediaUrl(linkUrl.trim());
    if (!url) { linkError = $t('toolkit.toolbar.invalidLink'); return; }
    submittingLink = true;
    linkError = '';
    try {
      const inserted = await onLink(url);
      if (disposed) return;
      if (inserted) { linkUrl = ''; closePanel(); }
      else linkError = $t('toolkit.toolbar.linkFailed');
    } catch {
      if (!disposed) linkError = $t('toolkit.toolbar.linkFailed');
    } finally { if (!disposed) submittingLink = false; }
  }
  function dockKeys(event: KeyboardEvent) {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement) || !target.hasAttribute('data-dock-item')) return;
    const buttons = [...dockElement.querySelectorAll<HTMLButtonElement>('[data-dock-item]:not(:disabled)')];
    const current = buttons.indexOf(target);
    let next = current;
    if (event.key === 'ArrowRight') next = (current + 1) % buttons.length;
    else if (event.key === 'ArrowLeft') next = (current - 1 + buttons.length) % buttons.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = buttons.length - 1;
    else if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && [insertButton, toolsButton].includes(target)) {
      event.preventDefault(); event.stopPropagation();
      if (!panel) openPanel(target === insertButton ? 'insert' : 'tools');
      return;
    } else return;
    event.preventDefault(); event.stopPropagation();
    const button = buttons[next];
    if (button) { dockIndex = Number(button.dataset.dockItem); button.focus(); }
  }
  $effect(() => {
    if (panel) queueMicrotask(() => {
      panelElement?.querySelector<HTMLElement>('button:not(.close):not(:disabled), input:not(:disabled), summary')?.focus();
    });
  });
  $effect(() => {
    if (controls.readOnly || disabled) dockIndex = 0;
  });
  onDestroy(() => { disposed = true; });
</script>

<svelte:window onpointerdown={(event) => {
  if (panel && event.target instanceof Node && !dockElement?.contains(event.target)) closePanel(false);
}} />

<div class="canvas-dock" bind:this={dockElement} data-testid="canvas-dock">
  {#if panel}
    <div class="dock-panel" bind:this={panelElement} tabindex="-1" role="dialog"
      aria-label={panel === 'insert' ? $t('toolkit.toolbar.insert') : $t('toolkit.toolbar.tools')}
      onkeydown={(event) => { if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); event.stopPropagation(); closePanel(); } }}>
      <div class="panel-title"><strong>{panel === 'insert' ? $t('toolkit.toolbar.insert') : $t('toolkit.toolbar.tools')}</strong>
        <button class="close" type="button" aria-label={$t('toolkit.toolbar.close')} onclick={() => closePanel()}><X size={17} /></button>
      </div>
      {#if panel === 'insert'}
        <div class="insert-primary">
          <button type="button" onclick={() => insert('files')} disabled={importing || editDisabled}><Upload size={18} />
            {importing ? $t('toolkit.canvas.importing') : $t('toolkit.canvas.addFiles')}</button>
        </div>
        <p class="format-hint">{$t('toolkit.toolbar.formats')}</p>
        <form class="link-form" onsubmit={submitLink}>
          <label for="canvas-link">{$t('toolkit.toolbar.linkLabel')}</label>
          <div><input id="canvas-link" type="url" bind:value={linkUrl} placeholder="https://…" maxlength="2048" required
              aria-invalid={!!linkError} aria-describedby={linkError ? 'canvas-link-error' : 'canvas-link-hint'}
              oninput={() => linkError = ''} disabled={editDisabled || linkBusy} />
            <button type="submit" title={$t('toolkit.toolbar.addLink')} aria-label={$t('toolkit.toolbar.addLink')}
              disabled={editDisabled || linkBusy || !linkUrl.trim()}><Link2 size={18} /></button></div>
          {#if linkError}<p id="canvas-link-error" class="link-error" role="alert">{linkError}</p>{/if}
          <p id="canvas-link-hint">{linkBusy ? $t('toolkit.toolbar.addingLink') : $t('toolkit.toolbar.linkHint')}</p>
        </form>
        <section><h4>{$t('toolkit.canvas.ideas')}</h4><div class="choice-grid">
          {#each kinds as kind}<button type="button" disabled={editDisabled} onclick={() => insert('card', kind)}>{$t(`toolkit.kind.${kind}`)}</button>{/each}
        </div></section>
        <details><summary>{$t('toolkit.canvas.materials')}</summary><div class="choice-grid">
          {#each ['brushed-metal','matte','frosted-acrylic','wood-grain','concrete','patina','mesh'] as material}
            <button type="button" disabled={editDisabled} onclick={() => insert('material', material)}>{$t(`toolkit.nodes.materialPresets.${material}`)}</button>
          {/each}
          <button type="button" disabled={editDisabled || !controls.selectedImage} onclick={() => insert('photo-material')}>{$t('toolkit.canvas.fromImage')}</button>
        </div></details>
        <details><summary>{$t('toolkit.canvas.technical')}</summary><div class="choice-grid">
          {#each [{ type:'web-search', key:'techWeb' }, { type:'crawl', key:'techCrawl' },
            { type:'lumigrid', key:'LumiGrid' }, { type:'led-strip', key:'techStrip' },
            { type:'led-matrix', key:'techMatrix' }, { type:'boxletter', key:'techLetter' },
            { type:'maker', key:'techSketch' }, { type:'document', key:'techDocument' }] as node}
            <button type="button" disabled={editDisabled} onclick={() => insert('technical', node.type)}>{node.key === 'LumiGrid' ? 'LumiGrid' : $t(`toolkit.nodes.${node.key}`)}</button>
          {/each}
        </div></details>
      {:else}
        {#if controls.readOnly}<p class="context-hint" role="status">{$t('toolkit.toolbar.readOnly')}</p>{/if}
        <details class="style-section" open={stylesOpen} ontoggle={(event) => stylesOpen = event.currentTarget.open}>
          <summary><Palette size={17} />{$t('toolkit.toolbar.styles')}</summary>
          {#if stylesOpen}
            <p class="context-hint">{controls.selected && controls.tool === 'select' ? $t('toolkit.toolbar.stylesSelection') : $t('toolkit.toolbar.stylesNext')}</p>
            <div class="style-host" use:mountStyles></div>
            {#if !controls.canStyle}<p class="context-hint">{$t(controls.selectionLocked ? 'toolkit.toolbar.lockedSelection' : controls.readOnly ? 'toolkit.toolbar.readOnly' : 'toolkit.toolbar.noStyles')}</p>{/if}
          {/if}
        </details>
        <section><h4>{$t('toolkit.toolbar.drawing')}</h4><div class="choice-grid tools-grid">
          {#each moreTools as item}
            <button type="button" disabled={disabled || (controls.readOnly && item.id !== 'hand')}
              class:chosen={controls.tool === item.id} aria-pressed={controls.tool === item.id}
              onclick={() => selectTool(item.id)}><item.icon size={17} />{$t(`toolkit.toolbar.${item.key}`)}</button>
          {/each}
        </div></section>
        <section aria-label={$t('toolkit.toolbar.selection')}>
          <div class="section-heading"><h4>{$t('toolkit.toolbar.selection')}</h4><span>{$t('toolkit.canvas.selected', { count: controls.selected })}</span></div>
          {#if !controls.selected}<p class="context-hint">{$t('toolkit.toolbar.selectObjects')}</p>
          {:else if controls.selectionLocked}<p class="context-hint">{$t('toolkit.toolbar.lockedSelection')}</p>{/if}
          <button type="button" class="selection-ask" disabled={disabled || !controls.selected} onclick={() => action('ask-selection')}>{$t('toolkit.toolbar.askSelection')}</button>
          <div class="choice-grid tools-grid">
            <button type="button" disabled={disabled || !controls.canEditSelection} onclick={() => action('duplicate')}><Copy size={17} />{$t('toolkit.toolbar.duplicate')}</button>
            <button type="button" disabled={disabled || !controls.canGroup} onclick={() => action('group')}><Group size={17} />{$t('toolkit.toolbar.group')}</button>
            <button type="button" disabled={disabled || !controls.canUngroup} onclick={() => action('ungroup')}><Ungroup size={17} />{$t('toolkit.toolbar.ungroup')}</button>
            <button type="button" disabled={disabled || !controls.canEditSelection} onclick={() => action('front')}><BringToFront size={17} />{$t('toolkit.toolbar.front')}</button>
            <button type="button" disabled={disabled || !controls.canEditSelection} onclick={() => action('back')}><SendToBack size={17} />{$t('toolkit.toolbar.back')}</button>
            <button type="button" disabled={disabled || !controls.canEditSelection} onclick={() => action('delete')}><Trash2 size={17} />{$t('toolkit.canvas.deleteSelected')}</button>
          </div>
          <details class="alignment-section"><summary>{$t('toolkit.toolbar.alignDistribute')}</summary>
            <p class="context-hint">{$t('toolkit.toolbar.alignHint')}</p>
            <div class="choice-grid">
              {#each alignments as alignment}
                <button type="button" disabled={disabled || !controls.canAlign} onclick={() => action(`align-${alignment}`)}>{$t(`toolkit.toolbar.align.${alignment}`)}</button>
              {/each}
              <button type="button" disabled={disabled || !controls.canDistribute} onclick={() => action('distribute-horizontal')}>{$t('toolkit.toolbar.distributeHorizontal')}</button>
              <button type="button" disabled={disabled || !controls.canDistribute} onclick={() => action('distribute-vertical')}>{$t('toolkit.toolbar.distributeVertical')}</button>
            </div>
          </details>
        </section>
        <section><h4>{$t('toolkit.toolbar.editView')}</h4><div class="choice-grid tools-grid">
          <button type="button" disabled={disabled || !controls.canUndo} onclick={() => action('undo')}><Undo2 size={17} />{$t('toolkit.canvas.undoTitle')}</button>
          <button type="button" disabled={disabled || !controls.canRedo} onclick={() => action('redo')}><Redo2 size={17} />{$t('toolkit.canvas.redoTitle')}</button>
          <button type="button" disabled={disabled || !controls.hasShapes} onclick={() => action('fit')}><Scan size={17} />{$t('toolkit.canvas.fit')}</button>
          <button type="button" disabled={disabled || !controls.canFitSelection} onclick={() => action('fit-selection')}><Focus size={17} />{$t('toolkit.toolbar.fitSelection')}</button>
          <button type="button" disabled={disabled} onclick={() => action('zoom-reset')}>{$t('toolkit.toolbar.actualSize')}</button>
          <button type="button" disabled={editDisabled || !controls.hasShapes} onclick={() => action('arrange')}><LayoutGrid size={17} />{$t('toolkit.canvas.arrangeIdeas')}</button>
        </div></section>
        <button type="button" class="run-tool" disabled={editDisabled || running || !controls.runnable} onclick={() => action('run')}>
          {running ? $t('toolkit.canvas.working') : $t('toolkit.canvas.runTool')}
        </button>
      {/if}
    </div>
  {/if}
  <div class="dock-tools" role="toolbar" tabindex="-1" aria-label={$t('toolkit.toolbar.label')} onkeydown={dockKeys}>
    {#each primaryTools as item, index}
      <button type="button" data-dock-item={index} tabindex={dockIndex === index ? 0 : -1}
        onfocus={() => dockIndex = index} disabled={disabled || (controls.readOnly && item.id !== 'select')}
        class:chosen={controls.tool === item.id} aria-pressed={controls.tool === item.id}
        title={$t(`toolkit.draw.${item.key}`)} aria-label={$t(`toolkit.draw.${item.key}`)}
        onclick={() => selectTool(item.id)}><item.icon size={20} /></button>
    {/each}
    <span class="divider" aria-hidden="true"></span>
    <button type="button" bind:this={insertButton} data-dock-item="4" tabindex={dockIndex === 4 ? 0 : -1}
      onfocus={() => dockIndex = 4} disabled={editDisabled} class:chosen={panel === 'insert'}
      aria-expanded={panel === 'insert'} aria-haspopup="dialog" title={$t('toolkit.toolbar.insert')} aria-label={$t('toolkit.toolbar.insert')}
      onclick={() => openPanel('insert')}><Plus size={21} /></button>
    <button type="button" bind:this={toolsButton} data-dock-item="5" tabindex={dockIndex === 5 ? 0 : -1}
      onfocus={() => dockIndex = 5} disabled={disabled} class:chosen={panel === 'tools' || !primaryTools.some(item => item.id === controls.tool)}
      aria-expanded={panel === 'tools'} aria-haspopup="dialog" title={$t('toolkit.toolbar.tools')} aria-label={$t('toolkit.toolbar.tools')}
      onclick={() => openPanel('tools')}><SlidersHorizontal size={20} /></button>
  </div>
</div>

<style>
  .canvas-dock { position:absolute;z-index:300;bottom:16px;left:50%;transform:translateX(-50%);max-width:calc(100% - 16px);pointer-events:auto; }
  .dock-tools { display:flex;align-items:center;gap:3px;padding:6px;background:var(--bg-1);border:1px solid var(--border);border-radius:14px;box-shadow:var(--glass-shadow-lg,0 6px 24px #0002); }
  button { font:inherit;font-size:12px;color:var(--text);background:var(--bg-1);border:1px solid var(--border);border-radius:7px;min-height:40px;padding:8px;cursor:pointer; }
  button:hover:not(:disabled) { background:var(--bg-2);border-color:var(--brand); }
  button:disabled { opacity:.45;cursor:not-allowed; }
  button:focus-visible,input:focus-visible,summary:focus-visible { outline:2px solid var(--focus);outline-offset:2px; }
  .chosen { color:var(--brand);background:var(--brand-soft);border-color:var(--brand); }
  .dock-tools button { display:grid;place-items:center;width:42px;height:42px;flex-shrink:0;border-color:transparent; }
  .dock-tools .chosen { border-color:var(--brand); }
  .divider { width:1px;height:23px;background:var(--border);margin:0 2px; }
  .dock-panel { position:absolute;bottom:calc(100% + 10px);left:50%;transform:translateX(-50%);width:390px;max-width:min(calc(100vw - 32px),calc(100cqw - 24px));max-height:min(560px,65dvh,calc(100cqh - 96px));overflow:auto;overscroll-behavior:contain;background:var(--bg-1);border:1px solid var(--border);border-radius:12px;padding:14px;box-shadow:var(--glass-shadow-lg,0 6px 24px #0002);color:var(--text);scrollbar-width:thin;scrollbar-color:var(--border) transparent; }
  .panel-title { display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px;position:sticky;top:0;z-index:400;background:var(--bg-1); }
  .panel-title strong { font-size:14px; }.close { border:0;display:grid;place-items:center;min-height:32px;width:32px;padding:4px; }
  section,details { margin-top:14px;border-top:1px solid var(--border);padding-top:10px; }
  h4,summary { font-size:12px;font-weight:700;margin:0 0 8px; }summary { cursor:pointer;min-height:36px;display:flex;align-items:center;gap:8px; }
  summary::after { content:'+';margin-left:auto;font-size:16px;font-weight:500; }details[open]>summary::after { content:'−'; }
  .style-section { margin-top:0;border-top:0;padding-top:0; }.style-host { margin:8px 0; }
  .style-host :global(.tlui-style-panel) { width:220px;max-width:100%; }
  .style-host :global(.tlui-button:focus-visible) { outline:2px solid var(--focus);outline-offset:-2px; }
  .style-host :global(.tl-container) { --color-accent:var(--brand);--color-panel:var(--bg-1);--color-text:var(--text);--color-text-1:var(--ink-primary); }
  .style-host :global(.toolkit-style-fields) { display:grid;gap:8px;margin-top:10px; }
  .style-host :global(.toolkit-style-fields:empty) { display:none; }
  .style-host :global(.toolkit-style-field) { display:grid;grid-template-columns:76px minmax(0,1fr);gap:8px;align-items:center;font-size:11px;line-height:1.35;color:var(--text); }
  .style-host :global(.toolkit-style-field select) { width:100%;min-width:0;min-height:38px;padding:6px;border:1px solid var(--border);border-radius:7px;background:var(--bg-0);color:var(--text);font:inherit; }
  .style-host :global(.toolkit-style-field select:focus-visible) { outline:2px solid var(--focus);outline-offset:2px; }
  .section-heading { display:flex;align-items:baseline;justify-content:space-between;gap:10px; }.section-heading span { font-size:11px;color:var(--ink-secondary); }
  .context-hint { margin:0 0 10px;color:var(--ink-secondary);font-size:12px;line-height:1.5; }
  .selection-ask { width:100%;margin-bottom:8px;border-color:var(--brand); }
  .alignment-section { border:0;padding-top:0;margin-top:8px; }
  .choice-grid { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px; }.choice-grid button { text-align:left;overflow-wrap:anywhere; }
  .tools-grid button { display:flex;align-items:center;gap:8px; }.tools-grid :global(svg) { flex-shrink:0; }
  .insert-primary button { display:flex;align-items:center;justify-content:center;gap:8px;width:100%;border-color:var(--brand); }
  .format-hint,.link-form p { margin:6px 0;font-size:11px;line-height:1.5;color:var(--ink-secondary); }
  .link-form { display:grid;gap:6px;margin-top:14px; }.link-form label { font-size:12px;font-weight:650; }
  .link-form>div { display:flex;gap:6px;min-width:0; }.link-form input { min-width:0;width:100%;flex:1;height:40px;border:1px solid var(--border);border-radius:7px;background:var(--bg-0);color:var(--text);font:inherit;font-size:12px;padding:8px;caret-color:var(--brand); }
  .link-form .link-error { color:var(--error); }.link-form input[aria-invalid='true'] { border-color:var(--error); }
  .link-form button { width:40px;flex-shrink:0;display:grid;place-items:center; }.run-tool { width:100%;margin-top:12px; }
  @media(max-width:420px) { .canvas-dock { bottom:12px; }.dock-tools { gap:1px;padding:4px; }.dock-tools button { width:40px;height:42px; }.dock-panel { padding:12px; } }
</style>
