<script lang="ts">
  import { base } from '$app/paths';
  import { page } from '$app/state';
  import { t } from 'svelte-i18n';
  import Icon from '$lib/ui/Icon.svelte';
  import { notificationStore } from '$lib/stores/notifications';

  const links = [
    { href: '/',         icon: 'layout-dashboard' as const, label: 'nav.dashboard', default: 'Dashboard' },
    { href: '/orders',   icon: 'clipboard-list'   as const, label: 'nav.orders',    default: 'Orders' },
    { href: '/calendar', icon: 'calendar'          as const, label: 'nav.calendar',  default: 'Calendar' },
    { href: '/inventory',icon: 'package'           as const, label: 'nav.inventory', default: 'Inventory' },
  ] as const;

  let currentPath  = $derived(page.url.pathname);
  let unreadCount  = $derived($notificationStore.unreadCount);

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
    box-shadow: 0 -4px 24px rgb(var(--shadow-rgb) / 0.08);
    display: none;
    justify-content: space-around;
    align-items: flex-start;
    gap: var(--space-xxs);
    z-index: var(--z-docked);
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
    max-width: 88px;
    min-width: 44px;
    transition: color var(--motion-sm) var(--ease-standard);
  }
  .rf-bottomnav__item:hover  { color: var(--ink-secondary); }
  .rf-bottomnav__item[aria-current="page"] { color: var(--brand); }
  .rf-bottomnav__item:focus-visible { outline: none; box-shadow: var(--focus-ring); }

  /* Pill indicator sits behind the icon and animates on active */
  .rf-bottomnav__pill {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 28px;
    border-radius: var(--radius-md);
    transition:
      background var(--motion-sm) var(--ease-standard),
      transform  var(--motion-xs) var(--ease-spring-soft);
  }
  .rf-bottomnav__item[aria-current="page"] .rf-bottomnav__pill {
    background: var(--brand-soft);
    transform: translateY(-2px);
  }

  .rf-bottomnav__badge {
    position: absolute;
    top: -4px; right: -6px;
    min-width: 16px; height: 16px;
    border-radius: var(--radius-full);
    background: var(--error);
    color: #fff;
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

  @media (max-width: 1024px) {
    .rf-bottomnav { display: flex; }
  }
</style>
