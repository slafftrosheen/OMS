<script lang="ts">
  /** Toolkit conversations, served by the existing private messages API. */
  import { onMount, tick } from 'svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { t, locale } from 'svelte-i18n';
  import { get } from 'svelte/store';
  const tr = (key: string) => get(t)(`toolkit.chat.${key}`);


  type Session = {
    id: string;
    title: string;
    persona: string | null;
    model: string | null;
    pinned: boolean;
    archived: boolean;
    last_message_at: string | null;
    created_at: string;
  };

  type Message = {
    id: string;
    role: 'user' | 'assistant' | 'tool';
    content: string;
    model: string | null;
    node_label: string | null;
    latency_ms: number | null;
    created_at: string;
  };

  let sessions = $state<Session[]>([]);
  let activeSession = $state<Session | null>(null);
  let messages = $state<Message[]>([]);
  let input = $state('');
  let loading = $state(false);
  let sessionsLoading = $state(true);
  let sending = $state<Record<string, boolean>>({});
  let sendLoading = $derived(!!activeSession && sending[activeSession.id] === true);
  let creating = $state(false);
  let error = $state('');
  let scroller: HTMLDivElement | null = $state(null);
  let destroyed = false;
  let loadToken = 0;
  let sessionsRequest: AbortController | null = null;
  let messagesRequest: AbortController | null = null;
  const sendRequests = new Map<string, AbortController>();
  const drafts = new Map<string, string>();

  async function loadSessions() {
    const controller = new AbortController();
    sessionsRequest?.abort();
    sessionsRequest = controller;
    sessionsLoading = true;
    try {
      const res = await fetch('/api/ai/sessions', { signal: controller.signal });
      if (res.ok) {
        const data = await res.json();
        if (destroyed || controller.signal.aborted) return;
        sessions = data.items ?? [];
        sessionsLoading = false;
        if (sessions.length > 0 && !activeSession) {
          await openSession(sessions[0]);
        }
      } else if (res.status === 401) {
        error = tr('login');
      } else throw new Error(tr('loadSessions'));
    } catch {
      if (!destroyed && !controller.signal.aborted) error = tr('loadSessions');
    } finally {
      if (sessionsRequest === controller) { sessionsRequest = null; sessionsLoading = false; }
    }
  }

  async function openSession(session: Session) {
    if (activeSession) drafts.set(activeSession.id, input);
    input = drafts.get(session.id) ?? '';
    messagesRequest?.abort();
    const controller = new AbortController();
    messagesRequest = controller;
    const token = ++loadToken;
    activeSession = session;
    loading = true;
    messages = [];
    error = '';
    try {
      const res = await fetch(`/api/ai/sessions/${encodeURIComponent(session.id)}`, { signal: controller.signal, cache: 'no-store' });
      if (!res.ok) throw new Error(tr('loadMessages'));
      const data = await res.json();
      if (destroyed || token !== loadToken || controller.signal.aborted) return;
      messages = data.messages ?? [];
      void scrollToBottom();
    } catch {
      if (!destroyed && token === loadToken && !controller.signal.aborted) error = tr('loadMessages');
    } finally {
      if (token === loadToken) loading = false;
      if (messagesRequest === controller) messagesRequest = null;
    }
  }

  async function createSession() {
    if (creating) return;
    creating = true;
    try {
      const res = await fetch('/api/ai/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: get(t)('ailab.chat.new_convo') }),
      });
      if (res.ok) {
        const data = await res.json();
        if (destroyed) return;
        sessions = [data.session, ...sessions];
        await openSession(data.session);
      } else throw new Error(tr('create'));
    } catch {
      if (!destroyed) error = tr('create');
    } finally { creating = false; }
  }

  async function send() {
    const textBody = input.trim();
    if (!textBody || !activeSession || loading || sendLoading) return;
    const sessionId = activeSession.id;
    const token = loadToken;
    const controller = new AbortController();
    sendRequests.set(sessionId, controller);

    input = '';
    drafts.delete(sessionId);
    sending = { ...sending, [sessionId]: true };
    error = '';

    const optimistic: Message = {
      id: `tmp-${Date.now()}`,
      role: 'user',
      content: textBody,
      model: null,
      node_label: null,
      latency_ms: null,
      created_at: new Date().toISOString(),
    };
    messages = [...messages, optimistic];
    void scrollToBottom();

    const payload: Record<string, unknown> = {
      content: textBody,
      language: $locale
    };

    try {
      const res = await fetch(`/api/ai/sessions/${encodeURIComponent(sessionId)}/messages`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        if (destroyed) return;
        // Use the API response directly instead of a full refetch.
        // Replace the temp id on the optimistic user message with a stable one
        // and append the assistant reply.
        const reply = data.content ?? tr('emptyReply');
        if (activeSession?.id === sessionId && token === loadToken) messages = [
          ...messages.map(m => m.id === optimistic.id
            ? { ...m, id: `${optimistic.id}-final` }
            : m
          ),
          {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: reply,
            model: data.model ?? null,
            node_label: data.node ?? null,
            latency_ms: null,
            created_at: new Date().toISOString(),
          },
        ];

        // Activity belongs to the original conversation even if the user has
        // switched views while the provider was answering.
        const lastMessageAt = new Date().toISOString();
        sessions = sessions.map(session => session.id === sessionId
          ? { ...session, last_message_at: lastMessageAt } : session);
        if (activeSession?.id === sessionId) {
          activeSession = { ...activeSession, last_message_at: lastMessageAt };
          // A return to this conversation may have loaded history before the
          // response was persisted. Refresh that view once, without duplicates.
          if (token !== loadToken) await openSession(activeSession);
          else void scrollToBottom();
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        if (!destroyed && activeSession?.id === sessionId) {
          error = errData.message || errData.error || `Error ${res.status}`;
          messages = messages.filter(m => m.id !== optimistic.id);
        }
      }
    } catch {
      if (!destroyed && activeSession?.id === sessionId && !controller.signal.aborted) {
        error = tr('sendError');
        messages = messages.filter(m => m.id !== optimistic.id);
      }
    } finally {
      const remaining = { ...sending }; delete remaining[sessionId]; sending = remaining;
      sendRequests.delete(sessionId);
    }
  }

  async function scrollToBottom() {
    await tick();
    if (!destroyed && scroller) scroller.scrollTop = scroller.scrollHeight;
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString(get(locale) === 'ru' ? 'ru-RU' : get(locale) === 'lv' ? 'lv-LV' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
  }

  onMount(() => {
    void loadSessions();
    return () => {
      destroyed = true;
      sessionsRequest?.abort(); messagesRequest?.abort();
      for (const controller of sendRequests.values()) controller.abort();
    };
  });
</script>

<div class="chat-toolkit">
  <!-- Sidebar: sessions -->
  <aside class="sessions-panel">
    <div class="sessions-header">
      <span class="sessions-title">{$t('ailab.chat.conversations')}</span>
      <button type="button" class="icon-btn" onclick={createSession} disabled={creating} title={$t('ailab.chat.new_convo')} aria-label={$t('ailab.chat.new_convo')}>
        <Icon name="plus" size="sm" />
      </button>
    </div>

    {#if sessionsLoading}
      <div class="empty-state">{$t('ailab.chat.loading_sessions')}</div>
    {:else if sessions.length === 0}
      <div class="empty-state">
        <p>{$t('ailab.chat.no_convos')}</p>
        <button class="btn-create" onclick={createSession} disabled={creating}>{$t('ailab.chat.start_one')}</button>
      </div>
    {:else}
      <div class="session-list">
        {#each sessions as s (s.id)}
          <button
            type="button"
            class="session-item"
            class:active={activeSession?.id === s.id}
            aria-pressed={activeSession?.id === s.id}
            onclick={() => openSession(s)}
          >
            <span class="session-title">{s.title}</span>
            {#if s.last_message_at}
              <span class="session-time">{formatTime(s.last_message_at)}</span>
            {/if}
          </button>
        {/each}
      </div>
    {/if}
  </aside>

  <!-- Main chat -->
  <section class="chat-main">
    {#if error}
      <div class="error-bar" role="alert">
        <Icon name="alert-circle" size="sm" /> {error}
      </div>
    {/if}
    {#if !activeSession}
      <div class="empty-chat">
        <Icon name="message-square" size="md" />
        <h3>{$t('toolkit.chatTab')}</h3>
        <p>{$t('toolkit.chat.startIntro')}</p>
        <button class="btn-create" onclick={createSession} disabled={creating}>{$t('ailab.chat.new_convo')}</button>
      </div>
    {:else}
      <header class="chat-header">
        <span class="chat-title">{activeSession.title}</span>
        {#if activeSession.model}
          <span class="model-tag">{activeSession.model}</span>
        {/if}
      </header>

      <div class="messages" bind:this={scroller} role="log" aria-live="polite" aria-relevant="additions" aria-label={$t('ailab.chat.conversations')}>
        {#if loading}
          <div class="empty-state">{$t('ailab.chat.loading_msgs')}</div>
        {:else if messages.length === 0}
          <div class="empty-state">{$t('ailab.chat.send_to_start')}</div>
        {:else}
          {#each messages as msg (msg.id)}
            <div class="msg" class:user={msg.role === 'user'} class:assistant={msg.role === 'assistant'}>
              <div class="msg-bubble">
                <div class="msg-meta">
                  <span class="msg-role">{msg.role}</span>
                  {#if msg.node_label}
                    <span class="msg-node">{$t('toolkit.chat.via')} {msg.node_label}</span>
                  {/if}
                  <span class="msg-time">{formatTime(msg.created_at)}</span>
                </div>
                <p class="msg-content">{msg.content}</p>
              </div>
            </div>
          {/each}
          {#if sendLoading}
            <div class="msg assistant">
              <div class="msg-bubble typing">
                <span></span><span></span><span></span>
              </div>
            </div>
          {/if}
        {/if}
      </div>


      <div class="input-area">
        <textarea
          bind:value={input}
          aria-label={$t('ailab.chat.placeholder')}
          placeholder={$t('ailab.chat.placeholder')}
          rows={3}
          disabled={sendLoading || loading}
          onkeydown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
        ></textarea>
        <button type="button" class="send-btn" onclick={send} disabled={sendLoading || loading || !input.trim()} aria-label={$t('ailab.chat.send', { default: 'Send message' })}>
          {#if sendLoading}
            <div class="spin"></div>
          {:else}
            <Icon name="send" size="sm" />
          {/if}
        </button>
      </div>
    {/if}
  </section>
</div>

<style>
  .chat-toolkit {
    display: grid;
    grid-template-columns: 240px 1fr;
    width: 100%;
    height: 100%;
    min-height: 0;
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-lg);
    overflow: hidden;
    background: var(--glass-bg);
    backdrop-filter: var(--glass-blur);
  }

  .sessions-panel {
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--border);
    background: var(--bg-1);
  }

  .sessions-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
  }

  .sessions-title { font-weight: 700; font-size: 0.9rem; }

  .session-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .session-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 10px;
    border-radius: 8px;
    border: none;
    background: transparent;
    cursor: pointer;
    text-align: left;
    font-size: 0.85rem;
    color: var(--text-muted);
    transition: background var(--transition-fast), color var(--transition-fast);
  }
  .session-item:hover { background: var(--bg-2); color: var(--text); }
  .session-item.active { background: color-mix(in oklab, var(--brand) 12%, transparent); color: var(--brand); }

  .session-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
  .session-time { font-size: 0.7rem; color: var(--text-muted); flex-shrink: 0; margin-left: 4px; }

  .chat-main {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .empty-chat, .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    flex: 1;
    color: var(--text-muted);
    font-size: 0.9rem;
    padding: 32px;
    text-align: center;
  }

  .chat-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
    background: var(--bg-1);
    flex-shrink: 0;
  }

  .chat-title { font-weight: 600; font-size: 0.95rem; }
  .model-tag {
    font-size: 0.7rem;
    padding: 2px 8px;
    border-radius: 999px;
    border: 1px solid var(--border);
    color: var(--text-muted);
    font-family: monospace;
  }

  .error-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    background: color-mix(in oklab, var(--error, #ff453a) 12%, transparent);
    color: var(--error, #ff453a);
    font-size: 0.85rem;
    flex-shrink: 0;
  }

  .messages {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .msg { display: flex; }
  .msg.user { justify-content: flex-end; }
  .msg.assistant { justify-content: flex-start; }

  .msg-bubble {
    max-width: 75%;
    background: var(--bg-2);
    border-radius: 12px;
    padding: 10px 14px;
    font-size: 0.9rem;
  }
  .msg.user .msg-bubble {
    background: color-mix(in oklab, var(--brand) 14%, transparent);
    border: 1px solid color-mix(in oklab, var(--brand) 30%, transparent);
  }

  .msg-meta {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-bottom: 4px;
    font-size: 0.7rem;
    color: var(--text-muted);
  }
  .msg-role { font-weight: 700; text-transform: capitalize; color: var(--brand); }

  .msg-content {
    margin: 0;
    line-height: 1.55;
    white-space: pre-wrap;
    word-break: break-word;
  }

  /* Typing indicator */
  .typing {
    display: flex;
    gap: 4px;
    align-items: center;
    padding: 14px 18px;
  }
  .typing span {
    width: 7px; height: 7px;
    border-radius: 50%;
    background: var(--text-muted);
    animation: bounce 1.2s infinite ease-in-out;
  }
  .typing span:nth-child(2) { animation-delay: 0.2s; }
  .typing span:nth-child(3) { animation-delay: 0.4s; }
  @keyframes bounce { 0%, 80%, 100% { transform: scale(0.8); opacity: 0.5; } 40% { transform: scale(1.1); opacity: 1; } }

  .input-area {
    display: flex;
    gap: 8px;
    align-items: flex-end;
    padding: 8px 16px 12px;
    border-top: 1px solid var(--border);
    background: var(--bg-1);
    flex-shrink: 0;
  }

  .input-area textarea {
    flex: 1;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--bg-0);
    color: var(--text);
    font-size: 0.9rem;
    font-family: inherit;
    resize: none;
    line-height: 1.4;
  }
  .input-area textarea:focus { outline: none; border-color: var(--brand); }
  .input-area textarea:disabled { opacity: 0.6; }

  .send-btn {
    width: 40px; height: 40px;
    display: flex; align-items: center; justify-content: center;
    border: none; border-radius: 10px;
    background: var(--brand); color: white;
    cursor: pointer; flex-shrink: 0;
    transition: opacity var(--transition-fast);
  }
  .send-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .btn-create, .icon-btn {
    padding: 8px 16px; border: 1px solid var(--border);
    border-radius: 8px; background: transparent;
    color: var(--text-muted); cursor: pointer; font-size: 0.85rem;
  }
  .btn-create:hover, .icon-btn:hover { background: var(--bg-2); color: var(--text); }
  .icon-btn { padding: 6px; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; }

  .spin {
    width: 16px; height: 16px;
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* Graphite chat surfaces, with conversation list reachable on small screens. */
  .chat-toolkit { grid-template-columns:minmax(210px,240px) minmax(0,1fr);
    border-color:var(--glass-border); background:var(--bg-0); backdrop-filter:none; }
  .sessions-panel { min-width:0; background:var(--bg-1); }
  .sessions-header { min-height:56px; }
  .session-item { min-height:44px; gap:var(--space-xs); border:1px solid transparent; }
  .session-item.active { color:var(--ink-primary); background:var(--brand-soft);
    border-color:color-mix(in oklab,var(--brand) 28%,var(--border)); }
  .chat-main { min-width:0; }
  .chat-header { min-height:56px; }
  .msg-bubble { max-width:min(78%,680px); border:1px solid var(--border);
    background:var(--bg-1); border-radius:var(--radius-md); }
  .msg.user .msg-bubble { border-color:color-mix(in oklab,var(--brand) 25%,var(--border)); }
  .msg-role { color:var(--ink-secondary); }
  .msg.user .msg-role { color:var(--brand); }
  .messages { overscroll-behavior:contain; }
  .input-area textarea { min-width:0; max-height:160px; border-radius:var(--radius-md); }
  .input-area textarea:focus-visible { outline:2px solid var(--focus);outline-offset:1px; }
  .send-btn { min-width:44px;min-height:44px; background:var(--brand);color:var(--on-brand);
    border-radius:var(--radius-md); }
  .send-btn:hover:not(:disabled) { background:var(--brand-2); }
  .icon-btn { width:40px;height:40px;min-height:40px; }
  @media(max-width:780px) {
    .chat-toolkit { grid-template-columns:minmax(0,1fr); grid-template-rows:auto minmax(0,1fr); }
    .sessions-panel { max-height:146px;border-right:0;border-bottom:1px solid var(--border); }
    .sessions-header { min-height:44px;padding:6px 12px; }
    .session-list { flex-direction:row;overflow-x:auto;overflow-y:hidden;gap:var(--space-xs); }
    .session-item { flex:0 0 180px;max-width:220px; }
    .empty-state { padding:var(--space-md); }
    .msg-bubble { max-width:95%; }
    .messages { padding:var(--space-md); }
    .input-area { padding:var(--space-sm); }
  }
  @media(prefers-reduced-motion:reduce) { .typing span { animation:none; } }
</style>
