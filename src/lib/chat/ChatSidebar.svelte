<script lang="ts">

  import { onMount, onDestroy } from 'svelte';
  import { fade, slide, fly } from 'svelte/transition';
  import { t } from 'svelte-i18n';
  import { currentUser } from '$lib/auth/authState';
  import { 
    rooms, 
    messages, 
    sendMessage, 
    loadRooms, 
    loadMessages, 
    ensureRoom, 
    isChatOpen, 
    toggleChat 
  } from '$lib/chat/chat-store';
  import { users, loadUsers } from '$lib/users/user-store';
  import { 
    Send, Plus, Hash, Users, Settings, Search, Smile, Paperclip, 
    MoreVertical, Bell, BellOff, X, MessageSquare 
  } from 'lucide-svelte';
  import MentionInput from '$lib/chat/MentionInput.svelte';
  import type { StationTag } from '$lib/order/stages';
  import StationBadge from '$lib/ui/StationBadge.svelte';

  let activeRoomId = $state('general');
  let messageText = $state('');
  let scroller: HTMLDivElement | null = $state(null);
  let showRoomModal = $state(false);
  let newRoomName = $state('');
  let searchQuery = $state('');
  
  // View state: 'list' | 'room'
  let view: 'list' | 'room' = $state('room');

  let activeRoom = $derived($rooms.find(r => r.id === activeRoomId) || $rooms[0]);
  let roomMessages = $derived($messages.filter(m => m.roomId === activeRoomId));
  let filteredRooms = $derived(searchQuery 
    ? $rooms.filter(r => r.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : $rooms);

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
    view = 'room';
    scrollToBottom();
  }

  function handleSend(text: string, mentions: string[] = []) {
    if (!text.trim()) return;
    sendMessage(activeRoomId, text, mentions);
    messageText = '';
    scrollToBottom();
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
    // Initial load
    if (activeRoomId) {
        await loadMessages(activeRoomId);
        scrollToBottom();
    }
  });
  
  // Scroll whenever messages change or sidebar opens
  $effect(() => {
    if ($isChatOpen && activeRoomId && $messages) {
      scrollToBottom();
    }
  });
</script>

{#if $isChatOpen}
  <!-- Backdrop for mobile/tablet -->
  <div class="sidebar-backdrop" onclick={toggleChat} transition:fade={{ duration: 200 }}></div>

  <aside class="chat-drawer" transition:fly={{ x: 400, duration: 300 }}>
    
    <!-- Sidebar Header -->
    <header class="drawer-header">
      <div class="header-title">
        {#if view === 'room'}
          <button class="back-btn" onclick={() => view = 'list'}>
            <Hash size={18} />
          </button>
          <h3>#{activeRoom?.name || 'Chat'}</h3>
        {:else}
          <h3>Channels</h3>
        {/if}
      </div>
      <div class="header-actions">
        {#if view === 'list'}
          <button class="icon-btn" onclick={() => showRoomModal = true} title="New Channel">
            <Plus size={18} />
          </button>
        {/if}
        <button class="icon-btn close-btn" onclick={toggleChat} title="Close Chat">
          <X size={20} />
        </button>
      </div>
    </header>

    <!-- Content Area -->
    <div class="drawer-content">
      
      <!-- ROOM LIST VIEW -->
      {#if view === 'list'}
        <div class="rooms-view" in:fade>
          <div class="search-box">
            <Search size={14} />
            <input type="text" placeholder="Filter channels..." bind:value={searchQuery} />
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
            <MentionInput 
              onCommit={handleSend} 
              placeholder={`Message #${activeRoom?.name}...`} 
            />
          </div>
        </div>
      {/if}
    </div>
  </aside>
{/if}

<!-- Create Room Modal -->
{#if showRoomModal}
  <div class="modal-backdrop" onclick={() => showRoomModal = false}>
    <div class="modal" onclick={stopPropagation(bubble('click'))} role="dialog">
      <div class="modal-header">
        <h3>Create Channel</h3>
        <button onclick={() => showRoomModal = false}><X size={18} /></button>
      </div>
      <div class="modal-body">
        <label>Channel Name
          <input type="text" placeholder="e.g. logistics-team" bind:value={newRoomName} />
        </label>
      </div>
      <div class="modal-footer">
        <button class="btn-ghost" onclick={() => showRoomModal = false}>Cancel</button>
        <button class="btn-primary" onclick={createRoom} disabled={!newRoomName.trim()}>Create</button>
      </div>
    </div>
  </div>
{/if}

<style>
  /* Sidebar Drawer */
  .chat-drawer {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: 380px;
    background: var(--bg-1, #fff);
    box-shadow: -4px 0 24px rgba(0,0,0,0.15);
    z-index: 2000;
    display: flex;
    flex-direction: column;
    border-left: 1px solid var(--border);
  }

  .sidebar-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.2);
    z-index: 1999;
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
    background: color-mix(in oklab, var(--primary, #3b82f6) 10%, white);
    border-color: color-mix(in oklab, var(--primary, #3b82f6) 20%, transparent);
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
    color: white;
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
    background: var(--primary, #3b82f6);
    color: white;
    border-top-left-radius: 12px;
    border-top-right-radius: 2px;
  }

  .input-area {
    padding: 12px;
    border-top: 1px solid var(--border);
    background: var(--bg-1);
  }

  /* Modal */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.5);
    z-index: 2100;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .modal {
    background: var(--bg-1);
    width: 90%;
    max-width: 360px;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 10px 40px rgba(0,0,0,0.25);
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
    color: white;
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
</style>