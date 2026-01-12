<script lang="ts">
  import { onMount, tick } from 'svelte';
  import Globe from 'lucide-svelte/icons/globe';
  import { locale, t } from 'svelte-i18n';
  import { setLocale } from '$lib/i18n';
  import { savePrefs } from '$lib/settings/service';
  import { track } from '$lib/telemetry';

  type LanguageCode = 'en' | 'ru' | 'lv';

  const languages: LanguageCode[] = ['en', 'ru', 'lv'];

  let open = false;
  let wrapper: HTMLDivElement | null = null;
  let trigger: HTMLButtonElement | null = null;
  let items: HTMLButtonElement[] = [];

  function registerItem(node: HTMLButtonElement) {
    items = [...items, node];
    return {
      destroy() {
        items = items.filter((item) => item !== node);
      }
    };
  }

  function focusItem(index: number) {
    items[index]?.focus();
  }

  async function openMenu(focusLast = false) {
    if (!open) {
      open = true;
      await tick();
    } else {
      await tick();
    }

    if (!items.length) return;

    const current = ($locale || 'en') as LanguageCode;
    const defaultIndex = Math.max(languages.indexOf(current), 0);
    const targetIndex = focusLast ? items.length - 1 : defaultIndex;
    focusItem(Math.max(0, targetIndex));
  }

  function toggleMenu() {
    if (open) {
      closeMenu();
    } else {
      void openMenu();
    }
  }

  function closeMenu() {
    open = false;
  }

  function selectLanguage(code: LanguageCode) {
    if ($locale === code) {
      closeMenu();
      return;
    }

    setLocale(code);
    savePrefs();
    track('locale_toggle', { locale: code });
    closeMenu();
    trigger?.focus();
  }

  function handleFocusOut(event: FocusEvent) {
    const next = event.relatedTarget as Node | null;
    if (!next || !wrapper?.contains(next)) {
      closeMenu();
    }
  }

  function handleDocumentPointer(event: PointerEvent) {
    if (!open) return;
    const target = event.target as Node | null;
    if (!wrapper?.contains(target)) {
      closeMenu();
    }
  }

  function handleTriggerKeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      void openMenu();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      void openMenu(true);
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      closeMenu();
    }
  }

  function handleMenuKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu();
      trigger?.focus();
      return;
    }

    if (!items.length) return;

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const currentIndex = items.findIndex((item) => item === document.activeElement);
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      const nextIndex = (currentIndex + delta + items.length) % items.length;
      focusItem(nextIndex);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusItem(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusItem(items.length - 1);
    }
  }

  onMount(() => {
    const pointerListener = (event: PointerEvent) => handleDocumentPointer(event);
    document.addEventListener('pointerdown', pointerListener, true);
    return () => document.removeEventListener('pointerdown', pointerListener, true);
  });
</script>

<div class="menu-wrap" bind:this={wrapper} on:focusout={handleFocusOut}>
  <button
    class="chip"
    type="button"
    aria-haspopup="menu"
    aria-expanded={open}
    on:click={toggleMenu}
    on:keydown={handleTriggerKeydown}
    bind:this={trigger}
    title={$t('header.language.label')}
  >
    <Globe aria-hidden="true" focusable="false" />
    <span class="mini" aria-hidden="true">{($locale || 'en').toUpperCase()}</span>
    <span class="sr-only">{$t('header.language.label')}</span>
  </button>
  {#if open}
    <div
      class="menu"
      role="menu"
      aria-label={$t('header.language.label')}
      tabindex="-1"
      on:keydown={handleMenuKeydown}
    >
      {#each languages as code}
        <button
          type="button"
          role="menuitemradio"
          class="row-item"
          aria-checked={$locale === code}
          data-lang={code}
          use:registerItem
          on:click={() => selectLanguage(code)}
        >
          <span>{$t(`header.language.options.${code}`)}</span>
          <span class="mini" aria-hidden="true">{code.toUpperCase()}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .menu-wrap {
    position: relative;
  }

  .chip {
    align-items: center;
    background: var(--bg-0);
    border: 1px solid color-mix(in oklab, var(--border) 85%, transparent);
    border-radius: calc(var(--radius-md) - var(--space-xxs));
    color: var(--text);
    cursor: pointer;
    display: inline-flex;
    gap: var(--space-tight);
    height: var(--control-sm);
    padding: 0 var(--space-md);
    transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease;
  }

  .chip:hover,
  .chip:focus-visible {
    background: color-mix(in oklab, var(--bg-2) 70%, var(--bg-1) 30%);
    border-color: color-mix(in oklab, var(--border) 70%, transparent);
  }

  .chip :global(svg) {
    width: var(--icon-size);
    height: var(--icon-size);
    stroke-width: 2;
  }

  .mini {
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.02em;
  }

  .menu {
    background: var(--bg-1);
    border: 1px solid color-mix(in oklab, var(--border) 85%, transparent);
    border-radius: var(--radius-md);
    box-shadow: 0 12px 24px rgba(var(--shadow-rgb) / 0.15);
    display: grid;
    gap: var(--space-xs);
    min-width: calc(180px * var(--font-scale, 1));
    padding: var(--space-sm);
    position: absolute;
    right: 0;
    top: calc(var(--control-sm) + var(--space-tight));
    z-index: 20;
  }

  .row-item {
    align-items: center;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    color: var(--text);
    cursor: pointer;
    display: flex;
    justify-content: space-between;
    padding: var(--space-sm) var(--space-snug);
    text-align: left;
    transition: background 0.2s ease, color 0.2s ease;
  }

  .row-item:hover,
  .row-item:focus-visible {
    background: color-mix(in oklab, var(--bg-2) 70%, var(--bg-1) 30%);
  }

  .row-item[aria-checked='true'] {
    background: color-mix(in oklab, var(--bg-2) 80%, var(--bg-1) 20%);
    font-weight: 600;
  }

  .sr-only {
    position: absolute;
    width: calc(1px * var(--font-scale, 1));
    height: calc(1px * var(--font-scale, 1));
    padding: 0;
    margin: calc(var(--space-xs) * -1);
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    border: 0;
  }
</style>
