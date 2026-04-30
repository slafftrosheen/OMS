<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import Icon from '$lib/ui/Icon.svelte';
  import { base } from '$app/paths';

  let title = $state('Untitled sketch');
  let description = $state('');
  let code = $state('');
  let params = $state({});
  let svg = $state('');
  let error = $state<string | null>(null);
  let dirty = $state(false);
  let saving = $state(false);
  let savedAt = $state<string | null>(null);

  const id = $derived(page.params.id);

  async function load() {
    const r = await fetch(`/api/ai/maker/${id}`);
    const j = await r.json();
    if (j.sketch) {
      title = j.sketch.title;
      description = j.sketch.description || '';
      code = j.sketch.code;
      params = j.sketch.params || {};
      render();
    }
  }

  async function save() {
    if (saving) return;
    saving = true;
    try {
      await fetch(`/api/ai/maker/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, code, params })
      });
      savedAt = new Date().toLocaleTimeString();
      dirty = false;
    } finally {
      saving = false;
    }
  }

  async function render() {
    error = null;
    try {
      const makerjs = await import('makerjs');
      
      // Basic sandbox-ish execution
      const fn = new Function('makerjs', 'require', `
        const module = { exports: {} };
        const requireMock = (name) => {
          if (name === 'makerjs') return makerjs;
          throw new Error('Module ' + name + ' not found');
        };
        ${code}
        return module.exports;
      `);
      
      const model = fn(makerjs, (name: string) => name === 'makerjs' ? makerjs : null);
      
      if (model) {
        svg = makerjs.exporter.toSVG(model, {
          useFillRules: true,
          annotate: true
        });
      }
    } catch (e) {
      error = (e as Error).message;
    }
  }

  function onCodeInput(e: Event) {
    code = (e.target as HTMLTextAreaElement).value;
    dirty = true;
    render();
  }

  function copySVG() {
    if (!svg) return;
    navigator.clipboard.writeText(svg);
    // Simple toast or feedback would be better, but alert works for now
    // We could use a global toast store if available
  }

  onMount(() => {
    void load();
    const interval = setInterval(() => { if (dirty && !saving) void save(); }, 10_000);
    return () => clearInterval(interval);
  });
</script>

<div class="maker-editor">
  <header>
    <div class="top">
      <a href="{base}/ai-lab/maker" class="back"><Icon name="arrow-left" size="sm" /></a>
      <input bind:value={title} oninput={() => dirty = true} class="title-input" />
      <div class="actions">
        {#if savedAt}
          <span class="muted small">saved {savedAt}</span>
        {/if}
        <button class="btn secondary" onclick={copySVG} title="Copy SVG to clipboard">
          <Icon name="copy" size="sm" />
          <span>SVG</span>
        </button>
        <button class="btn primary" onclick={save} disabled={!dirty || saving}>
          <Icon name={saving ? 'loader' : 'save'} size="sm" />
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
    <textarea bind:value={description} oninput={() => dirty = true} placeholder="Describe this technical idea..." class="desc-input"></textarea>
  </header>

  <div class="workspace">
    <div class="code-pane">
      <div class="pane-header">
        <Icon name="code" size="sm" />
        <span>Maker.js Script</span>
      </div>
      <textarea
        value={code}
        oninput={onCodeInput}
        spellcheck="false"
        class="code-editor"
      ></textarea>
      {#if error}
        <div class="error-box">
          <Icon name="alert-circle" size="sm" />
          <span>{error}</span>
        </div>
      {/if}
    </div>

    <div class="preview-pane">
      <div class="pane-header">
        <div class="header-left">
          <Icon name="eye" size="sm" />
          <span>Technical Preview</span>
        </div>
        <div class="header-right">
           <span class="small muted">Unit: mm</span>
        </div>
      </div>
      <div class="svg-container">
        {@html svg}
      </div>
      <div class="technical-info">
        <div class="info-item">
          <Icon name="maximize" size="xs" />
          <span class="small">Measurements: Use <code>makerjs.measure</code> in code for precision.</span>
        </div>
        <div class="info-item">
          <Icon name="file-json" size="xs" />
          <span class="small">Export: Copy SVG and paste into tldraw or save as file.</span>
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .maker-editor { display: flex; flex-direction: column; height: calc(100vh - 180px); gap: 12px; }
  
  header { display: flex; flex-direction: column; gap: 8px; }
  .top { display: flex; align-items: center; gap: 12px; }
  .back { color: var(--text-muted); display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 50%; background: var(--glass-bg); }
  .back:hover { background: var(--bg-2); color: var(--text); }
  
  .title-input { flex: 1; background: transparent; border: 0; font-size: 1.5rem; font-weight: 700; color: var(--text); padding: 4px 0; }
  .title-input:focus { outline: none; }
  
  .desc-input { background: transparent; border: 0; color: var(--text-muted); font-size: 0.9rem; resize: none; min-height: 40px; padding: 0; }
  .desc-input:focus { outline: none; }
  
  .actions { display: flex; align-items: center; gap: 12px; }
  .muted { color: var(--text-muted); }
  .small { font-size: 0.75rem; }
  
  .workspace { display: flex; flex: 1; gap: 12px; min-height: 0; }
  
  .code-pane, .preview-pane {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-lg);
    overflow: hidden;
  }
  
  .pane-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    background: rgba(0,0,0,0.1);
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-muted);
    border-bottom: 1px solid var(--glass-border);
  }
  
  .header-left { display: flex; align-items: center; gap: 8px; }
  
  .code-editor {
    flex: 1;
    background: #1a1a1a;
    color: #e0e0e0;
    font-family: var(--font-mono, monospace);
    font-size: 0.9rem;
    padding: 12px;
    border: 0;
    resize: none;
    line-height: 1.5;
  }
  .code-editor:focus { outline: none; }
  
  .error-box {
    padding: 8px 12px;
    background: rgba(255, 69, 58, 0.1);
    color: #ff453a;
    font-size: 0.8rem;
    display: flex;
    align-items: center;
    gap: 8px;
    border-top: 1px solid rgba(255, 69, 58, 0.2);
  }
  
  .svg-container {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #fff;
    padding: 20px;
    overflow: auto;
  }
  
  :global(.svg-container svg) {
    max-width: 100%;
    max-height: 100%;
    display: block;
  }
  
  .technical-info {
    padding: 12px;
    background: rgba(0,0,0,0.05);
    display: flex;
    flex-direction: column;
    gap: 6px;
    border-top: 1px solid var(--glass-border);
  }
  
  .info-item { display: flex; align-items: center; gap: 8px; color: var(--text-muted); }
  
  .btn {
    padding: 6px 12px; border-radius: var(--radius-full);
    cursor: pointer; display: inline-flex; gap: 6px; align-items: center; font: inherit; font-size: 0.9rem;
  }
  .btn.primary { background: var(--brand); color: white; border: 0; }
  .btn.secondary { background: var(--glass-bg); color: var(--text); border: 1px solid var(--glass-border); }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
