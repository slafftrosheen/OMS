<!-- src/lib/components/chat/ChatInput.svelte -->
<script lang="ts">
    import Button from "$lib/components/ui/Button.svelte";

    let {
        placeholder = "Type a message...",
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
        }) => void;
        oncancelReply?: () => void;
        onfileSelect?: (files: File[]) => void;
    } = $props();

    let message = "";
    let textareaElement: HTMLTextAreaElement;
    let isTyping = false;
    let typingTimeout: number;

    function handleInput() {
        // Auto-resize textarea
        if (textareaElement) {
            textareaElement.style.height = "auto";
            textareaElement.style.height = textareaElement.scrollHeight + "px";
        }

        // Typing indicator
        if (!isTyping) {
            isTyping = true;
            ontyping?.(true);
        }

        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            isTyping = false;
            ontyping?.(false);
        }, 1000) as unknown as number;
    }

    function handleKeydown(event: KeyboardEvent) {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            sendMessage();
        }
    }

    function sendMessage() {
        const trimmed = message.trim();
        if (!trimmed || disabled) return;

        onsend?.({
            message: trimmed,
            replyTo: replyingTo?.id,
        });

        message = "";
        if (textareaElement) {
            textareaElement.style.height = "auto";
        }
        cancelReply();
    }

    function cancelReply() {
        oncancelReply?.();
    }

    function handleFileSelect(event: Event) {
        const input = event.target as HTMLInputElement;
        const files = input.files;
        if (files && files.length > 0) {
            onfileSelect?.(Array.from(files));
        }
    }
</script>

<div class="chat-input-container">
    {#if replyingTo}
        <div class="reply-preview">
            <div class="reply-content">
                <span class="reply-label"
                    >Replying to {replyingTo.username}</span
                >
                <p class="reply-message">
                    {replyingTo.message.substring(0, 100)}{replyingTo.message
                        .length > 100
                        ? "..."
                        : ""}
                </p>
            </div>
            <button
                class="reply-cancel"
                onclick={cancelReply}
                aria-label="Cancel reply"
            >
                ✕
            </button>
        </div>
    {/if}

    <div class="input-wrapper">
        <label for="file-input" class="file-button" title="Attach file">
            <input
                id="file-input"
                type="file"
                multiple
                onchange={handleFileSelect}
                style="display: none;"
            />
            📎
        </label>

        <textarea
            bind:this={textareaElement}
            bind:value={message}
            oninput={handleInput}
            onkeydown={handleKeydown}
            {placeholder}
            {disabled}
            class="message-input"
            rows="1"
            aria-label="Message input"
        ></textarea>

        <Button
            variant="primary"
            size="sm"
            disabled={!message.trim() || disabled}
            onclick={sendMessage}
            icon="📤"
            iconPosition="right"
        >
            Send
        </Button>
    </div>
</div>

<style>
    .chat-input-container {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        padding: 1rem;
        background: white;
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

    .file-button:hover {
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
