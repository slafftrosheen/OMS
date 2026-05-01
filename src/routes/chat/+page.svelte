<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { t } from 'svelte-i18n';
  import { currentUser } from '$lib/auth/authState.svelte';
  import { rooms, messages, sendMessage, loadRooms, loadMessages, ensureRoom } from '$lib/chat/chat-store';
  import { users, loadUsers } from '$lib/users/user-store';
  import Icon from '$lib/ui/Icon.svelte';
  import MentionInput from '$lib/chat/MentionInput.svelte';
  import type { StationTag } from '$lib/order/stages';
  import StationBadge from '$lib/ui/StationBadge.svelte';

  type Room = { id: string; name: string; kind?: string; station?: string };

  let activeRoomId = $state('general');
  let messageText = $state('');
  let scroller: HTMLDivElement | null = $state(null);
  let showRoomModal = $state(false);
  let newRoomName = $state('');
  let searchQuery = $state('');
  let pollingInterval: ReturnType<typeof setInterval> | undefined = $state(undefined);

  let activeRoom = $derived($rooms.find((r: Room) => r.id === activeRoomId) || $rooms[0]);
  let roomMessages = $derived($messages.filter((m: any) => m.roomId === activeRoomId));
  let filteredRooms = $derived(searchQuery
    ? $rooms.filter((r: Room) => r.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : $rooms);

  let channelRooms = $derived(filteredRooms.filter((r: Room) => !r.kind || r.kind === 'channel'));
  let stationRooms = $derived(filteredRooms.filter((r: Room) => r.kind === 'station'));

  let currentUserId = $derived(($currentUser as any)?.id || '');

  function scrollToBottom() {
    if (scroller) {
      setTimeout(() => { if (scroller) scroller.scrollTop = scroller.scrollHeight; }, 50);
    }
  }

  function selectRoom(roomId: string) {
    activeRoomId = roomId;
    loadMessages(roomId);
    scrollToBottom();
  }

  function handleSend(text: string, mentions: string[] = []) {
    if (!text.trim()) return;
    sendMessage(activeRoomId, text, mentions);
    messageText = '';
    scrollToBottom();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(messageText);
    }
  }

  async function createRoom() {
    if (!newRoomName.trim()) return;
    const roomId = newRoomName.toLowerCase().replace(/\s+/g, '-');
    await ensureRoom({ id: roomId, name: newRoomName });
    showRoomModal = false;
    newRoomName = '';
    selectRoom(roomId);
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
    const user = $users.find((u: any) => String((u as any).id) === String(id));
    return (user as any)?.displayName || (user as any)?.username || 'Unknown';
  }

  function authorInitials(id: string) {
    const name = authorName(id);
    return name.split(' ').map((p: string) => p[0]).join('').slice(0, 2).toUpperCase();
  }

  function authorStation(id: string): StationTag | null {
    if (id === 'system') return null;
    const user = $users.find((u: any) => String((u as any).id) === String(id));
    return (user as any)?.stations?.[0] ?? null;
  }

  function shouldShowDateSeparator(index: number): boolean {
    if (index === 0) return true;
    const current = new Date(roomMessages[index].ts);
    const prev = new Date(roomMessages[index - 1].ts);
    return current.toDateString() !== prev.toDateString();
  }

  function stationColor(kind: string | undefined): string {
    return kind === 'station' ? 'var(--brand)' : 'var(--text-muted)';
  }

  onMount(async () => {
    await Promise.all([loadRooms(), loadUsers()]);
    await loadMessages(activeRoomId);
    scrollToBottom();

    pollingInterval = setInterval(() => {
      loadMessages(activeRoomId);
    }, 5000);
  });

  onDestroy(() => {
    if (pollingInterval) clearInterval(pollingInterval);
  });
</script>

<div class="chat-page">
  <!-- Sidebar -->
  <aside class="chat-sidebar">
    <div class="sidebar-header">
      <h2>{$t('chat.title', { default: 'Team Chat' })}</h2>
      <button class="icon-btn" onclick={() => showRoomModal = true} title={$t('chat.create_room_btn', { default: 'Create Room' })}>
        <Icon name="plus" size="sm" />
      </button>
    </div>

    <div class="search-box">
      <Icon name="search" size="sm" />
      <input type="text" placeholder={$t('chat.search_rooms', { default: 'Search rooms…' })} bind:value={searchQuery} />
    </div>

    <div class="rooms-list">
      <!-- Channels -->
      {#if channelRooms.length > 0}
        <div class="rooms-section">
          <span class="section-label">{$t('chat.channels_section', { default: 'Channels' })}</span>
          {#each channelRooms as room (room.id)}
            <button
              class="room-item"
              class:active={room.id === activeRoomId}
              onclick={() => selectRoom(room.id)}
            >
              <Icon name="hash" size="sm" />
              <span class="room-name">{room.name}</span>
            </button>
          {/each}
        </div>
      {/if}

      <!-- Station rooms -->
      {#if stationRooms.length > 0}
        <div class="rooms-section">
          <span class="section-label">{$t('chat.stations_section', { default: 'Production Stations' })}</span>
          {#each stationRooms as room (room.id)}
            <button
              class="room-item station-room"
              class:active={room.id === activeRoomId}
              onclick={() => selectRoom(room.id)}
            >
              <Icon name="cpu" size="sm" />
              <span class="room-name">{room.name}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>

    {#if $currentUser}
      <div class="sidebar-footer">
        <div class="user-info">
          <div class="user-avatar">{authorInitials(currentUserId)}</div>
          <div class="user-details">
            <span class="user-name">{($currentUser as any).displayName || ($currentUser as any).username}</span>
            <span class="user-status">{$t('chat.online', { default: 'Online' })}</span>
          </div>
        </div>
      </div>
    {/if}
  </aside>

  <!-- Main Chat Area -->
  <main class="chat-main">
    <header class="chat-header">
      <div class="header-left">
        {#if activeRoom && (activeRoom as any).kind === 'station'}
          <Icon name="cpu" size="sm" />
        {:else}
          <Icon name="hash" size="sm" />
        {/if}
        <h3>{activeRoom?.name || $t('chat.select_room', { default: 'Select a room' })}</h3>
        {#if activeRoom && (activeRoom as any).kind === 'station'}
          <span class="station-badge">{$t('chat.station_badge', { default: 'Station' })}</span>
        {/if}
      </div>
      <div class="header-actions">
        <button class="icon-btn" title={$t('chat.members_btn', { default: 'Members' })}>
          <Icon name="users" size="sm" />
        </button>
      </div>
    </header>

    <div class="messages-container" bind:this={scroller}>
      {#if roomMessages.length === 0}
        <div class="empty-state">
          <Icon name="hash" size="sm" />
          <h3>{$t('chat.welcome_room', { default: 'Welcome to #{name}', values: { name: activeRoom?.name ?? '' } })}</h3>
          <p>{$t('chat.start_conversation', { default: 'This is the beginning of the conversation. Say hello!' })}</p>
        </div>
      {:else}
        {#each roomMessages as message, i (message.id)}
          {#if shouldShowDateSeparator(i)}
            <div class="date-separator">
              <span>{formatDate(message.ts)}</span>
            </div>
          {/if}

          <article class="message" class:system={message.variant === 'system'}>
            <div class="message-avatar">{authorInitials(message.authorId)}</div>
            <div class="message-content">
              <div class="message-header">
                <span class="author-name">{authorName(message.authorId)}</span>
                {#if authorStation(message.authorId)}
                  <StationBadge station={authorStation(message.authorId)} size="sm" />
                {/if}
                <span class="message-time">{formatTime(message.ts)}</span>
              </div>
              <p class="message-text">{message.text}</p>
              {#if message.mentions && message.mentions.length > 0}
                <div class="message-mentions">
                  {#each message.mentions as mention}
                    <span class="mention-tag">@{authorName(mention)}</span>
                  {/each}
                </div>
              {/if}
            </div>
          </article>
        {/each}
      {/if}
    </div>

    <div class="message-input-container">
      <MentionInput
        onCommit={handleSend}
        placeholder={`Message #${activeRoom?.name || 'general'}…`}
      />
    </div>
  </main>
</div>

<!-- Create Room Modal -->
{#if showRoomModal}
  <div
    class="modal-backdrop"
    onclick={() => showRoomModal = false}
    onkeydown={(e) => e.key === 'Escape' && (showRoomModal = false)}
    role="button"
    tabindex="0"
  >
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      class="modal"
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-room-title"
      tabindex="-1"
    >
      <div class="modal-header">
        <h3 id="create-room-title">{$t('chat.create_channel_title', { default: 'Create Channel' })}</h3>
        <button class="icon-btn" onclick={() => showRoomModal = false} aria-label="Close">
          <Icon name="x" size="sm" />
        </button>
      </div>
      <div class="modal-body">
        <label>
          <span>{$t('chat.channel_name_label', { default: 'Channel Name' })}</span>
          <input
            type="text"
            placeholder={$t('chat.channel_name_placeholder', { default: 'e.g. production-updates' })}
            bind:value={newRoomName}
            onkeydown={(e) => e.key === 'Enter' && createRoom()}
          />
        </label>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick={() => showRoomModal = false}>{$t('actions.cancel', { default: 'Cancel' })}</button>
        <button class="btn btn-primary" onclick={createRoom} disabled={!newRoomName.trim()}>
          {$t('chat.create_channel_btn', { default: 'Create Channel' })}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .chat-page {
    display: grid;
    grid-template-columns: 280px 1fr;
    height: calc(100vh - 60px);
    background: var(--bg-0);
  }

  .chat-sidebar {
    display: flex;
    flex-direction: column;
    background: var(--bg-1);
    border-right: 1px solid var(--border);
  }

  .sidebar-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-md) var(--space-lg);
    border-bottom: 1px solid var(--border);
  }

  .sidebar-header h2 { margin: 0; font-size: 1.1rem; font-weight: 700; }

  .search-box {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: var(--space-md);
    padding: 8px 12px;
    background: var(--bg-2);
    border-radius: 8px;
    color: var(--text-muted);
  }

  .search-box input {
    flex: 1;
    border: none;
    background: transparent;
    font-size: 0.9rem;
    color: var(--text);
  }
  .search-box input::placeholder { color: var(--text-muted); }
  .search-box input:focus { outline: none; }

  .rooms-list {
    flex: 1;
    overflow-y: auto;
    padding: 0 var(--space-sm);
  }

  .rooms-section { margin-bottom: var(--space-md); }

  .section-label {
    display: block;
    padding: var(--space-sm) var(--space-sm);
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
  }

  .room-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 12px;
    border: none;
    background: transparent;
    border-radius: 6px;
    font-size: 0.9rem;
    color: var(--text-muted);
    cursor: pointer;
    transition: background var(--transition-fast), color var(--transition-fast);
    text-align: left;
  }
  .room-item:hover { background: var(--bg-2); color: var(--text); }
  .room-item.active { background: var(--brand); color: var(--bg-0); }
  .room-item.station-room { font-size: 0.85rem; }

  .room-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .sidebar-footer {
    padding: var(--space-md);
    border-top: 1px solid var(--border);
    background: var(--bg-2);
  }

  .user-info { display: flex; align-items: center; gap: var(--space-sm); }

  .user-avatar {
    width: 36px; height: 36px;
    border-radius: 8px;
    background: var(--brand);
    color: var(--bg-0);
    display: flex; align-items: center; justify-content: center;
    font-weight: 700; font-size: 0.8rem;
  }

  .user-details { display: flex; flex-direction: column; }
  .user-name { font-weight: 600; font-size: 0.9rem; }
  .user-status { font-size: 0.75rem; color: var(--ok, #34c759); }

  /* Main */
  .chat-main { display: flex; flex-direction: column; min-width: 0; }

  .chat-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-md) var(--space-lg);
    background: var(--bg-1);
    border-bottom: 1px solid var(--border);
  }

  .header-left { display: flex; align-items: center; gap: var(--space-sm); color: var(--text-muted); }
  .header-left h3 { margin: 0; font-size: 1rem; font-weight: 600; color: var(--text); }

  .station-badge {
    font-size: 0.65rem; font-weight: 700;
    padding: 2px 8px; border-radius: 999px;
    background: color-mix(in oklab, var(--brand) 12%, transparent);
    color: var(--brand);
    text-transform: uppercase; letter-spacing: 0.06em;
  }

  .header-actions { display: flex; gap: 4px; }

  .icon-btn {
    width: 36px; height: 36px;
    display: flex; align-items: center; justify-content: center;
    border: none; background: transparent; border-radius: 8px;
    cursor: pointer; color: var(--text-muted);
    transition: background var(--transition-fast), color var(--transition-fast);
  }
  .icon-btn:hover { background: var(--bg-2); color: var(--text); }

  /* Messages */
  .messages-container {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-lg);
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--text-muted);
    text-align: center;
    gap: var(--space-sm);
  }
  .empty-state h3 { margin: var(--space-md) 0 var(--space-xs); color: var(--text); }

  .date-separator {
    display: flex; align-items: center; gap: var(--space-md);
    margin: var(--space-lg) 0;
    color: var(--text-muted); font-size: 0.75rem;
  }
  .date-separator::before, .date-separator::after {
    content: ''; flex: 1; height: 1px; background: var(--border);
  }

  .message {
    display: flex;
    gap: var(--space-md);
    padding: var(--space-sm) 0;
    border-radius: 4px;
  }
  .message:hover {
    background: var(--bg-2);
    margin: 0 calc(-1 * var(--space-lg));
    padding: var(--space-sm) var(--space-lg);
  }
  .message.system { opacity: 0.7; }

  .message-avatar {
    width: 40px; height: 40px; border-radius: 50%;
    background: var(--bg-2);
    display: flex; align-items: center; justify-content: center;
    font-weight: 700; font-size: 0.85rem; color: var(--text-muted);
    flex-shrink: 0;
  }

  .message-content { flex: 1; min-width: 0; }

  .message-header {
    display: flex; align-items: center; gap: var(--space-sm);
    margin-bottom: 2px;
  }

  .author-name { font-weight: 600; font-size: 0.9rem; }
  .message-time { font-size: 0.75rem; color: var(--text-muted); }
  .message-text { margin: 0; line-height: 1.5; word-wrap: break-word; }

  .message-mentions { display: flex; gap: 4px; margin-top: 4px; }
  .mention-tag {
    font-size: 0.75rem; padding: 2px 6px;
    background: color-mix(in oklab, var(--brand) 15%, transparent);
    color: var(--brand); border-radius: 4px;
  }

  .message-input-container {
    padding: var(--space-md) var(--space-lg);
    background: var(--bg-1);
    border-top: 1px solid var(--border);
  }

  /* Modal */
  .modal-backdrop {
    position: fixed; inset: 0;
    background: color-mix(in oklab, var(--bg-0) 45%, transparent);
    display: flex; align-items: center; justify-content: center;
    z-index: var(--z-modal, 1000);
  }

  .modal {
    background: var(--bg-1);
    border-radius: 12px;
    width: 90%; max-width: 400px;
    box-shadow: 0 20px 60px color-mix(in oklab, black 30%, transparent);
  }

  .modal-header {
    display: flex; justify-content: space-between; align-items: center;
    padding: var(--space-md) var(--space-lg);
    border-bottom: 1px solid var(--border);
  }
  .modal-header h3 { margin: 0; font-size: 1.1rem; }

  .modal-body { padding: var(--space-lg); }
  .modal-body label { display: flex; flex-direction: column; gap: 8px; font-size: 0.9rem; font-weight: 500; }
  .modal-body input {
    padding: 10px 12px;
    border: 1px solid var(--border); border-radius: 8px;
    font-size: 0.95rem; background: var(--bg-0); color: var(--text);
  }
  .modal-body input:focus { outline: none; border-color: var(--brand); }

  .modal-footer {
    display: flex; justify-content: flex-end; gap: var(--space-sm);
    padding: var(--space-md) var(--space-lg);
    border-top: 1px solid var(--border);
  }

  .btn {
    padding: 10px 16px; border-radius: 8px; font-size: 0.9rem; font-weight: 600;
    cursor: pointer; border: 1px solid transparent;
    transition: background var(--transition-fast);
  }
  .btn-primary { background: var(--brand); color: var(--bg-0); }
  .btn-primary:hover:not(:disabled) { background: color-mix(in oklab, var(--brand) 85%, black); }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-ghost { background: transparent; color: var(--text-muted); }
  .btn-ghost:hover { background: var(--bg-2); }

  @media (max-width: 768px) {
    .chat-page { grid-template-columns: 1fr; }
    .chat-sidebar { display: none; }
  }
</style>
