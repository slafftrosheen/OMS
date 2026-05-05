<script lang="ts">
  /**
   * AI Lab › Chat — full-featured AI chat using the sessions API.
   * Creates/resumes chat sessions backed by ai_chat_sessions + ai_chat_messages.
   *
   * Adds station-friendly voice + visual assistants:
   *   - Mic captures audio → /api/ai/forge/asr → fills the input.
   *   - Camera captures a JPEG → vision-capable model can "see" it.
   *   - Auto-TTS reads assistant replies for hands-busy users on the floor.
   */
  import { onMount } from 'svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { t } from 'svelte-i18n';
  import VoiceVisual from '$lib/chat/VoiceVisual.svelte';

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
  let sendLoading = $state(false);
  let error = $state('');
  let scroller: HTMLDivElement | null = $state(null);

  // Voice / visual assistant state.
  let attachedImage = $state<string | null>(null);
  let autoSpeak = $state(false);
  let voicePanel = $state<{ speak: (t: string) => Promise<void> } | null>(null);

  async function loadSessions() {
    sessionsLoading = true;
    try {
      const res = await fetch('/api/ai/sessions');
      if (res.ok) {
        const data = await res.json();
        sessions = data.items ?? [];
        if (sessions.length > 0 && !activeSession) {
          await openSession(sessions[0]);
        }
      } else if (res.status === 401) {
        error = 'Please log in to use AI Chat.';
      }
    } catch {
      error = 'Failed to load chat sessions.';
    } finally {
      sessionsLoading = false;
    }
  }

  async function openSession(session: Session) {
    activeSession = session;
    loading = true;
    messages = [];
    try {
      const res = await fetch(`/api/ai/sessions/${session.id}`);
      if (res.ok) {
        const data = await res.json();
        messages = data.messages ?? [];
        scrollToBottom();
      }
    } catch {
      error = 'Failed to load messages.';
    } finally {
      loading = false;
    }
  }

  async function createSession() {
    try {
      const res = await fetch('/api/ai/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New conversation' }),
      });
      if (res.ok) {
        const data = await res.json();
        sessions = [data.session, ...sessions];
        await openSession(data.session);
      }
    } catch {
      error = 'Failed to create session.';
    }
  }

  async function send() {
    const textBody = input.trim();
    if ((!textBody && !attachedImage) || !activeSession) return;

    input = '';
    sendLoading = true;
    error = '';

    const optimistic: Message = {
      id: `tmp-${Date.now()}`,
      role: 'user',
      content: textBody || (attachedImage ? '(image)' : ''),
      model: null,
      node_label: null,
      latency_ms: null,
      created_at: new Date().toISOString(),
    };
    messages = [...messages, optimistic];
    scrollToBottom();

    const payload: Record<string, unknown> = {
      content: textBody || 'Describe what you see in the attached image.'
    };
    if (attachedImage) {
      payload.images = [attachedImage];
      payload.cap = 'vision';
    }
    // Consume the image so it's not re-sent on the next turn.
    attachedImage = null;

    try {
      const res = await fetch(`/api/ai/sessions/${activeSession.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        // Use the API response directly instead of a full refetch.
        // Replace the temp id on the optimistic user message with a stable one
        // and append the assistant reply.
        const reply = data.content ?? '(no response)';
        messages = [
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
        if (autoSpeak && voicePanel?.speak) {
          void voicePanel.speak(reply);
        }
        // Update session's last_message_at locally so the sidebar reflects activity
        if (activeSession) {
          activeSession = { ...activeSession, last_message_at: new Date().toISOString() };
          sessions = sessions.map(s => s.id === activeSession!.id ? activeSession! : s);
        }
        scrollToBottom();
      } else {
        const errData = await res.json().catch(() => ({}));
        error = errData.message || errData.error || `Error ${res.status}`;
        // Remove optimistic message
        messages = messages.filter(m => m.id !== optimistic.id);
      }
    } catch (e: any) {
      error = 'Failed to send message.';
      messages = messages.filter(m => m.id !== optimistic.id);
    } finally {
      sendLoading = false;
    }
  }

  function scrollToBottom() {
    setTimeout(() => { if (scroller) scroller.scrollTop = scroller.scrollHeight; }, 50);
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  onMount(loadSessions);
</script>

<div class="chat-lab">
  <!-- Sidebar: sessions -->
  <aside class="sessions-panel">
    <div class="sessions-header">
      <span class="sessions-title">{$t('ailab.chat.conversations')}</span>
      <button class="icon-btn" onclick={createSession} title={$t('ailab.chat.new_convo')}>
        <Icon name="plus" size="sm" />
      </button>
    </div>

    {#if sessionsLoading}
      <div class="empty-state">{$t('ailab.chat.loading_sessions')}</div>
    {:else if sessions.length === 0}
      <div class="empty-state">
        <p>{$t('ailab.chat.no_convos')}</p>
        <button class="btn-create" onclick={createSession}>{$t('ailab.chat.start_one')}</button>
      </div>
    {:else}
      <div class="session-list">
        {#each sessions as s (s.id)}
          <button
            class="session-item"
            class:active={activeSession?.id === s.id}
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
  <main class="chat-main">
    {#if !activeSession}
      <div class="empty-chat">
        <Icon name="message-square" size="md" />
        <h3>{$t('ailab.chat.title')}</h3>
        <p>{$t('ailab.chat.start_desc')}</p>
        <button class="btn-create" onclick={createSession}>{$t('ailab.chat.new_convo')}</button>
      </div>
    {:else}
      <header class="chat-header">
        <span class="chat-title">{activeSession.title}</span>
        {#if activeSession.model}
          <span class="model-tag">{activeSession.model}</span>
        {/if}
      </header>

      {#if error}
        <div class="error-bar">
          <Icon name="alert-circle" size="sm" /> {error}
        </div>
      {/if}

      <div class="messages" bind:this={scroller}>
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
                    <span class="msg-node">via {msg.node_label}</span>
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

      <div class="vv-row">
        <VoiceVisual
          bind:this={voicePanel}
          bind:text={input}
          bind:image={attachedImage}
          bind:autoSpeakReply={autoSpeak}
          disabled={sendLoading}
        />
      </div>
      <div class="input-area">
        <textarea
          bind:value={input}
          placeholder={$t('ailab.chat.placeholder')}
          rows={3}
          disabled={sendLoading}
          onkeydown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
        ></textarea>
        <button class="send-btn" onclick={send} disabled={sendLoading || (!input.trim() && !attachedImage)}>
          {#if sendLoading}
            <div class="spin"></div>
          {:else}
            <Icon name="send" size="sm" />
          {/if}
        </button>
      </div>
    {/if}
  </main>
</div>

<style>
  .chat-lab {
    display: grid;
    grid-template-columns: 240px 1fr;
    height: calc(100vh - var(--topbar-h, 56px) - 160px);
    min-height: 400px;
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

  .vv-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px 0;
    background: var(--bg-1);
    flex-shrink: 0;
  }

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
</style>
