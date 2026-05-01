<script lang="ts">
  import '../app.css';
  import '$lib/styles/a11y.css';
  import '$lib/styles/responsive.css';
  import { base } from '$app/paths';
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import { goto, replaceState } from '$app/navigation';

  import Logo from '$lib/brand/Logo.svelte';
  import NotificationsBell from '$lib/topbar/NotificationsBell.svelte';
  import ThemeSwitch from '$lib/topbar/ThemeSwitch.svelte';
  import LangSwitch from '$lib/topbar/LangSwitch.svelte';
  import TextSizeSwitch from '$lib/topbar/TextSizeSwitch.svelte';
  import DensitySwitch from '$lib/topbar/DensitySwitch.svelte';
  import UserSwitch from '$lib/topbar/UserSwitch.svelte';
  import MobileNav from '$lib/topbar/MobileNav.svelte';
  import Toast from '$lib/notify/Toast.svelte';
  import LiveRegion from '$lib/ui/LiveRegion.svelte';
  import ChatSidebar from '$lib/chat/ChatSidebar.svelte';
  import RealtimeConnection from '$lib/realtime/RealtimeConnection.svelte';
  import InstallPrompt from '$lib/pwa/InstallPrompt.svelte';
  import UpdatePrompt from '$lib/pwa/UpdatePrompt.svelte';
  import OfflineIndicator from '$lib/pwa/OfflineIndicator.svelte';
  import { role } from '$lib/ui/RoleSwitch.svelte';
  import GlobalSearch from '$lib/components/GlobalSearch.svelte';
  import Keybindings from '$lib/help/Keybindings.svelte';
  import { t } from 'svelte-i18n';
  import { startPreferenceUrlSync } from '$lib/settings/url-sync';
  import { ui } from '$lib/state/appState.svelte';
  import { setLocale } from '$lib/i18n';
  import Icon from '$lib/ui/Icon.svelte';
  import { AuthState, currentUser, loadCurrentUser } from '$lib/auth/authState.svelte';
  import { initChatRealtime, toggleChat, unreadCount, isChatOpen } from '$lib/chat/chat-store';
  import { websocket } from '$lib/stores/websocket';
  import { OrderState } from '$lib/order/orderState.svelte';
  import { setContext } from 'svelte';

  // Receive children snippet from SvelteKit
  let { children } = $props();

  // Instantiate state classes and provide via context (SSR-safe)
  const authStateInstance = new AuthState();
  const orderStateInstance = new OrderState();
  setContext('authState', authStateInstance);
  setContext('orderState', orderStateInstance);

  // UI state
  let searchOpen = $state(false);
  let showKb = $state(false);
  let mobileMenuOpen = $state(false);
  let authChecked = $state(false);
  let deferredPrompt: any = $state(null);
  let showInstallPrompt = $state(false);
  let showUpdatePrompt = $state(false);
  let isOnline = $state(true);

  // Public routes that don't require auth
  const publicRoutes = ['/login', '/help'];
  const INSTALL_PROMPT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

  let isPublicRoute = $derived(publicRoutes.some(r => page.url.pathname === `${base}${r}` || page.url.pathname === r));
  let isAdmin = $derived($currentUser?.roles?.Admin === 'SuperAdmin');
  let currentPath = $derived(page.url.pathname);

  const themeColors: Record<string, string> = {
    LightVim:        '#bf3020',
    DarkVim:         '#ff453a',
    HighContrastVim: '#ff3b3c'
  };
  let themeColor = $derived(themeColors[($ui).theme] ?? '#ff453a');

  const openSearch = () => {
    searchOpen = true;
  };

  const closeSearch = () => {
    searchOpen = false;
  };

  async function handleInstall() {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    console.log('Install prompt outcome:', outcome);
    
    showInstallPrompt = false;
    deferredPrompt = null;
  }

  function handleDismissInstall() {
    showInstallPrompt = false;
    deferredPrompt = null;
    // Store dismissal to not show again for a while
    localStorage.setItem('installPromptDismissed', Date.now().toString());
  }

  function handleUpdate() {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      // Tell service worker to skip waiting
      navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });

      // Reload page
      window.location.reload();
    }
  }

  function handleDismissUpdate() {
    showUpdatePrompt = false;
  }

  // Single consolidated onMount — replaces two separate onMount blocks
  onMount(() => {
    let stopChatRealtime: () => void;
    let stopPreferenceSync: () => void;

    const init = async () => {
      // Load current user from session
      const userPromise = loadCurrentUser(authStateInstance);
      if (isPublicRoute) {
        // Allow public routes to render while auth loads.
        authChecked = true;
      }
      const user = await userPromise;
      if (!authChecked) {
        // Private routes wait for auth before rendering.
        authChecked = true;
      }

      // Redirect to login if not authenticated and not on public route
      if (!user && !isPublicRoute) {
        goto(`${base}/login`);
        return;
      }

      // Initialize chat realtime if user is logged in
      if (user) {
        stopChatRealtime = initChatRealtime();
        websocket.connect();
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

      // Register service worker
      if ('serviceWorker' in navigator) {
        try {
          const registration = await navigator.serviceWorker.register('/service-worker.js', {
            scope: '/'
          });

          console.log('Service Worker registered:', registration.scope);

          // Check for updates
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;

            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  // New service worker available
                  showUpdatePrompt = true;
                }
              });
            }
          });

          // Check for updates on page load
          registration.update();
        } catch (error) {
          console.error('Service Worker registration failed:', error);
        }
      }
    };

    init();

    // Handle install prompt
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      const dismissedAt = Number(localStorage.getItem('installPromptDismissed') || 0);
      if (Date.now() - dismissedAt <= INSTALL_PROMPT_COOLDOWN_MS) {
        showInstallPrompt = false;
        return;
      }
      deferredPrompt = e;
      showInstallPrompt = true;
    });

    // Handle app installed
    window.addEventListener('appinstalled', () => {
      console.log('PWA installed');
      showInstallPrompt = false;
      deferredPrompt = null;
    });

    // Monitor online/offline status
    isOnline = navigator.onLine;
    
    window.addEventListener('online', () => {
      isOnline = true;
      console.log('App is online');
      
      // Trigger background sync if service worker is available
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready.then(registration => {
          // Cast to any for Background Sync API
          const reg = registration as any;
          if (reg.sync) {
            reg.sync.register('sync-orders');
            reg.sync.register('sync-photos');
          }
        });
      }
    });

    window.addEventListener('offline', () => {
      isOnline = false;
      console.log('App is offline');
    });

    stopPreferenceSync = startPreferenceUrlSync();
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.isContentEditable) return;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const adm = $role === 'Admin';
      const key = e.key?.toLowerCase();
      if (!key) return;
      // GlobalSearch handles Cmd+K internally
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

    // A11y: axe-core in dev mode only
    if (import.meta.env.DEV) {
      import('axe-core').then(axe => {
        axe.default
          .run(document, {
            runOnly: { type: 'rule', values: ['color-contrast', 'focus-order-semantics'] }
          })
          .then((results) => {
            if (results.violations.length) {
              console.group('%cA11Y (axe)', 'color:#fff;background:#e11d48;padding:2px 6px;border-radius:4px');
              results.violations.forEach((v) => console.warn(v.id, v.nodes.map((n) => n.target)));
              console.groupEnd();
            }
          });
      }).catch(() => {
        // axe-core not installed — skip
      });
    }

    // Cleanup
    return () => {
      stopPreferenceSync?.();
      window.removeEventListener('keydown', handler);
      if (stopChatRealtime) stopChatRealtime();
      websocket.disconnect();
    };
  });
</script>

<svelte:head>
  <link rel="manifest" href="/manifest.json" />
  <meta name="theme-color" content={themeColor} />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="default" />
  <meta name="apple-mobile-web-app-title" content="OMS" />
  <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
  <link rel="icon" type="image/png" sizes="32x32" href="/icons/icon-32x32.png" />
  <link rel="icon" type="image/png" sizes="16x16" href="/icons/icon-16x16.png" />
  <link rel="mask-icon" href="/icons/safari-pinned-tab.svg" color="#ff453a" />
  <meta name="msapplication-TileColor" content="#ff453a" />
  <meta name="msapplication-config" content="/browserconfig.xml" />
</svelte:head>

{#if !authChecked}
  <!-- Loading state while checking auth -->
  <div class="auth-loading">
    <div class="spinner"></div>
  </div>
{:else if isPublicRoute || $currentUser}
  <a href="#main" class="tag skip-link"
    onfocus={(e) => (e.currentTarget.style.cssText='position:fixed;top:8px;left:8px;z-index:1000')}
    onblur={(e) => (e.currentTarget.style.cssText='position:absolute;left:-9999px;top:-9999px')}>
    {$t('a11y.skip')}
  </a>

  {#if $currentUser}
    <header class="rf-topbar">
      <a href="{base}/" class="brand"><Logo /></a>
      <button class="mobile-menu-btn" onclick={() => mobileMenuOpen = !mobileMenuOpen} aria-label={$t('header.toggle_menu')} aria-expanded={mobileMenuOpen}>
        {#if mobileMenuOpen}
          <Icon name="x" size="md" />
        {:else}
          <Icon name="menu" size="md" />
        {/if}
      </button>
      <nav class="main" class:mobile-open={mobileMenuOpen}>
        <a href="{base}/orders" class:active={currentPath.includes('/orders')} onclick={() => mobileMenuOpen = false}>
          <Icon name="clipboard-list" size="sm" />
          <span>{$t('nav.orders', { default: 'Orders' })}</span>
        </a>
        <a href="{base}/calendar" class:active={currentPath.includes('/calendar')} onclick={() => mobileMenuOpen = false}>
          <Icon name="calendar" size="sm" />
          <span>{$t('nav.calendar', { default: 'Calendar' })}</span>
        </a>
        <a href="{base}/inventory" class:active={currentPath.includes('/inventory')} onclick={() => mobileMenuOpen = false}>
          <Icon name="package" size="sm" />
          <span>{$t('nav.inventory', { default: 'Inventory' })}</span>
        </a>
        <a href="{base}/ai-lab" class:active={currentPath.includes('/ai-lab') || currentPath.includes('/ai-dashboard')} onclick={() => mobileMenuOpen = false}>
          <Icon name="sparkles" size="sm" />
          <span>{$t('nav.ailab', { default: 'AI Lab' })}</span>
        </a>
        {#if isAdmin}
          <div class="nav-divider"></div>
          <a href="{base}/admin/users" class:active={currentPath.includes('/admin/users')} onclick={() => mobileMenuOpen = false}>
            <Icon name="users" size="sm" />
            <span>{$t('nav.users', { default: 'Users' })}</span>
          </a>
          <a href="{base}/admin/materials" class:active={currentPath.includes('/admin/materials')} onclick={() => mobileMenuOpen = false}>
            <Icon name="boxes" size="sm" />
            <span>{$t('nav.materials', { default: 'Materials' })}</span>
          </a>
        {/if}
      </nav>
      <div class="actions">
        <div class="action-btn desktop-only" title={$t('topbar.language', { default: 'Language' })}><LangSwitch /></div>
        <div class="action-group text-size-group desktop-only" title={$t('topbar.textSize', { default: 'Text Size' })}><TextSizeSwitch /></div>
        <div class="action-btn desktop-only" title={$t('topbar.density', { default: 'Density' })}><DensitySwitch /></div>
        <div class="action-btn" title={$t('topbar.theme', { default: 'Theme' })}><ThemeSwitch /></div>
        <div class="action-btn" title={$t('ui.notifications', { default: 'Notifications' })}><NotificationsBell /></div>
        <div class="action-btn" title={$t('layout.realtime', { default: 'Realtime connection' })}><RealtimeConnection /></div>
        <button
          class="action-btn chat-toggle"
          class:active={$isChatOpen}
          title={$t('ui.chat', { default: 'Chat' })}
          onclick={toggleChat}
        >
          <div class="icon-wrapper">
            <Icon name="message-square" size="md" />
            {#if $unreadCount > 0}
              <span class="badge">{$unreadCount > 9 ? '9+' : $unreadCount}</span>
            {/if}
          </div>
        </button>
        <a href="{base}/settings" class="action-btn settings-btn" title={$t('nav.settings', { default: 'Settings' })}>
          <Icon name="settings" size="md" />
        </a>
        <UserSwitch />
      </div>
    </header>
  {/if}

  {#if showInstallPrompt}
    <InstallPrompt 
      onInstall={handleInstall}
      onDismiss={handleDismissInstall}
    />
  {/if}

  {#if showUpdatePrompt}
    <UpdatePrompt 
      onUpdate={handleUpdate}
      onDismiss={handleDismissUpdate}
    />
  {/if}

  {#if !isOnline}
    <OfflineIndicator />
  {/if}

  <main id="main" class="rf-page">{@render children?.()}</main>

  {#if $currentUser}
    <div class="mobile-nav-wrapper">
      <MobileNav />
    </div>
    <ChatSidebar />
  {/if}

  <Toast />
  <LiveRegion />
  <GlobalSearch bind:visible={searchOpen} />
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

.chat-toggle {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0;
  position: relative;
}

.chat-toggle.active {
  color: var(--brand);
  background: var(--brand-soft);
}

.icon-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.badge {
  position: absolute;
  top: -2px;
  right: -2px;
  background: var(--error);
  color: var(--bg-0);
  font-size: 10px;
  font-weight: 700;
  min-width: 16px;
  height: 16px;
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
  border: 2px solid var(--bg-1);
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
  border-top-color: var(--brand);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.rf-topbar {
  position: sticky;
  top: 0;
  z-index: var(--z-sticky);
  display: flex;
  align-items: center;
  gap: var(--space-lg);
  padding: 0 clamp(var(--space-md), 3vw, var(--space-xl));
  height: var(--topbar-h, 60px);
  background: var(--glass-bg-strong);
  backdrop-filter: var(--glass-material-regular);
  -webkit-backdrop-filter: var(--glass-material-regular);
  border-bottom: 1px solid var(--separator-opaque, var(--divider));
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
  gap: var(--space-xxs);
  overflow-x: auto;
  scrollbar-width: none;
  padding: var(--space-xxs) 0;
}
.rf-topbar nav.main::-webkit-scrollbar { display: none; }

.rf-topbar nav.main a {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-sm);
  text-decoration: none;
  color: var(--ink-secondary);
  font-size: var(--text-sm);
  font-weight: 500;
  white-space: nowrap;
  transition:
    color      var(--motion-sm) var(--ease-standard),
    background var(--motion-sm) var(--ease-standard);
}
.rf-topbar nav.main a:hover {
  color: var(--ink-primary);
  background: color-mix(in oklab, var(--bg-2) 70%, transparent);
}
.rf-topbar nav.main a.active {
  background: var(--brand);
  color: var(--bg-0);
  font-weight: 600;
}
.rf-topbar nav.main a.active:hover {
  background: color-mix(in oklab, var(--brand) 85%, black);
}

.nav-divider {
  width: 1px;
  height: 20px;
  background: var(--divider);
  margin: 0 var(--space-xs);
  flex-shrink: 0;
}

.rf-topbar .actions {
  display: flex;
  align-items: center;
  gap: var(--space-xxs);
  flex-shrink: 0;
}

.rf-topbar .action-group {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.rf-topbar .action-group.text-size-group {
  padding: 0 var(--space-xs);
  border-radius: var(--radius-sm);
  background: var(--bg-0);
  border: 1px solid var(--border);
  height: var(--control-sm, 36px);
}

.rf-topbar .action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--control-sm, 36px);
  height: var(--control-sm, 36px);
  min-width: var(--control-sm, 36px);
  border-radius: var(--radius-sm);
  color: var(--ink-secondary);
  transition:
    background var(--motion-sm) var(--ease-standard),
    color      var(--motion-sm) var(--ease-standard);
  flex-shrink: 0;
}
.rf-topbar .action-btn:hover {
  background: color-mix(in oklab, var(--bg-2) 70%, transparent);
  color: var(--ink-primary);
}

.rf-topbar .settings-btn { text-decoration: none; }

.rf-topbar .mobile-menu-btn {
  display: none;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: var(--space-xs);
  cursor: pointer;
  color: var(--ink-primary);
  transition:
    background var(--motion-sm) var(--ease-standard),
    color      var(--motion-sm) var(--ease-standard);
}
.rf-topbar .mobile-menu-btn:hover { background: var(--bg-2); }

.mobile-nav-wrapper { display: none; }

@media (max-width: 1024px) {
  .rf-topbar {
    padding: 0 var(--space-md);
    height: 56px;
    gap: var(--space-sm);
  }
  .rf-topbar .brand  { flex: 1; order: 1; }
  .rf-topbar .actions { order: 2; gap: var(--space-xxs); }
  .rf-topbar .mobile-menu-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    order: 3;
  }
  .rf-topbar nav.main {
    position: fixed;
    top: 56px;
    left: 0;
    right: 0;
    bottom: 0;
    background: var(--glass-bg-strong);
    backdrop-filter: var(--glass-material-thick);
    -webkit-backdrop-filter: var(--glass-material-thick);
    flex-direction: column;
    align-items: stretch;
    gap: 0;
    padding: var(--space-md);
    display: none;
    z-index: var(--z-overlay);
    overflow-y: auto;
  }
  .rf-topbar nav.main.mobile-open { display: flex; }
  .rf-topbar nav.main a {
    padding: var(--space-md);
    border-radius: var(--radius-md);
    font-size: var(--text-md);
  }
  .nav-divider { width: 100%; height: 1px; margin: var(--space-sm) 0; }
  .rf-topbar .action-btn { width: 32px; height: 32px; min-width: 32px; }
  .desktop-only { display: none !important; }
  .mobile-nav-wrapper { display: block; }

  .rf-topbar nav.main.mobile-open::before {
    content: '';
    position: fixed;
    top: 56px;
    left: 0;
    right: 0;
    bottom: 0;
    background: color-mix(in oklab, var(--bg-0) 55%, transparent);
    z-index: -1;
  }
}
</style>
