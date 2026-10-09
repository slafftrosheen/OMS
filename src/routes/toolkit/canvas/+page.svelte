<script lang="ts">
  import { onMount } from 'svelte';
  import TldrawWrapper from '$lib/components/canvas/TldrawWrapper.svelte';
  import { ideaDefaults, type IdeaKind } from '$lib/components/canvas/idea-model';
  import { extractBoardCards, extractBoardLinks, normalizeProposals, type ProposedCard } from '$lib/components/canvas/toolkit-context';
  import { runShape } from '$lib/components/canvas/node-runner';

  type Board = { id: string; title: string; updated_at: string; created_at: string };
  type ChatMessage = { role: 'user' | 'assistant'; content: string };
  type Template = 'blank' | 'project' | 'options' | 'workshop';
  let boards = $state<Board[]>([]);
  let boardId = $state<string | null>(null);
  let boardTitle = $state('Untitled project');
  let initialSnapshot = $state<unknown>(null);
  let messages = $state<ChatMessage[]>([]);
  let suggestions = $state<ProposedCard[]>([]);
  let prompt = $state('');
  let loading = $state(true);
  let saving = $state(false);
  let dirty = $state(false);
  let lastSaved = $state('');
  let error = $state('');
  let notice = $state('');
  let projectListOpen = $state(true);
  let assistantOpen = $state(true);
  let running = $state(false);
  let requesting = $state(false);
  let selectedLabel = $state('Whole board');
  let editor: any = null;
  let lastSnapshot: unknown = null;
  let ready = false;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let pendingTemplate: Template | null = null;
  let destroyed = false;
  let documentRevision = 0;

  const kinds: { kind: IdeaKind; label: string; emoji: string }[] = [
    { kind: 'idea', label: 'Idea', emoji: '✦' },
    { kind: 'research', label: 'Research', emoji: '◈' },
    { kind: 'decision', label: 'Decision', emoji: '◇' },
    { kind: 'task', label: 'Task', emoji: '✓' },
    { kind: 'note', label: 'Note', emoji: '▤' }
  ];
  const prompts = [
    { label: 'Expand this concept', question: 'Expand the most promising concept into practical directions, with useful cards.' },
    { label: 'Challenge assumptions', question: 'What are the main risks, constraints and unanswered questions here?' },
    { label: 'Compare approaches', question: 'Suggest distinct approaches and useful decision criteria.' },
    { label: 'Plan next steps', question: 'Turn this project into a focused set of actionable next steps.' }
  ];

  function markDirty() {
    if (!boardId || !ready) return;
    dirty = true;
    documentRevision++;
    lastSaved = '';
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { void saveBoard(); }, 1200);
  }
  function onCanvasChange(value: unknown) {
    lastSnapshot = value;
    markDirty();
  }
  async function saveBoard() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = undefined;
    if (!boardId || !dirty || saving) return;
    const id = boardId;
    const revisionAtStart = documentRevision;
    const title = boardTitle.trim().slice(0, 120) || 'Untitled project';
    const payload = { version: 1, snapshot: lastSnapshot, conversation: messages.slice(-24), proposals: suggestions.slice(0, 8) };
    saving = true;
    try {
      const response = await fetch(`/api/ai/canvas/${encodeURIComponent(id)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, payload })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not save project');
      if (id === boardId) {
        dirty = documentRevision !== revisionAtStart;
        error = '';
        lastSaved = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        boards = boards.map(b => b.id === id ? { ...b, title, updated_at: new Date().toISOString() } : b);
      }
    } catch (e) {
      if (id === boardId) error = e instanceof Error ? e.message : 'Save failed';
    } finally {
      saving = false;
      if (dirty && boardId === id && !saveTimer && !destroyed) {
        saveTimer = setTimeout(() => { void saveBoard(); }, 3000);
      }
    }
  }
  async function loadBoards() {
    loading = true;
    try {
      const response = await fetch('/api/ai/canvas', { cache: 'no-store' });
      if (!response.ok) throw new Error('Could not load your projects');
      const data = await response.json();
      boards = Array.isArray(data.items) ? data.items : [];
      if (boards.length) await openBoard(boards[0].id);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Project list unavailable';
    } finally { loading = false; }
  }
  async function openBoard(id: string) {
    if (id === boardId && ready) return;
    if (dirty) {
      await saveBoard();
      if (dirty) { error = 'Save your changes before switching projects.'; return; }
    }
    loading = true;
    ready = false;
    editor = null;
    suggestions = [];
    selectedLabel = 'Whole board';
    try {
      const response = await fetch(`/api/ai/canvas/${encodeURIComponent(id)}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Unable to open project');
      const data = await response.json();
      const doc = data.canvas;
      if (!doc) throw new Error('Project was not found');
      boardTitle = doc.title || 'Untitled project';
      const payload = doc.payload && typeof doc.payload === 'object' ? doc.payload : {};
      initialSnapshot = payload.snapshot ?? (payload.store ? payload : null);
      lastSnapshot = initialSnapshot;
      suggestions = normalizeProposals(payload.proposals);
      messages = Array.isArray(payload.conversation)
        ? payload.conversation.slice(-24).filter((m: any) => m && ['user','assistant'].includes(m.role) &&
            typeof m.content === 'string').map((m: any) => ({ role: m.role, content: m.content.slice(0, 5000) }))
        : [];
      boardId = id;
      dirty = false;
      lastSaved = '';
      error = '';
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to open project';
    } finally { loading = false; }
  }
  async function createBoard(template: Template = 'blank') {
    if (dirty) {
      await saveBoard();
      if (dirty) return;
    }
    const labels: Record<Template, string> = {
      blank: 'Untitled project', project: 'Project concept', options: 'Explore alternatives', workshop: 'Workshop idea'
    };
    error = '';
    try {
      const response = await fetch('/api/ai/canvas', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: labels[template], payload: { version: 1, snapshot: null, conversation: [] } })
      });
      const data = await response.json();
      if (!response.ok || !data.canvas?.id) throw new Error(data.error || 'Could not create project');
      boards = [{ id: data.canvas.id, title: data.canvas.title,
        updated_at: data.canvas.updated_at, created_at: data.canvas.created_at }, ...boards];
      pendingTemplate = template;
      await openBoard(data.canvas.id);
      projectListOpen = false;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Project creation failed';
    }
  }
  function addCard(kind: IdeaKind, title?: string, body?: string, x?: number, y?: number) {
    if (!editor) return;
    const center = editor.getViewportPageBounds().center;
    editor.createShape({
      type: 'idea-card',
      x: x ?? center.x - 145,
      y: y ?? center.y - 112,
      props: { ...ideaDefaults(kind), ...(title ? { title } : {}), ...(body ? { body } : {}) }
    });
  }
  function seed(template: Template) {
    if (!editor || template === 'blank') return;
    const c = editor.getViewportPageBounds().center;
    const x = c.x - 470, y = c.y - 240;
    const items: Array<[IdeaKind, string, string, number, number]> = template === 'project' ? [
      ['idea','Project vision','What are we building and for whom?',0,0],
      ['research','Constraints','Budget, materials, deadlines and unknowns.',330,0],
      ['decision','Direction','Which approach is the best fit? Why?',660,0],
      ['task','First milestone','A small demonstrable result.',160,265],
      ['note','References','Place sketches, images and source notes nearby.',500,265]
    ] : template === 'options' ? [
      ['idea','The challenge','Describe the problem clearly.',330,0],
      ['idea','Option A','One credible path.',0,260],
      ['idea','Option B','A different path.',330,260],
      ['idea','Option C','An unconventional path.',660,260],
      ['decision','Evaluation','Compare benefits, tradeoffs and risks.',330,520]
    ] : [
      ['idea','Customer need','What should this signage or object achieve?',0,0],
      ['research','Site & measurements','Dimensions, conditions, constraints.',330,0],
      ['idea','Materials & finish','Acrylic, metal, illumination, graphics.',660,0],
      ['decision','Production method','Choose based on actual capacity.',160,265],
      ['task','Prototype','Test key assumptions in the workshop.',500,265]
    ];
    for (const [kind, title, body, dx, dy] of items) addCard(kind, title, body, x + dx, y + dy);
    editor.zoomToFit?.();
  }
  function onEditorReady(value: any) {
    editor = value;
    ready = true;
    if (pendingTemplate) {
      const template = pendingTemplate;
      pendingTemplate = null;
      if (template !== 'blank') {
        seed(template);
        lastSnapshot = editor.store.getSnapshot();
        markDirty();
      }
    }
  }
  function setArrowTool() { editor?.setCurrentTool('arrow'); }
  function getContext() {
    if (!editor) return { cards: [], focusId: '' };
    const all = editor.getCurrentPageShapes?.() ?? [];
    const selected = editor.getSelectedShapeIds?.() ?? [];
    const cards = extractBoardCards(all);
    const links = extractBoardLinks(all, (arrowId) => editor.getBindingsFromShape?.(arrowId, 'arrow') ?? []);
    selectedLabel = selected.length ? `${selected.length} selected` : 'Whole board';
    return { cards, links, focusId: String(selected[0] ?? '') };
  }
  async function brainstorm(question = prompt) {
    const text = question.trim();
    if (!text || requesting || !editor) return;
    requesting = true;
    notice = '';
    const context = getContext();
    messages = [...messages, { role: 'user', content: text }];
    prompt = '';
    suggestions = [];
    markDirty();
    try {
      const response = await fetch('/api/toolkit/brainstorm', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text, ...context })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not get suggestions');
      messages = [...messages, { role: 'assistant', content: String(data.reply ?? '').slice(0, 5000) }];
      suggestions = normalizeProposals(data.cards);
      markDirty();
    } catch (e) {
      notice = e instanceof Error ? e.message : 'Could not reach the brainstorming service';
      // Retain the prompt in the conversation so the user can retry or copy it.
    } finally { requesting = false; }
  }
  function applySuggestion(card: ProposedCard, index: number) {
    if (!editor) return;
    const c = editor.getViewportPageBounds().center;
    addCard(card.kind, card.title, card.body, c.x + (index % 2) * 320 - 300, c.y + Math.floor(index / 2) * 245 - 110);
    suggestions = suggestions.filter(s => s !== card);
    notice = 'Added to the canvas. You can edit or connect it.';
  }
  function applyAll() {
    const batch = [...suggestions];
    batch.forEach((card, index) => applySuggestion(card, index));
    suggestions = [];
  }
  async function runSelectedTechnical() {
    if (!editor || running) return;
    const selected = editor.getSelectedShapeIds?.() ?? [];
    if (!selected.length) { notice = 'Select a technical node first.'; return; }
    running = true;
    try {
      let done = 0;
      for (const id of selected) { await runShape(editor, id); done++; }
      notice = `${done} technical node(s) completed.`;
    } catch (e) { notice = e instanceof Error ? e.message : 'Tool execution failed'; }
    finally { running = false; }
  }
  function addTechnical(type: string) {
    if (!editor) return;
    const center = editor.getViewportPageBounds().center;
    editor.createShape({ type, x: center.x - 180, y: center.y - 120 });
  }
  async function removeBoard(id: string) {
    if (!confirm('Delete this project and its saved canvas? This cannot be undone.')) return;
    if (id === boardId && dirty) await saveBoard();
    try {
      const response = await fetch(`/api/ai/canvas?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Could not delete project');
      boards = boards.filter(b => b.id !== id);
      if (id === boardId) {
        boardId = null; ready = false; editor = null; initialSnapshot = null;
        lastSnapshot = null; messages = []; dirty = false;
        if (boards.length) await openBoard(boards[0].id);
      }
    } catch (e) { error = e instanceof Error ? e.message : 'Deletion failed'; }
  }

  onMount(() => {
    void loadBoards();
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      destroyed = true;
      if (saveTimer) clearTimeout(saveTimer);
      if (dirty && boardId && !saving) void saveBoard();
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  });
</script>

<svelte:head><title>Canvas · Toolkit</title></svelte:head>

<div class="workspace">
  <header class="command-bar">
    <div class="workspace-title">
      <button class="icon-toggle" onclick={() => projectListOpen = !projectListOpen}
        aria-label="Toggle project library" aria-expanded={projectListOpen}>☰</button>
      {#if boardId}
        <input class="board-title" aria-label="Project name" maxlength="120" bind:value={boardTitle} oninput={markDirty} />
      {:else}<h2>Ideas begin here</h2>{/if}
      <span class="save-indicator" role="status" aria-live="polite">
        {#if saving}Saving…{:else if dirty}Unsaved changes{:else if lastSaved}Saved {lastSaved}{:else if boardId}Ready{/if}
      </span>
    </div>
    <div class="command-actions">
      <button onclick={() => createBoard('blank')}>+ Project</button>
      <button onclick={() => void saveBoard()} disabled={!boardId || saving || !dirty}>Save</button>
      <button class="assistant-toggle" onclick={() => assistantOpen = !assistantOpen} aria-expanded={assistantOpen}>
        {assistantOpen ? 'Hide assistant' : 'Brainstorm'}
      </button>
    </div>
  </header>

  {#if error}<div class="workspace-alert" role="alert">{error}<button onclick={() => { error = ''; void loadBoards(); }}>Retry</button></div>{/if}

  <div class="panes">
    {#if projectListOpen}
      <aside class="library">
        <div class="pane-heading"><h3>Projects</h3><span>{boards.length}</span></div>
        <button class="new-project" onclick={() => createBoard('blank')}>+ Blank project</button>
        <div class="templates">
          <span class="small-heading">Quick start</span>
          <button onclick={() => createBoard('project')}>✦ Project concept</button>
          <button onclick={() => createBoard('options')}>◇ Compare options</button>
          <button onclick={() => createBoard('workshop')}>▣ Workshop concept</button>
        </div>
        <div class="project-list">
          {#if loading && !boards.length}<p class="muted">Loading projects…</p>{/if}
          {#each boards as b (b.id)}
            <div class="project-entry" class:active={boardId === b.id}>
              <button class="project-open" onclick={() => openBoard(b.id)}
                aria-current={boardId === b.id ? 'true' : undefined}>
                <strong>{b.title}</strong>
                <span>{new Date(b.updated_at).toLocaleDateString()}</span>
              </button>
              <button class="delete" title={`Delete ${b.title}`} aria-label={`Delete ${b.title}`} onclick={() => removeBoard(b.id)}>×</button>
            </div>
          {/each}
        </div>
        <p class="library-tip">Projects save to your workspace. Drag cards, connect them with arrows, and revisit ideas whenever you need.</p>
      </aside>
    {/if}

    <main class="board-area" aria-label="Idea canvas">
      {#if boardId && !loading}
        <div class="node-toolbar">
          <span class="small-heading">Add to canvas</span>
          {#each kinds as item (item.kind)}
            <button title={`Add ${item.label}`} onclick={() => addCard(item.kind)}>
              <span>{item.emoji}</span> {item.label}
            </button>
          {/each}
          <button onclick={setArrowTool} title="Draw connections between cards">↗ Connect</button>
          <details class="advanced-tools">
            <summary>Technical tools</summary>
            <div class="advanced-menu">
              {#each [{ type: 'web-search', name: 'Web search' }, { type: 'crawl', name: 'Page reference' },
                { type: 'lumigrid', name: 'LumiGrid' }, { type: 'led-strip', name: 'LED strip' },
                { type: 'led-matrix', name: 'LED matrix' }, { type: 'boxletter', name: 'Channel letter' },
                { type: 'maker', name: 'Maker sketch' }, { type: 'document', name: 'Document' }] as tool}
                <button onclick={() => addTechnical(tool.type)}>{tool.name}</button>
              {/each}
              <button onclick={runSelectedTechnical} disabled={running}>{running ? 'Working…' : 'Run selected tool'}</button>
            </div>
          </details>
        </div>
        <div class="drawing-surface">
          {#key boardId}
            <TldrawWrapper snapshot={initialSnapshot ?? undefined}
              onSave={onCanvasChange} onReady={onEditorReady} onError={(message) => (error = message)} />
          {/key}
        </div>
        <p class="canvas-hint">Double-click to edit cards · Drag to organize · Use Connect or the arrow tool to link ideas</p>
      {:else if loading}
        <div class="empty-canvas"><p>Opening your workspace…</p></div>
      {:else}
        <div class="empty-canvas">
          <div class="empty-symbol">✧</div>
          <h2>Give your next idea room to grow.</h2>
          <p>Start with an empty canvas, a project outline or a comparison of alternatives.</p>
          <div class="empty-actions">
            <button class="primary" onclick={() => createBoard('project')}>Start a project</button>
            <button onclick={() => createBoard('blank')}>Blank canvas</button>
          </div>
        </div>
      {/if}
    </main>

    {#if assistantOpen}
      <aside class="assistant-pane">
        <div class="pane-heading"><div><span class="small-heading">Creative partner</span><h3>Brainstorm</h3></div>
          <button aria-label="Close assistant" class="close-pane" onclick={() => assistantOpen = false}>×</button>
        </div>
        <p class="assistant-intro">Explore alternatives, spot gaps and turn thoughts into new cards. Asking sends the selected board context to your configured reasoning provider. Nothing is added without your approval.</p>
        <div class="quick-prompts" aria-label="Brainstorm prompts">
          {#each prompts as item (item.label)}
            <button onclick={() => brainstorm(item.question)} disabled={!boardId || requesting}>{item.label}</button>
          {/each}
        </div>
        <div class="conversation" role="log" aria-label="Brainstorm conversation" aria-live="polite">
          {#if !messages.length}
            <div class="conversation-empty">Describe the idea, challenge or decision on your canvas. Select a card to focus the discussion.</div>
          {/if}
          {#each messages as m, i (i)}
            <div class="message" class:user={m.role === 'user'}>
              <span class="message-role">{m.role === 'user' ? 'You' : 'Toolkit'}</span>
              <p>{m.content}</p>
            </div>
          {/each}
          {#if requesting}<p class="muted">Exploring the possibilities…</p>{/if}
        </div>
        {#if suggestions.length}
          <div class="suggestion-list">
            <div class="proposal-header"><strong>Suggested cards · {suggestions.length}</strong>
              <button onclick={applyAll}>Add all</button></div>
            {#each suggestions as proposal, i (`${proposal.kind}:${proposal.title}:${i}`)}
              <div class="proposal">
                <span class="proposal-kind">{proposal.kind}</span>
                <strong>{proposal.title}</strong>
                <p>{proposal.body}</p>
                <button onclick={() => applySuggestion(proposal, i)}>+ Add to board</button>
              </div>
            {/each}
          </div>
        {/if}
        {#if notice}<p role="status" class="note">{notice}</p>{/if}
        <form class="composer" onsubmit={(e) => { e.preventDefault(); void brainstorm(); }}>
          <label for="toolkit-prompt">Your question</label>
          <textarea id="toolkit-prompt" bind:value={prompt} rows="3" maxlength="2500"
            placeholder="What could we try? What am I missing?" disabled={!boardId || requesting}
            onkeydown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void brainstorm(); } }}></textarea>
          <div class="composer-footer"><span>{selectedLabel} · board context</span>
            <button class="primary" type="submit" disabled={!boardId || requesting || !prompt.trim()}>Ask ↗</button>
          </div>
        </form>
      </aside>
    {/if}
  </div>
</div>

<style>
  .workspace{display:flex;flex-direction:column;width:100%;min-height:0;flex:1;background:var(--bg-0);color:var(--text);border:1px solid var(--border);border-radius:15px;overflow:hidden}
  button{cursor:pointer;border:1px solid var(--border);border-radius:9px;padding:8px 11px;min-height:36px;background:var(--bg-1);color:var(--text);font:inherit;font-size:12px;font-weight:650}
  button:hover{border-color:var(--brand);background:var(--bg-2)}button:disabled{opacity:.5;cursor:not-allowed}
  button:focus-visible,input:focus-visible,textarea:focus-visible,summary:focus-visible{outline:2px solid var(--brand);outline-offset:2px}
  button.primary,.new-project,.assistant-toggle{background:var(--brand);color:white;border-color:var(--brand)}
  .command-bar{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--bg-1);border-bottom:1px solid var(--border);gap:12px;flex-wrap:wrap}
  .workspace-title,.command-actions{display:flex;align-items:center;gap:8px;min-width:0}.workspace-title{flex:1}.workspace-title h2{font-size:16px;margin:0}
  .board-title{font:700 16px inherit;font-family:inherit;font-size:16px;font-weight:750;background:transparent;border:1px solid transparent;padding:6px;border-radius:7px;min-width:100px;max-width:340px;flex:1;color:var(--text)}
  .board-title:hover,.board-title:focus{border-color:var(--border)}
  .save-indicator,.muted{font-size:11px;color:var(--ink-tertiary)}
  .icon-toggle{font-size:16px;min-width:38px}.panes{display:flex;flex:1;min-height:0;position:relative}
  .library{display:flex;flex-direction:column;flex:0 0 230px;min-width:0;background:var(--bg-1);border-right:1px solid var(--border);padding:12px;gap:12px;overflow:auto}
  .pane-heading{display:flex;justify-content:space-between;align-items:center;gap:10px}
  .pane-heading h3{margin:2px 0;font-size:16px}.pane-heading>span{font-size:12px;color:var(--ink-tertiary)}
  .small-heading{display:block;font-size:10px;color:var(--ink-tertiary);text-transform:uppercase;letter-spacing:.09em;font-weight:800}
  .templates{display:grid;gap:6px;border-top:1px solid var(--border);padding-top:12px}.templates button{text-align:left}
  .project-list{display:grid;align-content:start;gap:6px;min-height:80px}
  .project-entry{display:flex;align-items:center;border-radius:9px;border:1px solid transparent;min-width:0}.project-entry.active{background:var(--brand-soft);border-color:var(--brand)}
  .project-open{flex:1;text-align:left;display:grid;gap:4px;border:0;background:transparent;min-width:0}.project-open strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.project-open span{font-size:10px;color:var(--ink-tertiary)}
  .delete{width:31px;min-height:34px;padding:2px;background:transparent;border:0;color:var(--ink-tertiary);font-size:18px}
  .library-tip{margin-top:auto;font-size:11px;color:var(--ink-tertiary);line-height:1.55}
  .board-area{flex:1;min-width:0;display:flex;flex-direction:column;position:relative;background:var(--bg-0)}
  .node-toolbar{display:flex;gap:6px;align-items:center;flex-wrap:wrap;z-index:5;background:var(--bg-1);border-bottom:1px solid var(--border);padding:8px}
  .node-toolbar button{white-space:nowrap}.drawing-surface{flex:1;min-height:0;position:relative;isolation:isolate}
  .advanced-tools{position:relative;font-size:12px}.advanced-tools summary{padding:9px;cursor:pointer;border:1px solid var(--border);border-radius:9px;list-style:none;font-weight:650}
  .advanced-menu{position:absolute;z-index:15;top:calc(100% + 6px);right:0;width:190px;padding:8px;background:var(--bg-1);border:1px solid var(--border);border-radius:12px;box-shadow:var(--glass-shadow-lg);display:grid;gap:5px}
  .advanced-menu button{text-align:left}.canvas-hint{margin:0;padding:7px 12px;font-size:11px;color:var(--ink-tertiary);border-top:1px solid var(--border)}
  .empty-canvas{flex:1;display:grid;place-content:center;justify-items:center;text-align:center;gap:12px;padding:24px}.empty-symbol{font-size:66px;color:var(--brand)}.empty-canvas h2{font-size:24px;margin:0}.empty-canvas p{max-width:42ch;color:var(--ink-tertiary)}
  .empty-actions{display:flex;gap:8px}.workspace-alert{background:var(--bg-1);border-bottom:1px solid var(--error);padding:9px 15px;display:flex;justify-content:space-between;gap:8px;font-size:13px}
  .assistant-pane{display:flex;flex-direction:column;flex:0 0 300px;min-width:0;background:var(--bg-1);border-left:1px solid var(--border);gap:12px;padding:13px;overflow:auto}
  .close-pane{font-size:19px;background:transparent;border:0}.assistant-intro{font-size:12px;color:var(--ink-secondary);line-height:1.5;margin:0}
  .quick-prompts{display:flex;flex-wrap:wrap;gap:5px}.quick-prompts button{font-size:11px;padding:6px 8px;min-height:33px}
  .conversation{flex:1;overflow-y:auto;min-height:80px;display:flex;flex-direction:column;gap:11px}
  .conversation-empty{font-size:12px;line-height:1.6;color:var(--ink-tertiary);padding:16px 6px}
  .message{padding:10px;border:1px solid var(--border);border-radius:11px;background:var(--bg-0);font-size:12px}
  .message.user{background:var(--brand-soft)}.message-role{font-size:10px;color:var(--ink-tertiary);text-transform:uppercase;font-weight:800;letter-spacing:.08em}
  .message p{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.55;margin:7px 0 0}
  .suggestion-list{max-height:250px;overflow:auto;display:grid;gap:6px;border-top:1px solid var(--border);padding-top:10px}
  .proposal-header{display:flex;justify-content:space-between;align-items:center;font-size:12px}.proposal{display:grid;gap:4px;background:var(--bg-0);padding:8px;border:1px solid var(--border);border-radius:10px;font-size:12px}.proposal-kind{text-transform:uppercase;color:var(--brand);font-size:10px;font-weight:800}.proposal p{color:var(--ink-secondary);margin:0;line-height:1.4;white-space:pre-wrap}.proposal button{justify-self:end}
  .composer{display:grid;gap:7px;border-top:1px solid var(--border);padding-top:10px}.composer label{font-size:11px;font-weight:800}.composer textarea{border:1px solid var(--border);border-radius:9px;background:var(--bg-0);color:var(--text);font:inherit;font-size:12px;padding:10px;resize:vertical;min-height:68px}
  .composer-footer{display:flex;align-items:center;justify-content:space-between;gap:8px}.composer-footer span{font-size:10px;color:var(--ink-tertiary)}.note{font-size:12px;color:var(--brand)}
  @media(max-width:1100px){.library{flex-basis:190px}.assistant-pane{flex-basis:255px}}
  @media(max-width:780px){.panes{flex-direction:column;overflow-y:auto}.library{flex:0 0 auto;max-height:190px;border-right:0;border-bottom:1px solid var(--border)}.board-area{min-height:480px;flex:1 0 490px}.assistant-pane{flex:0 0 auto;max-height:420px;border-left:0;border-top:1px solid var(--border)}.node-toolbar{overflow-x:auto;flex-wrap:nowrap}.command-bar{padding:8px}}
  @media(prefers-reduced-motion:reduce){*{scroll-behavior:auto}}
</style>
