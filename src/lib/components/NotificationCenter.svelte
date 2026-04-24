<script lang="ts">
    import { onMount } from 'svelte';
    import { notificationService } from '$lib/notifications/NotificationService';
    import Icon from '$lib/ui/Icon.svelte';
    import type { Notification } from '$lib/notifications/NotificationService';

    let {
        visible = $bindable(false)
    }: {
        visible?: boolean;
    } = $props();

    let notifications = $state<Notification[]>([]);
    let unreadCount = $state(0);
    let filter = $state<'all' | 'unread'>('all');
    let loading = $state(false);

    const unsubscribe = notificationService.getNotifications().subscribe(n => {
        notifications = n;
    });

    const unsubscribeCount = notificationService.getUnreadCount().subscribe(c => {
        unreadCount = c;
    });

    function getIcon(type: string) {
        switch (type) {
            case 'success': return Check;
            case 'warning': return AlertCircle;
            case 'error': return X;
            default: return Info;
        }
    }

    function getTypeClass(type: string) {
        switch (type) {
            case 'success': return 'success';
            case 'warning': return 'warning';
            case 'error': return 'error';
            default: return 'info';
        }
    }

    async function markAsRead(notificationId: string) {
        await notificationService.markAsRead(notificationId);
    }

    async function markAllAsRead() {
        loading = true;
        await notificationService.markAllAsRead();
        loading = false;
    }

    function handleNotificationClick(notification: Notification) {
        if (!notification.read) {
            markAsRead(notification.id);
        }

        if (notification.action_url) {
            window.location.href = notification.action_url;
        }
    }

    function formatTime(timestamp: string) {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;

        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `${diffHours}h ago`;

        const diffDays = Math.floor(diffHours / 24);
        if (diffDays < 7) return `${diffDays}d ago`;

        return date.toLocaleDateString();
    }

    let filteredNotifications = $derived(filter === 'unread'
        ? notifications.filter(n => !n.read)
        : notifications);

    onMount(() => {
        return () => {
            unsubscribe();
            unsubscribeCount();
        };
    });
</script>

<div class="notification-trigger">
    <button class="bell-button" onclick={() => visible = !visible}>
        <Bell size={20} />
        {#if unreadCount > 0}
            <span class="badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
        {/if}
    </button>

    {#if visible}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="notification-panel" onclick={(e) => e.stopPropagation()}>
            <div class="panel-header">
                <h3>Notifications</h3>
                {#if unreadCount > 0}
                    <button
                        class="mark-all-btn"
                        onclick={markAllAsRead}
                        disabled={loading}
                    >
                        <CheckCheck size={16} />
                        Mark all read
                    </button>
                {/if}
            </div>

            <div class="filter-tabs">
                <button
                    class:active={filter === 'all'}
                    onclick={() => filter = 'all'}
                >
                    All ({notifications.length})
                </button>
                <button
                    class:active={filter === 'unread'}
                    onclick={() => filter = 'unread'}
                >
                    Unread ({unreadCount})
                </button>
            </div>

            <div class="notifications-list">
                {#if filteredNotifications.length === 0}
                    <div class="empty-state">
                        <Bell size={48} />
                        <p>No notifications</p>
                    </div>
                {:else}
                    {#each filteredNotifications as notification}
                        {@const IconComponent = getIcon(notification.type)}
                        <!-- svelte-ignore a11y_click_events_have_key_events -->
                        <!-- svelte-ignore a11y_no_static_element_interactions -->
                        <div
                            class="notification-item"
                            class:unread={!notification.read}
                            class:clickable={!!notification.action_url}
                            onclick={() => handleNotificationClick(notification)}
                        >
                            <div class="notif-icon {getTypeClass(notification.type)}">
                                <IconComponent size={16} />
                            </div>

                            <div class="notif-content">
                                <h4>{notification.title}</h4>
                                <p>{notification.message}</p>
                                <div class="notif-meta">
                                    <Clock size={12} />
                                    <span>{formatTime(notification.created_at)}</span>
                                </div>
                            </div>

                            {#if !notification.read}
                                <button
                                    class="mark-read-btn"
                                    onclick={(e) => { e.stopPropagation(); markAsRead(notification.id); }}
                                    title="Mark as read"
                                >
                                    <Check size={16} />
                                </button>
                            {/if}
                        </div>
                    {/each}
                {/if}
            </div>
        </div>
    {/if}
</div>

<style>
    .notification-trigger {
        position: relative;
    }

    .bell-button {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        background: white;
        border: 1px solid var(--border);
        border-radius: 50%;
        cursor: pointer;
        transition: all 0.2s;
    }

    .bell-button:hover {
        background: var(--bg-2);
        border-color: var(--brand);
    }

    .badge {
        position: absolute;
        top: -4px;
        right: -4px;
        background: var(--error);
        color: var(--bg-0);
        font-size: 0.625rem;
        font-weight: 700;
        padding: 2px 5px;
        border-radius: 10px;
        min-width: 18px;
        text-align: center;
    }

    .notification-panel {
        position: absolute;
        top: 50px;
        right: 0;
        width: 400px;
        max-height: 600px;
        background: white;
        border: 1px solid var(--border);
        border-radius: 12px;
        box-shadow: 0 10px 40px color-mix(in oklab, var(--bg-0) 15%, transparent);
        display: flex;
        flex-direction: column;
        animation: slideDown 0.2s ease;
        z-index: var(--z-modal);
    }

    @keyframes slideDown {
        from {
            opacity: 0;
            transform: translateY(-10px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    .panel-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 15px 20px;
        border-bottom: 1px solid var(--border);
    }

    .panel-header h3 {
        margin: 0;
        font-size: 1.125rem;
        font-weight: 600;
    }

    .mark-all-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        background: var(--bg-2);
        border: none;
        border-radius: 6px;
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.2s;
    }

    .mark-all-btn:hover:not(:disabled) {
        background: var(--border);
    }

    .mark-all-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .filter-tabs {
        display: flex;
        padding: 10px 20px;
        gap: 10px;
        border-bottom: 1px solid var(--border);
    }

    .filter-tabs button {
        padding: 6px 12px;
        background: none;
        border: 1px solid transparent;
        border-radius: 6px;
        font-size: 0.875rem;
        font-weight: 500;
        color: var(--ink-tertiary);
        cursor: pointer;
        transition: all 0.2s;
    }

    .filter-tabs button:hover {
        background: var(--bg-2);
    }

    .filter-tabs button.active {
        background: var(--brand-soft);
        border-color: var(--brand);
        color: var(--brand);
    }

    .notifications-list {
        flex: 1;
        overflow-y: auto;
        padding: 10px;
    }

    .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 60px 20px;
        color: var(--muted);
    }

    .empty-state p {
        margin-top: 15px;
        font-size: 0.938rem;
    }

    .notification-item {
        display: flex;
        gap: 12px;
        padding: 12px;
        border-radius: 8px;
        margin-bottom: 8px;
        transition: background 0.2s;
        position: relative;
    }

    .notification-item:hover {
        background: var(--bg-2);
    }

    .notification-item.unread {
        background: var(--brand-soft);
    }

    .notification-item.unread:hover {
        background: var(--brand-soft);
    }

    .notification-item.clickable {
        cursor: pointer;
    }

    .notif-icon {
        width: 32px;
        height: 32px;
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        color: var(--bg-0);
    }

    .notif-icon.info { background: var(--brand); }
    .notif-icon.success { background: var(--ok); }
    .notif-icon.warning { background: var(--warn); }
    .notif-icon.error { background: var(--error); }

    .notif-content {
        flex: 1;
        min-width: 0;
    }

    .notif-content h4 {
        margin: 0 0 4px 0;
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--ink-primary);
    }

    .notif-content p {
        margin: 0 0 6px 0;
        font-size: 0.813rem;
        color: var(--ink-tertiary);
        line-height: 1.4;
    }

    .notif-meta {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 0.75rem;
        color: var(--muted);
    }

    .mark-read-btn {
        width: 28px;
        height: 28px;
        background: none;
        border: 1px solid var(--border);
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        flex-shrink: 0;
        color: var(--ink-tertiary);
        transition: all 0.2s;
    }

    .mark-read-btn:hover {
        background: var(--ok);
        border-color: var(--ok);
        color: var(--bg-0);
    }

    @media (max-width: 480px) {
        .notification-panel {
            width: calc(100vw - 40px);
            max-width: 400px;
        }
    }
</style>
