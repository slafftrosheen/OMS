<!-- src/lib/components/chat/ChatMessage.svelte -->
<script lang="ts">
    import { currentProfile } from '$lib/stores/auth';

    interface MessageType {
        id: string;
        userId: string;
        username: string;
        message: string;
        timestamp: Date;
        edited?: boolean;
        replyTo?: string;
        attachments?: string[];
    }

    let {
        message,
        isOwn = false,
        onreply,
        ondelete,
        onedit
    }: {
        message: MessageType;
        isOwn?: boolean;
        onreply?: (msg: MessageType) => void;
        ondelete?: (id: string) => void;
        onedit?: (data: { id: string; message: string }) => void;
    } = $props();

    let showActions = false;
    let isEditing = false;
    let editedText = message.message;

    function formatTime(date: Date): string {
        return new Intl.DateTimeFormat('en', {
            hour: '2-digit',
            minute: '2-digit'
        }).format(date);
    }

    function formatDate(date: Date): string {
        const today = new Date();
        const messageDate = new Date(date);
        
        if (messageDate.toDateString() === today.toDateString()) {
            return 'Today';
        }
        
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        if (messageDate.toDateString() === yesterday.toDateString()) {
            return 'Yesterday';
        }
        
        return messageDate.toLocaleDateString();
    }

    function handleReply() {
        onreply?.(message);
    }

    function handleEdit() {
        isEditing = true;
    }

    function handleDelete() {
        ondelete?.(message.id);
    }

    function saveEdit() {
        if (editedText.trim() && editedText !== message.message) {
            onedit?.({ id: message.id, message: editedText });
        }
        isEditing = false;
    }

    function cancelEdit() {
        editedText = message.message;
        isEditing = false;
    }

    function handleKeydown(event: KeyboardEvent) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            saveEdit();
        } else if (event.key === 'Escape') {
            cancelEdit();
        }
    }
</script>

<div
    class="chat-message"
    class:own={isOwn}
    onmouseenter={() => showActions = true}
    onmouseleave={() => showActions = false}
>
    {#if !isOwn}
        <div class="avatar">
            {message.username.charAt(0).toUpperCase()}
        </div>
    {/if}

    <div class="message-content">
        {#if !isOwn}
            <div class="message-header">
                <span class="username">{message.username}</span>
                <span class="timestamp">{formatTime(message.timestamp)}</span>
            </div>
        {/if}

        <div class="message-bubble">
            {#if isEditing}
                <textarea
                    bind:value={editedText}
                    onkeydown={handleKeydown}
                    class="edit-textarea"
                    rows="3"
                    autofocus
></textarea>
                <div class="edit-actions">
                    <button class="edit-btn save" onclick={saveEdit}>Save</button>
                    <button class="edit-btn cancel" onclick={cancelEdit}>Cancel</button>
                </div>
            {:else}
                <p class="message-text">{message.message}</p>
                
                {#if message.attachments && message.attachments.length > 0}
                    <div class="attachments">
                        {#each message.attachments as attachment}
                            <a href={attachment} class="attachment-link" target="_blank" rel="noopener noreferrer">
                                📎 {attachment.split('/').pop()}
                            </a>
                        {/each}
                    </div>
                {/if}

                {#if message.edited}
                    <span class="edited-indicator">(edited)</span>
                {/if}
            {/if}
        </div>

        {#if isOwn}
            <div class="message-footer">
                <span class="timestamp">{formatTime(message.timestamp)}</span>
            </div>
        {/if}

        {#if showActions && !isEditing}
            <div class="message-actions">
                <button class="action-btn" onclick={handleReply} title="Reply">
                    💬
                </button>
                {#if isOwn}
                    <button class="action-btn" onclick={handleEdit} title="Edit">
                        ✏️
                    </button>
                    <button class="action-btn danger" onclick={handleDelete} title="Delete">
                        🗑️
                    </button>
                {/if}
            </div>
        {/if}
    </div>
</div>

<style>
    .chat-message {
        display: flex;
        gap: 0.75rem;
        margin-bottom: 1rem;
        position: relative;
    }

    .chat-message.own {
        flex-direction: row-reverse;
    }

    .avatar {
        width: 2.5rem;
        height: 2.5rem;
        border-radius: 50%;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 600;
        font-size: 1rem;
        flex-shrink: 0;
    }

    .message-content {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        max-width: 70%;
        position: relative;
    }

    .own .message-content {
        align-items: flex-end;
    }

    .message-header {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0 0.75rem;
    }

    .username {
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--color-gray-700, #374151);
    }

    .timestamp {
        font-size: 0.75rem;
        color: var(--color-gray-500, #9ca3af);
    }

    .message-bubble {
        background: var(--color-gray-100, #f3f4f6);
        padding: 0.75rem 1rem;
        border-radius: 1rem;
        position: relative;
    }

    .own .message-bubble {
        background: var(--color-primary, #0066cc);
        color: white;
    }

    .message-text {
        margin: 0;
        line-height: 1.5;
        word-wrap: break-word;
        white-space: pre-wrap;
    }

    .attachments {
        margin-top: 0.5rem;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }

    .attachment-link {
        font-size: 0.875rem;
        color: inherit;
        text-decoration: underline;
    }

    .own .attachment-link {
        color: white;
    }

    .edited-indicator {
        font-size: 0.75rem;
        opacity: 0.7;
        margin-left: 0.5rem;
    }

    .message-footer {
        padding: 0 0.75rem;
    }

    .edit-textarea {
        width: 100%;
        padding: 0.5rem;
        border: 1px solid var(--color-border, #d1d5db);
        border-radius: 0.375rem;
        font-family: inherit;
        font-size: 1rem;
        resize: vertical;
    }

    .edit-actions {
        display: flex;
        gap: 0.5rem;
        margin-top: 0.5rem;
    }

    .edit-btn {
        padding: 0.375rem 0.75rem;
        border: none;
        border-radius: 0.25rem;
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s ease;
    }

    .edit-btn.save {
        background: var(--color-primary, #0066cc);
        color: white;
    }

    .edit-btn.cancel {
        background: var(--color-gray-200, #e5e7eb);
        color: var(--color-gray-700, #374151);
    }

    .message-actions {
        position: absolute;
        top: -2rem;
        right: 0;
        background: white;
        border: 1px solid var(--color-border, #e5e7eb);
        border-radius: 0.375rem;
        padding: 0.25rem;
        display: flex;
        gap: 0.25rem;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    }

    .own .message-actions {
        left: 0;
        right: auto;
    }

    .action-btn {
        background: none;
        border: none;
        padding: 0.375rem;
        cursor: pointer;
        font-size: 1rem;
        border-radius: 0.25rem;
        transition: background-color 0.15s ease;
    }

    .action-btn:hover {
        background-color: var(--color-gray-100, #f3f4f6);
    }

    .action-btn.danger:hover {
        background-color: #fee2e2;
    }

    @media (max-width: 640px) {
        .message-content {
            max-width: 85%;
        }
    }
</style>