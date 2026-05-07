<script lang="ts">
  import { base } from '$app/paths';
  import { page } from '$app/state';
  import { t } from 'svelte-i18n';
  import Icon from '$lib/ui/Icon.svelte';
  import { notificationStore } from '$lib/stores/notifications';
  import { toggleChat, isChatOpen, unreadCount as chatUnread } from '$lib/chat/chat-store';

  const links = [
    { href: '/',         icon: 'layout-dashboard' as const, label: 'nav.dashboard', default: 'Dashboard' },
    { href: '/orders',   icon: 'clipboard-list'   as const, label: 'nav.orders',    default: 'Orders' },
    { href: '/calendar', icon: 'calendar'          as const, label: 'nav.calendar',  default: 'Calendar' },
    { href: '/inventory',icon: 'package'           as const, label: 'nav.inventory', default: 'Inventory' },
  ] as const;

  let currentPath  = $derived(page.url.pathname);
  let unreadCount  = $derived($notificationStore.unreadCount);
  let chatOpen     = $derived($isChatOpen);
  let chatUnreadN  = $derived($chatUnread);

  function isActive(href: string) {
    const full = `${base}${href}`;
    return href === '/'
      ? currentPath === base || currentPath === `${base}/`
      : currentPath.startsWith(full);
  }

  let notifActive = $derived(
    currentPath === `${base}/notifications` || currentPath === '/notifications'
  );
</script>

<nav class="rf-bottomnav" aria-label={$t('a11y.nav', { default: 'Primary navigation' })}>
  {#each links as link}
    {@const active = isActive(link.href)}
    <a
      href="{base}{link.href}"
      class="rf-bottomnav__item"
      aria-current={active ? 'page' : undefined}
      aria-label={$t(link.label, { default: link.default })}
    >
      <span class="rf-bottomnav__pill" aria-hidden="true">
        <Icon name={link.icon} size="md" />
      </span>
      <span class="rf-bottomnav__label">{$t(link.label, { default: link.default })}</span>
    </a>
  {/each}

  <!-- Chat toggle with unread badge -->
  <button
    class="rf-bottomnav__item rf-bottomnav__item--btn"
    class:is-active={chatOpen}
    onclick={toggleChat}
    aria-pressed={chatOpen}
    aria-label="{$t('chat.title', { default: 'Chat' })}{chatUnreadN ? ` (${chatUnreadN})` : ''}"
    type="button"
  >
    <span class="rf-bottomnav__pill rf-bottomnav__pill--chat" aria-hidden="true">
      <Icon name="message-square" size="md" />
      {#if chatUnreadN > 0}
        <span class="rf-bottomnav__badge">{chatUnreadN > 9 ? '9+' : chatUnreadN}</span>
      {/if}
    </span>
    <span class="rf-bottomnav__label">{$t('chat.title', { default: 'Chat' })}</span>
  </button>

  <!-- Notifications with live badge -->
  <a
    href="{base}/notifications"
    class="rf-bottomnav__item"
    aria-current={notifActive ? 'page' : undefined}
    aria-label="{$t('notifications.title', { default: 'Notifications' })}{unreadCount ? ` (${unreadCount})` : ''}"
  >
    <span class="rf-bottomnav__pill rf-bottomnav__pill--notif" aria-hidden="true">
      <Icon name="bell" size="md" />
      {#if unreadCount > 0}
        <span class="rf-bottomnav__badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
      {/if}
    </span>
    <span class="rf-bottomnav__label">{$t('notifications.title', { default: 'Notifications' })}</span>
  </a>
</nav>

<style>
  .rf-bottomnav {
    position: fixed;
    left: 0; right: 0; bottom: 0;
    padding:
      var(--space-xs)
      max(var(--space-md), env(safe-area-inset-right,  0px))
      calc(var(--space-sm) + env(safe-area-inset-bottom, 0px))
      max(var(--space-md), env(safe-area-inset-left, 0px));
    background: var(--glass-bg-strong);
    backdrop-filter: var(--glass-material-thick);
    -webkit-backdrop-filter: var(--glass-material-thick);
    border-top: 1px solid var(--separator-opaque, var(--divider));
    box-shadow: var(--glass-border-highlight), 0 -8px 32px rgb(var(--shadow-rgb) / 0.10);
    display: none;
    justify-content: space-around;
    align-items: flex-start;
    gap: var(--space-xxs);
    z-index: var(--z-docked);
    animation: rf-slide-up var(--motion-md) var(--ease-emphasized) both;
  }

  .rf-bottomnav__item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-xxs);
    padding: var(--space-xs) var(--space-sm);
    border-radius: var(--radius-md);
    text-decoration: none;
    color: var(--ink-tertiary);
    flex: 1;
    max-width: 92px;
    min-width: 48px;
    min-height: 56px;
    transition:
      color     var(--motion-sm) var(--ease-standard),
      transform var(--motion-xs) var(--ease-spring-soft);
  }
  .rf-bottomnav__item:hover  { color: var(--ink-secondary); }
  .rf-bottomnav__item:active { transform: scale(0.94); }
  .rf-bottomnav__item[aria-current="page"] { color: var(--brand); }
  .rf-bottomnav__item:focus-visible { outline: none; box-shadow: var(--focus-ring); }

  /* Pill indicator sits behind the icon and animates on active */
  .rf-bottomnav__pill {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 32px;
    border-radius: var(--radius-md);
    transition:
      background var(--motion-sm) var(--ease-standard),
      transform  var(--motion-xs) var(--ease-spring-soft);
  }
  .rf-bottomnav__item[aria-current="page"] .rf-bottomnav__pill {
    background: var(--brand-soft);
    transform: translateY(-3px);
    box-shadow: 0 6px 14px color-mix(in oklab, var(--brand) 22%, transparent);
  }

  .rf-bottomnav__badge {
    position: absolute;
    top: -4px; right: -6px;
    min-width: 16px; height: 16px;
    border-radius: var(--radius-full);
    background: var(--error);
    color: white;
    font-size: 9px;
    font-weight: 700;
    display: grid;
    place-items: center;
    padding: 0 3px;
    border: 2px solid var(--bg-0);
    line-height: 1;
    animation: rf-scale-in var(--motion-sm) var(--ease-spring-soft) both;
  }

  .rf-bottomnav__label {
    font-size: calc(var(--text-xs) * 0.95);
    font-weight: 500;
    line-height: 1;
    letter-spacing: var(--tracking-wide);
  }
  .rf-bottomnav__item[aria-current="page"] .rf-bottomnav__label {
    font-weight: 700;
    color: var(--brand);
  }

  /* Button variant of nav item (chat toggle) */
  .rf-bottomnav__item--btn {
    background: none;
    border: none;
    cursor: pointer;
    font: inherit;
  }
  .rf-bottomnav__item--btn.is-active { color: var(--brand); }
  .rf-bottomnav__item--btn.is-active .rf-bottomnav__pill {
    background: var(--brand-soft);
    transform: translateY(-3px);
    box-shadow: 0 6px 14px color-mix(in oklab, var(--brand) 22%, transparent);
  }
  .rf-bottomnav__item--btn.is-active .rf-bottomnav__label {
    font-weight: 700;
    color: var(--brand);
  }

  @media (max-width: 1024px) {
    .rf-bottomnav { display: flex; }
  }
  @media (prefers-reduced-motion: reduce) {
    .rf-bottomnav { animation: none; }
  }
</style>
