<script lang="ts">
  import type { FAQItem } from '../types';
  import FAQCard from './FAQCard.svelte';

  export let items: FAQItem[] = [];
  export let lang: 'en' | 'ru' | 'lv' = 'en';
  export let emptyMessage = 'No FAQ items found';
</script>

<div class="faq-list">
  {#if items.length === 0}
    <div class="empty-state">
      <p>{emptyMessage}</p>
    </div>
  {:else}
    {#each items as item (item.id)}
      <FAQCard {item} {lang} />
    {/each}
  {/if}
</div>

<style>
  .faq-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .empty-state {
    text-align: center;
    padding: var(--space-2xl);
    color: var(--muted);
    background: var(--bg-1);
    border: 1px dashed var(--border);
    border-radius: var(--radius-lg);
  }

  .empty-state p {
    margin: 0;
    font-size: 1rem;
  }
</style>
