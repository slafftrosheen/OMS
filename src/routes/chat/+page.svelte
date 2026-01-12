<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { t } from 'svelte-i18n';
  import { currentUser } from '$lib/auth/user-store';
  import { rooms, messages, sendMessage, loadRooms, loadMessages, ensureRoom } from '$lib/chat/chat-store';
  import { users, loadUsers } from '$lib/users/user-store';
  import { Send, Plus, Hash, Users, Settings, Search, Smile, Paperclip, MoreVertical, Bell, BellOff, X } from 'lucide-svelte';
  import MentionInput from '$lib/chat/MentionInput.svelte';
  import type { StationTag } from '$lib/order/stages';
  import StationBadge from '$lib/ui/StationBadge.svelte';

  // Accept params prop to silence SvelteKit warning
  export let params = {};

  let activeRoomId = 'general';
  let messageText = '';
  let scroller: HTMLDivElement | null = null;
  let showRoomModal = false;
  let newRoomName = '';
  let searchQuery = '';
  let pollingInterval: ReturnType<typeof setInterval>;

  $: activeRoom = $rooms.find(r => r.id === activeRoomId) || $rooms[0];
  $: roomMessages = $messages.filter(m => m.roomId === activeRoomId);
  $: filteredRooms = searchQuery 
    ? $rooms.filter(r => r.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : $rooms;

  function scrollToBottom() {
    if (scroller) {
      setTimeout(() => {
        if (scroller) scroller.scrollTop = scroller.scrollHeight;
      }, 50);
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
    return user?.stations?.[0] ?? null;
  }

  function shouldShowDateSeparator(index: number): boolean {
    if (index === 0) return true;
    const current = new Date(roomMessages[index].ts);
    const prev = new Date(roomMessages[index - 1].ts);
    return current.toDateString() !== prev.toDateString();
  }

  onMount(async () => {
    await Promise.all([loadRooms(), loadUsers()]);
    await loadMessages(activeRoomId);
    scrollToBottom();
    
    // Poll for new messages every 5 seconds
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
      <h2>Chat</h2>
      <button class="icon-btn" on:click={() => showRoomModal = true} title="Create Room">
        <Plus size={20} />
      </button>
    </div>
    
    <div class="search-box">
      <Search size={16} />
      <input type="text" placeholder="Search rooms..." bind:value={searchQuery} />
    </div>

    <div class="rooms-list">
      <div class="rooms-section">
        <span class="section-label">Channels</span>
        {#each filteredRooms as room (room.id)}
          <button 
            class="room-item" 
            class:active={room.id === activeRoomId}
            on:click={() => selectRoom(room.id)}
          >
            <Hash size={16} />
            <span class="room-name">{room.name}</span>
          </button>
        {/each}
      </div>
    </div>

    {#if $currentUser}
      <div class="sidebar-footer">
        <div class="user-info">
          <div class="user-avatar">{authorInitials($currentUser.id)}</div>
          <div class="user-details">
            <span class="user-name">{$currentUser.displayName || $currentUser.username}</span>
            <span class="user-status">Online</span>
          </div>
        </div>
      </div>
    {/if}
  </aside>

  <!-- Main Chat Area -->
  <main class="chat-main">
    <header class="chat-header">
      <div class="header-left">
        <Hash size={20} />
        <h3>{activeRoom?.name || 'Select a room'}</h3>
      </div>
      <div class="header-actions">
        <button class="icon-btn" title="Members">
          <Users size={18} />
        </button>
        <button class="icon-btn" title="Settings">
          <Settings size={18} />
        </button>
      </div>
    </header>

    <div class="messages-container" bind:this={scroller}>
      {#if roomMessages.length === 0}
        <div class="empty-state">
          <Hash size={48} />
          <h3>Welcome to #{activeRoom?.name}</h3>
          <p>This is the beginning of the conversation. Say hello!</p>
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
        placeholder={`Message #${activeRoom?.name || 'general'}...`}
      />
    </div>
  </main>
</div>

<!-- Create Room Modal -->
{#if showRoomModal}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="modal-backdrop" on:click={() => showRoomModal = false}>
    <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
    <div class="modal" on:click|stopPropagation role="dialog" aria-modal="true" aria-labelledby="create-room-title">
      <div class="modal-header">
        <h3 id="create-room-title">Create Channel</h3>
        <button class="icon-btn" on:click={() => showRoomModal = false} aria-label="Close">
          <X size={20} />
        </button>
      </div>
      <div class="modal-body">
        <label>
          <span>Channel Name</span>
          <input 
            type="text" 
            placeholder="e.g. production-updates"
            bind:value={newRoomName}
            on:keydown={(e) => e.key === 'Enter' && createRoom()}
          />
        </label>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" on:click={() => showRoomModal = false}>{$t('actions.cancel', { default: 'Cancel' })}</button>
        <button class="btn btn-primary" on:click={createRoom} disabled={!newRoomName.trim()}>
          Create Channel
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

  /* Sidebar */
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

  .sidebar-header h2 {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 700;
  }

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

  .search-box input::placeholder {
    color: var(--text-muted);
  }

  .rooms-list {
    flex: 1;
    overflow-y: auto;
    padding: 0 var(--space-sm);
  }

  .rooms-section {
    margin-bottom: var(--space-lg);
  }

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
    transition: all 0.15s ease;
    text-align: left;
  }

  .room-item:hover {
    background: var(--bg-2);
    color: var(--text);
  }

  .room-item.active {
    background: var(--primary, #3b82f6);
    color: white;
  }

  .room-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sidebar-footer {
    padding: var(--space-md);
    border-top: 1px solid var(--border);
    background: var(--bg-2);
  }

  .user-info {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .user-avatar {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    background: linear-gradient(135deg, var(--primary, #3b82f6), var(--accent, #8b5cf6));
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 0.8rem;
  }

  .user-details {
    display: flex;
    flex-direction: column;
  }

  .user-name {
    font-weight: 600;
    font-size: 0.9rem;
  }

  .user-status {
    font-size: 0.75rem;
    color: var(--success, #22c55e);
  }

  /* Main Chat */
  .chat-main {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .chat-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-md) var(--space-lg);
    background: var(--bg-1);
    border-bottom: 1px solid var(--border);
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    color: var(--text-muted);
  }

  .header-left h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text);
  }

  .header-actions {
    display: flex;
    gap: 4px;
  }

  .icon-btn {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    border-radius: 8px;
    cursor: pointer;
    color: var(--text-muted);
    transition: all 0.15s ease;
  }

  .icon-btn:hover {
    background: var(--bg-2);
    color: var(--text);
  }

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
  }

  .empty-state h3 {
    margin: var(--space-md) 0 var(--space-xs);
    color: var(--text);
  }

  .date-separator {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    margin: var(--space-lg) 0;
    color: var(--text-muted);
    font-size: 0.75rem;
  }

  .date-separator::before,
  .date-separator::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--border);
  }

  .message {
    display: flex;
    gap: var(--space-md);
    padding: var(--space-sm) 0;
  }

  .message:hover {
    background: var(--bg-2);
    margin: 0 calc(-1 * var(--space-lg));
    padding: var(--space-sm) var(--space-lg);
    border-radius: 4px;
  }

  .message.system {
    opacity: 0.7;
  }

  .message-avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--bg-2);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 0.85rem;
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .message-content {
    flex: 1;
    min-width: 0;
  }

  .message-header {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin-bottom: 2px;
  }

  .author-name {
    font-weight: 600;
    font-size: 0.9rem;
  }

  .message-time {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .message-text {
    margin: 0;
    line-height: 1.5;
    word-wrap: break-word;
  }

  .message-mentions {
    display: flex;
    gap: 4px;
    margin-top: 4px;
  }

  .mention-tag {
    font-size: 0.75rem;
    padding: 2px 6px;
    background: color-mix(in oklab, var(--primary, #3b82f6) 15%, transparent);
    color: var(--primary, #3b82f6);
    border-radius: 4px;
  }

  /* Message Input */
  .message-input-container {
    padding: var(--space-md) var(--space-lg);
    background: var(--bg-1);
    border-top: 1px solid var(--border);
  }

  /* Modal */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal {
    background: var(--bg-1);
    border-radius: 12px;
    width: 90%;
    max-width: 400px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-md) var(--space-lg);
    border-bottom: 1px solid var(--border);
  }

  .modal-header h3 {
    margin: 0;
    font-size: 1.1rem;
  }

  .modal-body {
    padding: var(--space-lg);
  }

  .modal-body label {
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 0.9rem;
    font-weight: 500;
  }

  .modal-body input {
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    font-size: 0.95rem;
    background: var(--bg-0);
  }

  .modal-body input:focus {
    outline: none;
    border-color: var(--primary, #3b82f6);
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-sm);
    padding: var(--space-md) var(--space-lg);
    border-top: 1px solid var(--border);
  }

  .btn {
    padding: 10px 16px;
    border-radius: 8px;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid transparent;
    transition: all 0.2s ease;
  }

  .btn-primary {
    background: var(--primary, #3b82f6);
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    background: color-mix(in oklab, var(--primary, #3b82f6) 85%, black);
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-ghost {
    background: transparent;
    color: var(--text-muted);
  }

  .btn-ghost:hover {
    background: var(--bg-2);
  }

  /* Responsive */
  @media (max-width: 768px) {
    .chat-page {
      grid-template-columns: 1fr;
    }

    .chat-sidebar {
      display: none;
    }
  }
</style>
