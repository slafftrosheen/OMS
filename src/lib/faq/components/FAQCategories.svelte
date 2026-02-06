<script lang="ts">
  import type { FAQCategory } from '../types';
  import * as Icons from 'lucide-svelte';

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

  const getIcon = (iconName?: string) => {
    if (!iconName) return Icons.HelpCircle;
    
    // Map icon names to lucide icons
    const iconMap: Record<string, any> = {
      'box': Icons.Box,
      'palette': Icons.Palette,
      'cog': Icons.Cog,
      'package': Icons.Package,
      'clipboard': Icons.Clipboard,
      'alert-circle': Icons.AlertCircle,
    };
    
    return iconMap[iconName] || Icons.HelpCircle;
  };

  const selectCategory = (id: number | null) => {
    onselect?.(id);
  };
</script>

<div class="faq-categories">
  <button
    class="category-btn"
    class:active={selectedId === null}
    onclick={() => selectCategory(null)}
    type="button"
  >
    <Icons.Grid size={20} />
    <div class="category-content">
      <span class="category-name">All Categories</span>
    </div>
  </button>

  {#each categories as category (category.id)}
    {@const SvelteComponent = getIcon(category.icon)}
    <button
      class="category-btn"
      class:active={selectedId === category.id}
      onclick={() => selectCategory(category.id)}
      type="button"
    >
      <SvelteComponent size={20} />
      <div class="category-content">
        <span class="category-name">{getName(category)}</span>
        {#if getDescription(category)}
          <span class="category-desc">{getDescription(category)}</span>
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

  .category-btn {
    display: flex;
    align-items: flex-start;
    gap: var(--space-md);
    padding: var(--space-md);
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: left;
    color: var(--text);
    font: inherit;
    width: 100%;
  }

  .category-btn:hover {
    background: var(--bg-2);
    border-color: var(--accent-1);
  }

  .category-btn.active {
    background: color-mix(in oklab, var(--accent-1) 12%, var(--bg-1));
    border-color: var(--accent-1);
    color: var(--accent-1);
  }

  .category-btn :global(svg) {
    flex-shrink: 0;
    margin-top: 2px;
  }

  .category-content {
    display: flex;
    flex-direction: column;
    gap: var(--space-xxs);
    flex: 1;
  }

  .category-name {
    font-weight: 600;
    font-size: 0.95rem;
  }

  .category-desc {
    font-size: 0.85rem;
    color: var(--muted);
    line-height: 1.4;
  }

  .category-btn.active .category-desc {
    color: color-mix(in oklab, var(--accent-1) 80%, var(--text));
  }
</style>
