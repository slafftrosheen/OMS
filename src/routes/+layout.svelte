<script lang="ts">
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { goto, replaceState } from '$app/navigation';
  
  import Logo from '$lib/brand/Logo.svelte';
  import NotificationsBell from '$lib/topbar/NotificationsBell.svelte';
  import ChatPopover from '$lib/topbar/ChatPopover.svelte';
  import ThemeSwitch from '$lib/topbar/ThemeSwitch.svelte';
  import LangSwitch from '$lib/topbar/LangSwitch.svelte';
  import TextSizeSwitch from '$lib/topbar/TextSizeSwitch.svelte';
  import DensitySwitch from '$lib/topbar/DensitySwitch.svelte';
  import UserSwitch from '$lib/topbar/UserSwitch.svelte';
  import MobileNav from '$lib/topbar/MobileNav.svelte';
  import Toaster from '$lib/ui/Toaster.svelte';
  import LiveRegion from '$lib/ui/LiveRegion.svelte';
  import { role } from '$lib/ui/RoleSwitch.svelte';
  import CommandPalette from '$lib/ui/CommandPalette.svelte';
  import Keybindings from '$lib/help/Keybindings.svelte';
  import { t } from 'svelte-i18n';
  import { startPreferenceUrlSync } from '$lib/settings/url-sync';
  import { ui } from '$lib/state/ui';
  import { setLocale } from '$lib/i18n';
  import { Menu, X, LayoutDashboard, ClipboardList, Calendar, Package, HelpCircle, Settings, Users, Boxes, MessageSquare, Bell } from 'lucide-svelte';
  import { currentUser, loadCurrentUser } from '$lib/auth/user-store';

  // Accept params prop to silence SvelteKit warning
  export let params = {};

  let searchOpen = false;
  let showKb = false;
  let mobileMenuOpen = false;
  let authChecked = false;

  // Public routes that don't require auth
  const publicRoutes = ['/login', '/help'];

  $: isPublicRoute = publicRoutes.some(r => $page.url.pathname === `${base}${r}` || $page.url.pathname === r);
  $: isAdmin = $currentUser?.roles?.Admin === 'SuperAdmin';
  $: currentPath = $page.url.pathname;

  const openSearch = () => {
    searchOpen = true;
  };

  const closeSearch = () => {
    searchOpen = false;
  };

  onMount(async () => {
    // Load current user from session
    const user = await loadCurrentUser();
    authChecked = true;
    
    // Redirect to login if not authenticated and not on public route
    if (!user && !isPublicRoute) {
      goto(`${base}/login`);
      return;
    }
    
    // Apply query params for deep-linking preferences
    const q = new URLSearchParams(location.search);
    const theme   = q.get('theme') as any;
    const density = q.get('density') as any;
    const lang    = q.get('lang');
    const font    = q.get('font');

    if (lang) setLocale(lang);
    ui.update(p=>({
      ...p,
      theme:   theme   || p.theme,
      density: density || p.density,
      fontScale: font ? Math.max(0.85, Math.min(1.3, +font)) : p.fontScale
    }));
    
    // Clean up URL params using SvelteKit's replaceState
    if (theme || density || lang || font) {
      const newUrl = new URL(location.href);
      newUrl.searchParams.delete('theme');
      newUrl.searchParams.delete('density');
      newUrl.searchParams.delete('lang');
      newUrl.searchParams.delete('font');
      replaceState(newUrl.pathname + newUrl.search + newUrl.hash, {});
    }
    
    const stopPreferenceSync = startPreferenceUrlSync();
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.isContentEditable) return;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const adm = $role === 'Admin';
      const key = e.key?.toLowerCase();
      if (!key) return;
      if ((e.metaKey || e.ctrlKey) && key === 'k') {
        e.preventDefault();
        openSearch();
        return;
      }
      if (key === '?') {
        e.preventDefault();
        showKb = !showKb;
        return;
      }
      if (!e.shiftKey) return;
      if (adm && key === 'a') window.dispatchEvent(new CustomEvent('rf-approve-selected'));
      if (adm && key === 'd') window.dispatchEvent(new CustomEvent('rf-decline-selected'));
      if (adm && key === 'u') window.dispatchEvent(new CustomEvent('rf-attach-revision'));
      if (!adm && key === 'n') window.dispatchEvent(new CustomEvent('rf-open-cr'));
      if (!adm && key === 'l') window.dispatchEvent(new CustomEvent('rf-focus-quicklog'));
    };

    window.addEventListener('keydown', handler);
    return () => {
      stopPreferenceSync?.();
      window.removeEventListener('keydown', handler);
    };
  });

  onMount(async () => {
    if (import.meta.env.DEV) {
      // axe is ~300KB — load only in dev
      const axe = await import('axe-core'); // npm i axe-core -D
      // Check only color contrast + focusable/focus-visible
      axe.default
        .run(document, {
          runOnly: { type: 'rule', values: ['color-contrast', 'focus-order-semantics'] } // Removed 'focus-visible' as it's not a valid rule ID
        })
        .then((results) => {
          if (results.violations.length) {
            console.group('%cA11Y (axe)', 'color:#fff;background:#e11d48;padding:2px 6px;border-radius:4px');
            results.violations.forEach((v) => console.warn(v.id, v.nodes.map((n) => n.target)));
            console.groupEnd();
          }
        });
    }
  });
</script>

<svelte:head>
  <link rel="stylesheet" href={`${base}/brand.css`}>
</svelte:head>

{#if !authChecked}
  <!-- Loading state while checking auth -->
  <div class="auth-loading">
    <div class="spinner"></div>
  </div>
{:else if isPublicRoute || $currentUser}
  <a href="#main" class="tag skip-link"
    on:focus={(e) => (e.currentTarget.style.cssText='position:fixed;top:8px;left:8px;z-index:1000')}
    on:blur={(e) => (e.currentTarget.style.cssText='position:absolute;left:-9999px;top:-9999px')}>
    {$t('a11y.skip')}
  </a>

  {#if $currentUser}
    <header class="rf-topbar">
      <a href="{base}/" class="brand"><Logo /></a>
      <button class="mobile-menu-btn" on:click={() => mobileMenuOpen = !mobileMenuOpen} aria-label={$t('header.toggle_menu')} aria-expanded={mobileMenuOpen}>
        {#if mobileMenuOpen}
          <X size={24} />
        {:else}
          <Menu size={24} />
        {/if}
      </button>
      <nav class="main" class:mobile-open={mobileMenuOpen}>
        <a href="{base}/" class:active={currentPath === base || currentPath === base + '/'} on:click={() => mobileMenuOpen = false}>
          <LayoutDashboard size={18} />
          <span>{$t('nav.dashboard', { default: 'Dashboard' })}</span>
        </a>
        <a href="{base}/orders" class:active={currentPath.includes('/orders')} on:click={() => mobileMenuOpen = false}>
          <ClipboardList size={18} />
          <span>{$t('nav.orders', { default: 'Orders' })}</span>
        </a>
        <a href="{base}/calendar" class:active={currentPath.includes('/calendar')} on:click={() => mobileMenuOpen = false}>
          <Calendar size={18} />
          <span>{$t('nav.calendar', { default: 'Calendar' })}</span>
        </a>
        <a href="{base}/inventory" class:active={currentPath.includes('/inventory')} on:click={() => mobileMenuOpen = false}>
          <Package size={18} />
          <span>{$t('nav.inventory', { default: 'Inventory' })}</span>
        </a>
        <a href="{base}/chat" class:active={currentPath.includes('/chat')} on:click={() => mobileMenuOpen = false}>
          <MessageSquare size={18} />
          <span>{$t('nav.chat', { default: 'Chat' })}</span>
        </a>
        <a href="{base}/faq" class:active={currentPath.includes('/faq')} on:click={() => mobileMenuOpen = false}>
          <HelpCircle size={18} />
          <span>{$t('nav.faq', { default: 'FAQ' })}</span>
        </a>
        {#if isAdmin}
          <div class="nav-divider"></div>
          <a href="{base}/admin/users" class:active={currentPath.includes('/admin/users')} on:click={() => mobileMenuOpen = false}>
            <Users size={18} />
            <span>Users</span>
          </a>
          <a href="{base}/admin/materials" class:active={currentPath.includes('/admin/materials')} on:click={() => mobileMenuOpen = false}>
            <Boxes size={18} />
            <span>Materials</span>
          </a>
        {/if}
      </nav>
      <div class="actions">
        <div class="action-btn" title={$t('topbar.language', { default: 'Language' })}><LangSwitch /></div>
        <div class="action-group text-size-group" title={$t('topbar.textSize', { default: 'Text Size' })}><TextSizeSwitch /></div>
        <div class="action-btn" title={$t('topbar.density', { default: 'Density' })}><DensitySwitch /></div>
        <div class="action-btn" title={$t('topbar.theme', { default: 'Theme' })}><ThemeSwitch /></div>
        <div class="action-btn" title={$t('ui.notifications', { default: 'Notifications' })}><NotificationsBell /></div>
        <div class="action-btn" title={$t('ui.chat', { default: 'Chat' })}><ChatPopover /></div>
        <a href="{base}/settings" class="action-btn settings-btn" title={$t('nav.settings', { default: 'Settings' })}>
          <Settings size={20} />
        </a>
        <UserSwitch />
      </div>
    </header>
  {/if}

  <main id="main" class="rf-page"><slot /></main>

  {#if $currentUser}
    <MobileNav />
  {/if}

  <Toaster />
  <LiveRegion />
  <CommandPalette open={searchOpen} onClose={closeSearch} />
  <Keybindings bind:open={showKb} />
{/if}

<div id="rf-live" class="sr-only" aria-live="polite"></div>

<style>
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}

.skip-link {
  position: absolute;
  left: -9999px;
  top: -9999px;
}

.auth-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: var(--bg-0);
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--border);
  border-top-color: var(--accent, #3b82f6);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.rf-topbar {
  position: sticky;
  top: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 0 clamp(16px, 3vw, 28px);
  height: 60px;
  background: var(--bg-1);
  border-bottom: 1px solid var(--border);
  backdrop-filter: blur(12px);
}

.rf-topbar .brand {
  display: inline-flex;
  align-items: center;
  text-decoration: none;
  flex-shrink: 0;
}

.rf-topbar nav.main {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 4px;
  overflow-x: auto;
  scrollbar-width: none;
  padding: 4px 0;
}

.rf-topbar nav.main::-webkit-scrollbar { display: none; }

.rf-topbar nav.main a {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 8px;
  text-decoration: none;
  color: var(--text-2);
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  transition: all 0.15s ease;
}

.rf-topbar nav.main a:hover {
  color: var(--text);
  background: var(--bg-2);
}

.rf-topbar nav.main a.active {
  color: var(--text);
  background: var(--accent, #3b82f6);
  color: white;
}

.rf-topbar nav.main a.active:hover {
  background: var(--accent-hover, #2563eb);
}

.nav-divider {
  width: 1px;
  height: 24px;
  background: var(--border);
  margin: 0 8px;
  flex-shrink: 0;
}

.rf-topbar .actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.rf-topbar .action-group {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.rf-topbar .action-group.text-size-group {
  padding: 0 4px;
  border-radius: 8px;
  background: var(--bg-0);
  border: 1px solid var(--border);
  height: 36px;
}

.rf-topbar .action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  min-width: 36px;
  border-radius: 8px;
  color: var(--text-2);
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.rf-topbar .action-btn:hover {
  background: var(--bg-2);
  color: var(--text);
}

.rf-topbar .settings-btn {
  text-decoration: none;
}

.rf-topbar .mobile-menu-btn {
  display: none;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 6px;
  cursor: pointer;
  color: var(--text);
  transition: all 0.15s ease;
}

.rf-topbar .mobile-menu-btn:hover {
  background: var(--bg-2);
}

@media (max-width: 1024px) {
  .rf-topbar { gap: 12px; }
  .rf-topbar nav.main a span { display: none; }
  .rf-topbar nav.main a { padding: 8px 10px; }
  .nav-divider { margin: 0 4px; }
}

@media (max-width: 720px) {
  .rf-topbar {
    padding: 0 16px;
    height: 56px;
  }
  
  .rf-topbar .brand { flex: 1; }
  
  .rf-topbar .mobile-menu-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    order: 3;
  }
  
  .rf-topbar nav.main {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: var(--bg-1);
    border-bottom: 1px solid var(--border);
    flex-direction: column;
    align-items: stretch;
    gap: 0;
    padding: 8px;
    display: none;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
    z-index: 100;
  }
  
  .rf-topbar nav.main.mobile-open { display: flex; }
  
  .rf-topbar nav.main a {
    padding: 14px 16px;
    border-radius: 8px;
  }
  
  .rf-topbar nav.main a span { display: inline; }
  
  .nav-divider {
    width: 100%;
    height: 1px;
    margin: 8px 0;
  }
  
  .rf-topbar .actions {
    order: 2;
    gap: 2px;
  }
  
  .rf-topbar .action-btn {
    width: 32px;
    height: 32px;
  }
  
  /* Keep text size and theme visible on mobile, hide others */
  .rf-topbar .actions > :global(.action-btn):nth-child(n+3):not(:last-child):not(.settings-btn) {
    display: none;
  }
}
</style>
