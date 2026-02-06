<!-- @migration-task Error while migrating Svelte code: Cannot use `export let` in runes mode — use `$props()` instead
https://svelte.dev/e/legacy_export_invalid -->
<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { chatStore } from '$lib/stores/chat';
  import { page } from '$app/stores';
  import { fly } from 'svelte/transition';

  export let orderId: string;

  let userId = $derived($page.data.session?.user?.id);
  let userEmail = $derived($page.data.session?.user?.email);

  let messageInput = '';
  let chatContainer: HTMLDivElement;
  let unsubscribe: (() => void) | null = null;
  let sending = false;

  async function scrollToBottom() {
    await tick();
    if (chatContainer) {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
  }

  async function handleSend() {
    if (!messageInput.trim() || !userId || sending) return;

    sending = true;
    const message = messageInput;
    messageInput = '';

    try {
      await chatStore.send(orderId, userId, message);
      await scrollToBottom();
    } catch (err) {
      console.error('Failed to send message:', err);
      messageInput = message; // Restore message on error
      alert('Failed to send message');
    } finally {
      sending = false;
    }
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  }

  function formatTime(timestamp: string) {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    if (isToday) {
      return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    }

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  }

  function getUserName(message: any) {
    return message.user?.profiles?.full_name ||
           message.user?.email?.split('@')[0] ||
           'Unknown User';
  }

  function getUserInitials(message: any) {
    const name = getUserName(message);
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  }

  let isOwnMessage = $derived((message: any) => message.user_id === userId);

  onMount(async () => {
    await chatStore.load(orderId);
    unsubscribe = chatStore.subscribe_realtime(orderId);
    await scrollToBottom();
  });

  onDestroy(() => {
    if (unsubscribe) unsubscribe();
    chatStore.clear();
  });

  // Auto-scroll on new messages
  $effect(() => {
    if ($chatStore.messages.length) {
      scrollToBottom();
    }
  });
</script>

<div class="chat-container">
  <div class="chat-header">
    <h3>Order Chat</h3>
    <span class="online-indicator">● {$chatStore.messages.length} messages</span>
  </div>

  <div class="chat-messages" bind:this={chatContainer}>
    {#if $chatStore.loading}
      <div class="loading-state">
        <div class="spinner" />
        <p>Loading messages...</p>
      </div>
    {:else if $chatStore.messages.length === 0}
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <p>No messages yet</p>
        <small>Start the conversation!</small>
      </div>
    {:else}
      {#each $chatStore.messages as message (message.id)}
        <div
          class="message"
          class:own={isOwnMessage(message)}
          transition:fly={{ y: 20, duration: 200 }}
        >
          {#if !isOwnMessage(message)}
            <div class="avatar">
              {#if message.user?.profiles?.avatar_url}
                <img src={message.user.profiles.avatar_url} alt={getUserName(message)} />
              {:else}
                <span class="avatar-text">{getUserInitials(message)}</span>
              {/if}
            </div>
          {/if}

          <div class="message-content">
            {#if !isOwnMessage(message)}
              <div class="message-sender">{getUserName(message)}</div>
            {/if}
            <div class="message-bubble">
              <p class="message-text">{message.message}</p>
              <span class="message-time">{formatTime(message.created_at)}</span>
            </div>
          </div>
        </div>
      {/each}
    {/if}
  </div>

  <div class="chat-input-container">
    <textarea
      bind:value={messageInput}
      on:keydown={handleKeyDown}
      placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
      rows="1"
      disabled={sending}
      class="chat-input"
    />
    <button
      class="send-button"
      on:click={handleSend}
      disabled={!messageInput.trim() || sending}
      aria-label="Send message"
    >
      {#if sending}
        <div class="spinner-sm" />
      {:else}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <line x1="22" y1="2" x2="11" y2="13"/>
          <polygon points="22 2 15 22 11 13 2 9 22 2"/>
        </svg>
      {/if}
    </button>
  </div>
</div>

<style>
  .chat-container {
    display: flex;
    flex-direction: column;
    height: 600px;
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
  }

  .chat-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1.5rem;
    background: var(--bg-0);
    border-bottom: 1px solid var(--border);
  }

  .chat-header h3 {
    margin: 0;
    font-size: 1rem;
    color: var(--text);
  }

  .online-indicator {
    font-size: 0.875rem;
    color: var(--ok);
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .chat-messages {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    background: var(--bg-0);
  }

  .loading-state,
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--muted);
    text-align: center;
  }

  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--border);
    border-top-color: var(--accent-1);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 1rem;
  }

  .spinner-sm {
    width: 16px;
    height: 16px;
    border: 2px solid transparent;
    border-top-color: currentColor;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .empty-state svg {
    margin-bottom: 1rem;
    opacity: 0.5;
  }

  .empty-state p {
    margin: 0.5rem 0 0.25rem;
    font-size: 1rem;
    color: var(--text);
  }

  .empty-state small {
    font-size: 0.875rem;
  }

  .message {
    display: flex;
    gap: 0.75rem;
    align-items: flex-start;
  }

  .message.own {
    flex-direction: row-reverse;
  }

  .avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    overflow: hidden;
    background: var(--accent-1);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .avatar-text {
    color: white;
    font-size: 0.875rem;
    font-weight: 600;
  }

  .message-content {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    max-width: 70%;
  }

  .message.own .message-content {
    align-items: flex-end;
  }

  .message-sender {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--muted);
    padding: 0 0.75rem;
  }

  .message-bubble {
    background: var(--bg-2);
    padding: 0.75rem 1rem;
    border-radius: 12px;
    position: relative;
  }

  .message.own .message-bubble {
    background: var(--accent-1);
    color: white;
  }

  .message-text {
    margin: 0;
    font-size: 0.875rem;
    line-height: 1.4;
    white-space: pre-wrap;
    word-wrap: break-word;
  }

  .message-time {
    display: block;
    font-size: 0.625rem;
    color: var(--muted);
    margin-top: 0.25rem;
  }

  .message.own .message-time {
    color: rgba(255, 255, 255, 0.7);
  }

  .chat-input-container {
    display: flex;
    gap: 0.75rem;
    padding: 1rem 1.5rem;
    background: var(--bg-1);
    border-top: 1px solid var(--border);
  }

  .chat-input {
    flex: 1;
    padding: 0.75rem 1rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    font-size: 0.875rem;
    font-family: inherit;
    background: var(--bg-0);
    color: var(--text);
    resize: none;
    max-height: 120px;
    transition: border-color 0.2s ease;
  }

  .chat-input:focus {
    outline: none;
    border-color: var(--accent-1);
  }

  .chat-input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .send-button {
    width: 44px;
    height: 44px;
    background: var(--accent-1);
    border: none;
    border-radius: 8px;
    color: white;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
    flex-shrink: 0;
  }

  .send-button:hover:not(:disabled) {
    background: var(--accent-2);
    transform: translateY(-1px);
  }

  .send-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  @media (max-width: 768px) {
    .chat-container {
      height: 500px;
    }

    .message-content {
      max-width: 85%;
    }
  }
</style>
