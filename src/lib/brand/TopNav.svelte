<script lang="ts">
  import { base } from '$app/paths';
  import { page } from '$app/state';
  import Icon from '$lib/ui/Icon.svelte';

  interface NavItem {
    path: string;
    label: string;
    icon?: import('$lib/ui/icons').IconName;
  }

  let { items = [
    { path: '/orders', label: 'Orders', icon: 'clipboard-list' },
    { path: '/calendar', label: 'Calendar', icon: 'calendar' },
    { path: '/inventory', label: 'Inventory', icon: 'package' },
    { path: '/ai-lab', label: 'AI Lab', icon: 'sparkles' }
  ] }: { items?: NavItem[] } = $props();

  const full = (p: string) => `${base}${p}`;

  let currentPath = $derived((page.url?.pathname ?? '').replace(base, '') || '/');
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
            <Icon name={it.icon} />
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
