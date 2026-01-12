<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { t } from 'svelte-i18n';
  import { currentUser } from '$lib/auth/user-store';
  import { users } from '$lib/users/user-store';
  import MentionInput from '$lib/chat/MentionInput.svelte';
  import { messages, sendMessage, loadMessages, ensureRoom } from '$lib/chat/chat-store';
  import type { Message } from '$lib/chat/types';
  import { Send, MessageSquare } from 'lucide-svelte';

  export let orderId: string;
  export let orderTitle: string = '';

  let chatContainer: HTMLElement;
  let roomId: string;
  
  $: roomId = `order-${orderId}`;
  $: orderMessages = $messages.filter(m => m.roomId === roomId);

  const nameFromId = (id: string) => {
    if (id === 'system') return 'System';
    const user = $users.find(u => String(u.id) === id);
    return user?.name ?? id;
  };

  const formatTime = (ts: string) => {
    const date = new Date(ts);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (ts: string) => {
    const date = new Date(ts);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return date.toLocaleDateString();
  };

  function handleSend(text: string, mentions: string[]) {
    sendMessage(roomId, text, mentions);
    tick().then(scrollToBottom);
  }

  function scrollToBottom() {
    if (chatContainer) {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
  }

  onMount(async () => {
    // Ensure room exists for this order
    await ensureRoom({ id: roomId, name: `Order: ${orderTitle || orderId}` });
    await loadMessages(roomId);
    tick().then(scrollToBottom);
  });

  // Group messages by date
  $: groupedMessages = orderMessages.reduce((groups, msg) => {
    const date = formatDate(msg.ts);
    if (!groups[date]) groups[date] = [];
    groups[date].push(msg);
    return groups;
  }, {} as Record<string, Message[]>);
</script>

<div class="order-chat">
  <header class="chat-header">
    <MessageSquare size={18} />
    <h3>{$t('chat.order_discussion', { default: 'Order Discussion' })}</h3>
    <span class="message-count">{orderMessages.length} messages</span>
  </header>

  <div class="chat-messages" bind:this={chatContainer}>
    {#if orderMessages.length === 0}
      <div class="empty-chat">
        <MessageSquare size={32} />
        <p>{$t('chat.no_messages', { default: 'No messages yet. Start a conversation!' })}</p>
      </div>
    {:else}
      {#each Object.entries(groupedMessages) as [date, msgs]}
        <div class="date-divider">
          <span>{date}</span>
        </div>
        {#each msgs as msg (msg.id)}
          <div 
            class="message" 
            class:is-own={$currentUser && String($currentUser.id) === msg.authorId}
            class:is-system={msg.variant === 'system'}
          >
            {#if msg.variant === 'system'}
              <div class="system-message">
                <span class="system-icon">ℹ️</span>
                <span class="system-text">{msg.text}</span>
                <span class="timestamp">{formatTime(msg.ts)}</span>
              </div>
            {:else}
              <div class="message-header">
                <span class="author">{nameFromId(msg.authorId)}</span>
                <span class="timestamp">{formatTime(msg.ts)}</span>
              </div>
              <div class="message-body">
                {msg.text}
              </div>
              {#if msg.mentions && msg.mentions.length > 0}
                <div class="mentions">
                  {#each msg.mentions as mentionId}
                    <span class="mention-tag">@{nameFromId(mentionId)}</span>
                  {/each}
                </div>
              {/if}
            {/if}
          </div>
        {/each}
      {/each}
    {/if}
  </div>

  <div class="chat-input">
    <MentionInput 
      placeholder={$t('chat.type_message', { default: 'Type a message... (use @name to mention)' })}
      onCommit={handleSend}
    />
  </div>
</div>

<style>
  .order-chat {
    display: flex;
    flex-direction: column;
    height: 500px;
    background: var(--bg-1);
    border-radius: var(--radius-md, 8px);
    border: 1px solid var(--border);
    overflow: hidden;
  }

  .chat-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    background: var(--bg-2);
    border-bottom: 1px solid var(--border);
  }

  .chat-header h3 {
    margin: 0;
    font-size: 1rem;
    flex: 1;
  }

  .message-count {
    font-size: 0.8rem;
    color: var(--muted);
  }

  .chat-messages {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .empty-chat {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--muted);
    gap: 12px;
  }

  .date-divider {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 8px 0;
  }

  .date-divider span {
    font-size: 0.75rem;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    background: var(--bg-1);
    padding: 4px 12px;
    border-radius: 999px;
    border: 1px solid var(--border);
  }

  .message {
    max-width: 80%;
    padding: 10px 14px;
    border-radius: 12px;
    background: var(--bg-2);
    align-self: flex-start;
  }

  .message.is-own {
    background: color-mix(in oklab, var(--accent-1) 15%, var(--bg-2));
    align-self: flex-end;
  }

  .message.is-system {
    max-width: 100%;
    align-self: center;
    background: transparent;
    padding: 4px;
  }

  .system-message {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.85rem;
    color: var(--muted);
  }

  .system-icon {
    font-size: 1rem;
  }

  .system-text {
    flex: 1;
  }

  .message-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }

  .author {
    font-weight: 600;
    font-size: 0.85rem;
  }

  .timestamp {
    font-size: 0.7rem;
    color: var(--muted);
  }

  .message-body {
    font-size: 0.95rem;
    line-height: 1.4;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .mentions {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 6px;
  }

  .mention-tag {
    font-size: 0.75rem;
    padding: 2px 6px;
    border-radius: 4px;
    background: color-mix(in oklab, var(--accent-2) 20%, transparent);
    color: var(--accent-2);
  }

  .chat-input {
    padding: 12px;
    border-top: 1px solid var(--border);
    background: var(--bg-2);
  }
</style>
