<script lang="ts">
  import Icon from '$lib/ui/Icon.svelte';
  import { notices } from '$lib/notify/bus';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { notificationStore } from '$lib/stores/notifications';
  import { currentUser } from '$lib/auth/authState.svelte';

  let open = $state(false);
  let btn: HTMLButtonElement | undefined = $state();

  let noticesList = $derived($notices);
  let storeState = $derived($notificationStore);

  // Ephemeral notices + unread DB notifications merged for display
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

  async function handleItemClick(item: any) {
    if (!item.ephemeral && item.id && !item.read) {
      await notificationStore.markAsRead(item.id);
    }
  }

  async function markAllRead() {
    const userId = $currentUser?.id;
    if (userId) await notificationStore.markAllAsRead(userId);
  }

  onMount(() => {
    const userId = $currentUser?.id;
    if (!userId) return;
    notificationStore.load(userId);
    const unsubscribe = notificationStore.subscribe_realtime(userId);
    return unsubscribe;
  });
</script>

<div class="rf-notif">
  <button
    bind:this={btn}
    class="rf-notif__trigger"
    type="button"
    aria-haspopup="menu"
    aria-expanded={open}
    aria-label="{$t('notifications.title', { default: 'Notifications' })}{count ? ` (${count})` : ''}"
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
        <span class="rf-notif__title">{$t('notifications.title', { default: 'Notifications' })}</span>
        <div class="rf-notif__header-actions">
          {#if count}
            <span class="rf-notif__count">{count}</span>
            <button class="rf-notif__mark-all" type="button" onclick={markAllRead}>
              {$t('notifications.mark_all_read', { default: 'Mark all read' })}
            </button>
          {/if}
        </div>
      </div>

      {#if allItems.length === 0}
        <div class="rf-notif__empty">{$t('notifications.empty', { default: 'No notifications yet.' })}</div>
      {:else}
        {#each allItems as item}
          <button
            role="menuitem"
            class="rf-notif__item"
            class:unread={!item.read}
            type="button"
            onclick={() => handleItemClick(item)}
          >
            <span class="rf-notif__item-text" data-kind={item.kind}>{item.text}</span>
            {#if item.time}
              <span class="rf-notif__item-time">
                {new Date(item.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            {/if}
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
    box-shadow: none;
    transform: none;
  }
  .rf-notif__item:hover { background: color-mix(in oklab, var(--bg-2) 60%, transparent); transform: none; filter: none; }
  .rf-notif__item:focus-visible { outline: none; box-shadow: inset var(--focus-ring); }
  .rf-notif__item.unread { background: color-mix(in oklab, var(--brand) 6%, transparent); }
  .rf-notif__item.unread:hover { background: color-mix(in oklab, var(--brand) 12%, transparent); }

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
