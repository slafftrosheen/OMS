<!-- src/lib/components/chat/ChatMessage.svelte -->
<script lang="ts">
    import { tick, untrack } from 'svelte';
    import { locale, t } from 'svelte-i18n';
    import Icon from '$lib/ui/Icon.svelte';

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
        onedit?: (data: { id: string; message: string }) => void | boolean | Promise<void | boolean>;
    } = $props();

    let editingId = $state<string | null>(null);
    let isEditing = $derived(editingId === message.id && isOwn);
    let editedText = $state('');
    let saving = $state(false);
    let editGeneration = 0;
    let editButton = $state<HTMLButtonElement>();
    let editor = $state<HTMLTextAreaElement>();

    $effect.pre(() => {
        const id = message.id;
        const own = isOwn;
        untrack(() => {
            if (editingId && (editingId !== id || !own)) {
                editingId = null;
                editedText = '';
                saving = false;
                editGeneration++;
            }
        });
    });

    function formatTime(date: Date): string {
        return new Intl.DateTimeFormat($locale || 'en', { hour: '2-digit', minute: '2-digit' }).format(date);
    }

    function handleReply() {
        onreply?.(message);
    }

    async function handleEdit() {
        if (!isOwn) return;
        const id = message.id;
        editGeneration++;
        saving = false;
        editedText = message.message;
        editingId = id;
        await tick();
        if (editingId === id && message.id === id && editor?.isConnected) editor.focus();
    }

    async function finishEdit() {
        const id = editingId;
        editingId = null;
        await tick();
        if (message.id === id && editButton?.isConnected) editButton.focus();
    }

    function handleDelete() {
        ondelete?.(message.id);
    }

    async function saveEdit() {
        if (!isEditing || saving || !editedText.trim()) return;
        const id = message.id;
        const generation = editGeneration;
        saving = true;
        try {
            const confirmed = editedText === message.message ? true : await onedit?.({ id, message: editedText });
            if (confirmed !== false && editingId === id && message.id === id && generation === editGeneration) void finishEdit();
        } catch {
            // The request owner reports failures; retain this draft for retry.
        } finally {
            if (generation === editGeneration) saving = false;
        }
    }

    function cancelEdit() {
        editGeneration++;
        saving = false;
        editedText = message.message;
        void finishEdit();
    }

    function handleKeydown(event: KeyboardEvent) {
        if (event.isComposing || event.keyCode === 229) return;
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            saveEdit();
        } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            cancelEdit();
        }
    }
</script>

<div
    class="chat-message"
    class:own={isOwn}
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
                    disabled={saving}
                    onkeydown={handleKeydown}
                    class="edit-textarea"
                    rows="3"
                    bind:this={editor}
                    aria-label={$t('chat.composer.edit_message')}
></textarea>
                <div class="edit-actions">
                    <button type="button" class="edit-btn save" onclick={saveEdit} disabled={saving || !editedText.trim()}>{$t('common.save')}</button>
                    <button type="button" class="edit-btn cancel" onclick={cancelEdit}>{$t('common.cancel')}</button>
                </div>
            {:else}
                <p class="message-text">{message.message}</p>
                
                {#if message.attachments && message.attachments.length > 0}
                    <div class="attachments">
                        {#each message.attachments as attachment}
                            <a href={attachment} class="attachment-link" target="_blank" rel="noopener noreferrer">
                                <Icon name="paperclip" size="xs" /> {attachment.split('/').pop()}
                            </a>
                        {/each}
                    </div>
                {/if}

                {#if message.edited}
                    <span class="edited-indicator">({$t('chat.composer.edited')})</span>
                {/if}
            {/if}
        </div>

        {#if isOwn}
            <div class="message-footer">
                <span class="timestamp">{formatTime(message.timestamp)}</span>
            </div>
        {/if}

        {#if !isEditing}
            <div class="message-actions">
                <button type="button" class="action-btn" onclick={handleReply} aria-label={$t('chat.composer.reply')} title={$t('chat.composer.reply')}>
                    <Icon name="reply" size="sm" />
                </button>
                {#if isOwn}
                    <button type="button" bind:this={editButton} class="action-btn" onclick={handleEdit} aria-label={$t('common.edit')} title={$t('common.edit')}>
                        <Icon name="edit" size="sm" />
                    </button>
                    <button type="button" class="action-btn danger" onclick={handleDelete} aria-label={$t('common.delete')} title={$t('common.delete')}>
                        <Icon name="trash-2" size="sm" />
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
        background: linear-gradient(135deg, var(--brand) 0%, color-mix(in oklab, var(--brand) 75%, black) 100%);
        color: var(--bg-0);
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
        color: var(--color-gray-700, var(--ink-secondary));
    }

    .timestamp {
        font-size: 0.75rem;
        color: var(--color-gray-500, var(--muted));
    }

    .message-bubble {
        background: var(--color-gray-100, var(--bg-2));
        padding: 0.75rem 1rem;
        border-radius: 1rem;
        position: relative;
    }

    .own .message-bubble {
        background: var(--color-primary, var(--brand));
        color: var(--bg-0);
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
        color: var(--bg-0);
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
        border: 1px solid var(--color-border, var(--border));
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
        transition: background var(--motion-sm) var(--ease-standard), color var(--motion-sm) var(--ease-standard);
    }

    .edit-btn.save {
        background: var(--color-primary, var(--brand));
        color: var(--bg-0);
    }

    .edit-btn.cancel {
        background: var(--color-gray-200, var(--border));
        color: var(--color-gray-700, var(--ink-secondary));
    }

    .message-actions {
        opacity: 0;
        pointer-events: none;
        position: absolute;
        top: -2rem;
        right: 0;
        background: var(--bg-1);
        border: 1px solid var(--color-border, var(--border));
        border-radius: 0.375rem;
        padding: 0.25rem;
        display: flex;
        gap: 0.25rem;
        box-shadow: 0 4px 6px -1px color-mix(in oklab, var(--bg-0) 10%, transparent);
    }

    .chat-message:hover .message-actions,
    .chat-message:focus-within .message-actions { opacity: 1; pointer-events: auto; }

    @media (hover: none) { .message-actions { position: static; opacity: 1; pointer-events: auto; } }

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
        background-color: var(--color-gray-100, var(--bg-2));
    }

    .action-btn.danger:hover {
        background-color: var(--error-soft);
    }

    @media (max-width: 640px) {
        .message-content {
            max-width: 85%;
        }
    }
</style>