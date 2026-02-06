<script lang="ts">
  import { Globe } from 'lucide-svelte';
  import { locale, t } from 'svelte-i18n';
  import { setLocale } from '$lib/i18n';
  import { clickOutside } from '$lib/utils/click-outside';

  let isOpen = $state(false);
  let currentLang = $derived($locale || 'en');

  function toggle() {
    isOpen = !isOpen;
  }

  function handleClickOutside() {
    isOpen = false;
  }

  function changeLang(lang: string) {
    setLocale(lang);
    isOpen = false;
  }

  const languages = [
    { code: 'en', label: 'English', flag: '🇬🇧' },
    { code: 'ru', label: 'Русский', flag: '🇷🇺' },
    { code: 'lv', label: 'Latviešu', flag: '🇱🇻' }
  ];

  let currentFlag = $derived(languages.find(l => l.code === currentLang)?.flag || '🇬🇧');
</script>

<div class="lang-menu" use:clickOutside={handleClickOutside}>
  <button
    class="lang-btn"
    onclick={toggle}
    aria-haspopup="menu"
    aria-expanded={isOpen}
    aria-label={$t('topbar.language', { default: 'Language' })}
  >
    <Globe size={18} aria-hidden="true" />
    <span class="flag">{currentFlag}</span>
  </button>

  {#if isOpen}
    <div class="dropdown" role="menu">
      {#each languages as lang}
        <button
          role="menuitem"
          class:active={currentLang === lang.code}
          onclick={() => changeLang(lang.code)}
        >
          <span class="flag">{lang.flag}</span>
          <span>{lang.label}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .lang-menu {
    position: relative;
  }

  .lang-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    height: 36px;
    padding: 0 8px;
    background: transparent;
    border: none;
    border-radius: 8px;
    color: var(--text);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .lang-btn:hover,
  .lang-btn[aria-expanded="true"] {
    background: var(--bg-2);
  }

  .flag {
    font-size: 1.25rem;
    line-height: 1;
  }

  .dropdown {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    min-width: 160px;
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(var(--shadow-rgb, 0 0 0) / 0.18);
    padding: 4px;
    z-index: 10000;
    animation: slideDown 0.15s ease;
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .dropdown button {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 10px 12px;
    background: transparent;
    border: none;
    border-radius: 8px;
    color: var(--text);
    cursor: pointer;
    text-align: left;
    transition: background 0.15s ease;
    font-size: 0.875rem;
  }

  .dropdown button:hover {
    background: var(--bg-2);
  }

  .dropdown button.active {
    background: var(--accent-1, var(--accent));
    color: white;
    font-weight: 600;
  }
</style>
