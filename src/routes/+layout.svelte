<script lang="ts">
  import '../app.css';
  import '$lib/styles/a11y.css';
  import '$lib/styles/responsive.css';
  import { base } from '$app/paths';
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import { goto, replaceState } from '$app/navigation';

  import Logo from '$lib/brand/Logo.svelte';
  import MobileNav from '$lib/topbar/MobileNav.svelte';
  import BottomBar from '$lib/ui/BottomBar.svelte';
  import Toast from '$lib/notify/Toast.svelte';
  import LiveRegion from '$lib/ui/LiveRegion.svelte';
  import ChatSidebar from '$lib/chat/ChatSidebar.svelte';
  import InstallPrompt from '$lib/pwa/InstallPrompt.svelte';
  import UpdatePrompt from '$lib/pwa/UpdatePrompt.svelte';
  import OfflineIndicator from '$lib/pwa/OfflineIndicator.svelte';
  import { role } from '$lib/ui/RoleSwitch.svelte';
  import GlobalSearch from '$lib/components/search/GlobalSearch.svelte';
  import Keybindings from '$lib/help/Keybindings.svelte';
  import { t } from 'svelte-i18n';
  import { startPreferenceUrlSync } from '$lib/settings/url-sync';
  import { ui } from '$lib/state/appState.svelte';
  import { setLocale } from '$lib/i18n';
  import Icon from '$lib/ui/Icon.svelte';
  import { AuthState, currentUser, loadCurrentUser } from '$lib/auth/authState.svelte';
  import { initChatRealtime } from '$lib/chat/chat-store';
  import { websocket } from '$lib/stores/websocket';
  import { OrderState } from '$lib/order/orderState.svelte';
  import { setContext } from 'svelte';

  let { children } = $props();

  const authStateInstance = new AuthState();
  const orderStateInstance = new OrderState();
  setContext('authState', authStateInstance);
  setContext('orderState', orderStateInstance);

  let searchOpen     = $state(false);
  let showKb         = $state(false);
  let mobileMenuOpen = $state(false);
  let authChecked    = $state(false);
  let deferredPrompt: any    = $state(null);
  let showInstallPrompt      = $state(false);
  let showUpdatePrompt       = $state(false);
  let isOnline               = $state(true);

  const publicRoutes = ['/login', '/help'];
  const INSTALL_PROMPT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

  let isPublicRoute = $derived(publicRoutes.some(r => page.url.pathname === `${base}${r}` || page.url.pathname === r));
  let isAdmin       = $derived($currentUser?.roles?.Admin === 'SuperAdmin');
  let currentPath   = $derived(page.url.pathname);

  const themeColors: Record<string, string> = {
    LightVim:        'oklch(0.40 0.18 258)',
    DarkVim:         'oklch(0.74 0.14 258)',
    HighContrastVim: '#6699ff'
  };
  let themeColor = $derived(themeColors[($ui).theme] ?? 'oklch(0.74 0.14 258)');

  // Close mobile menu on nav
  function navTo() { mobileMenuOpen = false; }

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
    localStorage.setItem('installPromptDismissed', Date.now().toString());
  }

  function handleUpdate() {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
      window.location.reload();
    }
  }

  function handleDismissUpdate() { showUpdatePrompt = false; }

  onMount(() => {
    let stopChatRealtime: () => void;
    let stopPreferenceSync: () => void;

    const init = async () => {
      const userPromise = loadCurrentUser(authStateInstance);
      if (isPublicRoute) authChecked = true;
      const user = await userPromise;
      if (!authChecked) authChecked = true;

      if (!user && !isPublicRoute) {
        goto(`${base}/login`);
        return;
      }

      if (user) {
        stopChatRealtime = initChatRealtime();
        websocket.connect();
      }

      const q = new URLSearchParams(location.search);
      const theme   = q.get('theme') as any;
      const density = q.get('density') as any;
      const lang    = q.get('lang');
      const font    = q.get('font');

      if (lang) setLocale(lang);
      ui.update(p => ({
        ...p,
        theme:     theme   || p.theme,
        density:   density || p.density,
        fontScale: font ? Math.max(0.85, Math.min(1.3, +font)) : p.fontScale
      }));

      if (theme || density || lang || font) {
        const newUrl = new URL(location.href);
        ['theme','density','lang','font'].forEach(k => newUrl.searchParams.delete(k));
        replaceState(newUrl.pathname + newUrl.search + newUrl.hash, {});
      }

      if ('serviceWorker' in navigator) {
        try {
          const registration = await navigator.serviceWorker.register('/service-worker.js', { scope: '/' });
          registration.addEventListener('updatefound', () => {
            const nw = registration.installing;
            if (nw) {
              nw.addEventListener('statechange', () => {
                if (nw.state === 'installed' && navigator.serviceWorker.controller) {
                  showUpdatePrompt = true;
                }
              });
            }
          });
          registration.update();
        } catch (err) {
          console.error('Service Worker registration failed:', err);
        }
      }
    };

    init();

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      const dismissedAt = Number(localStorage.getItem('installPromptDismissed') || 0);
      if (Date.now() - dismissedAt <= INSTALL_PROMPT_COOLDOWN_MS) return;
      deferredPrompt = e;
      showInstallPrompt = true;
    });

    window.addEventListener('appinstalled', () => {
      showInstallPrompt = false;
      deferredPrompt = null;
    });

    isOnline = navigator.onLine;
    window.addEventListener('online',  () => { isOnline = true; });
    window.addEventListener('offline', () => { isOnline = false; });

    stopPreferenceSync = startPreferenceUrlSync();

    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.isContentEditable) return;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const adm = $role === 'Admin';
      const key = e.key?.toLowerCase();
      if (!key) return;
      if (key === '?') { e.preventDefault(); showKb = !showKb; return; }
      if (!e.shiftKey) return;
      if (adm && key === 'a') window.dispatchEvent(new CustomEvent('rf-approve-selected'));
      if (adm && key === 'd') window.dispatchEvent(new CustomEvent('rf-decline-selected'));
      if (adm && key === 'u') window.dispatchEvent(new CustomEvent('rf-attach-revision'));
      if (!adm && key === 'n') window.dispatchEvent(new CustomEvent('rf-open-cr'));
      if (!adm && key === 'l') window.dispatchEvent(new CustomEvent('rf-focus-quicklog'));
    };
    window.addEventListener('keydown', handler);

    if (import.meta.env.DEV) {
      import('axe-core').then(axe => {
        axe.default.run(document, {
          runOnly: { type: 'rule', values: ['color-contrast', 'focus-order-semantics'] }
        }).then((results) => {
          if (results.violations.length) {
            console.group('%cA11Y (axe)', 'color:#fff;background:#e11d48;padding:2px 6px;border-radius:4px');
            results.violations.forEach((v) => console.warn(v.id, v.nodes.map((n) => n.target)));
            console.groupEnd();
          }
        });
      }).catch(() => {});
    }

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
  <link rel="mask-icon" href="/icons/safari-pinned-tab.svg" color="#5c6bc0" />
  <meta name="msapplication-TileColor" content="#5c6bc0" />
  <meta name="msapplication-config" content="/browserconfig.xml" />
</svelte:head>

{#if !authChecked}
  <div class="auth-loading">
    <div class="rf-spinner"></div>
  </div>
{:else if isPublicRoute || $currentUser}
  <a href="#main" class="rf-skip-link"
    onfocus={(e) => (e.currentTarget.style.cssText='position:fixed;top:var(--space-sm);left:var(--space-sm);z-index:var(--z-toast)')}
    onblur={(e)  => (e.currentTarget.style.cssText='position:absolute;left:-9999px;top:-9999px')}>
    {$t('a11y.skip')}
  </a>

  {#if $currentUser}
    <header class="rf-topbar" role="banner">
      <!-- Brand -->
      <a href="{base}/" class="rf-topbar__brand" aria-label={$t('app.brand.label', { default: 'OMS' })}>
        <Logo />
      </a>

      <!-- Desktop nav (≥1025px) -->
      <nav class="rf-topbar__nav" aria-label={$t('a11y.nav', { default: 'Primary navigation' })}>
        <a href="{base}/orders"    class:active={currentPath.includes('/orders')}    onclick={navTo}>
          <Icon name="clipboard-list" size="sm" />
          <span>{$t('nav.orders',    { default: 'Orders' })}</span>
        </a>
        <a href="{base}/calendar"  class:active={currentPath.includes('/calendar')}  onclick={navTo}>
          <Icon name="calendar"    size="sm" />
          <span>{$t('nav.calendar',  { default: 'Calendar' })}</span>
        </a>
        <a href="{base}/inventory" class:active={currentPath.includes('/inventory')} onclick={navTo}>
          <Icon name="package"     size="sm" />
          <span>{$t('nav.inventory', { default: 'Inventory' })}</span>
        </a>
        <a href="{base}/ai-lab"    class:active={currentPath.includes('/ai-lab')}    onclick={navTo}>
          <Icon name="sparkles"    size="sm" />
          <span>{$t('nav.ailab',    { default: 'AI Lab' })}</span>
        </a>
        {#if isAdmin}
          <span class="rf-topbar__divider" aria-hidden="true"></span>
          <a href="{base}/admin/users"      class:active={currentPath.includes('/admin/users')}      onclick={navTo}>
            <Icon name="users" size="sm" />
            <span>{$t('nav.users',     { default: 'Users' })}</span>
          </a>
          <a href="{base}/admin/materials"  class:active={currentPath.includes('/admin/materials')}  onclick={navTo}>
            <Icon name="boxes" size="sm" />
            <span>{$t('nav.materials', { default: 'Materials' })}</span>
          </a>
        {/if}
      </nav>

      <!-- Mobile hamburger (visible <1025px) -->
      <button
        class="rf-topbar__hamburger"
        onclick={() => mobileMenuOpen = !mobileMenuOpen}
        aria-label={$t('header.toggle_menu', { default: 'Toggle menu' })}
        aria-expanded={mobileMenuOpen}
        aria-controls="rf-mobile-menu"
      >
        {#if mobileMenuOpen}
          <Icon name="x"    size="md" />
        {:else}
          <Icon name="menu" size="md" />
        {/if}
      </button>
    </header>

    <!-- Mobile nav overlay -->
    {#if mobileMenuOpen}
      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
      <div class="rf-mobile-backdrop" onclick={() => mobileMenuOpen = false} aria-hidden="true"></div>
      <nav id="rf-mobile-menu" class="rf-mobile-menu" aria-label={$t('a11y.nav', { default: 'Primary navigation' })}>
        <a href="{base}/"          class:active={currentPath === `${base}/` || currentPath === base}   onclick={navTo}>
          <Icon name="layout-dashboard" size="md" />
          <span>{$t('nav.dashboard',  { default: 'Dashboard' })}</span>
        </a>
        <a href="{base}/orders"    class:active={currentPath.includes('/orders')}    onclick={navTo}>
          <Icon name="clipboard-list"   size="md" />
          <span>{$t('nav.orders',    { default: 'Orders' })}</span>
        </a>
        <a href="{base}/calendar"  class:active={currentPath.includes('/calendar')}  onclick={navTo}>
          <Icon name="calendar"         size="md" />
          <span>{$t('nav.calendar',  { default: 'Calendar' })}</span>
        </a>
        <a href="{base}/inventory" class:active={currentPath.includes('/inventory')} onclick={navTo}>
          <Icon name="package"          size="md" />
          <span>{$t('nav.inventory', { default: 'Inventory' })}</span>
        </a>
        <a href="{base}/ai-lab"    class:active={currentPath.includes('/ai-lab')}    onclick={navTo}>
          <Icon name="sparkles"         size="md" />
          <span>{$t('nav.ailab',    { default: 'AI Lab' })}</span>
        </a>
        {#if isAdmin}
          <hr class="rf-mobile-menu__divider" />
          <a href="{base}/admin/users"     class:active={currentPath.includes('/admin/users')}     onclick={navTo}>
            <Icon name="users" size="md" />
            <span>{$t('nav.users',     { default: 'Users' })}</span>
          </a>
          <a href="{base}/admin/materials" class:active={currentPath.includes('/admin/materials')} onclick={navTo}>
            <Icon name="boxes" size="md" />
            <span>{$t('nav.materials', { default: 'Materials' })}</span>
          </a>
        {/if}
      </nav>
    {/if}
  {/if}

  {#if showInstallPrompt}
    <InstallPrompt onInstall={handleInstall} onDismiss={handleDismissInstall} />
  {/if}
  {#if showUpdatePrompt}
    <UpdatePrompt onUpdate={handleUpdate} onDismiss={handleDismissUpdate} />
  {/if}
  {#if !isOnline}
    <OfflineIndicator />
  {/if}

  <main id="main" class="rf-page">{@render children?.()}</main>

  {#if $currentUser}
    <MobileNav />
    <BottomBar />
    <ChatSidebar />
  {/if}

  <Toast />
  <LiveRegion />
  <GlobalSearch bind:open={searchOpen} />
  <Keybindings bind:open={showKb} />
{/if}

<div id="rf-live" class="sr-only" aria-live="polite"></div>

<style>
/* ---- Accessibility ---- */
.sr-only {
  position: absolute;
  width: 1px; height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.rf-skip-link {
  position: absolute;
  left: -9999px; top: -9999px;
  padding: var(--space-sm) var(--space-lg);
  background: var(--brand);
  color: var(--bg-0);
  border-radius: var(--radius-sm);
  font-weight: 600;
  font-size: var(--text-sm);
  z-index: var(--z-toast);
  text-decoration: none;
  box-shadow: var(--elevation-3);
  transition: none;
}

/* ---- Auth loading ---- */
.auth-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100dvh;
  background: var(--bg-0);
}

/* ---- Topbar ---- */
.rf-topbar {
  position: sticky;
  top: 0;
  z-index: var(--z-sticky);
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: 0 clamp(var(--space-md), 3vw, var(--space-2xl));
  height: var(--topbar-h, 60px);
  background: var(--glass-bg-strong);
  backdrop-filter: var(--glass-material-regular);
  -webkit-backdrop-filter: var(--glass-material-regular);
  border-bottom: 1px solid var(--separator-opaque, var(--divider));
  box-shadow: var(--glass-shadow-sm), var(--glass-border-highlight);
  animation: rf-fade-in var(--motion-md) var(--ease-standard) both;
}

.rf-topbar__brand {
  display: inline-flex;
  align-items: center;
  text-decoration: none;
  flex-shrink: 0;
  border-radius: var(--radius-sm);
  padding: var(--space-xxs);
  margin: calc(-1 * var(--space-xxs));
  transition: opacity var(--motion-sm) var(--ease-standard);
}
.rf-topbar__brand:hover { opacity: 0.8; }

/* Desktop nav */
.rf-topbar__nav {
  flex: 1;
  display: flex;
  align-items: center;
  gap: var(--space-xxs);
  overflow-x: auto;
  scrollbar-width: none;
  padding: var(--space-xxs) 0;
}
.rf-topbar__nav::-webkit-scrollbar { display: none; }

.rf-topbar__nav a {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-xs) var(--space-md);
  border-radius: var(--radius-sm);
  text-decoration: none;
  color: var(--ink-secondary);
  font-size: var(--text-sm);
  font-weight: 500;
  white-space: nowrap;
  flex-shrink: 0;
  position: relative;
  transition:
    color      var(--motion-sm) var(--ease-standard),
    background var(--motion-sm) var(--ease-standard),
    transform  var(--motion-xs) var(--ease-spring-soft);
}
.rf-topbar__nav a:hover {
  color: var(--ink-primary);
  background: color-mix(in oklab, var(--bg-2) 70%, transparent);
}
.rf-topbar__nav a:active { transform: scale(0.97); }
.rf-topbar__nav a.active {
  background: var(--brand-soft);
  color: var(--brand);
  font-weight: 600;
}
.rf-topbar__nav a.active::after {
  content: '';
  position: absolute;
  inset: auto var(--space-md) -1px var(--space-md);
  height: 2px;
  background: var(--brand);
  border-radius: var(--radius-full);
  opacity: 0.85;
}
.rf-topbar__nav a.active:hover {
  background: color-mix(in oklab, var(--brand-soft) 80%, var(--bg-2));
}

.rf-topbar__divider {
  display: block;
  width: 1px;
  height: 18px;
  background: var(--divider);
  margin: 0 var(--space-xs);
  flex-shrink: 0;
}

/* Mobile hamburger — hidden on desktop */
.rf-topbar__hamburger {
  display: none;
  align-items: center;
  justify-content: center;
  width: var(--control-sm);
  height: var(--control-sm);
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--ink-primary);
  cursor: pointer;
  flex-shrink: 0;
  padding: 0;
  box-shadow: none;
  transition:
    background var(--motion-sm) var(--ease-standard),
    border-color var(--motion-sm) var(--ease-standard);
}
.rf-topbar__hamburger:hover {
  background: var(--bg-2);
  border-color: var(--border-strong);
  transform: none;
  filter: none;
}

/* ---- Mobile: show hamburger, hide desktop nav ---- */
@media (max-width: 1024px) {
  .rf-topbar {
    padding: 0 var(--space-md);
    height: calc(56px * var(--font-scale, 1));
    gap: var(--space-sm);
  }
  .rf-topbar__nav { display: none; }
  .rf-topbar__hamburger { display: flex; }
  .rf-topbar__brand { flex: 1; }
}

/* ---- Mobile menu overlay ---- */
.rf-mobile-backdrop {
  position: fixed;
  inset: 0;
  background: color-mix(in oklab, var(--bg-0) 40%, transparent);
  backdrop-filter: var(--glass-material-thin);
  -webkit-backdrop-filter: var(--glass-material-thin);
  z-index: calc(var(--z-sticky) + 1);
  animation: rf-fade-in var(--motion-sm) var(--ease-standard) both;
}

.rf-mobile-menu {
  position: fixed;
  top: calc(56px * var(--font-scale, 1));
  left: 0;
  right: 0;
  z-index: calc(var(--z-sticky) + 2);
  display: flex;
  flex-direction: column;
  gap: var(--space-xxs);
  padding: var(--space-sm);
  background: var(--glass-bg-strong);
  backdrop-filter: var(--glass-material-thick);
  -webkit-backdrop-filter: var(--glass-material-thick);
  border-bottom: 1px solid var(--glass-border);
  box-shadow: var(--glass-shadow-lg);
  animation: rf-slide-down var(--motion-md) var(--ease-emphasized) both;
  max-height: calc(100dvh - 56px * var(--font-scale, 1));
  overflow-y: auto;
}

.rf-mobile-menu a {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-md) var(--space-lg);
  border-radius: var(--radius-md);
  text-decoration: none;
  color: var(--ink-secondary);
  font-size: var(--text-md);
  font-weight: 500;
  transition:
    color      var(--motion-sm) var(--ease-standard),
    background var(--motion-sm) var(--ease-standard);
}
.rf-mobile-menu a:hover {
  color: var(--ink-primary);
  background: color-mix(in oklab, var(--bg-2) 70%, transparent);
}
.rf-mobile-menu a.active {
  color: var(--brand);
  background: var(--brand-soft);
  font-weight: 600;
}

.rf-mobile-menu__divider {
  border: none;
  border-top: 1px solid var(--divider);
  margin: var(--space-xs) 0;
}

@media (prefers-reduced-motion: reduce) {
  .rf-mobile-menu,
  .rf-mobile-backdrop { animation: none; }
}
</style>
