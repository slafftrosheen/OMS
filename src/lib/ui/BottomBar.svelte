<script lang="ts">
  import { base } from '$app/paths';
  import { t } from 'svelte-i18n';
  import Icon from '$lib/ui/Icon.svelte';
  import LangSwitch from '$lib/topbar/LangSwitch.svelte';
  import TextSizeSwitch from '$lib/topbar/TextSizeSwitch.svelte';
  import DensitySwitch from '$lib/topbar/DensitySwitch.svelte';
  import ThemeSwitch from '$lib/topbar/ThemeSwitch.svelte';
  import NotificationsBell from '$lib/topbar/NotificationsBell.svelte';
  import RealtimeConnection from '$lib/realtime/RealtimeConnection.svelte';
  import UserSwitch from '$lib/topbar/UserSwitch.svelte';
  import { toggleChat, isChatOpen, unreadCount } from '$lib/chat/chat-store';

  interface Props {
    onSearchOpen?: () => void;
  }
  let { onSearchOpen }: Props = $props();
</script>

<div class="rf-bottombar" role="toolbar" aria-label={$t('a11y.toolbar', { default: 'App toolbar' })}>
  <!-- Left cluster: utility switches -->
  <div class="rf-bottombar__cluster rf-bottombar__cluster--left">
    <div class="rf-bottombar__item" title={$t('topbar.language', { default: 'Language' })}>
      <LangSwitch />
    </div>
    <div class="rf-bottombar__item rf-bottombar__text-size" title={$t('topbar.textSize', { default: 'Text Size' })}>
      <TextSizeSwitch />
    </div>
    <div class="rf-bottombar__item" title={$t('topbar.density', { default: 'Density' })}>
      <DensitySwitch />
    </div>
    <div class="rf-bottombar__item" title={$t('topbar.theme', { default: 'Theme' })}>
      <ThemeSwitch />
    </div>
  </div>

  <!-- Right cluster: actions -->
  <div class="rf-bottombar__cluster rf-bottombar__cluster--right">
    <div class="rf-bottombar__item" title={$t('layout.realtime', { default: 'Realtime connection' })}>
      <RealtimeConnection />
    </div>
    <div class="rf-bottombar__item" title={$t('ui.notifications', { default: 'Notifications' })}>
      <NotificationsBell />
    </div>
    <button
      class="rf-bottombar__item rf-bottombar__chat"
      class:active={$isChatOpen}
      title={$t('ui.chat', { default: 'Chat' })}
      type="button"
      onclick={toggleChat}
    >
      <div class="rf-bottombar__chat-icon">
        <Icon name="message-square" size="md" />
        {#if $unreadCount > 0}
          <span class="rf-bottombar__badge" aria-label="{$unreadCount} {$t('ui.unread', { default: 'unread' })}">
            {$unreadCount > 9 ? '9+' : $unreadCount}
          </span>
        {/if}
      </div>
    </button>
    <a
      href="{base}/settings"
      class="rf-bottombar__item rf-bottombar__settings"
      title={$t('nav.settings', { default: 'Settings' })}
      aria-label={$t('nav.settings', { default: 'Settings' })}
    >
      <Icon name="settings" size="md" />
    </a>
    <UserSwitch />
  </div>
</div>

<style>
  .rf-bottombar {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    height: var(--bottombar-h, 44px);
    display: none;
    align-items: center;
    justify-content: space-between;
    padding:
      0
      max(var(--space-md), env(safe-area-inset-right, 0px))
      0
      max(var(--space-md), env(safe-area-inset-left, 0px));
    background: var(--glass-bg-strong);
    backdrop-filter: var(--glass-material-regular);
    -webkit-backdrop-filter: var(--glass-material-regular);
    border-top: 1px solid var(--separator-opaque, var(--divider));
    z-index: var(--z-docked);
  }

  @media (min-width: 1025px) {
    .rf-bottombar { display: flex; }
  }

  .rf-bottombar__cluster {
    display: flex;
    align-items: center;
    gap: var(--space-xxs);
  }

  .rf-bottombar__item {
    display: flex;
    align-items: center;
    justify-content: center;
    height: var(--control-sm, 36px);
    min-width: var(--control-sm, 36px);
    border-radius: var(--radius-sm);
    color: var(--ink-secondary);
    transition:
      background var(--motion-sm) var(--ease-standard),
      color      var(--motion-sm) var(--ease-standard);
    flex-shrink: 0;
  }
  .rf-bottombar__item:hover {
    background: color-mix(in oklab, var(--bg-2) 70%, transparent);
    color: var(--ink-primary);
  }

  .rf-bottombar__text-size {
    padding: 0 var(--space-xs);
    background: var(--bg-0);
    border: 1px solid var(--border);
    min-width: unset;
  }
  .rf-bottombar__text-size:hover {
    background: var(--bg-0);
  }

  /* Chat button */
  .rf-bottombar__chat {
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 0;
    position: relative;
  }
  .rf-bottombar__chat.active {
    color: var(--brand);
    background: var(--brand-soft);
  }

  .rf-bottombar__chat-icon {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
  }

  .rf-bottombar__badge {
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
    border: 2px solid var(--bg-0);
    line-height: 1;
  }

  /* Settings link */
  .rf-bottombar__settings {
    text-decoration: none;
  }
</style>
