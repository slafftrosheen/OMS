<script lang="ts">
  import { base } from '$app/paths';
  import { page } from '$app/state';
  import { t } from 'svelte-i18n';
  import Icon from '$lib/ui/Icon.svelte';

  const links = [
    { href: '/',          icon: 'layout-dashboard' as const, label: 'nav.dashboard', default: 'Dashboard' },
    { href: '/calendar',  icon: 'calendar'          as const, label: 'nav.calendar',  default: 'Calendar' },
    { href: '/inventory', icon: 'package'            as const, label: 'nav.inventory', default: 'Inventory' },
    { href: '/settings',  icon: 'settings'           as const, label: 'nav.settings',  default: 'Settings' },
  ] as const;

  let currentPath = $derived(page.url.pathname);
  function isActive(href: string) {
    const full = `${base}${href}`;
    return href === '/'
      ? currentPath === base || currentPath === `${base}/`
      : currentPath.startsWith(full);
  }
</script>

<nav class="rf-bottomnav" aria-label="Primary navigation">
  {#each links as link}
    {@const active = isActive(link.href)}
    <a
      href="{base}{link.href}"
      class="rf-bottomnav__item"
      aria-current={active ? 'page' : undefined}
      aria-label={$t(link.label, { default: link.default })}
    >
      <span class="rf-bottomnav__icon">
        <Icon name={link.icon} size="md" />
      </span>
      <span class="rf-bottomnav__label">{$t(link.label, { default: link.default })}</span>
    </a>
  {/each}
</nav>

<style>
  .rf-bottomnav {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    padding:
      var(--space-xs)
      max(var(--space-sm), env(safe-area-inset-right, 0px))
      calc(var(--space-xs) + env(safe-area-inset-bottom, 0px))
      max(var(--space-sm), env(safe-area-inset-left, 0px));
    background: var(--glass-bg-strong);
    backdrop-filter: var(--glass-material-thick);
    -webkit-backdrop-filter: var(--glass-material-thick);
    border-top: 1px solid var(--separator-opaque, var(--divider));
    display: none;
    justify-content: space-around;
    align-items: center;
    gap: var(--space-xxs);
    z-index: var(--z-docked);
  }

  .rf-bottomnav__item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    padding: var(--space-xs) var(--space-sm);
    border-radius: var(--radius-md);
    text-decoration: none;
    color: var(--ink-tertiary);
    min-width: var(--tap-min, 44px);
    transition:
      color      var(--motion-sm) var(--ease-standard),
      background var(--motion-sm) var(--ease-standard);
    flex: 1;
    max-width: 80px;
  }
  .rf-bottomnav__item:hover {
    color: var(--ink-secondary);
  }
  .rf-bottomnav__item[aria-current="page"] {
    color: var(--brand);
  }
  .rf-bottomnav__item:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .rf-bottomnav__icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: var(--radius-sm);
    transition:
      background var(--motion-sm) var(--ease-standard),
      transform  var(--motion-xs) var(--ease-emphasized);
  }
  .rf-bottomnav__item[aria-current="page"] .rf-bottomnav__icon {
    background: var(--brand-soft);
    transform: translateY(-1px);
  }

  .rf-bottomnav__label {
    font-size: calc(var(--text-xs) - 1px);
    font-weight: 500;
    line-height: 1;
  }
  .rf-bottomnav__item[aria-current="page"] .rf-bottomnav__label {
    font-weight: 700;
  }

  @media (max-width: 1024px) {
    .rf-bottomnav { display: flex; }
  }
</style>
