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
  let showMembers = $state(false);
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
        <button
          class="icon-btn"
          onclick={() => showMembers = !showMembers}
          aria-expanded={showMembers}
          title={$t('chat.members_btn', { default: 'Members' })}
        >
          <Icon name="users" size="sm" />
        </button>
      </div>
    </header>

    {#if showMembers}
      <aside class="members-panel" aria-label={$t('chat.members_btn', { default: 'Members' })}>
        <header class="members-panel__header">
          <span>{$t('chat.members_count', { default: '{n} members', values: { n: $users.length } })}</span>
          <button class="icon-btn" onclick={() => showMembers = false} aria-label="Close">
            <Icon name="x" size="sm" />
          </button>
        </header>
        <ul class="members-panel__list">
          {#each $users as u ((u as any).id)}
            <li class="members-panel__item">
              <span class="member-avatar">{authorInitials(String((u as any).id))}</span>
              <span class="member-name">{(u as any).displayName || (u as any).username}</span>
            </li>
          {/each}
        </ul>
      </aside>
    {/if}

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
    height: calc(100dvh - var(--topbar-h));
    background: var(--bg-0);
    animation: rf-fade-in var(--motion-md) var(--ease-standard) both;
  }

  .chat-sidebar {
    display: flex;
    flex-direction: column;
    background: var(--glass-bg);
    backdrop-filter: var(--glass-material-thin);
    -webkit-backdrop-filter: var(--glass-material-thin);
    border-right: 1px solid var(--separator-opaque, var(--divider));
  }

  .sidebar-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-md) var(--space-lg);
    border-bottom: 1px solid var(--divider);
  }

  .sidebar-header h2 {
    margin: 0;
    font-size: var(--text-lg);
    font-weight: 700;
    letter-spacing: var(--tracking-tight);
  }

  .search-box {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin: var(--space-md);
    padding: var(--space-sm) var(--space-md);
    background: color-mix(in oklab, var(--bg-1) 60%, var(--bg-0));
    border: 1px solid var(--border);
    border-radius: var(--radius-full);
    color: var(--ink-tertiary);
    transition:
      border-color var(--motion-sm) var(--ease-standard),
      box-shadow   var(--motion-sm) var(--ease-standard);
  }
  .search-box:focus-within {
    border-color: var(--brand);
    box-shadow: var(--focus-ring-soft);
  }

  .search-box input {
    flex: 1;
    border: none;
    background: transparent;
    font-size: var(--text-sm);
    color: var(--text);
    min-width: 0;
  }
  .search-box input::placeholder { color: var(--ink-tertiary); opacity: 0.7; }
  .search-box input:focus { outline: none; }

  .rooms-list {
    flex: 1;
    overflow-y: auto;
    padding: 0 var(--space-sm);
  }

  .rooms-section { margin-bottom: var(--space-md); }

  .section-label {
    display: block;
    padding: var(--space-sm);
    font-size: var(--text-xs);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: var(--tracking-wider);
    color: var(--ink-tertiary);
  }

  .room-item {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    width: 100%;
    padding: var(--space-sm) var(--space-md);
    border: none;
    background: transparent;
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    color: var(--ink-secondary);
    cursor: pointer;
    transition:
      background var(--motion-sm) var(--ease-standard),
      color      var(--motion-sm) var(--ease-standard),
      transform  var(--motion-xs) var(--ease-spring-soft);
    text-align: left;
    box-shadow: none;
  }
  .room-item:hover {
    background: color-mix(in oklab, var(--bg-2) 70%, transparent);
    color: var(--ink-primary);
    transform: translateX(2px);
  }
  .room-item.active {
    background: var(--brand-soft);
    color: var(--brand);
    font-weight: 600;
    box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--brand) 22%, transparent);
  }

  .room-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sidebar-footer {
    padding: var(--space-md);
    border-top: 1px solid var(--divider);
    background: color-mix(in oklab, var(--bg-1) 50%, transparent);
  }

  .user-info { display: flex; align-items: center; gap: var(--space-sm); }

  .user-avatar {
    width: 36px; height: 36px;
    border-radius: var(--radius-md);
    background: linear-gradient(135deg,
      color-mix(in oklab, var(--brand) 92%, white) 0%,
      var(--brand) 100%);
    color: white;
    display: flex; align-items: center; justify-content: center;
    font-weight: 700;
    font-size: var(--text-xs);
    box-shadow: 0 2px 8px color-mix(in oklab, var(--brand) 30%, transparent);
  }

  .user-details { display: flex; flex-direction: column; min-width: 0; }
  .user-name {
    font-weight: 600;
    font-size: var(--text-sm);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .user-status {
    font-size: var(--text-xs);
    color: var(--ok);
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
  }
  .user-status::before {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: var(--radius-full);
    background: var(--ok);
    box-shadow: 0 0 8px color-mix(in oklab, var(--ok) 60%, transparent);
    animation: rf-glow-pulse 2s ease-out infinite;
  }

  /* ---------- Main ---------- */
  .chat-main { display: flex; flex-direction: column; min-width: 0; }

  .chat-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-md) var(--space-lg);
    background: var(--glass-bg);
    backdrop-filter: var(--glass-material-thin);
    -webkit-backdrop-filter: var(--glass-material-thin);
    border-bottom: 1px solid var(--divider);
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    color: var(--ink-tertiary);
    min-width: 0;
  }
  .header-left h3 {
    margin: 0;
    font-size: var(--text-md);
    font-weight: 600;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .station-badge {
    font-size: var(--text-xs);
    font-weight: 700;
    padding: var(--space-xxs) var(--space-sm);
    border-radius: var(--radius-full);
    background: color-mix(in oklab, var(--brand) 14%, transparent);
    color: var(--brand);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wider);
  }

  .header-actions { display: flex; gap: var(--space-xs); }

  .icon-btn {
    width: var(--control-sm);
    height: var(--control-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    border-radius: var(--radius-md);
    cursor: pointer;
    color: var(--ink-tertiary);
    transition:
      background var(--motion-sm) var(--ease-standard),
      color      var(--motion-sm) var(--ease-standard),
      transform  var(--motion-xs) var(--ease-spring-soft);
    box-shadow: none;
  }
  .icon-btn:hover {
    background: color-mix(in oklab, var(--bg-2) 70%, transparent);
    color: var(--ink-primary);
    transform: scale(1.05);
  }
  .icon-btn:active { transform: scale(0.95); }

  /* ---------- Messages ---------- */
  .messages-container {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-lg);
    scroll-behavior: smooth;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--ink-tertiary);
    text-align: center;
    gap: var(--space-sm);
    animation: rf-fade-up var(--motion-lg) var(--ease-standard) both;
  }
  .empty-state h3 {
    margin: var(--space-md) 0 var(--space-xs);
    color: var(--text);
    font-size: var(--text-lg);
  }

  .date-separator {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    margin: var(--space-lg) 0;
    color: var(--ink-tertiary);
    font-size: var(--text-xs);
    font-weight: 500;
  }
  .date-separator::before, .date-separator::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--divider);
  }
  .date-separator span {
    padding: var(--space-xxs) var(--space-md);
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-full);
    backdrop-filter: var(--glass-material-thin);
    -webkit-backdrop-filter: var(--glass-material-thin);
  }

  .message {
    display: flex;
    gap: var(--space-md);
    padding: var(--space-sm);
    border-radius: var(--radius-md);
    transition: background var(--motion-sm) var(--ease-standard);
    animation: rf-fade-up var(--motion-md) var(--ease-standard) both;
  }
  .message:hover {
    background: color-mix(in oklab, var(--bg-2) 50%, transparent);
  }
  .message.system { opacity: 0.7; }

  .message-avatar {
    width: 40px;
    height: 40px;
    border-radius: var(--radius-full);
    background: var(--bg-2);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: var(--text-xs);
    color: var(--ink-secondary);
    flex-shrink: 0;
    border: 1px solid var(--glass-border);
  }

  .message-content { flex: 1; min-width: 0; }

  .message-header {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin-bottom: 2px;
    flex-wrap: wrap;
  }

  .author-name {
    font-weight: 600;
    font-size: var(--text-sm);
  }
  .message-time {
    font-size: var(--text-xs);
    color: var(--ink-tertiary);
  }
  .message-text {
    margin: 0;
    line-height: var(--leading-normal);
    word-wrap: break-word;
    color: var(--ink-primary);
  }

  .message-mentions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
    margin-top: var(--space-xs);
  }
  .mention-tag {
    font-size: var(--text-xs);
    padding: var(--space-xxs) var(--space-sm);
    background: color-mix(in oklab, var(--brand) 14%, transparent);
    color: var(--brand);
    border-radius: var(--radius-sm);
    font-weight: 500;
  }

  .message-input-container {
    padding: var(--space-md) var(--space-lg);
    background: var(--glass-bg);
    backdrop-filter: var(--glass-material-thin);
    -webkit-backdrop-filter: var(--glass-material-thin);
    border-top: 1px solid var(--divider);
  }

  /* ---------- Modal ---------- */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: color-mix(in oklab, var(--bg-0) 60%, transparent);
    backdrop-filter: var(--glass-material-thin);
    -webkit-backdrop-filter: var(--glass-material-thin);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--z-modal);
    animation: rf-fade-in var(--motion-sm) var(--ease-standard) both;
  }

  .modal {
    background: var(--glass-bg-strong);
    backdrop-filter: var(--glass-material-thick);
    -webkit-backdrop-filter: var(--glass-material-thick);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-lg);
    width: 90%;
    max-width: 440px;
    box-shadow: var(--glass-shadow-lg), var(--glass-border-highlight);
    animation: rf-slide-up var(--motion-md) var(--ease-emphasized) both;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-md) var(--space-lg);
    border-bottom: 1px solid var(--divider);
  }
  .modal-header h3 {
    margin: 0;
    font-size: var(--text-lg);
    letter-spacing: var(--tracking-tight);
  }

  .modal-body { padding: var(--space-lg); }
  .modal-body label {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    font-size: var(--text-sm);
    font-weight: 500;
  }
  .modal-body input {
    padding: var(--space-sm) var(--space-md);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    font-size: var(--text-md);
    background: color-mix(in oklab, var(--bg-1) 55%, var(--bg-0));
    color: var(--text);
    transition:
      border-color var(--motion-sm) var(--ease-standard),
      box-shadow   var(--motion-sm) var(--ease-standard);
  }
  .modal-body input:focus {
    outline: none;
    border-color: var(--brand);
    box-shadow: var(--focus-ring);
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-sm);
    padding: var(--space-md) var(--space-lg);
    border-top: 1px solid var(--divider);
  }

  .btn {
    padding: var(--space-sm) var(--space-lg);
    border-radius: var(--radius-full);
    font-size: var(--text-sm);
    font-weight: 600;
    cursor: pointer;
    border: 1px solid transparent;
    transition:
      background var(--motion-sm) var(--ease-standard),
      transform  var(--motion-sm) var(--ease-spring-soft),
      filter     var(--motion-sm) var(--ease-standard);
    box-shadow: none;
  }
  .btn-primary {
    background:
      linear-gradient(180deg,
        color-mix(in oklab, var(--brand) 96%, white) 0%,
        var(--brand) 100%);
    color: #fff;
    box-shadow:
      0 4px 14px -2px color-mix(in oklab, var(--brand) 35%, transparent),
      inset 0 1px 0 color-mix(in oklab, white 22%, transparent);
  }
  .btn-primary:hover:not(:disabled) {
    transform: translateY(-1px);
    filter: brightness(1.06);
  }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

  .btn-ghost {
    background: transparent;
    color: var(--ink-secondary);
  }
  .btn-ghost:hover { background: color-mix(in oklab, var(--bg-2) 70%, transparent); }

  /* ---------- Members panel ---------- */
  .members-panel {
    position: absolute;
    right: var(--space-md);
    top: calc(var(--topbar-h) + 56px);
    width: 280px;
    max-height: 60dvh;
    overflow: auto;
    z-index: var(--z-popover);
    background: var(--glass-bg-strong);
    backdrop-filter: var(--glass-material-thick);
    -webkit-backdrop-filter: var(--glass-material-thick);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--glass-shadow-lg), var(--glass-border-highlight);
    animation: rf-slide-down var(--motion-md) var(--ease-emphasized) both;
  }
  .members-panel__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-md);
    border-bottom: 1px solid var(--divider);
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--ink-tertiary);
  }
  .members-panel__list {
    list-style: none;
    margin: 0;
    padding: var(--space-sm);
    display: flex;
    flex-direction: column;
    gap: var(--space-xxs);
  }
  .members-panel__item {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm);
    border-radius: var(--radius-md);
    transition: background var(--motion-sm) var(--ease-standard);
  }
  .members-panel__item:hover {
    background: color-mix(in oklab, var(--bg-2) 70%, transparent);
  }
  .member-avatar {
    width: 28px;
    height: 28px;
    border-radius: var(--radius-full);
    background: var(--bg-2);
    border: 1px solid var(--glass-border);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: 700;
    color: var(--ink-secondary);
    flex-shrink: 0;
  }
  .member-name {
    font-size: var(--text-sm);
    color: var(--ink-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (max-width: 768px) {
    .chat-page { grid-template-columns: 1fr; }
    .chat-sidebar { display: none; }
    .members-panel { right: var(--space-sm); width: calc(100vw - var(--space-md)); }
  }
</style>
