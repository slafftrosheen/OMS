<script lang="ts">
  import { base } from '$app/paths';
  import { users, loadUsers } from '$lib/users/user-store';
  import { currentUser } from '$lib/auth/user-store';
  import { unseenCount } from '$lib/notifications/count';
  import { t } from 'svelte-i18n';
  import BellIcon from 'lucide-svelte/icons/bell';
  import TopNav from './TopNav.svelte';
  import ThemeQuick from '$lib/ui/ThemeQuick.svelte';
  import LangQuick from '$lib/ui/LangQuick.svelte';
  import TextScaleQuick from '$lib/ui/TextScaleQuick.svelte';
  import { onMount } from 'svelte';

  let showUserMenu = false, c = 0;
  unseenCount.subscribe((v) => (c = v));
  $: $currentUser, $users;

  onMount(() => {
    loadUsers();
  });

  const logo = () => `${base}/logo.png`;

  $: navItems = [
    { path: '/orders', label: $t('nav.orders'), icon: 'orders' },
    { path: '/calendar', label: $t('nav.calendar'), icon: 'calendar' },
    { path: '/inventory', label: $t('nav.inventory'), icon: 'inventory' },
    { path: '/', label: $t('nav.dashboard'), icon: 'home' },
    { path: '/settings', label: $t('nav.settings'), icon: 'settings' }
  ];
</script>

<header class="brandbar">
  <a href={`${base}/`} class="brand-link" aria-label={$t('app.brand.aria')}>
    <img src={logo()} alt={$t('app.brand.label')} class="brand-logo" width="220" height="64" decoding="async" />
  </a>

  <TopNav items={navItems} />

  <!-- actions -->
  <div class="actions" role="group" aria-label={$t('header.actions')}>
    <div class="toggles" role="group" aria-label="Display preferences">
      <ThemeQuick />
      <LangQuick />
      <TextScaleQuick />
    </div>

    <a
      class="notif"
      aria-label={c ? $t('header.notifications.srCount', { count: c }) : $t('header.notifications.label')}
      href={`${base}/notifications`}
      title={$t('header.notifications.label')}
    >
      <BellIcon aria-hidden="true" focusable="false" />
      {#if c}<span class="dot" aria-hidden="true"></span>{/if}
      <span class="sr-only">{$t('header.notifications.srCount', { count: c })}</span>
    </a>

    <div class="user">
      <button class="user-btn" aria-haspopup="menu" aria-expanded={showUserMenu} on:click={() => showUserMenu = !showUserMenu}>
        <img src={`${base}/brand/avatar-default.svg`} alt="" class="avatar" />
        <span class="name">{$currentUser?.name}</span>
      </button>

      {#if showUserMenu}
        <div class="menu" role="menu" aria-label={$t('header.user.label')}>
          <div class="menu-row"><b>{$t('header.user.label')}</b></div>
          <div class="menu-row">
            <select class="rf-input" on:change={pickUser} bind:value={$currentUserId} aria-label={$t('header.user.switch')}>
              {#each $users as u}
                {@const roleKey = `roles.${u.role.toLowerCase()}`}
                <option value={u.id}>
                  {u.name} — {$t(roleKey) !== roleKey ? $t(roleKey) : u.role}
                </option>
              {/each}
            </select>
          </div>
          <a class="menu-row tag" href={`${base}/settings`} role="menuitem">{$t('nav.settings')}</a>
        </div>
      {/if}
    </div>
  </div>
</header>

<style>
.brandbar{background:var(--bg-1);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;padding:8px 12px;gap:16px;flex-wrap:wrap}
.brand-link{display:inline-flex;align-items:center;gap:10px;text-decoration:none}
.brand-logo{height:40px;width:auto;object-fit:contain}
.brandbar :global(.topnav){flex:1;min-width:260px}
.brandbar :global(.topnav .nav-list){flex-wrap:wrap}
.actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap;justify-content:flex-end}
.toggles{display:flex;align-items:center;gap:8px}
.toggles :global(svg){width:18px;height:18px}
.notif{position:relative;width:28px;height:28px;display:grid;place-items:center;border:1px solid var(--border);border-radius:999px;background:var(--bg-0)}
.notif :global(svg){width:18px;height:18px;color:var(--text)}
.notif .dot{width:8px;height:8px;border-radius:999px;background:var(--accent-1);position:absolute;top:2px;right:2px}
.user{position:relative}
.user-btn{display:flex;align-items:center;gap:8px;background:transparent;border:1px solid var(--border);border-radius:999px;padding:4px 8px;color:var(--text)}
.avatar{width:22px;height:22px;border-radius:999px;background:var(--bg-2)}
.menu{position:absolute;right:0;margin-top:6px;min-width:240px;background:var(--bg-1);border:1px solid var(--border);border-radius:10px;padding:8px;z-index:50}
.menu-row{margin:6px 0}
.sr-only{position:absolute;clip:rect(1px,1px,1px,1px);padding:0;border:0;height:1px;width:1px;overflow:hidden;white-space:nowrap}
</style>
