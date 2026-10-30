<script lang="ts">
  import { tick } from 'svelte';

  import MessageSquare from 'lucide-svelte/icons/message-square';
  import { messages, sendMessage, rooms } from '$lib/chat/chat-store';

  let open = $state(false);
  let btn: HTMLButtonElement | undefined = $state();
  let text = $state('');
  let root = $state<HTMLDivElement>();
  let messageInput = $state<HTMLInputElement>();
  const dialogId = $props.id();

  let chatMessages = $derived($messages);
  let chatRooms = $derived($rooms);

  let activeRoomId = $state('general');
  let activeRoom = $derived(chatRooms.find((room) => room.id === activeRoomId) || chatRooms[0]);
  let chat = $derived(chatMessages.filter(m => m.roomId === activeRoom?.id));

  function send() {
    if (!text.trim() || !activeRoom) return;
    void sendMessage(activeRoom.id, text, []);
    text = '';
  }

  function close(restoreFocus = true) {
    open = false;
    if (restoreFocus) btn?.focus();
  }
  function onKey(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation(); close();
    }
  }
  function outside(event: PointerEvent) {
    if (open && root && !root.contains(event.target as Node)) close(false);
  }
  $effect(() => {
    if (!open) return;
    let active = true;
    void tick().then(() => { if (active) messageInput?.focus(); });
    return () => { active = false; };
  });
</script>

<svelte:window onpointerdown={outside} />

<div class="menu" bind:this={root}>
  <button bind:this={btn} class="icon" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? dialogId : undefined} aria-label="Open chat"
          onclick={()=>open=!open}><MessageSquare aria-hidden="true"/></button>

  {#if open}
  <div id={dialogId} class="sheet mobile-sheet" role="dialog" tabindex="-1" aria-label="Team chat" onkeydown={onKey}>
    <div class="panel card">
      <header class="row" style="justify-content:space-between"><strong>Team chat</strong>
        <button class="tag ghost" onclick={() => close()}>Close</button>
      </header>
      <div class="log" role="log" aria-live="polite">
        {#each chat as m}<div class="msg"><div class="msg-header"><b>{m.authorId}</b><span class="muted">{new Date(m.ts).toLocaleTimeString()}</span></div><div>{m.text}</div></div>{/each}
      </div>
      <form class="row" onsubmit={event => { event.preventDefault(); send(); }}><input aria-label="Message" bind:this={messageInput} bind:value={text}/><button class="tag" disabled={!activeRoom || !text.trim()}>Send</button></form>
    </div>
  </div>
  {/if}
</div>

<style>
.menu{position:relative}
.icon{position:relative;border:1px solid var(--border);border-radius:999px;padding:8px;background:var(--bg-0)}
.sheet{width:min(360px,92vw);position:absolute;right:0;top:calc(100% + 8px);z-index: var(--z-popover)}
.panel{width:100%;box-sizing:border-box}
form input{min-width:0;flex:1}
.log{max-height:300px;overflow:auto;display:grid;gap:8px;margin:8px 0}
.msg{border:1px solid var(--border);border-radius:10px;padding:6px;overflow-wrap:anywhere}
.msg-header{display:flex;flex-wrap:wrap;align-items:baseline;column-gap:8px;row-gap:2px}
.msg-header .muted{font-size:0.75rem}

@media (max-width: 820px){
  .panel{
    width:100%;
    border:none;
    box-shadow:none;
  }
}
</style>
