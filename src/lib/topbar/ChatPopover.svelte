<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { locale } from 'svelte-i18n';
  import MessageSquare from 'lucide-svelte/icons/message-square';
  import { messages, sendMessage, sendVoiceMessage, rooms, loadRooms, loadMessages, loadOlderMessages, roomHistory } from '$lib/chat/chat-store';
  import { currentUser } from '$lib/auth/authState.svelte';
  import VoiceRecorder from '$lib/chat/VoiceRecorder.svelte';
  import ChatAttachments from '$lib/chat/ChatAttachments.svelte';
  import { roomDraftSession } from '$lib/chat/room-drafts.svelte';
  import MentionInput from '$lib/chat/MentionInput.svelte';
  import HistoryControl from '$lib/chat/HistoryControl.svelte';
  import { conversationCopy } from '$lib/chat/conversation-copy';

  let open = $state(false);
  let btn = $state<HTMLButtonElement>();
  let root = $state<HTMLDivElement>();
  let scroller = $state<HTMLDivElement>();
  let drafts = $derived(roomDraftSession.drafts);
  const dialogId = $props.id();
  let activeRoomId = $state('general');
  let activeRoom = $derived($rooms.find(room => room.id === activeRoomId) || $rooms[0]);
  let activeDraft = $derived(activeRoom ? drafts[activeRoom.id] : undefined);
  let chat = $derived($messages.filter(message => message.roomId === activeRoom?.id));
  let history = $derived(activeRoom ? $roomHistory[activeRoom.id] : undefined);
  let c = $derived(conversationCopy($locale));

  async function send(text: string, mentions: string[]) {
    const room = activeRoom?.id, owner = $currentUser?.id;
    if (!room) return false;
    const confirmed = await roomDraftSession.submit(owner ?? '', room, () => sendMessage(room, text, mentions), () => $currentUser?.id ?? '');
    await tick();
    if (confirmed && activeRoom?.id === room && $currentUser?.id === owner && scroller) scroller.scrollTop = scroller.scrollHeight;
    return confirmed;
  }
  function close(restoreFocus = true) {
    open = false;
    if (restoreFocus) btn?.focus();
  }
  function onKey(event: KeyboardEvent) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
  }
  function outside(event: PointerEvent) {
    if (open && root && !root.contains(event.target as Node)) close(false);
  }
  $effect(() => {
    const owner = $currentUser?.id;
    untrack(() => { roomDraftSession.setOwner(owner ?? ''); activeRoomId = 'general'; open = false; });
    if (owner) untrack(() => { void loadRooms(); });
  });
  $effect(() => {
    const room = activeRoom?.id, owner = $currentUser?.id;
    if (!open || !room || !owner) return;
    let active = true;
    untrack(() => { roomDraftSession.ensure(owner, room); });
    void loadMessages(room).then(async () => {
      await tick();
      if (active && scroller) scroller.scrollTop = scroller.scrollHeight;
    });
    void tick().then(() => { if (active) root?.querySelector<HTMLTextAreaElement>('textarea')?.focus(); });
    return () => { active = false; };
  });
</script>

<svelte:window onpointerdown={outside} />
<div class="menu" bind:this={root}>
  <button bind:this={btn} type="button" class="icon" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? dialogId : undefined} aria-label={c.openChat}
    onclick={() => open = !open}><MessageSquare aria-hidden="true" /></button>
  {#if open}
    <div id={dialogId} class="sheet mobile-sheet" role="dialog" tabindex="-1" aria-label={c.teamChat} onkeydown={onKey}>
      <div class="panel card">
        <header class="row"><strong>{c.teamChat}</strong><button type="button" class="tag ghost" onclick={() => close()}>{c.close}</button></header>
        <div class="room-picker"><label for={`${dialogId}-room`}>{c.room}</label><select id={`${dialogId}-room`} value={activeRoom?.id ?? ''} onchange={event => activeRoomId = event.currentTarget.value} disabled={!$rooms.length}>
          {#if !$rooms.length}<option value="">{c.noRooms}</option>{/if}
          {#each $rooms as room (room.id)}<option value={room.id}>{room.peer?.displayName || room.peer?.username || room.name}</option>{/each}
        </select></div>
        <div class="log" role="log" aria-live="polite" bind:this={scroller}>
          <HistoryControl state={history} {scroller} contextKey={`${$currentUser?.id}:${activeRoom?.id}`} hasMessages={chat.length > 0}
            onRetry={() => activeRoom ? loadMessages(activeRoom.id) : Promise.resolve()} onOlder={() => activeRoom ? loadOlderMessages(activeRoom.id) : Promise.resolve()} />
          {#each chat as message (message.id)}
            <div class="msg" data-chat-message-id={message.id}><div class="msg-header"><b>{message.author?.displayName || message.author?.username || (message.authorId === $currentUser?.id ? $currentUser.displayName : c.unknown)}</b><time datetime={message.ts}>{new Date(message.ts).toLocaleTimeString($locale || 'en', { hour: '2-digit', minute: '2-digit' })}</time></div>
              <p>{message.text}</p><ChatAttachments attachments={message.attachments} contextKey={`${$currentUser?.id}:${activeRoom?.id}`} /></div>
          {/each}
          {#if !chat.length && !history?.loading && !history?.failed}<p class="empty">{c.empty}</p>{/if}
        </div>
        {#key `${$currentUser?.id}:${activeRoom?.id}`}
          {#if activeDraft}<MentionInput managed bind:value={activeDraft.text} bind:mentions={activeDraft.mentions} bind:sending={activeDraft.sending} bind:failed={activeDraft.failed} onCommit={send} placeholder={c.message} disabled={!activeRoom || !$currentUser} />{/if}
        {/key}
        <VoiceRecorder contextKey={`${$currentUser?.id ?? ''}:${$currentUser?.role ?? ''}:${activeRoom?.id ?? ''}`}
          disabled={!$currentUser || !activeRoom} onSend={(draft, signal) => activeRoom ? sendVoiceMessage(activeRoom.id, draft, signal) : Promise.resolve(false)} />
      </div>
    </div>
  {/if}
</div>

<style>
  .menu { position: relative; }
  .icon { position: relative; border: 1px solid var(--border); border-radius: var(--radius-full); padding: var(--space-sm); background: var(--bg-0); color: var(--ink-primary); }
  .sheet { width: min(400px, 92vw); position: absolute; right: 0; top: calc(100% + var(--space-sm)); z-index: var(--z-popover); }
  .panel { width: 100%; box-sizing: border-box; display: grid; gap: var(--space-sm); max-height: 85dvh; overflow: auto; min-width: 0; }
  .row { justify-content: space-between; flex-wrap: wrap; }
  .room-picker { display: grid; gap: var(--space-xs); font-size: var(--text-xs); color: var(--ink-secondary); }
  select { min-width: 0; width: 100%; min-height: var(--control-sm); padding: var(--space-sm); border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--ink-primary); background: var(--bg-1); font: inherit; font-size: var(--text-sm); }
  .log { max-height: 300px; overflow: auto; display: grid; gap: var(--space-sm); margin: var(--space-sm) 0; min-width: 0; }
  .msg { border: 1px solid var(--border); border-radius: var(--radius-sm); padding: var(--space-sm); overflow-wrap: anywhere; min-width: 0; }
  .msg-header { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-xxs) var(--space-sm); }
  .msg-header time { font-size: var(--text-xs); color: var(--ink-secondary); }
  .msg p { white-space: pre-wrap; margin: var(--space-xs) 0 0; }
  .empty { color: var(--ink-secondary); font-size: var(--text-sm); margin: 0; }
  select:focus-visible, button:focus-visible { outline: 2px solid var(--focus); outline-offset: var(--space-xxs); }
  @media (max-width: 820px) { .panel { width: 100%; border: none; box-shadow: none; } }
</style>
