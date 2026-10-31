<script lang="ts">
  import Hash from 'lucide-svelte/icons/hash';
  import Plus from 'lucide-svelte/icons/plus';
  import Search from 'lucide-svelte/icons/search';
  import X from 'lucide-svelte/icons/x';

  import { modalDialog } from '$lib/ui/modal-dialog';
  import { fade, fly } from 'svelte/transition';
  import { t } from 'svelte-i18n';
  import { currentUser } from '$lib/auth/authState.svelte';
  import {
    rooms,
    messages,
    sendMessage,
    sendVoiceMessage,
    loadRooms,
    loadMessages,
    ensureRoom,
    openDirectRoom,
    isChatOpen
  } from '$lib/chat/chat-store';
  import { users, loadUsers } from '$lib/users/user-store';
  import Icon from '$lib/ui/Icon.svelte';
  import MentionInput from '$lib/chat/MentionInput.svelte';
  import VoiceRecorder from '$lib/chat/VoiceRecorder.svelte';
  import ChatAttachments from '$lib/chat/ChatAttachments.svelte';
  import type { StationTag } from '$lib/order/stages';
  import StationBadge from '$lib/ui/StationBadge.svelte';

  let activeRoomId = $state('general');
  let drafts = $state<Record<string, { text: string; mentions: string[] }>>({ general: { text: '', mentions: [] } });
  let activeDraft = $derived(drafts[activeRoomId]);
  let scroller: HTMLDivElement | null = $state(null);
  let showRoomModal = $state(false);
  let showDmModal = $state(false);
  let dmFilter = $state('');
  let newRoomName = $state('');
  let searchQuery = $state('');
  let creatingRoom = $state(false);
  let openingDm = $state(false);
  let accountId = $derived($currentUser?.id ?? null);
  let viewLifetime: AbortController | null = null;
  let scrollTimer: ReturnType<typeof setTimeout> | undefined;

  // View state: 'list' | 'room'
  let view: 'list' | 'room' = $state('room');

  let activeRoom = $derived($rooms.find(r => r.id === activeRoomId) || $rooms[0]);
  let roomMessages = $derived($messages.filter(m => m.roomId === activeRoomId));
  let filteredRooms = $derived(searchQuery
    ? $rooms.filter(r => r.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : $rooms);

  function scrollToBottom() {
    clearTimeout(scrollTimer);
    if (scroller) {
      scrollTimer = setTimeout(() => {
        if (scroller) scroller.scrollTop = scroller.scrollHeight;
      }, 50);
    }
  }

  function selectRoom(roomId: string) {
    drafts[roomId] ??= { text: '', mentions: [] };
    activeRoomId = roomId;
    loadMessages(roomId);
    view = 'room';
    scrollToBottom();
  }

  function handleSend(text: string, mentions: string[] = []) {
    if (!text.trim()) return;
    sendMessage(activeRoomId, text, mentions);
    scrollToBottom();
  }

  function closeChat() {
    showRoomModal = false;
    showDmModal = false;
    isChatOpen.set(false);
  }

  async function createRoom() {
    const lifetime = viewLifetime;
    const ownerId = accountId;
    const name = newRoomName.trim();
    if (!name || creatingRoom || !ownerId || !lifetime || lifetime.signal.aborted) return;
    const roomId = name.toLowerCase().replace(/\s+/g, '-');
    creatingRoom = true;
    try {
      const confirmed = await ensureRoom({ id: roomId, name }, lifetime.signal);
      if (!confirmed || lifetime.signal.aborted || viewLifetime !== lifetime || $currentUser?.id !== ownerId) return;
      showRoomModal = false;
      newRoomName = '';
      selectRoom(roomId);
    } finally {
      if (viewLifetime === lifetime) creatingRoom = false;
    }
  }

  /** Start (or reopen) a DM with another user. */
  async function startDM(peerId: string) {
    const lifetime = viewLifetime;
    const ownerId = accountId;
    if (openingDm || !ownerId || !lifetime || lifetime.signal.aborted) return;
    openingDm = true;
    try {
      const room = await openDirectRoom(peerId, lifetime.signal);
      if (!room || lifetime.signal.aborted || viewLifetime !== lifetime || $currentUser?.id !== ownerId) return;
      showDmModal = false;
      dmFilter = '';
      selectRoom(room.id);
    } finally {
      if (viewLifetime === lifetime) openingDm = false;
    }
  }

  let dmCandidates = $derived.by(() => {
    const me = $currentUser?.id;
    const list = $users.filter(u => String(u.id) !== String(me));
    if (!dmFilter.trim()) return list;
    const q = dmFilter.toLowerCase();
    return list.filter(u =>
      (u.displayName ?? '').toLowerCase().includes(q) ||
      (u.username ?? '').toLowerCase().includes(q)
    );
  });

  function formatTime(iso: string) {
    const date = new Date(iso);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function formatDate(iso: string) {
    const date = new Date(iso);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return date.toLocaleDateString();
  }

  function authorName(id: string) {
    if (id === 'system') return 'System';
    const user = $users.find(u => String(u.id) === String(id));
    return user?.displayName || user?.username || 'Unknown';
  }

  function authorInitials(id: string) {
    const name = authorName(id);
    return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
  }

  function authorStation(id: string): StationTag | null {
    if (id === 'system') return null;
    const user = $users.find(u => String(u.id) === String(id));
    return (user?.stations?.[0]?.stationId as StationTag | undefined) ?? null;
  }

  function shouldShowDateSeparator(index: number): boolean {
    if (index === 0) return true;
    const current = new Date(roomMessages[index].ts);
    const prev = new Date(roomMessages[index - 1].ts);
    return current.toDateString() !== prev.toDateString();
  }

  $effect(() => {
    const ownerId = accountId;
    const lifetime = new AbortController();
    viewLifetime = lifetime;
    activeRoomId = 'general';
    drafts = { general: { text: '', mentions: [] } };
    showRoomModal = false;
    showDmModal = false;
    newRoomName = '';
    dmFilter = '';
    creatingRoom = false;
    openingDm = false;
    if (ownerId) {
      void Promise.all([loadRooms(), loadUsers(), loadMessages('general')]).then(() => {
        if (!lifetime.signal.aborted && $currentUser?.id === ownerId) scrollToBottom();
      });
    }
    return () => {
      lifetime.abort();
      clearTimeout(scrollTimer);
      if (viewLifetime === lifetime) viewLifetime = null;
    };
  });

  // Scroll whenever messages change or sidebar opens
  $effect(() => {
    if ($isChatOpen && activeRoomId && $messages) {
      scrollToBottom();
    }
  });
</script>

{#if $isChatOpen}
  <dialog class="chat-drawer" aria-label={$t('chat.title')} use:modalDialog={{ onClose: closeChat, initialFocus: '.close-btn' }} transition:fly={{ x: 400, duration: 300 }}>

    <!-- Sidebar Header -->
    <header class="drawer-header">
      <div class="header-title">
        {#if view === 'room'}
          <button type="button" class="back-btn" aria-label={$t('chat.channels_section')} onclick={() => view = 'list'}>
            <Hash size={18} />
          </button>
          <h3>#{activeRoom?.name || 'Chat'}</h3>
        {:else}
          <h3>{$t('chat.channels_section')}</h3>
        {/if}
      </div>
      <div class="header-actions">
        {#if view === 'list'}
          <button type="button" class="icon-btn" onclick={() => showDmModal = true} title={$t('chat.sidebar.new_direct')}>
            <Icon name="user-plus" size="sm" />
          </button>
          <button type="button" class="icon-btn" onclick={() => showRoomModal = true} title={$t('chat.create_channel_title')}>
            <Plus size={18} />
          </button>
        {/if}
        <button type="button" class="icon-btn close-btn" onclick={closeChat} title={$t('chat.sidebar.close')}>
          <X size={20} />
        </button>
      </div>
    </header>

    {#if showDmModal}
      <dialog class="dm-modal" aria-label={$t('chat.sidebar.start_direct')} use:modalDialog={{ onClose: () => showDmModal = false, initialFocus: '.dm-modal-search' }}>
        <div class="dm-modal-header">
          <span>{$t('chat.sidebar.start_direct')}</span>
          <button type="button" class="icon-btn" aria-label={$t('common.close')} onclick={() => showDmModal = false}>
            <X size={16} />
          </button>
        </div>
        <input
          type="text"
          class="dm-modal-search"
          placeholder={$t('chat.sidebar.search_people')}
          aria-label={$t('chat.sidebar.search_people')}
          bind:value={dmFilter}
        />
        <div class="dm-modal-list">
          {#if dmCandidates.length === 0}
            <p class="dm-modal-empty">{$t('chat.sidebar.no_matching_users')}</p>
          {:else}
            {#each dmCandidates as u (u.id)}
              {@const label = u.displayName || u.username || 'User'}
              <button type="button" class="dm-modal-row" onclick={() => startDM(String(u.id))} disabled={openingDm}>
                <div class="dm-avatar">{(label.split(' ').map(p => p[0]).join('') || '?').slice(0, 2).toUpperCase()}</div>
                <div class="dm-meta">
                  <span class="dm-name">{label}</span>
                  {#if u.username && u.username !== u.displayName}
                    <span class="dm-username">@{u.username}</span>
                  {/if}
                </div>
              </button>
            {/each}
          {/if}
        </div>
      </dialog>
    {/if}

    <!-- Content Area -->
    <div class="drawer-content">

      <!-- ROOM LIST VIEW -->
      {#if view === 'list'}
        <div class="rooms-view" in:fade>
          <div class="search-box">
            <Search size={14} />
            <input type="text" placeholder={$t('chat.search_rooms')} aria-label={$t('chat.search_rooms')} bind:value={searchQuery} />
          </div>

          <div class="rooms-list">
            {#each filteredRooms as room (room.id)}
              <button
                class="room-item"
                class:active={room.id === activeRoomId}
                onclick={() => selectRoom(room.id)}
              >
                <div class="room-icon"><Hash size={16} /></div>
                <div class="room-info">
                  <span class="room-name">{room.name}</span>
                  <span class="room-preview">Join conversation</span>
                </div>
              </button>
            {/each}
          </div>
        </div>

      <!-- MESSAGES VIEW -->
      {:else}
        <div class="messages-view" in:fade>
          <div class="messages-scroll" bind:this={scroller}>
            {#if roomMessages.length === 0}
              <div class="empty-state">
                <div class="empty-icon"><Hash size={32} /></div>
                <h4>#{activeRoom?.name}</h4>
                <p>Start the conversation!</p>
              </div>
            {:else}
              {#each roomMessages as message, i (message.id)}
                {#if shouldShowDateSeparator(i)}
                  <div class="date-separator">
                    <span>{formatDate(message.ts)}</span>
                  </div>
                {/if}

                <div class="message" class:system={message.variant === 'system'} class:own={message.authorId === $currentUser?.id}>
                  {#if message.authorId !== $currentUser?.id}
                    <div class="message-avatar" title={authorName(message.authorId)}>
                      {authorInitials(message.authorId)}
                    </div>
                  {/if}

                  <div class="message-body">
                    {#if message.authorId !== $currentUser?.id}
                      <div class="message-meta">
                        <span class="author">{authorName(message.authorId)}</span>
                        {#if authorStation(message.authorId)}
                          <StationBadge station={authorStation(message.authorId)} size="sm" />
                        {/if}
                        <span class="time">{formatTime(message.ts)}</span>
                      </div>
                    {/if}

                    <div class="bubble">
                      <p>{message.text}</p>
                      <ChatAttachments attachments={message.attachments} contextKey={`${accountId}:${activeRoomId}`} />
                    </div>

                    {#if message.authorId === $currentUser?.id}
                        <span class="time-own">{formatTime(message.ts)}</span>
                    {/if}
                  </div>
                </div>
              {/each}
            {/if}
          </div>

          <div class="input-area">
            {#key activeRoomId}
              {#if activeDraft}
                <MentionInput
                  bind:value={activeDraft.text}
                  bind:mentions={activeDraft.mentions}
                  onCommit={handleSend}
                  placeholder={$t('chat.message_placeholder')}
                />
              {/if}
            {/key}
            <VoiceRecorder contextKey={`${accountId ?? ''}:${$currentUser?.role ?? ''}:${activeRoomId}`}
              disabled={!accountId || !activeRoom} onSend={(draft, signal) => sendVoiceMessage(activeRoomId, draft, signal)} />
          </div>
        </div>
      {/if}
    </div>
  </dialog>
{/if}

<!-- Create Room Modal -->
{#if $isChatOpen && showRoomModal}
    <dialog class="modal" aria-label={$t('chat.create_channel_title')} use:modalDialog={{ onClose: () => showRoomModal = false, initialFocus: 'input' }}>
      <div class="modal-header">
        <h3>{$t('chat.create_channel_title')}</h3>
        <button type="button" aria-label={$t('common.close')} onclick={() => showRoomModal = false}><X size={18} /></button>
      </div>
      <div class="modal-body">
        <label>{$t('chat.channel_name_label')}
          <input type="text" placeholder={$t('chat.channel_name_placeholder')} bind:value={newRoomName} />
        </label>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn-ghost" onclick={() => showRoomModal = false}>{$t('common.cancel')}</button>
        <button type="button" class="btn-primary" onclick={createRoom} disabled={creatingRoom || !newRoomName.trim()}>{$t('chat.create_channel_btn')}</button>
      </div>
    </dialog>
{/if}

<style>
  /* Sidebar Drawer */
  .chat-drawer {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: 380px;
    max-width: 100%;
    height: 100dvh;
    max-height: none;
    margin: 0 0 0 auto;
    padding: 0;
    border: 0;
    color: var(--text);
    background: var(--bg-1, var(--bg-0));
    box-shadow: -4px 0 24px color-mix(in oklab, var(--bg-0) 15%, transparent);
    z-index: var(--z-modal);
    flex-direction: column;
    border-left: 1px solid var(--border);
  }

  .chat-drawer[open] { display: flex; }
  .chat-drawer::backdrop {
    background: color-mix(in oklab, var(--bg-0) 20%, transparent);
    backdrop-filter: blur(2px);
  }

  .drawer-header {
    height: 60px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    border-bottom: 1px solid var(--border);
    background: var(--bg-1);
  }

  .header-title {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .header-title h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
  }

  .back-btn {
    background: transparent;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
  }

  .back-btn:hover { background: var(--bg-2); color: var(--text); }

  .header-actions {
    display: flex;
    gap: 4px;
  }

  .icon-btn {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    color: var(--text-muted);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .icon-btn:hover {
    background: var(--bg-2);
    color: var(--text);
  }

  .drawer-content {
    flex: 1;
    overflow: hidden;
    position: relative;
    display: flex;
    flex-direction: column;
  }

  /* List View */
  .rooms-view {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 16px;
  }

  .search-box {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: var(--bg-2);
    border-radius: 8px;
    margin-bottom: 16px;
    color: var(--text-muted);
  }

  .search-box input {
    border: none;
    background: transparent;
    flex: 1;
    font-size: 0.9rem;
    color: var(--text);
  }

  .search-box input:focus { outline: none; }

  .room-item {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 12px;
    border: 1px solid transparent;
    background: transparent;
    border-radius: 8px;
    text-align: left;
    cursor: pointer;
    transition: all 0.2s;
  }

  .room-item:hover {
    background: var(--bg-2);
  }

  .room-item.active {
    background: color-mix(in oklab, var(--primary, var(--brand)) 10%, white);
    border-color: color-mix(in oklab, var(--primary, var(--brand)) 20%, transparent);
  }

  .room-icon {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    background: var(--bg-2);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
  }

  .room-item.active .room-icon {
    background: var(--primary);
    color: var(--bg-0);
  }

  .room-info {
    display: flex;
    flex-direction: column;
  }

  .room-name {
    font-weight: 600;
    font-size: 0.95rem;
    color: var(--text);
  }

  .room-preview {
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  /* Messages View */
  .messages-view {
    flex: 1;
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .messages-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    opacity: 0.7;
  }

  .empty-icon {
    width: 64px;
    height: 64px;
    background: var(--bg-2);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 12px;
  }

  .date-separator {
    text-align: center;
    margin: 16px 0;
    position: relative;
  }

  .date-separator span {
    background: var(--bg-2);
    padding: 2px 10px;
    border-radius: 12px;
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .message {
    display: flex;
    gap: 10px;
    max-width: 90%;
  }

  .message.own {
    align-self: flex-end;
    flex-direction: row-reverse;
  }

  .message-avatar {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: var(--bg-2);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 0.75rem;
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .message-body {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .message.own .message-body {
    align-items: flex-end;
  }

  .message-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-left: 4px;
  }

  .author {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-2);
  }

  .time {
    font-size: 0.7rem;
    color: var(--text-muted);
  }

  .time-own {
    font-size: 0.7rem;
    color: var(--text-muted);
    margin-right: 4px;
    margin-top: 2px;
  }

  .bubble {
    padding: 8px 12px;
    border-radius: 12px;
    background: var(--bg-2);
    color: var(--text);
    font-size: 0.95rem;
    line-height: 1.4;
    border-top-left-radius: 2px;
    word-wrap: break-word;
  }

  .message.own .bubble {
    background: var(--primary, var(--brand));
    color: var(--bg-0);
    border-top-left-radius: 12px;
    border-top-right-radius: 2px;
  }

  .input-area {
    display: grid;
    gap: var(--space-md);
    min-width: 0;
    padding: 12px;
    border-top: 1px solid var(--border);
    background: var(--bg-1);
  }

  /* Modal */
  .modal::backdrop, .dm-modal::backdrop {
    background: color-mix(in oklab, var(--bg-0) 55%, transparent);
  }

  .modal {
    padding: 0;
    color: var(--text);
    border: 1px solid var(--border);
    background: var(--bg-1);
    width: 90%;
    max-width: 360px;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 10px 40px color-mix(in oklab, var(--bg-0) 25%, transparent);
  }

  .modal-header {
    padding: 16px;
    border-bottom: 1px solid var(--border);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .modal-header h3 { margin: 0; font-size: 1.1rem; }
  .modal-header button { background: none; border: none; cursor: pointer; color: var(--text-muted); }

  .modal-body {
    padding: 20px;
  }

  .modal-body label {
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-weight: 500;
    font-size: 0.9rem;
  }

  .modal-body input {
    padding: 10px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg-0);
  }

  .modal-footer {
    padding: 16px;
    border-top: 1px solid var(--border);
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .btn-primary {
    background: var(--primary);
    color: var(--bg-0);
    border: none;
    padding: 8px 16px;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

  .btn-ghost {
    background: transparent;
    border: 1px solid var(--border);
    padding: 8px 16px;
    border-radius: 6px;
    cursor: pointer;
  }

  @media (max-width: 640px) {
    .chat-drawer {
      width: 100%;
    }
  }

  /* ── DM modal ──────────────────────────────────────────────────────────── */
  .dm-modal {
    position: fixed;
    padding: 0;
    color: var(--text);
    margin: auto;
    width: min(380px, 90vw);
    max-height: 70vh;
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: var(--glass-shadow, 0 12px 36px rgba(0,0,0,0.25));
    flex-direction: column;
    overflow: hidden;
  }
  .dm-modal[open] { display: flex; }
  .dm-modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    border-bottom: 1px solid var(--border);
    font-weight: 600;
    font-size: 13px;
  }
  .dm-modal-search {
    width: 100%;
    padding: 10px 14px;
    border: none;
    background: var(--bg-0);
    color: var(--text);
    font-size: 13px;
    border-bottom: 1px solid var(--border);
    outline: none;
  }
  .dm-modal-list {
    flex: 1;
    overflow-y: auto;
    padding: 4px;
  }
  .dm-modal-empty {
    padding: 16px;
    text-align: center;
    color: var(--text-muted);
    font-size: 12px;
  }
  .dm-modal-row {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 8px 10px;
    border: none;
    background: transparent;
    color: var(--text);
    text-align: left;
    border-radius: 8px;
    cursor: pointer;
  }
  .dm-modal-row:hover { background: var(--bg-2); }
  .dm-avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: color-mix(in oklab, var(--brand) 14%, transparent);
    color: var(--brand);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 700;
    flex-shrink: 0;
  }
  .dm-meta { display: flex; flex-direction: column; min-width: 0; }
  .dm-name { font-size: 13px; font-weight: 500; }
  .dm-username { font-size: 11px; color: var(--text-muted); }
</style>
