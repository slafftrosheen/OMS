<script lang="ts">
  import type { FAQItem } from '../types';
  import Badge from '$lib/ui/Badge.svelte';
  import { Eye } from 'lucide-svelte';

  export let item: FAQItem;
  export let lang: 'en' | 'ru' | 'lv' = 'en';
  export let showAnswer = false;

  const getQuestion = (item: FAQItem, lang: 'en' | 'ru' | 'lv') => {
    if (lang === 'ru' && item.questionRu) return item.questionRu;
    if (lang === 'lv' && item.questionLv) return item.questionLv;
    return item.questionEn;
  };

  const getAnswer = (item: FAQItem, lang: 'en' | 'ru' | 'lv') => {
    if (lang === 'ru' && item.answerRu) return item.answerRu;
    if (lang === 'lv' && item.answerLv) return item.answerLv;
    return item.answerEn;
  };

  let expanded = showAnswer;
  const toggle = () => {
    expanded = !expanded;
  };
</script>

<article class="faq-card" class:expanded>
  <button 
    class="faq-header" 
    on:click={toggle}
    aria-expanded={expanded}
    type="button"
  >
    <div class="faq-question-row">
      <h3 class="faq-question">
        {getQuestion(item, lang)}
      </h3>
      {#if item.isFeatured}
        <Badge tone="primary" label="Featured">★</Badge>
      {/if}
    </div>
    
    <div class="faq-meta">
      {#if item.tags && item.tags.length > 0}
        <div class="faq-tags">
          {#each item.tags.slice(0, 3) as tag}
            <Badge tone="neutral">{tag.name}</Badge>
          {/each}
        </div>
      {/if}
      
      <div class="faq-stats">
        <Eye size={14} />
        <span>{item.viewCount}</span>
      </div>
      
      <svg 
        class="chevron" 
        width="20" 
        height="20" 
        viewBox="0 0 20 20" 
        fill="none"
      >
        <path 
          d="M5 7.5L10 12.5L15 7.5" 
          stroke="currentColor" 
          stroke-width="1.5" 
          stroke-linecap="round" 
          stroke-linejoin="round"
        />
      </svg>
    </div>
  </button>
  
  {#if expanded}
    <div class="faq-answer">
      {@html getAnswer(item, lang)}
    </div>
  {/if}
</article>

<style>
  .faq-card {
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    overflow: hidden;
    transition: box-shadow 0.2s ease, border-color 0.2s ease;
  }

  .faq-card:hover {
    border-color: var(--accent-1);
    box-shadow: 0 2px 8px color-mix(in oklab, var(--accent-1) 12%, transparent);
  }

  .faq-card.expanded {
    border-color: var(--accent-1);
  }

  .faq-header {
    width: 100%;
    padding: var(--space-lg);
    background: transparent;
    border: none;
    cursor: pointer;
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    color: inherit;
    font: inherit;
  }

  .faq-question-row {
    display: flex;
    align-items: flex-start;
    gap: var(--space-md);
    justify-content: space-between;
  }

  .faq-question {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--text);
    flex: 1;
    line-height: 1.4;
  }

  .faq-meta {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    flex-wrap: wrap;
  }

  .faq-tags {
    display: flex;
    gap: var(--space-xs);
    flex-wrap: wrap;
    flex: 1;
  }

  .faq-stats {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    color: var(--muted);
    font-size: 0.875rem;
  }

  .chevron {
    color: var(--muted);
    transition: transform 0.2s ease;
  }

  .faq-card.expanded .chevron {
    transform: rotate(180deg);
  }

  .faq-answer {
    padding: 0 var(--space-lg) var(--space-lg);
    color: var(--text);
    line-height: 1.6;
    animation: slideDown 0.2s ease;
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .faq-answer :global(h3) {
    font-size: 1rem;
    font-weight: 600;
    margin: var(--space-lg) 0 var(--space-md);
    color: var(--text);
  }

  .faq-answer :global(p) {
    margin: var(--space-md) 0;
  }

  .faq-answer :global(ul),
  .faq-answer :global(ol) {
    margin: var(--space-md) 0;
    padding-left: var(--space-xl);
  }

  .faq-answer :global(li) {
    margin: var(--space-xs) 0;
  }

  .faq-answer :global(table) {
    width: 100%;
    border-collapse: collapse;
    margin: var(--space-lg) 0;
    font-size: 0.9rem;
  }

  .faq-answer :global(th),
  .faq-answer :global(td) {
    padding: var(--space-sm) var(--space-md);
    border: 1px solid var(--border);
    text-align: left;
  }

  .faq-answer :global(th) {
    background: var(--bg-2);
    font-weight: 600;
  }

  .faq-answer :global(strong) {
    font-weight: 600;
    color: var(--accent-1);
  }

  .faq-answer :global(code) {
    background: var(--bg-2);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    font-size: 0.9em;
  }
</style>
