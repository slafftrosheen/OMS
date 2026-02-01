<script lang="ts">
  import { t } from 'svelte-i18n';
  import { base } from '$app/paths';
  import { HelpCircle, ChevronDown, ChevronRight } from 'lucide-svelte';
  
  let expandedItems: Set<string> = new Set(['q1']);
  
  const faqs = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'];
  
  function toggleItem(item: string) {
    if (expandedItems.has(item)) {
      expandedItems.delete(item);
    } else {
      expandedItems.add(item);
    }
    expandedItems = expandedItems; // trigger reactivity
  }
</script>

<section class="card">
  <h1 style="margin: 0 0 16px 0; display: flex; align-items: center; gap: 12px;">
    <HelpCircle size={28} aria-hidden="true" />
    {$t('faq.title')}
  </h1>
  
  <div class="faq-list">
    {#each faqs as faqKey}
      {@const isExpanded = expandedItems.has(faqKey)}
      <div class="faq-item">
        <button 
          class="faq-question" 
          on:click={() => toggleItem(faqKey)}
          aria-expanded={isExpanded}>
          <span class="faq-icon">
            {#if isExpanded}
              <ChevronDown size={20} aria-hidden="true" />
            {:else}
              <ChevronRight size={20} aria-hidden="true" />
            {/if}
          </span>
          <span class="faq-question-text">{$t(`faq.${faqKey}`)}</span>
        </button>
        {#if isExpanded}
          <div class="faq-answer fade-in">
            <p>{$t(`faq.a${faqKey.substring(1)}`)}</p>
          </div>
        {/if}
      </div>
    {/each}
  </div>
</section>

<section class="card" style="margin-top: 16px;">
  <h2 style="margin: 0 0 12px 0;">{$t('help.title')}</h2>
  <p class="muted">
    Need more help? Contact your system administrator or refer to the user documentation.
  </p>
  <div style="margin-top: 12px;">
    <a href={`${base}/`} class="tag">← {$t('nav.dashboard')}</a>
  </div>
</section>

<style>
  .faq-list {
    display: grid;
    gap: 12px;
  }
  
  .faq-item {
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
    background: var(--bg-0);
  }
  
  .faq-question {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px;
    background: transparent;
    border: none;
    text-align: left;
    cursor: pointer;
    transition: background-color 0.2s ease;
    color: var(--text);
  }
  
  .faq-question:hover {
    background: color-mix(in oklab, var(--bg-1) 50%, var(--bg-2));
  }
  
  .faq-icon {
    flex-shrink: 0;
    color: var(--accent-1);
  }
  
  .faq-question-text {
    font-weight: 600;
    font-size: 1.05rem;
  }
  
  .faq-answer {
    padding: 0 16px 16px 48px;
    color: var(--text);
  }
  
  .faq-answer p {
    margin: 0;
    line-height: 1.6;
  }
</style>
