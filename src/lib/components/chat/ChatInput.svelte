<!-- src/lib/components/chat/ChatInput.svelte -->
<script lang="ts">
    import { onDestroy } from "svelte";
    import { t } from "svelte-i18n";
    import Button from "$lib/components/ui/Button.svelte";

    let {
        placeholder,
        disabled = false,
        replyingTo = null,
        ontyping,
        onsend,
        oncancelReply,
        onfileSelect,
    }: {
        placeholder?: string;
        disabled?: boolean;
        replyingTo?: { id: string; username: string; message: string } | null;
        ontyping?: (typing: boolean) => void;
        onsend?: (data: {
            message: string;
            replyTo: string | undefined;
        }) => void | boolean | Promise<void | boolean>;
        oncancelReply?: () => void;
        onfileSelect?: (files: File[]) => void;
    } = $props();

    let message = $state("");
    let sending = $state(false);
    let textareaElement: HTMLTextAreaElement;
    let fileInput: HTMLInputElement;
    let isTyping = false;
    let typingTimeout: ReturnType<typeof setTimeout> | undefined;
    let typingCallback: typeof ontyping;
    let destroyed = false;

    function stopTyping() {
        clearTimeout(typingTimeout);
        if (isTyping) typingCallback?.(false);
        isTyping = false;
        typingCallback = undefined;
    }

    function handleInput() {
        if (textareaElement) {
            textareaElement.style.height = "auto";
            textareaElement.style.height = textareaElement.scrollHeight + "px";
        }
        if (!isTyping) {
            isTyping = true;
            typingCallback = ontyping;
            typingCallback?.(true);
        }
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(stopTyping, 1000);
    }

    function handleKeydown(event: KeyboardEvent) {
        if (event.isComposing || event.keyCode === 229) return;
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            void sendMessage();
        }
    }

    async function sendMessage() {
        const trimmed = message.trim();
        if (!trimmed || disabled || sending || !onsend) return;
        const sentReplyId = replyingTo?.id;
        sending = true;
        stopTyping();
        try {
            const confirmed = await onsend({ message: trimmed, replyTo: sentReplyId });
            if (destroyed || confirmed === false) return;
            message = "";
            if (textareaElement) textareaElement.style.height = "auto";
            if (replyingTo?.id === sentReplyId) cancelReply();
        } catch {
            // Keep the draft available for retry. The request owner reports failures.
        } finally {
            if (!destroyed) sending = false;
        }
    }

    onDestroy(() => {
        destroyed = true;
        clearTimeout(typingTimeout);
    });

    function cancelReply() {
        oncancelReply?.();
    }

    function handleFileSelect(event: Event) {
        const input = event.target as HTMLInputElement;
        const files = input.files;
        if (!disabled && !sending && files && files.length > 0) {
            onfileSelect?.(Array.from(files));
        }
        input.value = "";
    }
</script>

<div class="chat-input-container">
    {#if replyingTo}
        <div class="reply-preview">
            <div class="reply-content">
                <span class="reply-label"
                    >{$t('chat.composer.replying_to', { values: { name: replyingTo.username } })}</span
                >
                <p class="reply-message">
                    {replyingTo.message.substring(0, 100)}{replyingTo.message
                        .length > 100
                        ? "..."
                        : ""}
                </p>
            </div>
            <button
                type="button"
                class="reply-cancel"
                onclick={cancelReply}
                aria-label={$t('chat.composer.cancel_reply')}
            >
                ✕
            </button>
        </div>
    {/if}

    <div class="input-wrapper">
        <input bind:this={fileInput} type="file" multiple disabled={disabled || sending} onchange={handleFileSelect} hidden />
        <button type="button" class="file-button" title={$t('chat.composer.attach_file')} aria-label={$t('chat.composer.attach_file')}
            disabled={disabled || sending || !onfileSelect} onclick={() => fileInput?.click()}>
            📎
        </button>

        <textarea
            bind:this={textareaElement}
            bind:value={message}
            oninput={handleInput}
            onkeydown={handleKeydown}
            placeholder={placeholder ?? $t('chat.type_message')}
            disabled={disabled || sending}
            class="message-input"
            rows="1"
            aria-label={$t('chat.composer.message_input')}
        ></textarea>

        <Button
            variant="primary"
            size="sm"
            disabled={!message.trim() || disabled || sending || !onsend}
            onclick={sendMessage}
            icon="📤"
            iconPosition="right"
        >
            {$t('chat.composer.send')}
        </Button>
    </div>
</div>

<style>
    .chat-input-container {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        padding: 1rem;
        background: var(--bg-1);
        border-top: 1px solid var(--color-border, var(--border));
    }

    .reply-preview {
        display: flex;
        justify-content: space-between;
        gap: 1rem;
        padding: 0.75rem;
        background: var(--color-gray-50, var(--bg-2));
        border-left: 3px solid var(--color-primary, var(--brand));
        border-radius: 0.375rem;
    }

    .reply-content {
        flex: 1;
        min-width: 0;
    }

    .reply-label {
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--color-primary, var(--brand));
        display: block;
        margin-bottom: 0.25rem;
    }

    .reply-message {
        font-size: 0.875rem;
        color: var(--color-gray-600, var(--ink-tertiary));
        margin: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .reply-cancel {
        background: none;
        border: none;
        color: var(--color-gray-400, var(--muted));
        cursor: pointer;
        font-size: 1.25rem;
        padding: 0;
        width: 1.5rem;
        height: 1.5rem;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 0.25rem;
        transition: background var(--motion-sm) var(--ease-standard), color var(--motion-sm) var(--ease-standard);
        flex-shrink: 0;
    }

    .reply-cancel:hover {
        background-color: var(--color-gray-200, var(--border));
        color: var(--color-gray-700, var(--ink-secondary));
    }

    .input-wrapper {
        display: flex;
        align-items: flex-end;
        gap: 0.75rem;
    }

    .file-button {
        background: none;
        border: 1px solid var(--color-border, var(--border));
        padding: 0.625rem;
        border-radius: 0.375rem;
        cursor: pointer;
        font-size: 1.25rem;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background var(--motion-sm) var(--ease-standard), color var(--motion-sm) var(--ease-standard);
        flex-shrink: 0;
    }

    .file-button:disabled { opacity: 0.5; cursor: not-allowed; }

    .file-button:hover:not(:disabled) {
        background-color: var(--color-gray-50, var(--bg-2));
        border-color: var(--color-gray-300, var(--border));
    }

    .message-input {
        flex: 1;
        padding: 0.625rem 0.75rem;
        border: 1px solid var(--color-border, var(--border));
        border-radius: 0.375rem;
        font-family: inherit;
        font-size: 1rem;
        line-height: 1.5;
        resize: none;
        max-height: 150px;
        overflow-y: auto;
        transition: border-color 0.15s ease;
    }

    .message-input:focus {
        outline: none;
        border-color: var(--color-primary, var(--brand));
        box-shadow: 0 0 0 3px color-mix(in oklab, var(--link) 10%, transparent);
    }

    .message-input:disabled {
        background-color: var(--color-gray-100, var(--bg-2));
        cursor: not-allowed;
    }

    @media (max-width: 640px) {
        .input-wrapper {
            gap: 0.5rem;
        }

        .file-button {
            padding: 0.5rem;
        }
    }
</style>
