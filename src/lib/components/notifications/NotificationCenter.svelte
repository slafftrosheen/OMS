<!-- src/lib/components/notifications/NotificationCenter.svelte -->
<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import { notificationStore as notifications } from '$lib/stores/notifications';
    import Badge from '$lib/components/ui/Badge.svelte';
    import Button from '$lib/components/ui/Button.svelte';

    export let open = false;

    const dispatch = createEventDispatcher();

    $: unreadCount = $notifications.unreadCount;

    function getNotificationIcon(type: string): string {
        const icons: Record<string, string> = {
            info: 'ℹ️',
            success: '✅',
            warning: '⚠️',
            error: '❌'
        };
        return icons[type] || 'ℹ️';
    }

    function getNotificationColor(type: string): string {
        const colors: Record<string, string> = {
            info: '#3b82f6',
            success: '#10b981',
            warning: '#f59e0b',
            error: '#ef4444'
        };
        return colors[type] || '#3b82f6';
    }

    function formatTimestamp(timestamp: string): string {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        
        return date.toLocaleDateString();
    }

    async function handleMarkAsRead(id: string) {
        try {
            await fetch(`/api/notifications/${id}/read`, { method: 'POST' });
            notifications.markAsRead(id);
        } catch (error) {
            console.error('Failed to mark notification as read:', error);
        }
    }

    async function handleMarkAllAsRead() {
        try {
            await fetch('/api/notifications/read-all', { method: 'POST' });
            // Note: In a real component, currentUser.id would be passed in
            // notifications.markAllAsRead(currentUser.id);
        } catch (error) {
            console.error('Failed to mark all as read:', error);
        }
    }

    function handleNotificationClick(notification: any) {
        if (!notification.read) {
            handleMarkAsRead(notification.id);
        }

        if (notification.action_url) {
            window.location.href = notification.action_url;
        }

        dispatch('notificationClick', notification);
    }

    function handleRemove(id: string, event: Event) {
        event.stopPropagation();
        notifications.delete(id);
    }

    function toggleOpen() {
        open = !open;
    }
</script>

<div class="notification-center">
    <button class="notification-trigger" on:click={toggleOpen} aria-label="Open notifications">
        <span class="notification-icon">🔔</span>
        {#if unreadCount > 0}
            <Badge variant="danger" size="sm" class="notification-badge">
                {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
        {/if}
    </button>

    {#if open}
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <div class="notification-overlay" on:click={toggleOpen} role="button" tabindex="-1"></div>
        
        <div class="notification-panel">
            <div class="panel-header">
                <h3 class="panel-title">Notifications</h3>
                {#if unreadCount > 0}
                    <button class="mark-all-read" on:click={handleMarkAllAsRead}>
                        Mark all as read
                    </button>
                {/if}
            </div>

            <div class="notifications-list">
                {#if $notifications.items.length === 0}
                    <div class="empty-state">
                        <p class="empty-message">No notifications</p>
                        <p class="empty-hint">You're all caught up!</p>
                    </div>
                {:else}
                    {#each $notifications.items as notification (notification.id)}
                        <div
                            class="notification-item"
                            class:unread={!notification.read}
                            on:click={() => handleNotificationClick(notification)}
                            role="button"
                            tabindex="0"
                            on:keypress={(e) => e.key === 'Enter' && handleNotificationClick(notification)}
                        >
                            <div
                                class="notification-indicator"
                                style="background: {getNotificationColor(notification.type)}"
                            >
                                {getNotificationIcon(notification.type)}
                            </div>

                            <div class="notification-content">
                                <h4 class="notification-title">{notification.title}</h4>
                                <p class="notification-message">{notification.message}</p>
                                <span class="notification-time">
                                    {formatTimestamp(notification.created_at)}
                                </span>
                            </div>

                            <button
                                class="notification-remove"
                                on:click={(e) => handleRemove(notification.id, e)}
                                aria-label="Remove notification"
                            >
                                ✕
                            </button>
                        </div>
                    {/each}
                {/if}
            </div>

            {#if $notifications.items.length > 0}
                <div class="panel-footer">
                    <Button variant="ghost" size="sm" on:click={() => notifications.clear()}>
                        Clear all
                    </Button>
                </div>
            {/if}
        </div>
    {/if}
</div>

<style>
    .notification-center {
        position: relative;
    }

    .notification-trigger {
        position: relative;
        background: none;
        border: none;
        padding: 0.5rem;
        cursor: pointer;
        font-size: 1.5rem;
        border-radius: 0.375rem;
        transition: background-color 0.15s ease;
    }

    .notification-trigger:hover {
        background-color: var(--color-gray-100, #f3f4f6);
    }

    .notification-icon {
        display: block;
    }

    .notification-badge {
        position: absolute;
        top: 0;
        right: 0;
        transform: translate(25%, -25%);
    }

    .notification-overlay {
        position: fixed;
        inset: 0;
        z-index: 999;
        background: transparent;
    }

    .notification-panel {
        position: absolute;
        top: calc(100% + 0.5rem);
        right: 0;
        width: 400px;
        max-width: calc(100vw - 2rem);
        max-height: 600px;
        background: white;
        border: 1px solid var(--color-border, #e5e7eb);
        border-radius: 0.5rem;
        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1),
                    0 4px 6px -2px rgba(0, 0, 0, 0.05);
        z-index: 1000;
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }

    .panel-header {
        padding: 1rem;
        border-bottom: 1px solid var(--color-border, #e5e7eb);
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: var(--color-gray-50, #f9fafb);
    }

    .panel-title {
        font-size: 1.125rem;
        font-weight: 600;
        margin: 0;
        color: var(--color-text, #111827);
    }

    .mark-all-read {
        background: none;
        border: none;
        color: var(--color-primary, #0066cc);
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
        padding: 0.25rem 0.5rem;
        border-radius: 0.25rem;
        transition: background-color 0.15s ease;
    }

    .mark-all-read:hover {
        background-color: var(--color-gray-200, #e5e7eb);
    }

    .notifications-list {
        flex: 1;
        overflow-y: auto;
    }

    .empty-state {
        padding: 3rem 2rem;
        text-align: center;
    }

    .empty-message {
        font-size: 1rem;
        color: var(--color-gray-700, #374151);
        margin: 0 0 0.5rem 0;
    }

    .empty-hint {
        font-size: 0.875rem;
        color: var(--color-gray-500, #9ca3af);
        margin: 0;
    }

    .notification-item {
        display: flex;
        gap: 0.75rem;
        padding: 1rem;
        border-bottom: 1px solid var(--color-border, #e5e7eb);
        cursor: pointer;
        transition: background-color 0.15s ease;
        position: relative;
    }

    .notification-item:hover {
        background-color: var(--color-gray-50, #f9fafb);
    }

    .notification-item.unread {
        background-color: #eff6ff;
    }

    .notification-item.unread::before {
        content: '';
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 3px;
        background: var(--color-primary, #0066cc);
    }

    .notification-indicator {
        width: 2.5rem;
        height: 2.5rem;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.25rem;
        flex-shrink: 0;
        color: white;
    }

    .notification-content {
        flex: 1;
        min-width: 0;
    }

    .notification-title {
        font-size: 0.875rem;
        font-weight: 600;
        margin: 0 0 0.25rem 0;
        color: var(--color-text, #111827);
    }

    .notification-message {
        font-size: 0.875rem;
        color: var(--color-gray-600, #6b7280);
        margin: 0 0 0.375rem 0;
        line-height: 1.4;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }

    .notification-time {
        font-size: 0.75rem;
        color: var(--color-gray-500, #9ca3af);
    }

    .notification-remove {
        background: none;
        border: none;
        color: var(--color-gray-400, #9ca3af);
        cursor: pointer;
        padding: 0.25rem;
        width: 1.5rem;
        height: 1.5rem;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 0.25rem;
        transition: all 0.15s ease;
        flex-shrink: 0;
    }

    .notification-remove:hover {
        background-color: var(--color-gray-200, #e5e7eb);
        color: var(--color-gray-700, #374151);
    }

    .panel-footer {
        padding: 0.75rem;
        border-top: 1px solid var(--color-border, #e5e7eb);
        display: flex;
        justify-content: center;
        background: var(--color-gray-50, #f9fafb);
    }

    /* Custom scrollbar */
    .notifications-list::-webkit-scrollbar {
        width: 0.5rem;
    }

    .notifications-list::-webkit-scrollbar-track {
        background: var(--color-gray-100, #f3f4f6);
    }

    .notifications-list::-webkit-scrollbar-thumb {
        background: var(--color-gray-400, #9ca3af);
        border-radius: 0.25rem;
    }

    @media (max-width: 640px) {
        .notification-panel {
            width: calc(100vw - 1rem);
            right: 0.5rem;
        }
    }
</style>