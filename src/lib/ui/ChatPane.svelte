<script lang="ts">
  import { onMount } from 'svelte';
  import MentionInput from '$lib/chat/MentionInput.svelte';
  import { rooms, messages, sendMessage } from '$lib/chat/chat-store';
  import { users, loadUsers } from '$lib/users/user-store';
  import { currentUser } from '$lib/auth/user-store';
  import { t } from 'svelte-i18n';
  import { REWORK_LABEL } from '$lib/order/stages';
  import type { StationTag, ReworkReason } from '$lib/order/stages';
  import StationBadge from '$lib/ui/StationBadge.svelte';

  $: $rooms, $messages, $users, $currentUser, $t;

  let activeRoomId = 'general';
  let scroller: HTMLDivElement | null = null;

  onMount(() => {
    loadUsers();
  });

  $: activeRoom = $rooms.find((room) => room.id === activeRoomId) || $rooms[0];
  $: roomMessages = $messages.filter((message) => message.roomId === activeRoomId);

  function formatTime(iso: string) {
    const date = new Date(iso);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function authorName(id: string) {
    if (id === 'system') return $t('chat.system.name');
    return $users.find((user) => String(user.id) === String(id))?.name ?? id;
  }

  function authorStation(id: string): StationTag | null {
    if (id === 'system') return null;
    return $users.find((user) => String(user.id) === String(id))?.stations?.[0] ?? null;
  }

  function reworkReasonLabel(reason: ReworkReason) {
    return $t(REWORK_LABEL[reason]);
  }

  function isMention(messageMentions: string[] | undefined) {
    if (!messageMentions || messageMentions.length === 0) return false;
    return $currentUser ? messageMentions.includes(String($currentUser.username)) : false;
  }

  function avatarInitial(id: string) {
    const name = authorName(id) || '';
    return name
      .split(' ')
      .map((part) => part.charAt(0))
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }

  function commit(text: string, mentions: string[]) {
    if (!activeRoom) return;
    sendMessage(activeRoom.id, text, mentions);
    setTimeout(() => {
      if (scroller) {
        scroller.scrollTop = scroller.scrollHeight;
      }
    });
  }

  function selectRoom(id: string) {
    activeRoomId = id;
    setTimeout(() => {
      if (scroller) {
        scroller.scrollTop = scroller.scrollHeight;
      }
    });
  }

  onMount(() => {
    if (scroller) {
      scroller.scrollTop = scroller.scrollHeight;
    }
  });
</script>

<div class="rf-panel chat-panel">
  <header class="chat-header">
    <div class="chat-header__intro">
      <div class="chat-title">{$t('chat.title')}</div>
      {#if $currentUser}
        <div class="chat-current">
          <span class="chat-avatar" aria-hidden="true">{avatarInitial($currentUser.id)}</span>
          <div class="chat-current__info">
            <strong>{$currentUser.name}</strong>
            {#if $currentUser.stations && $currentUser.stations[0]}
              <StationBadge station={$currentUser.stations[0]} size="sm" tone="highlight" />
            {/if}
          </div>
        </div>
      {/if}
    </div>
    <div class="rooms" role="tablist" aria-label={$t('chat.rooms')}>
      {#each $rooms as room (room.id)}
        <button
          type="button"
          class="tag"
          class:is-active={room.id === activeRoomId}
          role="tab"
          aria-selected={room.id === activeRoomId}
          tabindex={room.id === activeRoomId ? 0 : -1}
          on:click={() => selectRoom(room.id)}
        >
          {room.name}
        </button>
      {/each}
    </div>
  </header>

  <div
    class="rf-scroll messages"
    role="log"
    aria-live="polite"
    aria-atomic="false"
    bind:this={scroller}
  >
    {#each roomMessages as message (message.id)}
      {@const author = authorName(message.authorId)}
      {@const station = message.variant === 'system' ? message.event?.station ?? null : authorStation(message.authorId)}
      <article
        class="card message"
        class:message--system={message.variant === 'system'}
        data-mention={isMention(message.mentions)}
      >
        <header class="message-head">
          <div class="message-meta">
            <div class="message-persona">
              <span class="message-avatar" aria-hidden="true">{avatarInitial(message.authorId)}</span>
              <div class="message-author">
                <strong>{author}</strong>
                {#if station}
                  <StationBadge station={station} size="sm" />
                {/if}
              </div>
            </div>
            <span class="muted message-time">{formatTime(message.ts)}</span>
          </div>
          {#if message.mentions && message.mentions.length}
            <div class="message-recipients" aria-label={$t('chat.mentions')}>
              <span class="muted label">{$t('chat.to')}</span>
              {#each message.mentions as id (id)}
                <span class="tag tag--small">@{authorName(id)}</span>
              {/each}
            </div>
          {/if}
        </header>
        {#if message.variant === 'system' && message.event}
          <div class="system-event">
            <div class="system-headline">
              <strong>{message.event.orderTitle}</strong>
              <span class="muted">({message.event.orderId})</span>
            </div>
            <div class="system-tags">
              {#if message.event.station}
                <StationBadge station={message.event.station} size="sm" />
              {/if}
              {#if message.event.type === 'stage_rework'}
                <span class="tag tag--small tone-warn">{reworkReasonLabel(message.event.reason)}</span>
              {:else if message.event.type === 'stage_completed'}
                <span class="tag tag--small tone-ok">{$t('chat.system.completed.badge')}</span>
              {/if}
            </div>
            <p class="system-body">
              {#if message.event.type === 'stage_rework'}
                {$t('chat.system.rework.summary')}
              {:else if message.event.type === 'stage_completed'}
                {$t('chat.system.completed.summary')}
              {/if}
            </p>
            {#if message.event.type === 'stage_rework' && message.event.note}
              <p class="system-note">
                <span class="muted">{$t('chat.system.note_label')}:</span>
                <span>{message.event.note}</span>
              </p>
            {/if}
          </div>
        {:else}
          <p class="message-body">{message.text}</p>
        {/if}
      </article>
    {/each}
    {#if roomMessages.length === 0}
      <div class="muted">{$t('chat.empty')}</div>
    {/if}
  </div>

  <MentionInput onCommit={commit} placeholder={$t('chat.message_placeholder')} />
</div>

<style>
  .chat-panel{ gap:var(--space-lg); padding:var(--space-lg) }
  .chat-header{ display:grid; gap:var(--space-lg) }
  .chat-header__intro{ display:flex; justify-content:space-between; align-items:center; gap:var(--space-md); flex-wrap:wrap }
  .chat-title{ font-weight:800; font-size:1.05rem }
  .chat-current{ display:flex; align-items:center; gap:var(--space-snug); background:color-mix(in oklab,var(--bg-2) 75%, transparent); padding:var(--space-sm) var(--space-md); border-radius:var(--radius-lg); border:1px solid color-mix(in oklab,var(--border) 85%, transparent) }
  .chat-avatar{ width:var(--avatar-md); height:var(--avatar-md); border-radius:var(--radius-md); display:grid; place-items:center; background:linear-gradient(135deg,var(--accent-2),color-mix(in oklab,var(--accent-2) 60%, var(--bg-2))); color:var(--ink-0, var(--text)); font-weight:700 }
  .chat-current__info{ display:flex; flex-direction:column; gap:var(--space-xs); font-size:.85rem }
  .rooms{ display:flex; flex-wrap:wrap; gap:var(--space-sm) }
  .rooms .tag{ border-radius:var(--radius-lg); font-size:.8rem }

  .messages{ display:grid; gap:var(--space-md); min-height:0 }
  .message{ display:flex; flex-direction:column; gap:var(--space-snug); background:var(--bg-1); border:1px solid color-mix(in oklab,var(--border) 80%, transparent); padding:var(--space-lg); box-shadow:0 12px 28px rgba(var(--shadow-rgb)/.12) }
  .message[data-mention="true"]{ border-color:color-mix(in oklab,var(--info) 40%, transparent); box-shadow:0 16px 34px rgba(var(--shadow-rgb)/.16) }
  .message--system{ border-left:4px solid var(--accent-1); background:color-mix(in oklab,var(--bg-1) 70%, var(--accent-2) 30%) }
  .message-head{ display:flex; flex-direction:column; gap:var(--space-sm) }
  .message-meta{ display:flex; justify-content:space-between; align-items:flex-start; gap:var(--space-md); flex-wrap:wrap }
  .message-persona{ display:flex; align-items:flex-start; gap:var(--space-snug) }
  .message-avatar{ width:var(--avatar-sm); height:var(--avatar-sm); border-radius:var(--radius-md); display:grid; place-items:center; background:color-mix(in oklab,var(--bg-2) 80%, transparent); font-size:.8rem; font-weight:700; color:var(--text) }
  .message-author{ display:grid; gap:var(--space-xs); font-size:.85rem }
  .message-time{ font-size:.75rem }
  .message-recipients{ display:flex; flex-wrap:wrap; gap:var(--space-tight); align-items:center }
  .message-body{ margin:0; background:color-mix(in oklab,var(--bg-2) 80%, transparent); padding:var(--space-md); border-radius:var(--radius-md); line-height:1.45 }
  .system-event{ display:grid; gap:var(--space-sm); background:color-mix(in oklab,var(--bg-2) 80%, transparent); padding:var(--space-md); border-radius:var(--radius-md) }
  .system-headline{ display:flex; flex-wrap:wrap; gap:var(--space-tight); align-items:center }
  .system-tags{ display:flex; flex-wrap:wrap; gap:var(--space-tight) }
  .system-body{ margin:0; line-height:1.5 }
  .system-note{ margin:0; display:flex; gap:var(--space-tight); font-size:.85rem; align-items:flex-start }

  @media (max-width: 720px){
    .chat-header__intro{ align-items:flex-start }
    .chat-current{ width:100% }
    .message-meta{ flex-direction:column; align-items:flex-start }
    .message-time{ align-self:flex-end }
  }
</style>
