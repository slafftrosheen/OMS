<script lang="ts">
  import MessageSquare from 'lucide-svelte/icons/message-square';
  import { messages, sendMessage, rooms } from '$lib/chat/chat-store';
  
  let open = false;
  let btn: HTMLButtonElement;
  let text = '';
  let chatMessages = [];
  let chatRooms = [];
  
  const unsubscribeMessages = messages.subscribe(v => chatMessages = v);
  const unsubscribeRooms = rooms.subscribe(v => chatRooms = v);
  
  let activeRoomId = 'general';
  $: activeRoom = chatRooms.find((room) => room.id === activeRoomId) || chatRooms[0];
  $: chat = chatMessages.filter(m => m.roomId === activeRoomId);
  
  function send() { 
    if (!text.trim() || !activeRoom) return; 
    sendMessage(activeRoom.id, text, []); 
    text = ''; 
  }
  
  function onKey(e: KeyboardEvent) { 
    if (e.key === 'Escape') { 
      open = false; 
      btn?.focus(); 
    } 
  }
</script>

<div class="menu">
  <button bind:this={btn} class="icon" aria-haspopup="dialog" aria-expanded={open} aria-label="Open chat"
          on:click={()=>open=!open}><MessageSquare aria-hidden="true"/></button>

  {#if open}
  <div class="sheet mobile-sheet" role="dialog" aria-modal="true" aria-label="Team chat" style="min-width:360px;max-width:92vw" on:keydown={onKey}>
    <div class="panel card">
      <header class="row" style="justify-content:space-between"><strong>Team chat</strong>
        <button class="tag ghost" on:click={()=>{open=false;btn?.focus();}}>Close</button>
      </header>
      <div class="log" role="log" aria-live="polite">
        {#each chat as m}<div class="msg"><b>{m.authorId}</b><span class="muted">{new Date(m.ts).toLocaleTimeString()}</span><div>{m.text}</div></div>{/each}
      </div>
      <form class="row" on:submit|preventDefault={send}><input aria-label="Message" bind:value={text}/><button class="tag">Send</button></form>
    </div>
  </div>
  {/if}
</div>

<style>
.menu{position:relative}
.icon{position:relative;border:1px solid var(--border);border-radius:999px;padding:8px;background:var(--bg-0)}
.sheet{position:absolute;right:0;top:calc(100% + 8px);z-index:60}
.panel{width:min(520px,90vw)}
.log{max-height:300px;overflow:auto;display:grid;gap:8px;margin:8px 0}
.msg{border:1px solid var(--border);border-radius:10px;padding:6px}

@media (max-width: 820px){
  .panel{
    width:100%;
    border:none;
    box-shadow:none;
  }
}
</style>
