<script lang="ts">
  import Icon from '$lib/ui/Icon.svelte';
  import { notices } from '$lib/notify/bus';
  import { onMount } from 'svelte';
  import { base } from '$app/paths';

  let open = $state(false);
  let btn: HTMLButtonElement | undefined = $state();
  let dbNotifications: any[] = $state([]);
  let noticesList = $derived($notices);

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') { open = false; btn?.focus(); }
  }

  async function loadNotifications() {
    try {
      const res = await fetch(`${base}/api/notifications?unreadOnly=true&limit=20`);
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data.notifications || data.data || []);
        dbNotifications = Array.isArray(list) ? list : [];
      }
    } catch { dbNotifications = []; }
  }

  onMount(() => {
    loadNotifications();
    const iv = setInterval(loadNotifications, 30000);
    return () => clearInterval(iv);
  });

  let allNotifications = $derived([
    ...noticesList,
    ...(Array.isArray(dbNotifications) ? dbNotifications : []).map(n => ({
      text: n.title, kind: n.type, time: n.createdAt
    }))
  ]);
  let count = $derived(allNotifications.length);
</script>

<div class="rf-notif">
  <button
    bind:this={btn}
    class="rf-notif__trigger"
    type="button"
    aria-haspopup="menu"
    aria-expanded={open}
    aria-label={`Notifications${count ? ` (${count} unread)` : ''}`}
    onclick={() => open = !open}
  >
    <Icon name="bell" size="md" />
    {#if count}
      <span class="rf-notif__badge" aria-hidden="true">{count > 9 ? '9+' : count}</span>
    {/if}
  </button>

  {#if open}
    <div
      class="rf-notif__dropdown"
      role="menu"
      tabindex={-1}
      onkeydown={onKey}
    >
      <div class="rf-notif__header">
        <span class="rf-notif__title">Notifications</span>
        {#if count}<span class="rf-notif__count">{count}</span>{/if}
      </div>

      {#if allNotifications.length === 0}
        <div class="rf-notif__empty">No notifications</div>
      {:else}
        {#each allNotifications as n}
          <button role="menuitem" class="rf-notif__item" type="button">
            <span class="rf-notif__item-text" data-kind={n.kind}>{n.text}</span>
            <span class="rf-notif__item-time">{new Date(n.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </button>
        {/each}
      {/if}
    </div>
  {/if}
</div>

<style>
  .rf-notif { position: relative; }

  .rf-notif__trigger {
    position: relative;
    display: grid;
    place-items: center;
    width: var(--control-sm, 36px);
    height: var(--control-sm, 36px);
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--ink-secondary);
    cursor: pointer;
    transition:
      background var(--motion-sm) var(--ease-standard),
      color      var(--motion-sm) var(--ease-standard);
  }
  .rf-notif__trigger:hover {
    background: color-mix(in oklab, var(--bg-2) 70%, transparent);
    color: var(--ink-primary);
  }
  .rf-notif__trigger:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .rf-notif__badge {
    position: absolute;
    top: -2px;
    right: -2px;
    min-width: 16px;
    height: 16px;
    border-radius: var(--radius-full);
    background: var(--error);
    color: var(--bg-0);
    font-size: 10px;
    font-weight: 700;
    display: grid;
    place-items: center;
    padding: 0 3px;
    border: 2px solid var(--bg-0);
  }

  .rf-notif__dropdown {
    position: absolute;
    right: 0;
    top: calc(100% + var(--space-sm));
    width: min(360px, 92vw);
    background: var(--glass-bg-strong);
    backdrop-filter: var(--glass-material-thick);
    -webkit-backdrop-filter: var(--glass-material-thick);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--glass-shadow-lg);
    padding: var(--space-sm);
    z-index: var(--z-popover);
    max-height: 480px;
    overflow-y: auto;
    animation: rf-dropdown-in var(--motion-sm) var(--ease-standard) both;
  }

  @keyframes rf-dropdown-in {
    from { opacity: 0; transform: translateY(-6px) scale(0.97); }
    to   { opacity: 1; transform: translateY(0)   scale(1); }
  }

  .rf-notif__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-xs) var(--space-sm);
    margin-bottom: var(--space-xs);
    border-bottom: 1px solid var(--divider);
  }
  .rf-notif__title {
    font-size: var(--text-sm);
    font-weight: 700;
    color: var(--ink-primary);
  }
  .rf-notif__count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    height: 20px;
    padding: 0 var(--space-xxs);
    background: var(--error-soft);
    color: var(--error);
    border-radius: var(--radius-full);
    font-size: var(--text-xs);
    font-weight: 700;
  }

  .rf-notif__empty {
    padding: var(--space-lg) var(--space-sm);
    text-align: center;
    color: var(--ink-tertiary);
    font-size: var(--text-sm);
  }

  .rf-notif__item {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--space-sm);
    width: 100%;
    padding: var(--space-sm);
    border-radius: var(--radius-sm);
    border: none;
    background: transparent;
    cursor: pointer;
    text-align: left;
    transition: background var(--motion-sm) var(--ease-standard);
  }
  .rf-notif__item:hover { background: color-mix(in oklab, var(--bg-2) 60%, transparent); }
  .rf-notif__item:focus-visible { outline: none; box-shadow: inset var(--focus-ring); }

  .rf-notif__item-text {
    font-size: var(--text-sm);
    color: var(--ink-secondary);
    flex: 1;
    line-height: var(--leading-snug);
  }
  .rf-notif__item-time {
    font-size: var(--text-xs);
    color: var(--ink-tertiary);
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
  }
</style>
