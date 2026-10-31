<script lang="ts">
    import { untrack } from "svelte";
    import { base } from "$app/paths";
    import { parseOrderChatMessage, reconcileOrderMessages, compareOrderChatPosition, orderRealtimePatch, resolveOrderAcknowledgement, type OrderChatMessage } from "./order-chat-state";
    import { currentUser } from "$lib/auth/authState.svelte";
    import { realtimeService } from "$lib/realtime/realtime-service";
    import { notifications } from "$lib/notify/store";
    import { t, locale } from "svelte-i18n";
    import Modal from "$lib/components/ui/Modal.svelte";
    import Button from "$lib/components/ui/Button.svelte";
    import ChatMessage from "./ChatMessage.svelte";
    import ChatInput from "./ChatInput.svelte";
    import type { VoiceDraft } from '$lib/chat/types';
    import { postVoiceMessage } from '$lib/chat/voice';
    import { voiceCopy } from '$lib/chat/voice-copy';
    import { supabase } from '$lib/supabase-client';
    import { env } from '$env/dynamic/public';
    import HistoryControl from '$lib/chat/HistoryControl.svelte';
    import { compareChatPosition, emptyConversationHistory, validHistoryPage } from '$lib/chat/history';

    let {
        orderId,
        messages = $bindable([]),
        typingUsers = [],
    }: {
        orderId: string;
        messages?: OrderChatMessage[];
        typingUsers?: string[];
    } = $props();

    let messagesContainer = $state<HTMLDivElement>();
    let replyingTo: { id: string; username: string; message: string } | null =
        $state(null);
    let shouldScrollToBottom = $state(true);

    interface Conversation {
        orderId: string;
        ownerId: string;
        controller: AbortController;
        changes: Map<string, OrderChatMessage | null>;
        changeRevisions: Map<string, number>;
        remotePatches: Map<string, Partial<OrderChatMessage>>;
        pendingWrites: Map<symbol, number>;
        revision: number;
        refreshing?: boolean;
        refreshAgain?: boolean;
        loadingOlder?: boolean;
    }
    let conversation: Conversation | null = null;
    let accountId = $derived($currentUser?.id ?? null);
    let pendingDeleteId = $state<string | null>(null);
    let confirmDeleteOpen = $state(false);
    let loading = $state(false);
    let loadFailed = $state(false);
    let history = $state(emptyConversationHistory());
    let chatCopy = $derived(voiceCopy($locale));

    function isCurrent(scope: Conversation | null): scope is Conversation {
        return !!scope && conversation === scope && !scope.controller.signal.aborted
            && orderId === scope.orderId && $currentUser?.id === scope.ownerId;
    }

    function requestSignal(scope: Conversation) {
        return AbortSignal.any([scope.controller.signal, AbortSignal.timeout(20000)]);
    }

    async function loadMessages(scope: Conversation) {
        const startedRevision = scope.revision;
        loading = true;
        loadFailed = false;
        try {
            const response = await fetch(`${base}/api/chat/messages?${new URLSearchParams({ orderId: scope.orderId })}`, { signal: requestSignal(scope) });
            const data = await response.json();
            if (!isCurrent(scope)) return;
            if (!response.ok || !validHistoryPage(data)) throw new Error('Messages unavailable');
            const confirmed = data.messages.map(parseOrderChatMessage);
            if (confirmed.some((message: OrderChatMessage | null) => !message)) throw new Error('Invalid message response');
            const rows = confirmed as OrderChatMessage[];
            const older = data.hasMore && rows[0] ? messages.filter(message => compareOrderChatPosition(message, rows[0]) < 0) : [];
            // Only local mutations confirmed after this read started may be newer
            // than its snapshot. Later authoritative reads can remove or edit them.
            const laterChanges = new Map([...scope.changes].filter(([id]) => (scope.changeRevisions.get(id) ?? 0) > startedRevision));
            messages = applyRemotePatches(scope, reconcileOrderMessages([...older, ...rows], laterChanges), startedRevision);
            const oldest = rows[0], newest = rows[rows.length - 1];
            const continuous = !!oldest && !!history.latestPosition && compareChatPosition(
                { id: oldest.id, ts: oldest.historyTimestamp ?? oldest.timestamp.toISOString() }, history.latestPosition) <= 0;
            const keepOlderCursor = !!data.hasMore && history.olderLoaded && continuous;
            history = { ...history, initialized: true, hasMore: keepOlderCursor ? history.hasMore : data.hasMore === true,
                cursor: keepOlderCursor ? history.cursor : data.nextCursor ?? null, olderLoaded: !!keepOlderCursor,
                latestPosition: newest ? { id: newest.id, ts: newest.historyTimestamp ?? newest.timestamp.toISOString() } : null };
            const discardThrough = Math.min(startedRevision, ...scope.pendingWrites.values());
            for (const [id, revision] of scope.changeRevisions) {
                if (revision <= discardThrough && !scope.loadingOlder) { scope.changeRevisions.delete(id); scope.changes.delete(id); scope.remotePatches.delete(id); }
            }
        } catch {
            if (isCurrent(scope)) loadFailed = true;
        } finally {
            if (isCurrent(scope)) loading = false;
        }
    }

    async function loadEarlier() {
        const scope = conversation, cursor = history.cursor;
        if (!isCurrent(scope) || scope.loadingOlder || !history.hasMore || !cursor) return;
        scope.loadingOlder = true;
        const startedRevision = scope.revision;
        history = { ...history, loadingOlder: true, olderFailed: false };
        shouldScrollToBottom = false;
        try {
            const query = new URLSearchParams({ orderId: scope.orderId, cursor });
            const response = await fetch(`${base}/api/chat/messages?${query}`, { signal: requestSignal(scope) });
            const data = await response.json();
            if (!isCurrent(scope)) return;
            if (history.cursor !== cursor) return;
            if (!response.ok || !validHistoryPage(data) || (data.hasMore && data.nextCursor === cursor)) throw new Error('Messages unavailable');
            const rows = data.messages.map(parseOrderChatMessage);
            if (rows.some(message => !message)) throw new Error('Invalid message response');
            const current = new Map(messages.map(message => [message.id, message]));
            for (const [id, change] of scope.changes) { if (change) current.set(id, change); }
            const merged = reconcileOrderMessages(rows as OrderChatMessage[], current);
            const laterChanges = new Map([...scope.changes].filter(([id]) => (scope.changeRevisions.get(id) ?? 0) > startedRevision));
            messages = applyRemotePatches(scope, reconcileOrderMessages(merged, laterChanges), startedRevision);
            history = { ...history, olderLoaded: true, hasMore: data.hasMore === true, cursor: data.nextCursor ?? null };
        } catch {
            if (isCurrent(scope)) history = { ...history, olderFailed: true };
        } finally {
            scope.loadingOlder = false;
            if (isCurrent(scope)) history = { ...history, loadingOlder: false };
        }
    }

    function rememberChange(scope: Conversation, id: string, message: OrderChatMessage | null) {
        scope.remotePatches.delete(id);
        scope.changes.set(id, message);
        scope.changeRevisions.set(id, ++scope.revision);
    }

    function beginMessageWrite(scope: Conversation) {
        const token = Symbol(), revision = scope.revision;
        scope.pendingWrites.set(token, revision);
        return { revision, finish() { scope.pendingWrites.delete(token); } };
    }

    function acceptAcknowledgement(scope: Conversation, confirmed: OrderChatMessage, startedRevision: number) {
        const current = resolveOrderAcknowledgement(confirmed, startedRevision, scope);
        rememberChange(scope, confirmed.id, current);
        messages = reconcileOrderMessages(messages, new Map([[confirmed.id, current]]));
    }

    function applyRemotePatches(scope: Conversation, rows: OrderChatMessage[], startedRevision: number) {
        return rows.map(message => (scope.changeRevisions.get(message.id) ?? 0) > startedRevision && scope.remotePatches.has(message.id)
            ? { ...message, ...scope.remotePatches.get(message.id) } : message);
    }

    function handleRealtime(scope: Conversation, payload: { eventType: string; new?: Record<string, unknown>; old?: Record<string, unknown> }) {
        if (!isCurrent(scope)) return;
        const row = payload.eventType === 'DELETE' ? payload.old : payload.new;
        if (!row || typeof row.id !== 'string') return;
        if (payload.eventType === 'DELETE') {
            // DELETE events may only include the primary key. A tombstone also
            // fences a page already in flight without importing its contents.
            if (messages.some(message => message.id === row.id) || scope.loadingOlder || scope.refreshing || scope.pendingWrites.size > 0) {
                rememberChange(scope, row.id, null);
                messages = messages.filter(message => message.id !== row.id);
            }
            return;
        }
        const existing = messages.find(message => message.id === row.id);
        if (row.order_id !== scope.orderId) {
            if (existing) { rememberChange(scope, row.id, null); messages = messages.filter(message => message.id !== row.id); }
            return;
        }
        if (payload.eventType === 'UPDATE') {
            if (row.is_deleted === true) {
                rememberChange(scope, row.id, null); messages = messages.filter(message => message.id !== row.id);
            } else {
                const patch = orderRealtimePatch(row);
                if (existing) {
                    const changed = { ...existing, ...patch };
                    rememberChange(scope, row.id, changed);
                    messages = reconcileOrderMessages(messages, new Map([[row.id, changed]]));
                } else if (scope.loadingOlder || scope.refreshing || scope.pendingWrites.size > 0) {
                    scope.remotePatches.set(row.id, patch);
                    scope.changeRevisions.set(row.id, ++scope.revision);
                }
            }
            return;
        }
        void refreshConversation(scope);
    }

    async function refreshConversation(scope: Conversation) {
        if (!isCurrent(scope)) return;
        if (scope.refreshing) { scope.refreshAgain = true; return; }
        scope.refreshing = true;
        try {
            do { scope.refreshAgain = false; await loadMessages(scope); }
            while (isCurrent(scope) && scope.refreshAgain);
        } finally { scope.refreshing = false; }
    }

    async function sendMessage(data: { message: string; replyTo?: string | null }): Promise<boolean> {
        const scope = conversation;
        if (!isCurrent(scope)) return false;
        const write = beginMessageWrite(scope);
        try {
            const response = await fetch(`${base}/api/chat/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: requestSignal(scope),
                body: JSON.stringify({ orderId: scope.orderId, text: data.message, replyTo: data.replyTo })
            });
            const body = await response.json();
            if (!isCurrent(scope)) return false;
            const confirmed = parseOrderChatMessage(body.message);
            if (!response.ok || !body.success || !confirmed) throw new Error('Send failed');
            acceptAcknowledgement(scope, confirmed, write.revision);
            shouldScrollToBottom = true;
            return true;
        } catch {
            if (isCurrent(scope)) notifications.error($t('chat.composer.send_failed'));
            return false;
        } finally { write.finish(); }
    }

    async function editMessage(data: { id: string; message: string }): Promise<boolean> {
        const scope = conversation;
        if (!isCurrent(scope)) return false;
        const write = beginMessageWrite(scope);
        try {
            const response = await fetch(`${base}/api/chat/messages/${encodeURIComponent(data.id)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                signal: requestSignal(scope),
                body: JSON.stringify({ message: data.message })
            });
            if (!isCurrent(scope)) return false;
            if (!response.ok) throw new Error('Edit failed');
            const existing = messages.find(message => message.id === data.id);
            if (existing) {
                const changed = { ...existing, message: data.message.trim(), edited: true };
                acceptAcknowledgement(scope, changed, write.revision);
            }
            return true;
        } catch {
            if (isCurrent(scope)) notifications.error($t('chat.composer.edit_failed'));
            return false;
        } finally { write.finish(); }
    }

    async function sendVoice(draft: VoiceDraft, signal: AbortSignal): Promise<boolean> {
        const scope = conversation;
        const replyTo = replyingTo?.id;
        if (!isCurrent(scope) || signal.aborted) return false;
        const write = beginMessageWrite(scope);
        try {
            const result = await postVoiceMessage<unknown>({ orderId: scope.orderId }, draft,
                AbortSignal.any([scope.controller.signal, signal]), { replyTo });
            if (!isCurrent(scope) || signal.aborted) return false;
            const confirmed = parseOrderChatMessage(result.message);
            if (!confirmed || confirmed.userId !== scope.ownerId) throw new Error('Invalid voice message response');
            if (!confirmed.voiceAttachments?.length) confirmed.voiceAttachments = [result.attachment];
            acceptAcknowledgement(scope, confirmed, write.revision);
            shouldScrollToBottom = true;
            if (replyingTo?.id === replyTo) replyingTo = null;
            return true;
        } finally { write.finish(); }
    }

    function deleteMessage(messageId: string) {
        pendingDeleteId = messageId;
        confirmDeleteOpen = true;
    }

    async function confirmDeleteMessage() {
        const scope = conversation;
        const id = pendingDeleteId;
        confirmDeleteOpen = false;
        pendingDeleteId = null;
        if (!id || !isCurrent(scope)) return;
        try {
            const response = await fetch(`${base}/api/chat/messages/${encodeURIComponent(id)}`, {
                method: 'DELETE', signal: requestSignal(scope)
            });
            if (!isCurrent(scope)) return;
            if (!response.ok) throw new Error('Delete failed');
            rememberChange(scope, id, null);
            messages = messages.filter(message => message.id !== id);
        } catch {
            if (isCurrent(scope)) notifications.error($t('chat.composer.delete_failed'));
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
        const scope = conversation;
        if (!me || !isCurrent(scope)) return;
        // Throttle typing broadcasts to once per second per user.
        if (typingThrottle && isTyping) return;
        if (typingThrottle) clearTimeout(typingThrottle);
        typingThrottle = setTimeout(() => { typingThrottle = null; }, 1000);
        try {
            realtimeService.broadcast(
                `order:${scope.orderId}:chat`,
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

    $effect(() => {
        const ownerId = accountId;
        const target = orderId;
        const scope: Conversation = {
            orderId: target, ownerId: ownerId ?? '', controller: new AbortController(), changes: new Map(), changeRevisions: new Map(), remotePatches: new Map(), pendingWrites: new Map(), revision: 0
        };
        conversation = scope;
        messages = [];
        history = emptyConversationHistory();
        replyingTo = null;
        pendingDeleteId = null;
        confirmDeleteOpen = false;
        shouldScrollToBottom = true;
        loading = false;
        loadFailed = false;
        let channel: ReturnType<typeof supabase.channel> | null = null;
        let refreshTimer: ReturnType<typeof setInterval> | undefined;
        const resume = () => { if (!document.hidden && isCurrent(scope)) void refreshConversation(scope); };
        if (ownerId && target) untrack(() => {
            void refreshConversation(scope);
            if (env.PUBLIC_SUPABASE_URL && env.PUBLIC_SUPABASE_ANON_KEY) {
                channel = supabase.channel(`order-chat:${ownerId}:${target}`)
                    .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, payload => handleRealtime(scope, payload)).subscribe();
            }
            // Resume and polling also cover sessions where realtime is unavailable.
            document.addEventListener('visibilitychange', resume);
            refreshTimer = setInterval(resume, 30000);
        });
        return () => {
            scope.controller.abort();
            if (conversation === scope) conversation = null;
            if (typingThrottle) clearTimeout(typingThrottle);
            typingThrottle = null;
            clearInterval(refreshTimer); document.removeEventListener('visibilitychange', resume);
            if (channel) void Promise.resolve(supabase.removeChannel(channel)).catch(() => {});
        };
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
        <h3 class="chat-title">{$t('chat.order_discussion')}</h3>
        {#if messages.length > 0}
            <span class="message-count">{chatCopy.messages}: {messages.length}</span>
        {/if}
    </div>

    <div
        bind:this={messagesContainer}
        class="messages-container"
        onscroll={handleScroll}
    >
        <HistoryControl state={{ ...history, loading, failed: loadFailed }} scroller={messagesContainer} contextKey={`${accountId}:${orderId}`} hasMessages={messages.length > 0}
            onRetry={() => isCurrent(conversation) ? refreshConversation(conversation) : Promise.resolve()} onOlder={loadEarlier} />
        {#if messages.length === 0 && !loadFailed && !loading}
            <div class="empty-state">
                <p class="empty-message">{$t('chat.no_messages')}</p>
                <p class="empty-hint">{$t('chat.start_conversation')}</p>
            </div>
        {:else}
            {#each messages as message (message.id)}
                <ChatMessage
                    {message}
                    contextKey={`${accountId}:${orderId}`}
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

    {#key `${accountId}:${orderId}`}
    <ChatInput
        disabled={!accountId || !orderId}
        {replyingTo}
        onsend={sendMessage}
        ontyping={handleTyping}
        oncancelReply={() => (replyingTo = null)}
        voiceContextKey={`${accountId ?? ''}:${$currentUser?.role ?? ''}:${orderId}`}
        onsendVoice={sendVoice}
    />
    {/key}
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
        flex-wrap: wrap;
        gap: var(--space-sm);
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
