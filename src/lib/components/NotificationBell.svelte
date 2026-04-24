<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { notificationStore, unreadNotifications } from '$lib/stores/notifications';
  import { page } from '$app/state';
  import { fly, fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';

  let userId = $derived(page.data.session?.user?.id);

  let showDropdown = false;
  let unsubscribe: (() => void) | null = null;

  function getNotificationIcon(type: string) {
    const icons: Record<string, string> = {
      INFO: 'ℹ️',
      SUCCESS: '✅',
      WARNING: '⚠️',
      ERROR: '❌',
      ASSIGNMENT: '👤',
      REWORK: '🔄',
      STAGE_CHANGE: '🔄'
    };
    return icons[type] || 'ℹ️';
  }

  function getNotificationColor(type: string) {
    const colors: Record<string, string> = {
      INFO: '#007bff',
      SUCCESS: '#28a745',
      WARNING: '#ffc107',
      ERROR: '#dc3545',
      ASSIGNMENT: '#6f42c1',
      REWORK: '#fd7e14',
      STAGE_CHANGE: '#17a2b8'
    };
    return colors[type] || '#6c757d';
  }

  function formatTimeAgo(timestamp: string) {
    const now = new Date();
    const then = new Date(timestamp);
    const diffMs = now.getTime() - then.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;

    return then.toLocaleDateString();
  }

  async function handleNotificationClick(notification: any) {
    await notificationStore.markAsRead(notification.id);

    // Navigate to reference if available
    if (notification.reference_type === 'order' && notification.reference_id) {
      window.location.href = `/orders/${notification.reference_id}`;
    }

    showDropdown = false;
  }

  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.notification-bell-container')) {
      showDropdown = false;
    }
  }

  onMount(async () => {
    if (userId) {
      await notificationStore.load(userId);
      unsubscribe = notificationStore.subscribe_realtime(userId);

      // Request notification permission
      await notificationStore.requestPermission();
    }

    document.addEventListener('click', handleClickOutside);
  });

  onDestroy(() => {
    if (unsubscribe) unsubscribe();
    document.removeEventListener('click', handleClickOutside);
  });
</script>

<div class="notification-bell-container">
  <button
    class="notification-bell"
    class:has-unread={$notificationStore.unreadCount > 0}
    onclick={() => showDropdown = !showDropdown}
    aria-label="Notifications"
    aria-expanded={showDropdown}
  >
    <svg class="bell-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>

    {#if $notificationStore.unreadCount > 0}
      <span class="badge" transition:fly={{ y: -10, duration: 200 }}>
        {$notificationStore.unreadCount > 99 ? '99+' : $notificationStore.unreadCount}
      </span>
    {/if}
  </button>

  {#if showDropdown}
    <div
      class="notification-dropdown"
      transition:fly={{ y: -10, duration: 200, easing: cubicOut }}
    >
      <div class="dropdown-header">
        <h3>Notifications</h3>
        {#if $notificationStore.unreadCount > 0}
          <button
            class="mark-all-read"
            onclick={() => notificationStore.markAllAsRead(userId)}
          >
            Mark all read
          </button>
        {/if}
      </div>

      <div class="notification-list">
        {#if $notificationStore.items.length === 0}
          <div class="empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
            <p>No notifications yet</p>
          </div>
        {:else}
          {#each $notificationStore.items as notification (notification.id)}
            <button
              class="notification-item"
              class:unread={!notification.read}
              onclick={() => handleNotificationClick(notification)}
              transition:fade={{ duration: 150 }}
            >
              <div
                class="notification-icon"
                style="background-color: {getNotificationColor(notification.type)}"
              >
                {getNotificationIcon(notification.type)}
              </div>

              <div class="notification-content">
                <div class="notification-header">
                  <span class="notification-title">{notification.title}</span>
                  <span class="notification-time">{formatTimeAgo(notification.created_at)}</span>
                </div>
                <p class="notification-message">{notification.message}</p>
              </div>

              {#if !notification.read}
                <div class="unread-indicator"></div>
              {/if}
            </button>
          {/each}
        {/if}
      </div>

      {#if $notificationStore.items.length > 0}
        <div class="dropdown-footer">
          <a href="/notifications" class="view-all-link">View all notifications</a>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .notification-bell-container {
    position: relative;
  }

  .notification-bell {
    position: relative;
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 0.5rem;
    border-radius: 8px;
    transition: background 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .notification-bell:hover {
    background: var(--bg-2);
  }

  .notification-bell.has-unread .bell-icon {
    animation: ring 2s ease-in-out infinite;
  }

  @keyframes ring {
    0%, 100% { transform: rotate(0deg); }
    10%, 30% { transform: rotate(-10deg); }
    20%, 40% { transform: rotate(10deg); }
    50% { transform: rotate(0deg); }
  }

  .bell-icon {
    color: var(--text);
  }

  .badge {
    position: absolute;
    top: 2px;
    right: 2px;
    background: var(--danger);
    color: var(--bg-0);
    font-size: 0.625rem;
    font-weight: 700;
    padding: 0.125rem 0.375rem;
    border-radius: 10px;
    min-width: 18px;
    text-align: center;
  }

  .notification-dropdown {
    position: absolute;
    top: calc(100% + 0.5rem);
    right: 0;
    width: 400px;
    max-width: calc(100vw - 2rem);
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 4px 20px color-mix(in oklab, var(--bg-0) 15%, transparent);
    z-index: var(--z-modal);
    max-height: 600px;
    display: flex;
    flex-direction: column;
  }

  .dropdown-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid var(--border);
  }

  .dropdown-header h3 {
    margin: 0;
    font-size: 1.125rem;
    color: var(--text);
  }

  .mark-all-read {
    background: transparent;
    border: none;
    color: var(--accent-1);
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    transition: background 0.2s ease;
  }

  .mark-all-read:hover {
    background: var(--bg-2);
  }

  .notification-list {
    overflow-y: auto;
    max-height: 450px;
  }

  .notification-item {
    display: flex;
    gap: 1rem;
    padding: 1rem 1.5rem;
    border: none;
    background: transparent;
    border-bottom: 1px solid var(--border);
    cursor: pointer;
    transition: background 0.2s ease;
    width: 100%;
    text-align: left;
    position: relative;
  }

  .notification-item:hover {
    background: var(--bg-2);
  }

  .notification-item.unread {
    background: rgba(var(--accent-1-rgb), 0.05);
  }

  .notification-icon {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.25rem;
    flex-shrink: 0;
  }

  .notification-content {
    flex: 1;
    min-width: 0;
  }

  .notification-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 0.5rem;
    margin-bottom: 0.25rem;
  }

  .notification-title {
    font-weight: 600;
    color: var(--text);
    font-size: 0.875rem;
  }

  .notification-time {
    font-size: 0.75rem;
    color: var(--muted);
    white-space: nowrap;
  }

  .notification-message {
    margin: 0;
    font-size: 0.875rem;
    color: var(--muted);
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .unread-indicator {
    position: absolute;
    top: 50%;
    right: 0.75rem;
    transform: translateY(-50%);
    width: 8px;
    height: 8px;
    background: var(--accent-1);
    border-radius: 50%;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem 2rem;
    color: var(--muted);
    text-align: center;
  }

  .empty-state svg {
    margin-bottom: 1rem;
    opacity: 0.5;
  }

  .empty-state p {
    margin: 0;
    font-size: 0.875rem;
  }

  .dropdown-footer {
    padding: 0.75rem 1.5rem;
    border-top: 1px solid var(--border);
    text-align: center;
  }

  .view-all-link {
    color: var(--accent-1);
    font-size: 0.875rem;
    font-weight: 600;
    text-decoration: none;
    transition: opacity 0.2s ease;
  }

  .view-all-link:hover {
    opacity: 0.8;
  }

  @media (max-width: 480px) {
    .notification-dropdown {
      width: calc(100vw - 2rem);
    }
  }
</style>
