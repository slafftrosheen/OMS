<script lang="ts">
  import type { FAQTag } from '../types';
  import Badge from '$lib/ui/Badge.svelte';
  import { createEventDispatcher } from 'svelte';

  export let tags: FAQTag[] = [];
  export let selectedTag: string | null = null;

  const dispatch = createEventDispatcher<{ select: string | null }>();

  const selectTag = (slug: string | null) => {
    dispatch('select', slug);
  };
</script>

<div class="faq-tags">
  <h3 class="tags-title">Popular Tags</h3>
  <div class="tags-list">
    {#each tags as tag (tag.id)}
      <button
        class="tag-btn"
        class:active={selectedTag === tag.slug}
        on:click={() => selectTag(selectedTag === tag.slug ? null : tag.slug)}
        type="button"
      >
        {tag.name}
        <span class="tag-count">{tag.usageCount}</span>
      </button>
    {/each}
  </div>
</div>

<style>
  .faq-tags {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .tags-title {
    margin: 0;
    font-size: 0.9rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted);
  }

  .tags-list {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
  }

  .tag-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    padding: calc(var(--space-xs) + var(--space-xxs)) calc(var(--space-sm) + var(--space-xs));
    border-radius: 999px;
    font-size: 0.82rem;
    border: 1px solid var(--border);
    background: var(--bg-2);
    color: var(--text);
    cursor: pointer;
    transition: all 0.2s ease;
    font: inherit;
    line-height: 1;
  }

  .tag-btn:hover {
    background: var(--bg-3);
    border-color: var(--accent-1);
  }

  .tag-btn.active {
    background: color-mix(in oklab, var(--accent-1) 18%, transparent);
    color: var(--accent-1);
    border-color: color-mix(in oklab, var(--accent-1) 40%, transparent);
  }

  .tag-count {
    font-size: 0.75rem;
    opacity: 0.7;
  }
</style>
