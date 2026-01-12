<script lang="ts">
  export let params = {};
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { Bell, BellRing, Check, CheckCheck, Trash2, Filter, RefreshCw, AlertTriangle, Info, Package, MessageSquare, Calendar, Settings } from 'lucide-svelte';
  import { currentUser } from '$lib/auth/user-store';

  interface Notification {
    id: number;
    type: string;
    title: string;
    message: string;
    link: string | null;
    isRead: boolean;
    sourceType: string | null;
    sourceId: string | null;
    createdAt: string;
    readAt: string | null;
  }

  let notifications: Notification[] = [];
  let loading = true;
  let filter: 'all' | 'unread' | 'read' = 'all';
  let typeFilter: string = 'all';

  const notificationTypes = [
    { value: 'all', label: 'All Types' },
    { value: 'order', label: 'Orders' },
    { value: 'chat', label: 'Messages' },
    { value: 'system', label: 'System' },
    { value: 'inventory', label: 'Inventory' }
  ];

  $: filteredNotifications = notifications.filter(n => {
    if (filter === 'unread' && n.isRead) return false;
    if (filter === 'read' && !n.isRead) return false;
    if (typeFilter !== 'all' && n.type !== typeFilter) return false;
    return true;
  });

  $: unreadCount = notifications.filter(n => !n.isRead).length;

  async function loadNotifications() {
    loading = true;
    try {
      const response = await fetch('/api/notifications');
      if (response.ok) {
        notifications = await response.json();
      }
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      loading = false;
    }
  }

  async function markAsRead(ids: number[]) {
    try {
      await fetch('/api/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids })
      });
      notifications = notifications.map(n => 
        ids.includes(n.id) ? { ...n, isRead: true, readAt: new Date().toISOString() } : n
      );
    } catch (err) {
      console.error('Failed to mark as read:', err);
    }
  }

  async function markAllAsRead() {
    try {
      await fetch('/api/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAllRead: true })
      });
      notifications = notifications.map(n => ({ ...n, isRead: true, readAt: new Date().toISOString() }));
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  }

  async function dismissNotification(id: number) {
    try {
      await fetch(`/api/notifications?id=${id}`, { method: 'DELETE' });
      notifications = notifications.filter(n => n.id !== id);
    } catch (err) {
      console.error('Failed to dismiss notification:', err);
    }
  }

  async function clearAllRead() {
    try {
      await fetch('/api/notifications', { method: 'DELETE' });
      notifications = notifications.filter(n => !n.isRead);
    } catch (err) {
      console.error('Failed to clear notifications:', err);
    }
  }

  function getIcon(type: string) {
    switch (type) {
      case 'order': return Package;
      case 'chat': return MessageSquare;
      case 'calendar': return Calendar;
      case 'alert': return AlertTriangle;
      case 'system': return Settings;
      default: return Info;
    }
  }

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  onMount(loadNotifications);
</script>

<div class="notifications-page">
  <header class="page-header">
    <div class="header-left">
      <h1>
        <Bell size={24} />
        {$t('notifications.title')}
      </h1>
      {#if unreadCount > 0}
        <span class="unread-badge">{unreadCount} unread</span>
      {/if}
    </div>
    <div class="header-actions">
      <button class="btn btn-ghost" on:click={loadNotifications} disabled={loading}>
        <span class:spinning={loading}><RefreshCw size={18} /></span>
      </button>
      {#if unreadCount > 0}
        <button class="btn btn-secondary" on:click={markAllAsRead}>
          <CheckCheck size={18} />
          Mark all read
        </button>
      {/if}
      <button class="btn btn-ghost" on:click={clearAllRead} title="Clear all read notifications">
        <Trash2 size={18} />
      </button>
    </div>
  </header>

  <div class="filters">
    <div class="filter-tabs">
      <button class="filter-tab" class:active={filter === 'all'} on:click={() => filter = 'all'}>
        All ({notifications.length})
      </button>
      <button class="filter-tab" class:active={filter === 'unread'} on:click={() => filter = 'unread'}>
        Unread ({unreadCount})
      </button>
      <button class="filter-tab" class:active={filter === 'read'} on:click={() => filter = 'read'}>
        Read ({notifications.length - unreadCount})
      </button>
    </div>
    <select class="type-filter" bind:value={typeFilter}>
      {#each notificationTypes as type}
        <option value={type.value}>{type.label}</option>
      {/each}
    </select>
  </div>

  <div class="notifications-list">
    {#if loading}
      <div class="loading-state">
        <div class="spinner"></div>
        <p>Loading notifications...</p>
      </div>
    {:else if filteredNotifications.length === 0}
      <div class="empty-state">
        <BellRing size={48} />
        <h3>No notifications</h3>
        <p class="muted">You're all caught up!</p>
      </div>
    {:else}
      {#each filteredNotifications as notification (notification.id)}
        <button 
          class="notification-card" 
          class:unread={!notification.isRead}
          on:click={() => !notification.isRead && markAsRead([notification.id])}
        >
          <div class="notification-icon" data-type={notification.type}>
            <svelte:component this={getIcon(notification.type)} size={20} />
          </div>
          <div class="notification-content">
            <h4>{notification.title}</h4>
            <p>{notification.message}</p>
            <div class="notification-meta">
              <span class="time">{formatDate(notification.createdAt)}</span>
              {#if notification.sourceType}
                <span class="source">{notification.sourceType}</span>
              {/if}
            </div>
          </div>
          <div class="notification-actions">
            {#if !notification.isRead}
              <button 
                class="action-btn" 
                title="Mark as read"
                on:click|stopPropagation={() => markAsRead([notification.id])}
              >
                <Check size={16} />
              </button>
            {/if}
            <button 
              class="action-btn" 
              title="Dismiss"
              on:click|stopPropagation={() => dismissNotification(notification.id)}
            >
              <Trash2 size={16} />
            </button>
          </div>
          {#if notification.link}
            <a href={notification.link} class="notification-link">View →</a>
          {/if}
        </button>
      {/each}
    {/if}
  </div>
</div>

<style>
  .notifications-page {
    max-width: 800px;
    margin: 0 auto;
    padding: var(--space-lg);
  }

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-lg);
    flex-wrap: wrap;
    gap: var(--space-md);
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }

  .header-left h1 {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin: 0;
    font-size: 1.5rem;
    font-weight: 700;
  }

  .unread-badge {
    font-size: 0.75rem;
    font-weight: 600;
    padding: 4px 10px;
    border-radius: 20px;
    background: var(--primary, #3b82f6);
    color: white;
  }

  .header-actions {
    display: flex;
    gap: var(--space-sm);
  }

  .btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    border: 1px solid transparent;
    transition: all 0.2s ease;
  }

  .btn-secondary {
    background: var(--bg-1);
    color: var(--text);
    border-color: var(--border);
  }

  .btn-secondary:hover {
    background: var(--bg-2);
  }

  .btn-ghost {
    background: transparent;
    color: var(--text-muted);
  }

  .btn-ghost:hover {
    background: var(--bg-2);
    color: var(--text);
  }

  :global(.spinning) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .filters {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-lg);
    gap: var(--space-md);
    flex-wrap: wrap;
  }

  .filter-tabs {
    display: flex;
    background: var(--bg-2);
    border-radius: 8px;
    padding: 4px;
    gap: 2px;
  }

  .filter-tab {
    padding: 8px 16px;
    border: none;
    background: transparent;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    color: var(--text-muted);
    transition: all 0.15s ease;
  }

  .filter-tab:hover {
    color: var(--text);
  }

  .filter-tab.active {
    background: var(--bg-1);
    color: var(--text);
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  }

  .type-filter {
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg-1);
    font-size: 13px;
    cursor: pointer;
  }

  .notifications-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .notification-card {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: var(--space-md);
    padding: var(--space-md);
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: left;
    width: 100%;
    font: inherit;
  }

  .notification-card:hover {
    border-color: var(--primary, #3b82f6);
    box-shadow: 0 4px 12px rgba(0,0,0,0.08);
  }

  .notification-card.unread {
    background: color-mix(in oklab, var(--primary, #3b82f6) 5%, var(--bg-1));
    border-left: 3px solid var(--primary, #3b82f6);
  }

  .notification-icon {
    width: 40px;
    height: 40px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-2);
    color: var(--text-muted);
  }

  .notification-icon[data-type="order"] {
    background: color-mix(in oklab, var(--primary, #3b82f6) 15%, transparent);
    color: var(--primary, #3b82f6);
  }

  .notification-icon[data-type="alert"] {
    background: color-mix(in oklab, var(--danger, #ef4444) 15%, transparent);
    color: var(--danger, #ef4444);
  }

  .notification-icon[data-type="chat"] {
    background: color-mix(in oklab, var(--success, #22c55e) 15%, transparent);
    color: var(--success, #22c55e);
  }

  .notification-content {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .notification-content h4 {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--text);
  }

  .notification-content p {
    margin: 0;
    font-size: 0.85rem;
    color: var(--text-muted);
    line-height: 1.4;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .notification-meta {
    display: flex;
    gap: var(--space-sm);
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .notification-meta .source {
    padding: 2px 6px;
    background: var(--bg-2);
    border-radius: 4px;
  }

  .notification-actions {
    display: flex;
    gap: 4px;
    align-items: flex-start;
  }

  .action-btn {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    border-radius: 6px;
    cursor: pointer;
    color: var(--text-muted);
    transition: all 0.15s ease;
  }

  .action-btn:hover {
    background: var(--bg-2);
    color: var(--text);
  }

  .notification-link {
    grid-column: 2;
    font-size: 0.85rem;
    color: var(--primary, #3b82f6);
    text-decoration: none;
    font-weight: 500;
  }

  .notification-link:hover {
    text-decoration: underline;
  }

  .empty-state, .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 20px;
    color: var(--text-muted);
    text-align: center;
  }

  .empty-state h3, .loading-state h3 {
    margin: var(--space-md) 0 var(--space-xs);
    font-size: 1.1rem;
    color: var(--text);
  }

  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--border);
    border-top-color: var(--primary, #3b82f6);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @media (max-width: 640px) {
    .notifications-page {
      padding: var(--space-md);
    }

    .page-header {
      flex-direction: column;
      align-items: flex-start;
    }

    .filters {
      flex-direction: column;
      align-items: stretch;
    }

    .filter-tabs {
      width: 100%;
      justify-content: center;
    }

    .type-filter {
      width: 100%;
    }

    .notification-card {
      grid-template-columns: 1fr;
    }

    .notification-icon {
      display: none;
    }

    .notification-actions {
      position: absolute;
      top: var(--space-sm);
      right: var(--space-sm);
    }

    .notification-card {
      position: relative;
      padding-right: 80px;
    }
  }
</style>
