<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { currentUser } from "$lib/auth/authState.svelte";
    import { realtimeService } from "$lib/realtime/realtime-service";
    import { notifications } from "$lib/notify/store";
    import { t } from "svelte-i18n";
    import Modal from "$lib/components/ui/Modal.svelte";
    import Button from "$lib/components/ui/Button.svelte";
    import ChatMessage from "./ChatMessage.svelte";
    import ChatInput from "./ChatInput.svelte";

    let {
        orderId,
        messages = $bindable([]),
        typingUsers = [],
    }: {
        orderId: string;
        messages?: Array<{
            id: string;
            userId: string;
            username: string;
            message: string;
            timestamp: Date;
            edited?: boolean;
            replyTo?: string;
            attachments?: string[];
        }>;
        typingUsers?: string[];
    } = $props();

    let messagesContainer: HTMLDivElement;
    let replyingTo: { id: string; username: string; message: string } | null =
        $state(null);
    let shouldScrollToBottom = $state(true);

    async function loadMessages() {
        try {
            const response = await fetch(
                `/api/chat/messages?orderId=${orderId}`,
            );
            const data = await response.json();

            if (data.success) {
                messages = data.messages.map((m: any) => ({
                    ...m,
                    timestamp: new Date(m.timestamp),
                }));
            }
        } catch (error) {
            console.error("Failed to load messages:", error);
        }
    }

    async function sendMessage(data: { message: string; replyTo?: string | null }) {
        const { message, replyTo } = data;

        try {
            const response = await fetch("/api/chat/messages", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    orderId,
                    message,
                    replyTo,
                }),
            });

            const data = await response.json();

            if (data.success) {
                messages = [
                    ...messages,
                    {
                        ...data.message,
                        timestamp: new Date(data.message.timestamp),
                    },
                ];
                shouldScrollToBottom = true;
            }
        } catch (error) {
            console.error("Failed to send message:", error);
        }
    }

    async function editMessage(data: { id: string; message: string }) {
        const { id, message } = data;

        try {
            const response = await fetch(`/api/chat/messages/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message }),
            });

            if (response.ok) {
                messages = messages.map((m) =>
                    m.id === id ? { ...m, message, edited: true } : m,
                );
            }
        } catch (error) {
            console.error("Failed to edit message:", error);
        }
    }

    let pendingDeleteId = $state<string | null>(null);
    let confirmDeleteOpen = $state(false);

    function deleteMessage(messageId: string) {
        pendingDeleteId = messageId;
        confirmDeleteOpen = true;
    }

    async function confirmDeleteMessage() {
        const id = pendingDeleteId;
        confirmDeleteOpen = false;
        pendingDeleteId = null;
        if (!id) return;
        try {
            const response = await fetch(`/api/chat/messages/${id}`, {
                method: "DELETE",
            });
            if (response.ok) {
                messages = messages.filter((m) => m.id !== id);
            } else {
                notifications.error(
                    $t("chat.delete_failed", { default: "Failed to delete message" })
                );
            }
        } catch (error) {
            console.error("Failed to delete message:", error);
            notifications.error(
                $t("chat.delete_failed", { default: "Failed to delete message" })
            );
        }
    }

    function handleReply(message: { id: string; username: string; message: string }) {
        replyingTo = {
            id: message.id,
            username: message.username,
            message: message.message,
        };
    }

    let typingThrottle: ReturnType<typeof setTimeout> | null = null;

    function handleTyping(isTyping: boolean) {
        const me = $currentUser;
        if (!me || !orderId) return;
        // Throttle typing broadcasts to once per second per user.
        if (typingThrottle && isTyping) return;
        typingThrottle = setTimeout(() => { typingThrottle = null; }, 1000);
        try {
            realtimeService.broadcast(
                `order:${orderId}:chat`,
                "typing",
                {
                    userId: me.id,
                    username: (me as any).profile?.full_name || me.email || "Someone",
                    isTyping,
                    ts: Date.now(),
                }
            );
        } catch (err) {
            // Realtime is best-effort — silently degrade if backend unavailable.
            console.warn("typing broadcast failed", err);
        }
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

    onDestroy(() => {
        if (typingThrottle) {
            clearTimeout(typingThrottle);
            typingThrottle = null;
        }
    });

    $effect(() => {
        // Track messages length to trigger scroll on new messages
        if (messages.length > 0) {
            scrollToBottom();
        }
    });
</script>

<div class="chat-container">
    <div class="chat-header">
        <h3 class="chat-title">Order Discussion</h3>
        {#if messages.length > 0}
            <span class="message-count"
                >{messages.length} message{messages.length !== 1
                    ? "s"
                    : ""}</span
            >
        {/if}
    </div>

    <div
        bind:this={messagesContainer}
        class="messages-container"
        onscroll={handleScroll}
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
                    isOwn={message.userId === $currentUser?.id}
                    onreply={handleReply}
                    onedit={editMessage}
                    ondelete={deleteMessage}
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
                        {typingUsers.join(", ")}
                        {typingUsers.length === 1 ? "is" : "are"} typing...
                    </span>
                </div>
            {/if}
        {/if}
    </div>

    <ChatInput
        {replyingTo}
        onsend={sendMessage}
        ontyping={handleTyping}
        oncancelReply={() => (replyingTo = null)}
    />
</div>

<Modal
    bind:open={confirmDeleteOpen}
    title={$t("chat.delete_title", { default: "Delete message" })}
    size="sm"
>
    <p>{$t("chat.delete_confirm", { default: "This message will be permanently removed from the conversation." })}</p>
    <div class="confirm-actions">
        <Button variant="outline" onclick={() => { confirmDeleteOpen = false; pendingDeleteId = null; }}>
            {$t("actions.cancel", { default: "Cancel" })}
        </Button>
        <Button variant="primary" onclick={confirmDeleteMessage}>
            {$t("actions.delete", { default: "Delete" })}
        </Button>
    </div>
</Modal>

<style>
    .chat-container {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: var(--bg-1);
        border-radius: var(--radius-md);
        border: 1px solid var(--border);
        overflow: hidden;
    }

    .chat-header {
        padding: var(--space-md);
        border-bottom: 1px solid var(--border);
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: var(--bg-2);
    }

    .chat-title {
        font-size: var(--text-lg);
        font-weight: 600;
        margin: 0;
        color: var(--ink-primary);
    }

    .message-count {
        font-size: var(--text-sm);
        color: var(--ink-tertiary);
    }

    .messages-container {
        flex: 1;
        overflow-y: auto;
        padding: var(--space-md);
        scroll-behavior: smooth;
    }

    .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        padding: var(--space-2xl);
        text-align: center;
    }

    .empty-message {
        font-size: var(--text-lg);
        color: var(--ink-tertiary);
        margin: 0 0 var(--space-sm) 0;
    }

    .empty-hint {
        font-size: var(--text-sm);
        color: var(--muted);
        margin: 0;
    }

    .confirm-actions {
        display: flex;
        gap: var(--space-md);
        justify-content: flex-end;
        margin-top: var(--space-lg);
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
        background: var(--color-gray-400, var(--muted));
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
        0%,
        60%,
        100% {
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
        color: var(--color-gray-600, var(--ink-tertiary));
        font-style: italic;
    }

    /* Custom scrollbar */
    .messages-container::-webkit-scrollbar {
        width: 0.5rem;
    }

    .messages-container::-webkit-scrollbar-track {
        background: var(--color-gray-100, var(--bg-2));
    }

    .messages-container::-webkit-scrollbar-thumb {
        background: var(--color-gray-400, var(--muted));
        border-radius: 0.25rem;
    }

    .messages-container::-webkit-scrollbar-thumb:hover {
        background: var(--color-gray-500, var(--ink-tertiary));
    }
</style>
