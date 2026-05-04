<script lang="ts">
  import Icon from '$lib/ui/Icon.svelte';
  import { notices } from '$lib/notify/bus';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { base } from '$app/paths';
  import { notificationStore } from '$lib/stores/notifications';
  import { currentUser } from '$lib/auth/authState.svelte';

  let open = $state(false);
  let btn: HTMLButtonElement | undefined = $state();
  let root: HTMLDivElement | undefined = $state();

  let noticesList = $derived($notices);
  let storeState = $derived($notificationStore);

  // Ephemeral notices + DB notifications merged for display
  let allItems = $derived([
    ...noticesList.map((n: any) => ({ ephemeral: true, text: n.text, kind: n.kind, time: n.time, read: false, id: null })),
    ...storeState.items.map(n => ({
      ephemeral: false,
      id: n.id,
      text: n.title,
      kind: n.type,
      time: n.created_at,
      read: n.read,
      message: n.message
    }))
  ]);

  let count = $derived(noticesList.length + storeState.unreadCount);

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') { open = false; btn?.focus(); }
  }

  function onDocClick(e: MouseEvent) {
    if (!open || !root) return;
    if (root.contains(e.target as Node)) return;
    open = false;
  }

  async function handleItemClick(item: any) {
    if (!item.ephemeral && item.id && !item.read) {
      await notificationStore.markAsRead(item.id);
    }
  }

  async function markAllRead() {
    const userId = $currentUser?.id;
    if (userId) await notificationStore.markAllAsRead(userId);
  }

  function formatRelative(ts: string | number) {
    const d = new Date(ts).getTime();
    const now = Date.now();
    const diffSec = Math.floor((now - d) / 1000);
    if (diffSec < 60)        return $t('notifications.time.just_now', { default: 'just now' });
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60)        return `${diffMin}m`;
    const diffHr  = Math.floor(diffMin / 60);
    if (diffHr  < 24)        return `${diffHr}h`;
    const diffD   = Math.floor(diffHr / 24);
    if (diffD   < 7)         return `${diffD}d`;
    return new Date(ts).toLocaleDateString();
  }

  onMount(() => {
    const userId = $currentUser?.id;
    if (!userId) return;
    notificationStore.load(userId);
    const unsubscribe = notificationStore.subscribe_realtime(userId);
    document.addEventListener('click', onDocClick, true);
    return () => {
      document.removeEventListener('click', onDocClick, true);
      unsubscribe?.();
    };
  });
</script>

<div class="rf-notif" bind:this={root}>
  <button
    bind:this={btn}
    class="rf-notif__trigger"
    type="button"
    aria-haspopup="menu"
    aria-expanded={open}
    aria-label="{$t('notifications.title')}{count ? ` (${count})` : ''}"
    onclick={() => open = !open}
  >
    <Icon name="bell" size="md" />
    {#if count}
      <span class="rf-notif__badge" aria-hidden="true">{count > 9 ? '9+' : count}</span>
    {/if}
  </button>

  {#if open}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      class="rf-notif__dropdown"
      role="menu"
      tabindex={-1}
      onkeydown={onKey}
    >
      <div class="rf-notif__header">
        <span class="rf-notif__title">{$t('notifications.title')}</span>
        <div class="rf-notif__header-actions">
          {#if storeState.unreadCount}
            <span class="rf-notif__count" aria-label="{storeState.unreadCount} {$t('notifications.filter.unread')}">
              {storeState.unreadCount}
            </span>
            <button class="rf-notif__mark-all" type="button" onclick={markAllRead}>
              {$t('notifications.mark_all_read')}
            </button>
          {/if}
        </div>
      </div>

      {#if allItems.length === 0}
        <div class="rf-notif__empty">
          <Icon name="bell" size="lg" />
          <span>{$t('notifications.empty', { default: 'No notifications yet.' })}</span>
        </div>
      {:else}
        <div class="rf-notif__list">
          {#each allItems.slice(0, 8) as item}
            <button
              role="menuitem"
              class="rf-notif__item"
              class:unread={!item.read}
              type="button"
              onclick={() => handleItemClick(item)}
            >
              <span class="rf-notif__item-dot" data-kind={item.kind} aria-hidden="true"></span>
              <span class="rf-notif__item-text">{item.text}</span>
              {#if item.time}
                <span class="rf-notif__item-time">{formatRelative(item.time)}</span>
              {/if}
            </button>
          {/each}
        </div>
      {/if}

      <div class="rf-notif__footer">
        <a class="rf-notif__view-all" href="{base}/notifications" onclick={() => open = false}>
          {$t('notifications.view_all', { default: 'View all' })}
        </a>
      </div>
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
    bottom: calc(100% + var(--space-sm));
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
    animation: rf-dropdown-up var(--motion-sm) var(--ease-spring-soft) both;
  }

  @keyframes rf-dropdown-up {
    from { opacity: 0; transform: translateY(8px) scale(0.97); }
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
  .rf-notif__header-actions {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
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
  .rf-notif__mark-all {
    font-size: var(--text-xs);
    color: var(--brand);
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 0;
    font-weight: 500;
    box-shadow: none;
    transform: none;
  }
  .rf-notif__mark-all:hover { text-decoration: underline; transform: none; filter: none; }

  .rf-notif__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-2xl) var(--space-sm);
    text-align: center;
    color: var(--ink-tertiary);
    font-size: var(--text-sm);
    opacity: 0.85;
  }
  .rf-notif__empty :global(svg) {
    opacity: 0.4;
  }

  .rf-notif__list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .rf-notif__item {
    display: grid;
    grid-template-columns: 8px 1fr auto;
    align-items: center;
    gap: var(--space-sm);
    width: 100%;
    padding: var(--space-sm) var(--space-md);
    border-radius: var(--radius-sm);
    border: none;
    background: transparent;
    cursor: pointer;
    text-align: left;
    transition: background var(--motion-sm) var(--ease-standard);
    box-shadow: none;
    transform: none;
  }
  .rf-notif__item:hover { background: color-mix(in oklab, var(--bg-2) 60%, transparent); transform: none; filter: none; }
  .rf-notif__item:focus-visible { outline: none; box-shadow: inset var(--focus-ring); }
  .rf-notif__item.unread { background: color-mix(in oklab, var(--brand) 6%, transparent); }
  .rf-notif__item.unread:hover { background: color-mix(in oklab, var(--brand) 12%, transparent); }

  .rf-notif__item-dot {
    width: 8px; height: 8px;
    border-radius: var(--radius-full);
    background: var(--ink-3);
    align-self: center;
    flex-shrink: 0;
  }
  .rf-notif__item.unread .rf-notif__item-dot { background: var(--brand); box-shadow: 0 0 0 3px color-mix(in oklab, var(--brand) 22%, transparent); }
  .rf-notif__item-dot[data-kind="ASSIGNMENT"],
  .rf-notif__item-dot[data-kind="STAGE_CHANGE"] { background: var(--brand); }
  .rf-notif__item-dot[data-kind="REWORK"],
  .rf-notif__item-dot[data-kind="WARNING"] { background: var(--warn); }
  .rf-notif__item-dot[data-kind="ERROR"] { background: var(--error); }
  .rf-notif__item-dot[data-kind="SUCCESS"] { background: var(--ok); }

  .rf-notif__item-text {
    font-size: var(--text-sm);
    color: var(--ink-secondary);
    line-height: var(--leading-snug);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .rf-notif__item.unread .rf-notif__item-text { color: var(--ink-primary); font-weight: 500; }
  .rf-notif__item-time {
    font-size: var(--text-xs);
    color: var(--ink-tertiary);
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
  }

  .rf-notif__footer {
    margin-top: var(--space-xs);
    padding: var(--space-xs);
    border-top: 1px solid var(--divider);
    text-align: center;
  }
  .rf-notif__view-all {
    display: inline-block;
    padding: var(--space-xs) var(--space-md);
    border-radius: var(--radius-sm);
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--brand);
    text-decoration: none;
    transition: background var(--motion-sm) var(--ease-standard);
  }
  .rf-notif__view-all:hover { background: var(--brand-soft); }
  .rf-notif__view-all:focus-visible { outline: none; box-shadow: var(--focus-ring); }
</style>
