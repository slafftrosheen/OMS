<script lang="ts">
  // AI Lab chat — persistent sessions, citations, persona templates, voice input.
  import { onMount } from 'svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import VoiceInput from '$lib/components/VoiceInput.svelte';

  type Session = {
    id: string; title: string; persona: string | null; persona_template_id: string | null;
    pinned: boolean; archived: boolean; last_message_at: string | null;
  };
  type Message = {
    id: string; role: 'user' | 'assistant' | 'tool' | 'system';
    content: string; citations?: Array<{ source_id: string; title: string; page: number | null }>;
    model?: string; node_label?: string; tool_name?: string; created_at: string;
  };
  type PersonaTemplate = {
    id: string; user_id: string | null; name: string; description: string | null;
    icon: string; color: string; system_prompt_addon: string | null;
    tool_slugs: string[]; model_override: string | null; voice: string; is_global: boolean;
  };

  // ── State ──────────────────────────────────────────────────────────────────
  let sessions = $state<Session[]>([]);
  let activeId = $state<string | null>(null);
  let messages = $state<Message[]>([]);
  let composer = $state('');
  let busy = $state(false);

  let templates = $state<PersonaTemplate[]>([]);
  let selectedTemplateId = $state<string | null>(null);
  let showPersonaPicker = $state(false);
  let showTemplateEditor = $state(false);
  let editingTemplate = $state<Partial<PersonaTemplate>>({});
  let editMode = $state<'create' | 'edit'>('create');

  // Available tool slugs for template editor checkboxes.
  const KNOWN_TOOLS = [
    { slug: 'rag.search_knowledge',    label: 'Knowledge search' },
    { slug: 'cnc.feeds_speeds',        label: 'CNC feeds & speeds' },
    { slug: 'paint.match',             label: 'Paint match' },
    { slug: 'engineering.brainstorm',  label: 'Engineering brainstorm' },
    { slug: 'data.pending_orders',     label: 'Pending orders' },
    { slug: 'data.low_stock',          label: 'Low stock' },
    { slug: 'forge.image',             label: 'Image generation' },
    { slug: 'forge.asr',               label: 'Transcribe audio' },
    { slug: 'forge.tts',               label: 'Text to speech' },
    { slug: 'forge.matting',           label: 'Background removal' },
    { slug: 'forge.mesh',              label: '3D mesh generation' },
    { slug: 'maker.list_sketches',     label: 'List technical sketches' },
    { slug: 'maker.read_sketch',       label: 'Read technical sketch' },
    { slug: 'maker.save_sketch',       label: 'Save technical sketch' },
  ];

  const selectedTemplate = $derived(templates.find((t) => t.id === selectedTemplateId) ?? null);

  // ── Data loading ───────────────────────────────────────────────────────────
  async function loadTemplates() {
    const j = await (await fetch('/api/ai/personas')).json();
    templates = j.templates ?? [];
  }

  async function loadSessions() {
    const j = await (await fetch('/api/ai/sessions?archived=0')).json();
    sessions = j.items ?? [];
    if (!activeId && sessions.length > 0) await open(sessions[0].id);
  }

  async function newSession() {
    const r = await fetch('/api/ai/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'New conversation',
        persona: selectedTemplate?.name.toLowerCase().replace(/\s+/g, '-') ?? null,
        persona_template_id: selectedTemplateId ?? null
      })
    });
    const j = await r.json();
    await loadSessions();
    if (j.session?.id) await open(j.session.id);
  }

  async function open(id: string) {
    activeId = id;
    const j = await (await fetch(`/api/ai/sessions/${id}`)).json();
    messages = j.messages ?? [];
    selectedTemplateId = (j.session as Session | null)?.persona_template_id ?? null;
  }

  // ── Send / voice ──────────────────────────────────────────────────────────
  async function send() {
    if (!composer.trim() || !activeId || busy) return;
    busy = true;
    const text = composer;
    composer = '';
    messages = [...messages, {
      id: 'tmp-' + Date.now(),
      role: 'user', content: text, created_at: new Date().toISOString()
    } as Message];
    try {
      await fetch(`/api/ai/sessions/${activeId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: text,
          persona_template_id: selectedTemplateId ?? undefined
        })
      });
      await open(activeId);
    } catch (err) {
      console.error(err);
    } finally {
      busy = false;
    }
  }

  function onVoiceTranscription(text: string) {
    composer = text;
    void send();
  }

  async function archive(id: string) {
    await fetch(`/api/ai/sessions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: true })
    });
    if (activeId === id) { activeId = null; messages = []; }
    await loadSessions();
  }

  // ── Persona template actions ───────────────────────────────────────────────
  async function selectTemplate(id: string | null) {
    selectedTemplateId = id;
    showPersonaPicker = false;
    if (activeId) {
      await fetch(`/api/ai/sessions/${activeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persona_template_id: id })
      });
    }
  }

  function openCreateTemplate() {
    editMode = 'create';
    editingTemplate = {
      name: '', description: '', icon: 'user', color: 'var(--brand)',
      system_prompt_addon: '', tool_slugs: [], model_override: null, voice: 'af'
    };
    showTemplateEditor = true;
    showPersonaPicker = false;
  }

  function openEditTemplate(t: PersonaTemplate) {
    if (t.is_global) return; // global templates are read-only
    editMode = 'edit';
    editingTemplate = { ...t, tool_slugs: [...t.tool_slugs] };
    showTemplateEditor = true;
    showPersonaPicker = false;
  }

  async function saveTemplate() {
    const method = editMode === 'create' ? 'POST' : 'PATCH';
    const url = editMode === 'create'
      ? '/api/ai/personas'
      : `/api/ai/personas/${editingTemplate.id}`;
    const r = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editingTemplate)
    });
    if (r.ok) {
      await loadTemplates();
      showTemplateEditor = false;
    }
  }

  async function deleteTemplate(id: string) {
    await fetch(`/api/ai/personas/${id}`, { method: 'DELETE' });
    if (selectedTemplateId === id) selectedTemplateId = null;
    await loadTemplates();
    showTemplateEditor = false;
  }

  function toggleToolSlug(slug: string) {
    const slugs = editingTemplate.tool_slugs ?? [];
    editingTemplate = {
      ...editingTemplate,
      tool_slugs: slugs.includes(slug) ? slugs.filter((s) => s !== slug) : [...slugs, slug]
    };
  }

  onMount(() => {
    void Promise.all([loadTemplates(), loadSessions()]);
  });
</script>

<div class="chat">
  <!-- ── Session sidebar ─────────────────────────────────────────────────── -->
  <aside class="sidebar">
    <button class="btn" onclick={newSession}><Icon name="plus" size="sm" /> New conversation</button>
    <div class="sess-list">
      {#each sessions as s (s.id)}
        <div class="sess" class:active={activeId === s.id}>
          <button class="sess-main" onclick={() => open(s.id)}>
            <span class="title">{s.title}</span>
            {#if s.persona}<span class="persona">{s.persona}</span>{/if}
          </button>
          <button class="x" aria-label="Archive" onclick={() => void archive(s.id)}>
            <Icon name="archive" size="sm" />
          </button>
        </div>
      {/each}
    </div>
  </aside>

  <!-- ── Main thread ─────────────────────────────────────────────────────── -->
  <main class="thread">
    <header class="thread-head">
      <!-- Persona picker button -->
      <div class="persona-area">
        <button
          class="persona-btn"
          onclick={() => { showPersonaPicker = !showPersonaPicker; showTemplateEditor = false; }}
          aria-expanded={showPersonaPicker}
          aria-label="Select persona"
        >
          {#if selectedTemplate}
            <span class="persona-dot" style="background:{selectedTemplate.color}"></span>
            <Icon name={selectedTemplate.icon as 'user'} size="sm" />
            <span>{selectedTemplate.name}</span>
            {#if selectedTemplate.tool_slugs.length > 0}
              <span class="tool-count">{selectedTemplate.tool_slugs.length} tools</span>
            {/if}
          {:else}
            <Icon name="user" size="sm" />
            <span>All tools</span>
          {/if}
          <Icon name="chevron-down" size="sm" />
        </button>

        <!-- Persona picker panel -->
        {#if showPersonaPicker}
          <div class="picker-panel" role="listbox" aria-label="Persona templates">
            <button
              class="picker-item"
              class:selected={selectedTemplateId === null}
              onclick={() => void selectTemplate(null)}
            >
              <Icon name="sparkles" size="sm" />
              <span>All tools (default)</span>
            </button>
            {#each templates as t (t.id)}
              <div class="picker-row">
                <button
                  class="picker-item"
                  class:selected={selectedTemplateId === t.id}
                  onclick={() => void selectTemplate(t.id)}
                >
                  <span class="persona-dot" style="background:{t.color}"></span>
                  <Icon name={t.icon as 'user'} size="sm" />
                  <span>{t.name}</span>
                  {#if t.tool_slugs.length > 0}
                    <span class="tool-count">{t.tool_slugs.length} tools</span>
                  {/if}
                  {#if t.is_global}
                    <span class="global-badge">built-in</span>
                  {/if}
                </button>
                {#if !t.is_global}
                  <button class="icon-btn" onclick={() => openEditTemplate(t)} aria-label="Edit {t.name}">
                    <Icon name="pencil" size="sm" />
                  </button>
                {/if}
              </div>
            {/each}
            <button class="picker-item new-tmpl" onclick={openCreateTemplate}>
              <Icon name="plus" size="sm" /> Create template…
            </button>
          </div>
        {/if}
      </div>

      <span class="muted small">RAG + ColQwen2 · tool calling enabled</span>
    </header>

    <!-- Template editor dialog -->
    {#if showTemplateEditor}
      <div class="template-editor">
        <h3>{editMode === 'create' ? 'New persona template' : `Edit "${editingTemplate.name}"`}</h3>
        <div class="form-grid">
          <label>
            Name
            <input bind:value={editingTemplate.name} placeholder="e.g. Senior Engineer" />
          </label>
          <label>
            Description
            <input bind:value={editingTemplate.description} placeholder="Short description" />
          </label>
          <label>
            System prompt add-on
            <textarea
              rows="4"
              bind:value={editingTemplate.system_prompt_addon}
              placeholder="Additional instructions appended to the base system prompt…"
            ></textarea>
          </label>
          <label>
            Icon (lucide name)
            <input bind:value={editingTemplate.icon} placeholder="user" />
          </label>
          <label>
            Accent colour
            <input type="color"
              bind:value={editingTemplate.color}
              class="color-pick"
            />
          </label>
          <label>
            TTS voice
            <select bind:value={editingTemplate.voice}>
              <option value="af">af (default female)</option>
              <option value="am">am (default male)</option>
              <option value="bf">bf (British female)</option>
              <option value="bm">bm (British male)</option>
            </select>
          </label>
        </div>

        <fieldset class="tool-list">
          <legend>Allowed tools <span class="hint">(empty = all)</span></legend>
          {#each KNOWN_TOOLS as t}
            <label class="tool-row">
              <input
                type="checkbox"
                checked={(editingTemplate.tool_slugs ?? []).includes(t.slug)}
                onchange={() => toggleToolSlug(t.slug)}
              />
              {t.label}
            </label>
          {/each}
        </fieldset>

        <div class="editor-actions">
          {#if editMode === 'edit'}
            <button class="btn-danger" onclick={() => void deleteTemplate(editingTemplate.id!)}>
              <Icon name="trash-2" size="sm" /> Delete
            </button>
          {/if}
          <button class="btn-ghost" onclick={() => { showTemplateEditor = false; }}>Cancel</button>
          <button class="btn" onclick={() => void saveTemplate()}>
            <Icon name="save" size="sm" /> Save
          </button>
        </div>
      </div>
    {/if}

    <!-- Message thread -->
    <div class="messages">
      {#each messages as m (m.id)}
        {#if m.role !== 'system'}
          <div class="msg" data-role={m.role}>
            <div class="role">
              {#if m.role === 'user'}<Icon name="user" size="sm" />{/if}
              {#if m.role === 'assistant'}<Icon name="sparkles" size="sm" />{/if}
              {#if m.role === 'tool'}<Icon name="wrench" size="sm" />{/if}
              <span>{m.role}{m.tool_name ? ` · ${m.tool_name}` : ''}</span>
              {#if m.model}<span class="meta-pill">{m.model}</span>{/if}
              {#if m.node_label}<span class="meta-pill">{m.node_label}</span>{/if}
            </div>
            <pre class="content">{m.content}</pre>
            {#if m.citations && m.citations.length}
              <div class="cites">
                {#each m.citations as c}
                  <a class="cite" href="/ai-lab/knowledge/{c.source_id}">
                    <Icon name="link" size="sm" /> {c.title}{c.page ? ` p.${c.page}` : ''}
                  </a>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      {/each}
      {#if busy}
        <div class="msg" data-role="assistant">
          <div class="role"><Icon name="loader" size="sm" /> thinking…</div>
        </div>
      {/if}
    </div>

    <!-- Composer -->
    <form class="composer" onsubmit={(e) => { e.preventDefault(); void send(); }}>
      <textarea
        rows="2"
        placeholder="Ask anything — the LLM can call tools and cite the knowledge base."
        bind:value={composer}
        onkeydown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
      ></textarea>
      <div class="composer-actions">
        <VoiceInput onTranscription={onVoiceTranscription} size="sm" />
        <button class="btn" type="submit" disabled={!activeId || !composer.trim() || busy}>
          <Icon name="send" size="sm" /> Send
        </button>
      </div>
    </form>
  </main>
</div>

<style>
  .chat {
    display: grid;
    grid-template-columns: 280px 1fr;
    gap: calc(var(--space-md) * var(--density, 1));
    min-height: 70vh;
  }
  @media (max-width: 800px) { .chat { grid-template-columns: 1fr; } }

  .sidebar {
    display: flex; flex-direction: column; gap: 10px;
    background: var(--glass-bg); backdrop-filter: var(--glass-blur);
    border: 1px solid var(--glass-border); border-radius: var(--radius-lg);
    padding: 12px;
  }
  .sess-list { display: flex; flex-direction: column; gap: 4px; overflow: auto; max-height: 60vh; }
  .sess {
    display: flex; align-items: center; gap: 6px;
    border-radius: var(--radius-md); padding: 0 6px 0 0;
  }
  .sess:hover { background: color-mix(in oklab, var(--brand) 6%, transparent); }
  .sess.active { background: color-mix(in oklab, var(--brand) 14%, transparent); color: var(--brand); }
  .sess-main {
    flex: 1; display: flex; align-items: center; gap: 6px;
    background: transparent; border: 0; color: inherit; text-align: left;
    padding: 8px 10px; cursor: pointer; font: inherit;
  }
  .sess .title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sess .persona { font-size: 0.65rem; opacity: 0.7; }
  .sess .x { background: transparent; border: 0; color: inherit; cursor: pointer; opacity: 0.5; padding: 4px; }
  .sess .x:hover { opacity: 1; }

  .thread {
    display: flex; flex-direction: column;
    background: var(--glass-bg); backdrop-filter: var(--glass-blur);
    border: 1px solid var(--glass-border); border-radius: var(--radius-lg);
    padding: 12px; gap: 12px; min-height: 0;
  }
  .thread-head { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }

  /* ── Persona area ─────────────────────────────────────────────────────── */
  .persona-area { position: relative; }
  .persona-btn {
    display: inline-flex; align-items: center; gap: 6px;
    background: var(--glass-bg); border: 1px solid var(--glass-border);
    border-radius: var(--radius-full); padding: 6px 12px;
    color: inherit; cursor: pointer; font: inherit; font-size: 0.875rem;
    transition: background var(--transition-fast), border-color var(--transition-fast);
  }
  .persona-btn:hover { background: color-mix(in oklab, var(--brand) 8%, transparent); border-color: var(--brand); }
  .persona-btn:focus-visible { outline: none; box-shadow: var(--focus-ring); }
  .persona-dot {
    width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
  }
  .tool-count {
    font-size: 0.65rem; opacity: 0.7;
    background: color-mix(in oklab, var(--brand) 12%, transparent);
    border: 1px solid color-mix(in oklab, var(--brand) 25%, transparent);
    border-radius: var(--radius-full); padding: 0 5px;
  }
  .global-badge {
    font-size: 0.6rem; opacity: 0.6;
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-full); padding: 0 5px;
  }

  .picker-panel {
    position: absolute; top: calc(100% + 6px); left: 0; z-index: 100;
    min-width: 280px;
    background: var(--glass-bg); backdrop-filter: var(--glass-blur);
    border: 1px solid var(--glass-border); border-radius: var(--radius-lg);
    box-shadow: var(--glass-shadow);
    padding: 6px;
    display: flex; flex-direction: column; gap: 2px;
  }
  .picker-row { display: flex; align-items: center; gap: 4px; }
  .picker-item {
    flex: 1; display: flex; align-items: center; gap: 8px;
    background: transparent; border: 0; border-radius: var(--radius-md);
    color: inherit; cursor: pointer; font: inherit; font-size: 0.875rem;
    padding: 8px 10px; text-align: left;
    transition: background var(--transition-fast);
  }
  .picker-item:hover { background: color-mix(in oklab, var(--brand) 8%, transparent); }
  .picker-item.selected {
    background: color-mix(in oklab, var(--brand) 14%, transparent);
    color: var(--brand);
  }
  .picker-item.new-tmpl { opacity: 0.8; margin-top: 4px; border-top: 1px solid var(--glass-border); padding-top: 10px; }
  .icon-btn {
    background: transparent; border: 0; color: inherit; cursor: pointer; padding: 6px;
    border-radius: var(--radius-md); opacity: 0.6;
  }
  .icon-btn:hover { opacity: 1; background: color-mix(in oklab, var(--brand) 8%, transparent); }

  /* ── Template editor ──────────────────────────────────────────────────── */
  .template-editor {
    background: color-mix(in oklab, var(--brand) 4%, transparent);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-lg);
    padding: 16px; display: flex; flex-direction: column; gap: 12px;
  }
  .template-editor h3 { margin: 0; font-size: 1rem; }
  .form-grid {
    display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
  }
  @media (max-width: 600px) { .form-grid { grid-template-columns: 1fr; } }
  .form-grid label,
  .form-grid label textarea {
    display: flex; flex-direction: column; gap: 4px; font-size: 0.85rem;
  }
  .form-grid label textarea { resize: vertical; }
  .form-grid input, .form-grid textarea, .form-grid select {
    background: transparent; border: 1px solid var(--glass-border);
    border-radius: var(--radius-md); padding: 7px 10px;
    color: inherit; font: inherit; font-size: 0.875rem;
  }
  .form-grid input:focus, .form-grid textarea:focus, .form-grid select:focus {
    outline: none; border-color: var(--brand);
  }
  .color-pick { width: 48px; height: 32px; padding: 2px; cursor: pointer; }

  .tool-list {
    border: 1px solid var(--glass-border); border-radius: var(--radius-md);
    padding: 10px 14px; display: flex; flex-direction: column; gap: 6px;
    font-size: 0.875rem;
  }
  .tool-list legend { font-weight: 600; padding: 0 4px; }
  .tool-list .hint { font-weight: 400; opacity: 0.6; font-size: 0.75rem; }
  .tool-row { display: flex; align-items: center; gap: 8px; cursor: pointer; }

  .editor-actions {
    display: flex; gap: 8px; justify-content: flex-end; align-items: center; flex-wrap: wrap;
  }

  /* ── Messages ─────────────────────────────────────────────────────────── */
  .messages { flex: 1; overflow: auto; display: flex; flex-direction: column; gap: 12px; }
  .msg {
    border-radius: var(--radius-md); padding: 10px 12px;
    border: 1px solid var(--glass-border);
  }
  .msg[data-role="user"]      { background: color-mix(in oklab, var(--brand) 10%, transparent); }
  .msg[data-role="tool"]      { background: color-mix(in oklab, #ffd60a 6%, transparent); }
  .msg[data-role="assistant"] { background: color-mix(in oklab, #ffffff 4%, transparent); }
  .role { display: flex; align-items: center; gap: 6px; opacity: 0.75; font-size: 0.75rem; margin-bottom: 6px; }
  .meta-pill {
    font-size: 0.65rem;
    background: color-mix(in oklab, var(--brand) 14%, transparent);
    border: 1px solid color-mix(in oklab, var(--brand) 30%, transparent);
    border-radius: var(--radius-full); padding: 0 6px;
  }
  .content { white-space: pre-wrap; margin: 0; font: inherit; }
  .cites { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px; }
  .cite {
    display: inline-flex; gap: 4px; align-items: center;
    font-size: 0.75rem; color: var(--brand); text-decoration: none;
    padding: 2px 8px; border-radius: var(--radius-full);
    border: 1px solid color-mix(in oklab, var(--brand) 30%, transparent);
  }

  /* ── Composer ─────────────────────────────────────────────────────────── */
  .composer { display: flex; gap: 8px; align-items: flex-end; }
  .composer textarea {
    flex: 1;
    background: transparent; border: 1px solid var(--glass-border);
    border-radius: var(--radius-md); padding: 10px;
    color: inherit; font: inherit; resize: vertical;
  }
  .composer textarea:focus { outline: none; border-color: var(--brand); box-shadow: var(--focus-ring); }
  .composer-actions { display: flex; flex-direction: column; gap: 6px; align-items: stretch; }

  /* ── Buttons ──────────────────────────────────────────────────────────── */
  .btn {
    padding: 8px 14px; border-radius: var(--radius-full);
    background: var(--brand); color: white; border: 0;
    cursor: pointer; font: inherit; display: inline-flex; align-items: center; gap: 6px;
  }
  .btn:disabled { opacity: 0.6; cursor: not-allowed; }
  .btn-ghost {
    padding: 8px 14px; border-radius: var(--radius-full);
    background: transparent; border: 1px solid var(--glass-border);
    color: inherit; cursor: pointer; font: inherit;
  }
  .btn-danger {
    padding: 8px 14px; border-radius: var(--radius-full);
    background: color-mix(in oklab, #f66 12%, transparent);
    border: 1px solid color-mix(in oklab, #f66 40%, transparent);
    color: #f66; cursor: pointer; font: inherit;
    display: inline-flex; align-items: center; gap: 6px;
  }
  .muted { color: var(--text-muted, #888); }
  .small { font-size: 0.8rem; }
</style>
