<script lang="ts">
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import Icon from '$lib/ui/Icon.svelte';

  export interface NavItem {
    path: string;
    label: string;
    icon?: any;
  }

  export let items: NavItem[] = [
    { path: '/orders', label: 'Orders' },
    { path: '/calendar', label: 'Calendar' },
    { path: '/inventory', label: 'Inventory' },
    { path: '/', label: 'Dashboard' },
    { path: '/settings', label: 'Settings' }
  ];

  const full = (p: string) => `${base}${p}`;

  $: currentPath = ($page.url?.pathname ?? '').replace(base, '') || '/';
  const isActive = (path: string) => {
    if (!path || path === '/') return currentPath === '/';
    return currentPath === path || currentPath.startsWith(`${path}/`);
  };
</script>

<nav class="topnav" aria-label="Primary">
  <ul class="nav-list" role="menubar">
    {#each items as it (it.path)}
      <li role="none">
        <a
          role="menuitem"
          class="nav-link"
          class:active={isActive(it.path)}
          href={full(it.path)}
          aria-current={isActive(it.path) ? 'page' : undefined}
        >
          {#if it.icon}
            {#if typeof it.icon === 'string'}
              <Icon name={it.icon} aria-hidden="true" />
            {:else}
              <svelte:component this={it.icon} aria-hidden="true" />
            {/if}
          {/if}
          {it.label}
        </a>
      </li>
    {/each}
  </ul>
</nav>

<style>
.topnav{display:flex;align-items:center}
.nav-list{display:flex;gap:8px;list-style:none;margin:0;padding:0}
.nav-link{display:inline-flex;gap:6px;align-items:center;padding:6px 10px;border-radius:10px;color:var(--text);text-decoration:none;border:1px solid transparent;font-weight:500}
.nav-link:hover,.nav-link:focus-visible{background:var(--bg-2);border-color:var(--border)}
.nav-link.active{background:var(--bg-2);border-color:var(--border)}
.nav-link :global(svg){width:16px;height:16px}
</style>
