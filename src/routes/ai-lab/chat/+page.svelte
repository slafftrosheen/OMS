<script lang="ts">
  // AI Lab chat — persistent sessions, citations, persona switch.
  import { onMount } from 'svelte';
  import Icon from '$lib/ui/Icon.svelte';

  type Session = {
    id: string; title: string; persona: string | null;
    pinned: boolean; archived: boolean; last_message_at: string | null;
  };
  type Message = {
    id: string; role: 'user' | 'assistant' | 'tool' | 'system';
    content: string; citations?: Array<{ source_id: string; title: string; page: number | null }>;
    model?: string; node_label?: string; tool_name?: string; created_at: string;
  };

  const PERSONAS = [
    { value: '',                  label: 'Default' },
    { value: 'engineer',          label: 'Engineering' },
    { value: 'cnc-operator',      label: 'CNC operator' },
    { value: 'paint-shop',        label: 'Paint / finishing' },
    { value: 'sales',             label: 'Sales' },
    { value: 'logistics',         label: 'Logistics' }
  ];

  let sessions = $state<Session[]>([]);
  let activeId = $state<string | null>(null);
  let messages = $state<Message[]>([]);
  let composer = $state('');
  let busy = $state(false);
  let persona = $state('');

  async function loadSessions() {
    const j = await (await fetch('/api/ai/sessions?archived=0')).json();
    sessions = j.items ?? [];
    if (!activeId && sessions.length > 0) await open(sessions[0].id);
  }

  async function newSession() {
    const r = await fetch('/api/ai/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'New conversation', persona: persona || null })
    });
    const j = await r.json();
    await loadSessions();
    if (j.session?.id) await open(j.session.id);
  }

  async function open(id: string) {
    activeId = id;
    const j = await (await fetch(`/api/ai/sessions/${id}`)).json();
    messages = j.messages ?? [];
    persona = j.session?.persona ?? '';
  }

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
        body: JSON.stringify({ content: text, persona: persona || undefined })
      });
      await open(activeId);
    } catch (err) {
      console.error(err);
    } finally {
      busy = false;
    }
  }

  async function setPersona(p: string) {
    persona = p;
    if (!activeId) return;
    await fetch(`/api/ai/sessions/${activeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ persona: p || null })
    });
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

  onMount(() => { void loadSessions(); });
</script>

<div class="chat">
  <aside class="sidebar">
    <button class="btn" onclick={newSession}><Icon name="plus" size="sm" /> New conversation</button>
    <div class="sess-list">
      {#each sessions as s (s.id)}
        <div class="sess" class:active={activeId === s.id}>
          <button class="sess-main" onclick={() => open(s.id)}>
            <span class="title">{s.title}</span>
            {#if s.persona}<span class="persona">{s.persona}</span>{/if}
          </button>
          <button
            class="x"
            aria-label="Archive"
            onclick={() => void archive(s.id)}
          ><Icon name="archive" size="sm" /></button>
        </div>
      {/each}
    </div>
  </aside>

  <main class="thread">
    <header class="thread-head">
      <select class="persona-pick" bind:value={persona} onchange={() => setPersona(persona)}>
        {#each PERSONAS as p}<option value={p.value}>{p.label}</option>{/each}
      </select>
      <span class="muted small">RAG-grounded · tool calling enabled</span>
    </header>
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
        <div class="msg" data-role="assistant"><div class="role"><Icon name="loader" size="sm" /> thinking…</div></div>
      {/if}
    </div>

    <form class="composer" onsubmit={(e) => { e.preventDefault(); void send(); }}>
      <textarea
        rows="2"
        placeholder="Ask anything — the LLM can call tools and cite the knowledge base."
        bind:value={composer}
        onkeydown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
      ></textarea>
      <button class="btn" type="submit" disabled={!activeId || !composer.trim() || busy}>
        <Icon name="send" size="sm" /> Send
      </button>
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
    background: var(--glass-bg);
    backdrop-filter: var(--glass-blur);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-lg);
    padding: 12px;
  }
  .sess-list { display: flex; flex-direction: column; gap: 4px; overflow: auto; max-height: 60vh; }
  .sess {
    display: flex; align-items: center; gap: 6px;
    border-radius: var(--radius-md);
    padding: 0 6px 0 0;
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
    background: var(--glass-bg);
    backdrop-filter: var(--glass-blur);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-lg);
    padding: 12px;
    gap: 12px;
    min-height: 0;
  }
  .thread-head { display: flex; gap: 12px; align-items: center; }
  .persona-pick {
    background: var(--surface, transparent);
    border: 1px solid var(--glass-border);
    color: inherit; padding: 6px 10px; border-radius: var(--radius-full); font: inherit;
  }
  .messages { flex: 1; overflow: auto; display: flex; flex-direction: column; gap: 12px; }
  .msg {
    border-radius: var(--radius-md);
    padding: 10px 12px;
    border: 1px solid var(--glass-border);
    background: color-mix(in oklab, var(--brand) 4%, transparent);
  }
  .msg[data-role="user"]      { background: color-mix(in oklab, var(--brand) 10%, transparent); }
  .msg[data-role="tool"]      { background: color-mix(in oklab, #ffd60a 6%, transparent); }
  .msg[data-role="assistant"] { background: color-mix(in oklab, #ffffff 4%, transparent); }
  .role { display: flex; align-items: center; gap: 6px; opacity: 0.75; font-size: 0.75rem; margin-bottom: 6px; }
  .meta-pill {
    font-size: 0.65rem;
    background: color-mix(in oklab, var(--brand) 14%, transparent);
    border: 1px solid color-mix(in oklab, var(--brand) 30%, transparent);
    border-radius: var(--radius-full);
    padding: 0 6px;
  }
  .content { white-space: pre-wrap; margin: 0; font: inherit; }
  .cites { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px; }
  .cite {
    display: inline-flex; gap: 4px; align-items: center;
    font-size: 0.75rem; color: var(--brand); text-decoration: none;
    padding: 2px 8px; border-radius: var(--radius-full);
    border: 1px solid color-mix(in oklab, var(--brand) 30%, transparent);
  }
  .composer { display: flex; gap: 8px; }
  .composer textarea {
    flex: 1;
    background: var(--surface, transparent);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-md);
    padding: 10px;
    color: inherit; font: inherit; resize: vertical;
  }
  .composer textarea:focus { outline: none; border-color: var(--brand); box-shadow: var(--focus-ring); }
  .btn {
    padding: 8px 14px; border-radius: var(--radius-full);
    background: var(--brand); color: white; border: 0;
    cursor: pointer; font: inherit; display: inline-flex; align-items: center; gap: 6px;
  }
  .btn:disabled { opacity: 0.6; cursor: not-allowed; }
  .muted { color: var(--text-muted, #888); }
  .small { font-size: 0.8rem; }
</style>
