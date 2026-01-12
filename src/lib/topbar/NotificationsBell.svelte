<script lang="ts">
  import Bell from 'lucide-svelte/icons/bell';
  import { notices } from '$lib/notify/bus';
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  
  let open = false;
  let btn: HTMLButtonElement;
  let noticesList: any[] = [];
  let dbNotifications: any[] = [];
  const unsubscribe = notices.subscribe(v => noticesList = v);
  
  function onKey(e: KeyboardEvent) { 
    if (e.key === 'Escape') { 
      open = false; 
      btn?.focus(); 
    } 
  }
  
  // Load notifications from database
  async function loadNotifications() {
    try {
      const res = await fetch(`${base}/api/notifications?unreadOnly=true&limit=20`);
      if (res.ok) {
        dbNotifications = await res.json();
      }
    } catch (err) {
      console.debug('Failed to load notifications:', err);
    }
  }
  
  onMount(() => {
    loadNotifications();
    // Poll for new notifications every 30 seconds
    const interval = setInterval(loadNotifications, 30000);
    return () => clearInterval(interval);
  });
  
  $: allNotifications = [...noticesList, ...dbNotifications.map(n => ({
    text: n.title,
    kind: n.type,
    time: n.createdAt
  }))];
  
  $: count = allNotifications.length;
</script>

<div class="menu">
  <button bind:this={btn} class="icon" aria-haspopup="menu" aria-expanded={open}
          aria-label={`Notifications ${count}`} on:click={()=>open=!open}>
    <Bell aria-hidden="true"/>{#if count}<span class="nbadge" aria-label="{count} unread">{count}</span>{/if}
  </button>

  {#if open}
  <div class="dropdown mobile-sheet" role="menu" style="max-width:92vw" on:keydown={onKey}>
    {#if allNotifications.length===0}<div class="muted">No notifications.</div>{/if}
    {#each allNotifications as n}
      <button role="menuitem" class="row">
        <span class="tag" data-kind={n.kind}>{n.text}</span>
        <span class="muted">{new Date(n.time).toLocaleTimeString()}</span>
      </button>
    {/each}
  </div>
  {/if}
</div>

<style>
.menu{position:relative}
.icon{position:relative;border:1px solid var(--border);border-radius:999px;background:var(--bg-0);width:var(--control-xs);height:var(--control-xs);display:grid;place-items:center}
.nbadge{ position:absolute; top:calc(var(--space-tight) * -1); right:calc(var(--space-tight) * -1); min-width:var(--icon-size);height:var(--icon-size);
        border-radius:var(--radius-full); background:var(--error, var(--danger)); color:var(--ink-0, var(--text)); font-size:calc(0.7rem * var(--font-scale, 1));
        display:grid; place-items:center; padding:0 calc(var(--space-xs) + (var(--space-xxs) / 2)); }
.dropdown{position:absolute;right:0;top:calc(100% + var(--space-sm));min-width:calc(320px * var(--font-scale, 1));background:var(--bg-0);
         border:1px solid var(--border);border-radius:var(--radius-md);box-shadow:0 10px 24px color-mix(in oklab,var(--shadow-rgb) 35%,transparent);
         padding:var(--space-sm);z-index:50}
.dropdown [role="menuitem"]{display:flex;justify-content:space-between;gap:var(--space-sm);padding:var(--space-tight);border-radius:var(--radius-sm)}
.dropdown [role="menuitem"]:focus{outline:3px solid var(--focus)}

@media (max-width: 820px){
  .dropdown{
    min-width:auto; 
    width:100%;
  }
}
</style>
