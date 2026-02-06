<!-- @migration-task Error while migrating Svelte code: Can't migrate code with afterUpdate. Please migrate by hand. -->
<!-- src/lib/components/chat/ChatContainer.svelte -->
<script lang="ts">
    import { onMount, afterUpdate } from 'svelte';
    import { currentProfile } from '$lib/stores/auth';
    import ChatMessage from './ChatMessage.svelte';
    import ChatInput from './ChatInput.svelte';

    export let orderId: string;
    export let messages: Array<{
        id: string;
        userId: string;
        username: string;
        message: string;
        timestamp: Date;
        edited?: boolean;
        replyTo?: string;
        attachments?: string[];
    }> = [];
    export let typingUsers: string[] = [];

    let messagesContainer: HTMLDivElement;
    let replyingTo: { id: string; username: string; message: string } | null = null;
    let shouldScrollToBottom = true;

    async function loadMessages() {
        try {
            const response = await fetch(`/api/chat/messages?orderId=${orderId}`);
            const data = await response.json();
            
            if (data.success) {
                messages = data.messages.map((m: any) => ({
                    ...m,
                    timestamp: new Date(m.timestamp)
                }));
            }
        } catch (error) {
            console.error('Failed to load messages:', error);
        }
    }

    async function sendMessage(event: CustomEvent) {
        const { message, replyTo } = event.detail;

        try {
            const response = await fetch('/api/chat/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orderId,
                    message,
                    replyTo
                })
            });

            const data = await response.json();
            
            if (data.success) {
                messages = [...messages, {
                    ...data.message,
                    timestamp: new Date(data.message.timestamp)
                }];
                shouldScrollToBottom = true;
            }
        } catch (error) {
            console.error('Failed to send message:', error);
        }
    }

    async function editMessage(event: CustomEvent) {
        const { id, message } = event.detail;

        try {
            const response = await fetch(`/api/chat/messages/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message })
            });

            if (response.ok) {
                messages = messages.map(m =>
                    m.id === id ? { ...m, message, edited: true } : m
                );
            }
        } catch (error) {
            console.error('Failed to edit message:', error);
        }
    }

    async function deleteMessage(event: CustomEvent) {
        const messageId = event.detail;

        if (!confirm('Are you sure you want to delete this message?')) return;

        try {
            const response = await fetch(`/api/chat/messages/${messageId}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                messages = messages.filter(m => m.id !== messageId);
            }
        } catch (error) {
            console.error('Failed to delete message:', error);
        }
    }

    function handleReply(event: CustomEvent) {
        const message = event.detail;
        replyingTo = {
            id: message.id,
            username: message.username,
            message: message.message
        };
    }

    function handleTyping(event: CustomEvent) {
        const isTyping = event.detail;
        // Send typing indicator to server via WebSocket
        console.log('User typing:', isTyping);
    }

    function handleScroll() {
        if (!messagesContainer) return;
        
        const { scrollTop, scrollHeight, clientHeight } = messagesContainer;
        const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
        
        shouldScrollToBottom = isNearBottom;
    }

    function scrollToBottom() {
        if (messagesContainer && shouldScrollToBottom) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    }

    onMount(() => {
        loadMessages();
    });

    afterUpdate(() => {
        scrollToBottom();
    });
</script>

<div class="chat-container">
    <div class="chat-header">
        <h3 class="chat-title">Order Discussion</h3>
        {#if messages.length > 0}
            <span class="message-count">{messages.length} message{messages.length !== 1 ? 's' : ''}</span>
        {/if}
    </div>

    <div
        bind:this={messagesContainer}
        class="messages-container"
        on:scroll={handleScroll}
    >
        {#if messages.length === 0}
            <div class="empty-state">
                <p class="empty-message">No messages yet</p>
                <p class="empty-hint">Start the conversation below</p>
            </div>
        {:else}
            {#each messages as message (message.id)}
                <ChatMessage
                    {message}
                    isOwn={message.userId === $currentProfile?.id}
                    on:reply={handleReply}
                    on:edit={editMessage}
                    on:delete={deleteMessage}
                />
            {/each}

            {#if typingUsers.length > 0}
                <div class="typing-indicator">
                    <div class="typing-dots">
                        <span></span>
                        <span></span>
                        <span></span>
                    </div>
                    <span class="typing-text">
                        {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
                    </span>
                </div>
            {/if}
        {/if}
    </div>

    <ChatInput
        {replyingTo}
        on:send={sendMessage}
        on:typing={handleTyping}
        on:cancelReply={() => replyingTo = null}
    />
</div>

<style>
    .chat-container {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: white;
        border-radius: 0.5rem;
        border: 1px solid var(--color-border, #e5e7eb);
        overflow: hidden;
    }

    .chat-header {
        padding: 1rem;
        border-bottom: 1px solid var(--color-border, #e5e7eb);
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: var(--color-gray-50, #f9fafb);
    }

    .chat-title {
        font-size: 1.125rem;
        font-weight: 600;
        margin: 0;
        color: var(--color-text, #111827);
    }

    .message-count {
        font-size: 0.875rem;
        color: var(--color-gray-600, #6b7280);
    }

    .messages-container {
        flex: 1;
        overflow-y: auto;
        padding: 1rem;
        scroll-behavior: smooth;
    }

    .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        padding: 2rem;
        text-align: center;
    }

    .empty-message {
        font-size: 1.125rem;
        color: var(--color-gray-600, #6b7280);
        margin: 0 0 0.5rem 0;
    }

    .empty-hint {
        font-size: 0.875rem;
        color: var(--color-gray-500, #9ca3af);
        margin: 0;
    }

    .typing-indicator {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem 0;
        margin-left: 3.25rem;
    }

    .typing-dots {
        display: flex;
        gap: 0.25rem;
    }

    .typing-dots span {
        width: 0.5rem;
        height: 0.5rem;
        background: var(--color-gray-400, #9ca3af);
        border-radius: 50%;
        animation: typing 1.4s infinite;
    }

    .typing-dots span:nth-child(2) {
        animation-delay: 0.2s;
    }

    .typing-dots span:nth-child(3) {
        animation-delay: 0.4s;
    }

    @keyframes typing {
        0%, 60%, 100% {
            transform: translateY(0);
            opacity: 0.7;
        }
        30% {
            transform: translateY(-0.5rem);
            opacity: 1;
        }
    }

    .typing-text {
        font-size: 0.875rem;
        color: var(--color-gray-600, #6b7280);
        font-style: italic;
    }

    /* Custom scrollbar */
    .messages-container::-webkit-scrollbar {
        width: 0.5rem;
    }

    .messages-container::-webkit-scrollbar-track {
        background: var(--color-gray-100, #f3f4f6);
    }

    .messages-container::-webkit-scrollbar-thumb {
        background: var(--color-gray-400, #9ca3af);
        border-radius: 0.25rem;
    }

    .messages-container::-webkit-scrollbar-thumb:hover {
        background: var(--color-gray-500, #6b7280);
    }
</style>