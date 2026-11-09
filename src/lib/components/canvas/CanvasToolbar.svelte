<script lang="ts">
  import { onDestroy } from 'svelte';
  import { t } from 'svelte-i18n';
  import { Plus, Upload, Link2, LayoutGrid, MessageSquare, Play, X } from 'lucide-svelte';
  import type { ToolkitControlsState } from './toolkit-controls';
  import { normalizeCanvasMediaUrl } from './toolkit-media-url';

  // CanvasApp owns drawing, properties, layers and view commands in every
  // workspace. This bar contains only Toolkit-specific content and automation.
  interface Props {
    controls: ToolkitControlsState;
    disabled?: boolean; importing?: boolean; linking?: boolean; running?: boolean;
    onInsert: (kind: string, value?: string) => void;
    onAction: (action: string) => void;
    onLink: (url: string) => Promise<boolean>;
  }
  let { controls, disabled = false, importing = false, linking = false, running = false,
    onInsert, onAction, onLink }: Props = $props();
  let panelOpen = $state(false);
  let linkUrl = $state('');
  let linkError = $state('');
  let submittingLink = $state(false);
  let dockIndex = $state(0);
  let panelElement = $state<HTMLDivElement>();
  let insertButton: HTMLButtonElement;
  let dockElement: HTMLDivElement;
  let disposed = false;
  const kinds = ['idea', 'research', 'decision', 'task', 'note'];
  const editDisabled = $derived(disabled || controls.readOnly);
  const linkBusy = $derived(linking || submittingLink);

  function closePanel(restoreFocus = true) {
    panelOpen = false;
    if (restoreFocus) insertButton?.focus();
  }
  function openPanel() {
    if (panelOpen) closePanel();
    else { panelOpen = true; linkError = ''; }
  }
  function insert(kind: string, value?: string) {
    if (editDisabled) return;
    closePanel(false);
    onInsert(kind, value);
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
    if (!buttons.length) return;
    const current = buttons.indexOf(target);
    let next = current;
    if (event.key === 'ArrowRight') next = (current + 1) % buttons.length;
    else if (event.key === 'ArrowLeft') next = (current - 1 + buttons.length) % buttons.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = buttons.length - 1;
    else if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && target === insertButton) {
      event.preventDefault(); event.stopPropagation();
      if (!panelOpen) openPanel();
      return;
    } else return;
    event.preventDefault(); event.stopPropagation();
    const button = buttons[next];
    if (button) { dockIndex = Number(button.dataset.dockItem); button.focus(); }
  }
  $effect(() => {
    if (panelOpen) queueMicrotask(() => {
      panelElement?.querySelector<HTMLElement>('button:not(.close):not(:disabled), input:not(:disabled), summary')?.focus();
    });
  });
  $effect(() => {
    // Keep a keyboard entry point when a selection disappears or becomes read-only.
    if (disabled || controls.readOnly) { dockIndex = 3; closePanel(false); }
    else if (dockIndex === 2 && (!controls.runnable || running)) dockIndex = 0;
    else if (dockIndex === 1 && !controls.hasShapes) dockIndex = 0;
  });
  onDestroy(() => { disposed = true; });
</script>

<svelte:window onpointerdown={(event) => {
  if (panelOpen && event.target instanceof Node && !dockElement?.contains(event.target)) closePanel(false);
}} />

<div class="canvas-content-bar" bind:this={dockElement} data-testid="canvas-content-bar">
  <div class="content-actions" role="toolbar" tabindex="-1" aria-label={$t('toolkit.toolbar.contentLabel')} onkeydown={dockKeys}>
    <button type="button" bind:this={insertButton} data-dock-item="0" tabindex={dockIndex === 0 ? 0 : -1}
      onfocus={() => dockIndex = 0} disabled={editDisabled} class:chosen={panelOpen}
      aria-expanded={panelOpen} aria-haspopup="dialog" onclick={openPanel}>
      <Plus size={17} />{$t('toolkit.toolbar.insert')}
    </button>
    <button type="button" data-dock-item="1" tabindex={dockIndex === 1 ? 0 : -1} onfocus={() => dockIndex = 1}
      disabled={editDisabled || !controls.hasShapes} onclick={() => onAction('arrange')}>
      <LayoutGrid size={16} />{$t('toolkit.canvas.arrangeIdeas')}
    </button>
    {#if controls.runnable || running}
      <button type="button" data-dock-item="2" tabindex={dockIndex === 2 ? 0 : -1} onfocus={() => dockIndex = 2}
        disabled={editDisabled || running || !controls.runnable} onclick={() => onAction('run')}>
        <Play size={16} />{running ? $t('toolkit.canvas.working') : $t('toolkit.canvas.runTool')}
      </button>
    {/if}
    <button type="button" data-dock-item="3" tabindex={dockIndex === 3 ? 0 : -1} onfocus={() => dockIndex = 3}
      disabled={disabled} onclick={() => onAction(controls.selected ? 'ask-selection' : 'ask-board')}>
      <MessageSquare size={16} />{$t(controls.selected ? 'toolkit.toolbar.askSelection' : 'toolkit.canvas.assistant')}
    </button>
  </div>
  {#if panelOpen}
    <div class="insert-panel" bind:this={panelElement} tabindex="-1" role="dialog" aria-label={$t('toolkit.toolbar.insert')}
      onkeydown={(event) => { if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); event.stopPropagation(); closePanel(); } }}>
      <div class="panel-title"><strong>{$t('toolkit.toolbar.insert')}</strong>
        <button class="close" type="button" aria-label={$t('toolkit.toolbar.close')} onclick={() => closePanel()}><X size={17} /></button>
      </div>
      <section class="ideas"><h4>{$t('toolkit.canvas.ideas')}</h4><div class="choice-grid">
        {#each kinds as kind}<button type="button" disabled={editDisabled} onclick={() => insert('card', kind)}>{$t(`toolkit.kind.${kind}`)}</button>{/each}
      </div></section>
      <section>
        <button class="upload" type="button" onclick={() => insert('files')} disabled={importing || editDisabled}><Upload size={18} />
          {importing ? $t('toolkit.canvas.importing') : $t('toolkit.canvas.addFiles')}</button>
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
      </section>
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
    </div>
  {/if}
</div>

<style>
  .canvas-content-bar { position:relative;z-index:300;flex:none;min-width:0;background:var(--bg-1);color:var(--text);border-bottom:1px solid var(--border); }
  .content-actions { display:flex;align-items:center;gap:4px;padding:4px 8px;overflow-x:auto;scrollbar-width:thin; }
  button { font:inherit;font-size:12px;color:var(--text);background:var(--bg-1);border:1px solid var(--border);border-radius:var(--radius-sm,4px);min-height:36px;padding:6px 8px;cursor:pointer; }
  button:hover:not(:disabled) { background:var(--bg-2);border-color:var(--brand); }
  button:disabled { opacity:.45;cursor:not-allowed; }
  button:focus-visible,input:focus-visible,summary:focus-visible { outline:2px solid var(--focus);outline-offset:2px; }
  .content-actions button { display:flex;align-items:center;justify-content:center;gap:6px;white-space:nowrap;flex-shrink:0;border-color:transparent; }
  .content-actions .chosen { color:var(--brand);background:var(--brand-soft);border-color:var(--brand); }
  .insert-panel { position:absolute;top:100%;left:8px;width:390px;max-width:calc(100% - 16px);max-height:min(560px,60dvh);overflow:auto;overscroll-behavior:contain;background:var(--bg-1);border:1px solid var(--border);border-radius:var(--radius-sm,4px);padding:12px;box-sizing:border-box;box-shadow:var(--glass-shadow-lg);scrollbar-width:thin;scrollbar-color:var(--border) transparent; }
  .panel-title { display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;position:sticky;top:0;z-index:1;background:var(--bg-1); }
  .panel-title strong { font-size:14px; }.close { border:0;display:grid;place-items:center;min-height:36px;width:36px;padding:4px; }
  section,details { margin-top:12px;border-top:1px solid var(--border);padding-top:12px; }
  .ideas { margin-top:0;border-top:0;padding-top:0; }
  h4,summary { font-size:12px;font-weight:700;margin:0 0 8px; }summary { cursor:pointer;min-height:36px;display:flex;align-items:center;gap:8px; }
  summary::after { content:'+';margin-left:auto;font-size:16px;font-weight:500; }details[open]>summary::after { content:'−'; }
  .choice-grid { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px; }.choice-grid button { text-align:left;overflow-wrap:anywhere; }
  .upload { display:flex;align-items:center;justify-content:center;gap:8px;width:100%; }
  .format-hint,.link-form p { margin:6px 0;font-size:11px;line-height:1.5;color:var(--ink-secondary); }
  .link-form { display:grid;gap:6px;margin-top:12px; }.link-form label { font-size:12px;font-weight:650; }
  .link-form>div { display:flex;gap:6px;min-width:0; }.link-form input { min-width:0;width:100%;flex:1;min-height:40px;border:1px solid var(--border);border-radius:var(--radius-sm,4px);background:var(--bg-0);color:var(--text);font:inherit;font-size:12px;padding:8px;caret-color:var(--brand); }
  .link-form .link-error { color:var(--error); }.link-form input[aria-invalid='true'] { border-color:var(--error); }
  .link-form button { width:40px;flex-shrink:0;display:grid;place-items:center; }
  @media(max-width:780px) { button,summary { min-height:44px; }.close { min-height:44px;width:44px; } }
</style>
