<script lang="ts">
  import { locale, t } from 'svelte-i18n';
  import { setLocale } from '$lib/i18n';
  import { clickOutside } from '$lib/utils/click-outside';
  import Icon from '$lib/ui/Icon.svelte';

  let isOpen = $state(false);
  let currentLang = $derived($locale || 'en');

  function changeLang(lang: string) { setLocale(lang); isOpen = false; }

  const languages = [
    { code: 'en', label: 'English',   flag: '🇬🇧' },
    { code: 'ru', label: 'Русский',   flag: '🇷🇺' },
    { code: 'lv', label: 'Latviešu',  flag: '🇱🇻' },
  ];

  let currentFlag = $derived(languages.find(l => l.code === currentLang)?.flag || '🇬🇧');
</script>

<div class="rf-lang" use:clickOutside={() => { isOpen = false; }}>
  <button
    class="rf-lang__btn"
    type="button"
    onclick={() => isOpen = !isOpen}
    aria-haspopup="menu"
    aria-expanded={isOpen}
    aria-label={$t('topbar.language', { default: 'Language' })}
  >
    <Icon name="globe" size="sm" />
    <span class="rf-lang__flag" aria-hidden="true">{currentFlag}</span>
  </button>

  {#if isOpen}
    <div class="rf-lang__dropdown" role="menu">
      {#each languages as lang}
        <button
          role="menuitem"
          class="rf-lang__item"
          class:active={currentLang === lang.code}
          type="button"
          onclick={() => changeLang(lang.code)}
        >
          <span class="rf-lang__flag">{lang.flag}</span>
          <span>{lang.label}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .rf-lang { position: relative; }

  .rf-lang__btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-xxs);
    height: var(--control-sm, 36px);
    padding: 0 var(--space-sm);
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    color: var(--ink-secondary);
    cursor: pointer;
    transition:
      background var(--motion-sm) var(--ease-standard),
      color      var(--motion-sm) var(--ease-standard);
  }
  .rf-lang__btn:hover,
  .rf-lang__btn[aria-expanded="true"] {
    background: color-mix(in oklab, var(--bg-2) 70%, transparent);
    color: var(--ink-primary);
  }
  .rf-lang__btn:focus-visible { outline: none; box-shadow: var(--focus-ring); }

  .rf-lang__flag { font-size: 1.1rem; line-height: 1; }

  .rf-lang__dropdown {
    position: absolute;
    top: calc(100% + var(--space-sm));
    right: 0;
    min-width: 160px;
    background: var(--glass-bg-strong);
    backdrop-filter: var(--glass-material-thick);
    -webkit-backdrop-filter: var(--glass-material-thick);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--glass-shadow-md);
    padding: var(--space-xxs);
    z-index: var(--z-popover);
    animation: rf-dd-in var(--motion-sm) var(--ease-standard) both;
  }
  @keyframes rf-dd-in {
    from { opacity: 0; transform: translateY(-6px) scale(0.97); }
    to   { opacity: 1; transform: translateY(0)   scale(1); }
  }

  .rf-lang__item {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    width: 100%;
    padding: var(--space-xs) var(--space-sm);
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    color: var(--ink-secondary);
    cursor: pointer;
    text-align: left;
    font-size: var(--text-sm);
    transition:
      background var(--motion-sm) var(--ease-standard),
      color      var(--motion-sm) var(--ease-standard);
  }
  .rf-lang__item:hover { background: color-mix(in oklab, var(--bg-2) 60%, transparent); color: var(--ink-primary); }
  .rf-lang__item:focus-visible { outline: none; box-shadow: inset var(--focus-ring); }
  .rf-lang__item.active {
    background: var(--brand);
    color: var(--bg-0);
    font-weight: 600;
  }
  .rf-lang__item.active:hover { background: color-mix(in oklab, var(--brand) 85%, black); }
</style>
