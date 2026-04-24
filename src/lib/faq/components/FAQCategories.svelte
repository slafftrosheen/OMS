<script lang="ts">
  import type { FAQCategory } from '../types';
  import Icon from '$lib/ui/Icon.svelte';
  import type { IconName } from '$lib/ui/icons';

  let {
    categories = [],
    selectedId = null,
    lang = 'en',
    onselect
  }: {
    categories?: FAQCategory[];
    selectedId?: number | null;
    lang?: 'en' | 'ru' | 'lv';
    onselect?: (id: number | null) => void;
  } = $props();

  const getName = (cat: FAQCategory) => {
    if (lang === 'ru' && cat.nameRu) return cat.nameRu;
    if (lang === 'lv' && cat.nameLv) return cat.nameLv;
    return cat.nameEn;
  };

  const getDescription = (cat: FAQCategory) => {
    if (lang === 'ru' && cat.descriptionRu) return cat.descriptionRu;
    if (lang === 'lv' && cat.descriptionLv) return cat.descriptionLv;
    return cat.descriptionEn || '';
  };

  const iconMap: Record<string, IconName> = {
    'box':          'box',
    'palette':      'palette',
    'cog':          'settings',
    'package':      'package',
    'clipboard':    'clipboard-list',
    'alert-circle': 'alert-circle',
    'grid':         'grid',
  };

  function getIconName(name?: string): IconName {
    return (name && iconMap[name]) ? iconMap[name] : 'help-circle';
  }
</script>

<div class="faq-categories">
  <button
    class="rf-faq-cat"
    class:active={selectedId === null}
    type="button"
    onclick={() => onselect?.(null)}
  >
    <Icon name="grid" size="md" />
    <span class="rf-faq-cat__name">All Categories</span>
  </button>

  {#each categories as category (category.id)}
    <button
      class="rf-faq-cat"
      class:active={selectedId === category.id}
      type="button"
      onclick={() => onselect?.(category.id)}
    >
      <Icon name={getIconName(category.icon)} size="md" />
      <div class="rf-faq-cat__body">
        <span class="rf-faq-cat__name">{getName(category)}</span>
        {#if getDescription(category)}
          <span class="rf-faq-cat__desc">{getDescription(category)}</span>
        {/if}
      </div>
    </button>
  {/each}
</div>

<style>
  .faq-categories {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .rf-faq-cat {
    display: flex;
    align-items: flex-start;
    gap: var(--space-md);
    padding: var(--space-md);
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition:
      background    var(--motion-sm) var(--ease-standard),
      color         var(--motion-sm) var(--ease-standard),
      border-color  var(--motion-sm) var(--ease-standard);
    text-align: left;
    color: var(--ink-secondary);
    font: inherit;
    width: 100%;
  }
  .rf-faq-cat:hover {
    background: var(--bg-2);
    border-color: color-mix(in oklab, var(--brand) 40%, transparent);
    color: var(--ink-primary);
  }
  .rf-faq-cat.active {
    background: var(--brand-soft);
    border-color: color-mix(in oklab, var(--brand) 45%, transparent);
    color: var(--brand);
  }
  .rf-faq-cat:focus-visible { outline: none; box-shadow: var(--focus-ring); }

  .rf-faq-cat__body {
    display: flex;
    flex-direction: column;
    gap: var(--space-xxs);
    flex: 1;
  }
  .rf-faq-cat__name {
    font-weight: 600;
    font-size: var(--text-sm);
  }
  .rf-faq-cat__desc {
    font-size: var(--text-xs);
    color: var(--ink-tertiary);
    line-height: var(--leading-snug);
  }
  .rf-faq-cat.active .rf-faq-cat__desc {
    color: color-mix(in oklab, var(--brand) 80%, var(--text));
  }
</style>
