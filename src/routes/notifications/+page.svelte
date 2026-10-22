<script lang="ts">
  import BellRing from 'lucide-svelte/icons/bell-ring';
  import Check from 'lucide-svelte/icons/check';
  import CheckCheck from 'lucide-svelte/icons/check-check';
  import RefreshCw from 'lucide-svelte/icons/refresh-cw';
  import Trash2 from 'lucide-svelte/icons/trash-2';

  import { t } from 'svelte-i18n';
  import Icon from '$lib/ui/Icon.svelte';
  import { currentUser } from '$lib/auth/authState.svelte';
  import { notificationStore } from '$lib/stores/notifications';
  import type { Notification } from '$lib/stores/notifications';
  import { base } from '$app/paths';
  import SemanticBadge from '$lib/badges/SemanticBadge.svelte';
  import { badgeDescriptor, notificationBadge } from '$lib/badges/catalog';

  let filter: 'all' | 'unread' | 'read' = $state('all');
  let typeFilter: string = $state('all');

  let storeState  = $derived($notificationStore);
  let allItems    = $derived(storeState.items);
  let unreadCount = $derived(storeState.unreadCount);

  let filteredNotifications = $derived(allItems.filter((n: Notification) => {
    if (filter === 'unread' && n.read)  return false;
    if (filter === 'read'   && !n.read) return false;
    if (typeFilter !== 'all' && n.category !== typeFilter.toUpperCase()) return false;
    return true;
  }));

  async function handleRefresh() {
    const userId = $currentUser?.id;
    if (userId) await notificationStore.load(userId);
  }

  async function handleMarkAllRead() {
    const userId = $currentUser?.id;
    if (userId) await notificationStore.markAllAsRead(userId);
  }

  async function handleMarkRead(id: string) {
    await notificationStore.markAsRead(id);
  }

  async function handleDismiss(id: string) {
    await notificationStore.dismiss(id);
  }

  async function handleClearRead() {
    await notificationStore.dismissRead();
  }

  const destination = (link: string) => base && link !== base && !link.startsWith(`${base}/`) ? `${base}${link}` : link;

  function formatDate(dateStr: string): string {
    const date   = new Date(dateStr);
    const now    = new Date();
    const diffMs = now.getTime() - date.getTime();
    const mins   = Math.floor(diffMs / 60_000);
    const hours  = Math.floor(diffMs / 3_600_000);
    const days   = Math.floor(diffMs / 86_400_000);

    if (mins  <  1) return '< 1m';
    if (mins  < 60) return `${mins}m`;
    if (hours < 24) return `${hours}h`;
    if (days  <  7) return `${days}d`;
    return date.toLocaleDateString();
  }

  $effect(() => {
    const userId = $currentUser?.id;
    if (!userId) { notificationStore.clear(); return; }
    return notificationStore.connect(userId);
  });
</script>

<svelte:head>
  <title>{$t('notifications.title')} — OMS</title>
</svelte:head>

<div class="notif-page">
  <!-- Header -->
  <header class="notif-header">
    <div class="notif-header__left">
      <Icon name="bell" size="lg" />
      <h1>{$t('notifications.title')}</h1>
      {#if unreadCount > 0}
        <SemanticBadge badge={badgeDescriptor('unread', { count: unreadCount })} />
      {/if}
    </div>
    <div class="notif-header__actions">
      <button
        class="notif-action-btn"
        onclick={handleRefresh}
        disabled={storeState.loading}
        aria-label={$t('notifications.refresh', { default: 'Refresh' })}
        title={$t('notifications.refresh', { default: 'Refresh' })}
      >
        <span class:spinning={storeState.loading}>
          <RefreshCw size={16} />
        </span>
      </button>
      {#if unreadCount > 0}
        <button class="notif-action-btn notif-action-btn--label" onclick={handleMarkAllRead}>
          <CheckCheck size={16} />
          {$t('notifications.mark_all_read')}
        </button>
      {/if}
      <button
        class="notif-action-btn"
        onclick={handleClearRead}
        aria-label={$t('notifications.clear_read', { default: 'Clear read' })}
        title={$t('notifications.clear_read', { default: 'Clear read' })}
      >
        <Trash2 size={16} />
      </button>
    </div>
  </header>

  <!-- Filters -->
  <div class="notif-filters">
    <div class="notif-tabs">
      <button class="notif-tab" class:active={filter === 'all'}    onclick={() => filter = 'all'}>
        {$t('notifications.filter.all', { default: 'All' })} ({allItems.length})
      </button>
      <button class="notif-tab" class:active={filter === 'unread'} onclick={() => filter = 'unread'}>
        {$t('notifications.filter.unread', { default: 'Unread' })} ({unreadCount})
      </button>
      <button class="notif-tab" class:active={filter === 'read'}   onclick={() => filter = 'read'}>
        {$t('notifications.filter.read', { default: 'Read' })} ({allItems.length - unreadCount})
      </button>
    </div>
    <select class="notif-type-select" bind:value={typeFilter}>
      <option value="all"       >{$t('notifications.filter.type_all',  { default: 'All Types' })}</option>
      <option value="order"     >{$t('notifications.filter.orders',    { default: 'Orders' })}</option>
      <option value="chat"      >{$t('notifications.filter.messages',  { default: 'Messages' })}</option>
      <option value="system"    >{$t('notifications.filter.system',    { default: 'System' })}</option>
      <option value="inventory" >{$t('notifications.filter.inventory', { default: 'Inventory' })}</option>
    </select>
  </div>

  {#if storeState.error}
    <p class="notif-error" role="alert">{$t('notifications.sync_failed', { default: 'Notifications could not be updated. Try again.' })}</p>
  {/if}

  <!-- List -->
  <div class="notif-list">
    {#if storeState.loading && allItems.length === 0}
      <div class="notif-state">
        <div class="rf-spinner"></div>
        <p>{$t('notifications.loading', { default: 'Loading notifications…' })}</p>
      </div>
    {:else if filteredNotifications.length === 0 && !storeState.error}
      <div class="notif-state">
        <BellRing size={48} class="notif-state__icon" />
        <p class="notif-state__title">{$t('notifications.no_notifs', { default: 'No notifications' })}</p>
        <p class="notif-state__sub">{$t('notifications.caught_up', { default: "You're all caught up!" })}</p>
      </div>
    {:else}
      {#each filteredNotifications as n (n.id)}
        <div class="notif-card" class:notif-card--unread={!n.read} role="article">
          <div class="notif-card__body">
            <div class="notif-card__badges">
              <SemanticBadge badge={notificationBadge(n)} />
              <SemanticBadge badge={badgeDescriptor(n.read ? 'read' : 'unread')} />
            </div>
            <p class="notif-card__title">
              {#if n.link}
                <a href={destination(n.link)} onclick={() => { if (!n.read) void handleMarkRead(n.id); }}>{n.title}</a>
              {:else}{n.title}{/if}
            </p>
            {#if n.message}
              <p class="notif-card__msg">{n.message}</p>
            {/if}
            <span class="notif-card__time">{formatDate(n.created_at)}</span>
          </div>

          <div class="notif-card__actions">
            {#if !n.read}
              <button
                class="notif-icon-btn"
                type="button"
                aria-label={$t('notifications.mark_read', { default: 'Mark as read' })}
                title={$t('notifications.mark_read', { default: 'Mark as read' })}
                onclick={() => handleMarkRead(n.id)}
              >
                <Check size={14} />
              </button>
            {/if}
            <button
              class="notif-icon-btn notif-icon-btn--danger"
              type="button"
              aria-label={$t('notifications.dismiss', { default: 'Dismiss' })}
              title={$t('notifications.dismiss', { default: 'Dismiss' })}
              onclick={() => handleDismiss(n.id)}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .notif-card__badges { display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px; }
  .notif-card__title a { color:inherit;text-decoration:underline;text-underline-offset:3px; }
  .notif-card__title a:focus-visible { outline:2px solid var(--focus);outline-offset:3px;border-radius:2px; }
  .notif-page {
    max-width: 720px;
    margin: 0 auto;
  }

  .notif-error {
    padding: var(--space-md);
    color: var(--text);
    border: 1px solid var(--error);
    border-radius: var(--radius-sm);
  }

  /* Header */
  .notif-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-md);
    margin-bottom: var(--space-xl);
  }
  .notif-header__left {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }
  .notif-header__left h1 {
    font-size: var(--text-2xl);
    font-weight: 700;
    margin: 0;
  }

  .notif-header__actions {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
  }

  /* Buttons */
  .notif-action-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-xs) var(--space-sm);
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--glass-bg);
    backdrop-filter: var(--glass-material-thin);
    -webkit-backdrop-filter: var(--glass-material-thin);
    color: var(--ink-secondary);
    font-size: var(--text-sm);
    font-weight: 500;
    cursor: pointer;
    transition:
      background var(--motion-sm) var(--ease-standard),
      color      var(--motion-sm) var(--ease-standard),
      transform  var(--motion-sm) var(--ease-spring-soft);
    box-shadow: none;
  }
  .notif-action-btn:hover { background: var(--bg-2); color: var(--ink-primary); transform: none; filter: none; }
  .notif-action-btn:disabled { opacity: 0.45; cursor: not-allowed; }
  .notif-action-btn--label { gap: var(--space-xs); padding: var(--space-xs) var(--space-md); }

  :global(.spinning) { animation: rf-spin 0.8s linear infinite; }

  /* Filters */
  .notif-filters {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-md);
    flex-wrap: wrap;
    margin-bottom: var(--space-lg);
  }
  .notif-tabs {
    display: flex;
    background: var(--bg-2);
    border-radius: var(--radius-md);
    padding: 3px;
    gap: 2px;
  }
  .notif-tab {
    padding: var(--space-xs) var(--space-md);
    border: none;
    background: transparent;
    border-radius: var(--radius-sm);
    font-size: var(--text-sm);
    font-weight: 500;
    cursor: pointer;
    color: var(--ink-tertiary);
    transition:
      background var(--motion-sm) var(--ease-standard),
      color      var(--motion-sm) var(--ease-standard);
    box-shadow: none;
  }
  .notif-tab:hover  { color: var(--ink-secondary); transform: none; filter: none; }
  .notif-tab.active {
    background: var(--glass-bg-strong);
    color: var(--ink-primary);
    box-shadow: var(--glass-shadow-sm);
  }
  .notif-type-select {
    min-width: 140px;
  }

  /* List */
  .notif-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  /* Empty / loading state */
  .notif-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-md);
    padding: var(--space-4xl) var(--space-xl);
    color: var(--ink-tertiary);
    text-align: center;
    animation: rf-fade-up var(--motion-md) var(--ease-standard) both;
  }
  :global(.notif-state__icon) { opacity: 0.3; }
  .notif-state__title {
    font-size: var(--text-lg);
    font-weight: 600;
    color: var(--ink-secondary);
    margin: 0;
  }
  .notif-state__sub {
    font-size: var(--text-sm);
    color: var(--ink-tertiary);
    margin: 0;
  }

  /* Card */
  .notif-card {
    display: grid;
    grid-template-columns: 40px 1fr auto;
    align-items: flex-start;
    gap: var(--space-md);
    padding: var(--space-md);
    background: var(--glass-bg);
    backdrop-filter: var(--glass-material-thin);
    -webkit-backdrop-filter: var(--glass-material-thin);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-md);
    transition:
      background  var(--motion-sm) var(--ease-standard),
      box-shadow  var(--motion-sm) var(--ease-standard),
      transform   var(--motion-sm) var(--ease-spring-soft);
    animation: rf-fade-up var(--motion-md) var(--ease-standard) both;
  }
  .notif-card:hover {
    background: var(--glass-bg-strong);
    box-shadow: var(--glass-shadow-sm);
    transform: translateY(-1px);
  }
  .notif-card--unread {
    background: color-mix(in oklab, var(--brand) 5%, var(--glass-bg));
    border-left: 3px solid var(--brand);
  }
  .notif-card--unread:hover {
    background: color-mix(in oklab, var(--brand) 8%, var(--glass-bg-strong));
  }

  .notif-card__body {
    display: flex;
    flex-direction: column;
    gap: var(--space-xxs);
    min-width: 0;
    cursor: pointer;
    padding: 2px var(--space-xs);
    border-radius: var(--radius-sm);
    transition: background var(--motion-sm) var(--ease-standard);
  }
  .notif-card__body:hover { background: color-mix(in oklab, var(--bg-2) 60%, transparent); }
  .notif-card__body:focus-visible { outline: none; box-shadow: var(--focus-ring); }

  .notif-card__title {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--ink-primary);
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .notif-card__msg {
    font-size: var(--text-xs);
    color: var(--ink-tertiary);
    margin: 0;
    line-height: var(--leading-snug);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .notif-card__time {
    font-size: var(--text-xs);
    color: var(--ink-quaternary);
    font-variant-numeric: tabular-nums;
  }

  .notif-card__actions {
    display: flex;
    gap: var(--space-xxs);
    flex-shrink: 0;
  }
  .notif-icon-btn {
    width: 30px; height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    border-radius: var(--radius-sm);
    cursor: pointer;
    color: var(--ink-tertiary);
    transition:
      background var(--motion-sm) var(--ease-standard),
      color      var(--motion-sm) var(--ease-standard);
    box-shadow: none;
  }
  .notif-icon-btn:hover { background: var(--bg-2); color: var(--ink-primary); transform: none; filter: none; }
  .notif-icon-btn--danger:hover { background: var(--error-soft); color: var(--error); }

  @media (max-width: 600px) {
    .notif-header { flex-direction: column; align-items: flex-start; }
    .notif-filters { flex-direction: column; align-items: stretch; }
    .notif-tabs { width: 100%; }
    .notif-tab { flex: 1; text-align: center; }
    .notif-type-select { width: 100%; }
    .notif-card { grid-template-columns: 36px 1fr auto; gap: var(--space-sm); }
  }
</style>
