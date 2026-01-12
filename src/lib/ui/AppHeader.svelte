<script lang="ts">
  import { base } from '$app/paths';
  import { createEventDispatcher, onDestroy, onMount } from 'svelte';
  import SearchIcon from 'lucide-svelte/icons/search';
  import BellIcon from 'lucide-svelte/icons/bell';
  import HelpCircle from 'lucide-svelte/icons/help-circle';
  import { users, loadUsers } from '$lib/users/user-store';
  import { currentUser } from '$lib/auth/user-store';
  import { unseenCount } from '$lib/notifications/count';
  import RoleSwitch from './RoleSwitch.svelte';
  import { t } from 'svelte-i18n';
  import TopNav from '$lib/brand/TopNav.svelte';
  import ThemeQuick from '$lib/ui/ThemeQuick.svelte';
  import LangQuick from '$lib/ui/LangQuick.svelte';
  import TextScaleQuick from '$lib/ui/TextScaleQuick.svelte';
  import HelpOverlay from '$lib/ui/HelpOverlay.svelte';

  const dispatch = createEventDispatcher<{ opensearch: void }>();
  const openSearch = () => dispatch('opensearch');

  onMount(() => {
    loadUsers();
  });

  let showUserMenu = false;
  let showHelp = false;
  let notificationCount = 0;

  const unsubscribeUnseen = unseenCount.subscribe((value) => (notificationCount = value));
  onDestroy(() => unsubscribeUnseen?.());

  $: $currentUser, $users, $currentUserId;

  const logo = () => `${base}/logo.png`;
  const pickUser = (event: Event) => currentUserId.set((event.target as HTMLSelectElement).value);

  const toggleUserMenu = () => (showUserMenu = !showUserMenu);

  $: notificationLabel = notificationCount
    ? `${$t('header.notifications.label')} (${$t('header.notifications.srCount', { count: notificationCount })})`
    : $t('header.notifications.label');

  const roleLabel = (role: string) => {
    if (role === 'Admin') return $t('roles.admin');
    if (role === 'Station') return $t('roles.station');
    return role;
  };

  $: navItems = [
    { path: '/orders', label: $t('nav.orders'), icon: 'orders' },
    { path: '/calendar', label: $t('nav.calendar'), icon: 'calendar' },
    { path: '/inventory', label: $t('nav.inventory'), icon: 'inventory' },
    { path: '/', label: $t('nav.dashboard'), icon: 'home' },
    { path: '/settings', label: $t('nav.settings'), icon: 'settings' }
  ];
</script>

<header class="app-header">
  <div class="app-header__brand">
    <a href={`${base}/`} class="brand-link" aria-label={$t('app.brand.aria')}>
      <img src={logo()} alt={$t('app.brand.aria')} class="brand-logo" width="220" height="64" decoding="async" />
    </a>
  </div>

  <div class="app-header__nav">
    <TopNav items={navItems} />
  </div>

  <div class="app-header__actions" role="group" aria-label={$t('header.actions')}>
    <button class="tag" type="button" on:click={openSearch} aria-label={$t('a11y.search')} title={$t('a11y.search')}>
      <SearchIcon aria-hidden="true" focusable="false" width={18} height={18} />
      <span class="sr-only">{$t('a11y.search')}</span>
    </button>

    <div class="app-header__toggles" role="group" aria-label="Display preferences">
      <ThemeQuick />
      <LangQuick />
      <TextScaleQuick />
    </div>

    <RoleSwitch />

    <button class="tag" title="Help" on:click={()=>showHelp=true}>
      <HelpCircle aria-hidden="true" width={18} height={18} />
    </button>

    <a class="notif" aria-label={notificationLabel} href={`${base}/notifications`} title={$t('header.notifications.label')}>
      <BellIcon aria-hidden="true" focusable="false" />
      {#if notificationCount}<span class="dot" aria-hidden="true"></span>{/if}
      <span class="sr-only">{$t('header.notifications.srCount', { count: notificationCount })}</span>
    </a>

    <div class="user">
      <button class="user-btn" aria-haspopup="menu" aria-expanded={showUserMenu} on:click={toggleUserMenu}>
        <img src={`${base}/brand/avatar-default.svg`} alt="" class="avatar" />
        <span class="name">{$currentUser?.name}</span>
      </button>

      {#if showUserMenu}
        <div class="menu" role="menu" aria-label={$t('header.user.label')}>
          <div class="menu-row"><b>{$t('header.user.label')}</b></div>
          <div class="menu-row">
            <select class="rf-input" on:change={pickUser} bind:value={$currentUserId} aria-label={$t('header.user.switch')}>
              {#each $users as u}
                <option value={u.id}>{u.name} — {roleLabel(u.role)}</option>
              {/each}
            </select>
          </div>
          <a class="menu-row tag" href={`${base}/settings`} role="menuitem">{$t('nav.settings')}</a>
        </div>
      {/if}
    </div>
  </div>
</header>

{#if showHelp}<HelpOverlay onClose={()=>showHelp=false}/>{/if}

<style>
  .app-header {
    position: sticky;
    top: 0;
    z-index: 100;
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: var(--space-xl);
    padding: var(--space-md) clamp(var(--space-lg), 3vw, calc(var(--space-xl) + var(--space-xs)));
    background: var(--bg-1);
    border-bottom: 1px solid var(--border);
  }

  .app-header__brand {
    min-width: 0;
  }

  .brand-link {
    display: inline-flex;
    align-items: center;
    gap: var(--space-snug);
    text-decoration: none;
  }

  .brand-logo {
    height: var(--avatar-lg);
    width: auto;
    object-fit: contain;
  }

  .notif {
    position: relative;
    width: var(--control-xs);
    height: var(--control-xs);
    display: grid;
    place-items: center;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--bg-0);
    color: var(--text);
  }

  .notif :global(svg) {
    width: var(--icon-size);
    height: var(--icon-size);
  }

  .notif .dot {
    width: var(--space-sm);
    height: var(--space-sm);
    border-radius: 999px;
    background: var(--accent-1);
    position: absolute;
    top: var(--space-xxs);
    right: var(--space-xxs);
  }

  .user {
    position: relative;
  }

  .user-btn {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: var(--space-xs) var(--space-sm);
    color: var(--text);
  }

  .avatar {
    width: var(--avatar-xs);
    height: var(--avatar-xs);
    border-radius: 999px;
    background: var(--bg-2);
  }

  .menu {
    position: absolute;
    right: 0;
    margin-top: var(--space-tight);
    min-width: calc(240px * var(--font-scale, 1));
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: calc(var(--radius-md) - var(--space-xxs));
    padding: var(--space-sm);
    z-index: 50;
  }

  .menu-row {
    margin: var(--space-tight) 0;
  }

  .app-header__nav {
    display: flex;
    align-items: center;
    overflow-x: auto;
    padding: 0;
    min-width: 0;
    scrollbar-width: none;
  }

  .app-header__nav::-webkit-scrollbar {
    display: none;
  }

  .app-header__nav :global(.topnav) {
    flex: 1;
  }

  .app-header__nav :global(.nav-list) {
    flex-wrap: wrap;
  }

  .app-header__actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    min-width: 0;
  }

  .app-header__toggles {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .app-header__toggles :global(svg) {
    width: 18px;
    height: 18px;
  }

  .app-header__actions .tag {
    transition: background 0.2s ease, color 0.2s ease;
  }

  .sr-only {
    position: absolute;
    clip: rect(1px, 1px, 1px, 1px);
    padding: 0;
    border: 0;
    height: 1px;
    width: 1px;
    overflow: hidden;
    white-space: nowrap;
  }

  @media (max-width: 1280px) {
    .app-header {
      grid-template-columns: auto 1fr auto;
      gap: 16px;
    }

    .app-header__nav {
      order: 0;
    }

    .app-header__actions {
      order: 0;
    }

    .user-btn .name {
      display: none;
    }
  }

  @media (max-width: 720px) {
    .app-header {
      padding: 10px 16px;
      gap: 12px;
      grid-template-columns: 1fr auto;
    }

    .app-header__brand {
      grid-column: 1 / -1;
    }

    .app-header__nav {
      order: 2;
      grid-column: 1 / -1;
      width: 100%;
      justify-content: flex-start;
    }

    .app-header__actions {
      order: 1;
      gap: 8px;
    }

    .brand-logo {
      height: 32px;
    }
  }
</style>
