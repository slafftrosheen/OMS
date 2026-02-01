<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import type { FAQItem } from '$lib/faq/types';
  import Badge from '$lib/ui/Badge.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { ArrowLeft, Eye, Calendar, Tag } from 'lucide-svelte';

  let item: FAQItem | null = null;
  let loading = true;
  let error = false;
  let lang: 'en' | 'ru' | 'lv' = 'en';

  $: slug = $page.params.slug;

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

  async function loadFAQItem() {
    loading = true;
    error = false;
    try {
      const urlLang = $page.url.searchParams.get('lang');
      if (urlLang && ['en', 'ru', 'lv'].includes(urlLang)) {
        lang = urlLang as 'en' | 'ru' | 'lv';
      }

      const response = await fetch(`/api/faq/${slug}?lang=${lang}`);
      if (response.ok) {
        item = await response.json();
      } else if (response.status === 404) {
        error = true;
      }
    } catch (err) {
      console.error('Failed to load FAQ item:', err);
      error = true;
    } finally {
      loading = false;
    }
  }

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  onMount(() => {
    loadFAQItem();
  });
</script>

<svelte:head>
  {#if item}
    <title>{getQuestion(item, lang)} | FAQ - Reclame OMS</title>
    <meta name="description" content={getAnswer(item, lang).substring(0, 160)} />
  {:else}
    <title>FAQ | Reclame OMS</title>
  {/if}
</svelte:head>

<div class="faq-detail-page">
  {#if loading}
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Loading FAQ...</p>
    </div>
  {:else if error || !item}
    <div class="error-state">
      <h1>FAQ Not Found</h1>
      <p>The FAQ item you're looking for doesn't exist or has been removed.</p>
      <Button on:click={() => goto('/faq')}>
        <ArrowLeft size={18} />
        Back to FAQs
      </Button>
    </div>
  {:else}
    <div class="faq-detail-container">
      <div class="faq-breadcrumb">
        <Button variant="ghost" on:click={() => goto('/faq')}>
          <ArrowLeft size={18} />
          Back to FAQs
        </Button>
      </div>

      <article class="faq-detail">
        <header class="faq-detail-header">
          {#if item.isFeatured}
            <Badge tone="primary" label="Featured">★ Featured</Badge>
          {/if}
          <h1 class="faq-question">{getQuestion(item, lang)}</h1>
          
          <div class="faq-meta">
            <div class="meta-item">
              <Eye size={16} />
              <span>{item.viewCount} views</span>
            </div>
            <div class="meta-item">
              <Calendar size={16} />
              <span>{formatDate(item.createdAt)}</span>
            </div>
          </div>

          {#if item.tags && item.tags.length > 0}
            <div class="faq-tags-section">
              <Tag size={16} />
              <div class="faq-tags">
                {#each item.tags as tag}
                  <Badge tone="neutral">{tag.name}</Badge>
                {/each}
              </div>
            </div>
          {/if}
        </header>

        <div class="faq-answer">
          {@html getAnswer(item, lang)}
        </div>

        {#if item.attachments && item.attachments.length > 0}
          <div class="faq-attachments">
            <h3>Attachments</h3>
            <div class="attachments-list">
              {#each item.attachments as attachment}
                <a href={attachment.filePath} class="attachment-item" download>
                  <span class="attachment-name">{attachment.fileName}</span>
                  {#if attachment.fileSize}
                    <span class="attachment-size">
                      {(attachment.fileSize / 1024).toFixed(1)} KB
                    </span>
                  {/if}
                </a>
              {/each}
            </div>
          </div>
        {/if}
      </article>

      {#if item.relatedFaqs && item.relatedFaqs.length > 0}
        <aside class="related-faqs">
          <h3>Related FAQs</h3>
          <div class="related-list">
            {#each item.relatedFaqs as related}
              <a href="/faq/{related.slug}" class="related-item">
                <span class="related-question">
                  {lang === 'ru' && related.questionRu ? related.questionRu :
                   lang === 'lv' && related.questionLv ? related.questionLv :
                   related.questionEn}
                </span>
                {#if related.isFeatured}
                  <Badge tone="primary">★</Badge>
                {/if}
              </a>
            {/each}
          </div>
        </aside>
      {/if}
    </div>
  {/if}
</div>

<style>
  .faq-detail-page {
    min-height: 100vh;
    background: var(--bg-0);
    padding: var(--space-xl) var(--space-lg);
  }

  .loading-state,
  .error-state {
    max-width: 800px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-2xl);
    gap: var(--space-lg);
    text-align: center;
  }

  .loading-state {
    color: var(--muted);
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid var(--border);
    border-top-color: var(--accent-1);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .error-state h1 {
    margin: 0;
    font-size: 2rem;
    color: var(--text);
  }

  .error-state p {
    margin: 0;
    color: var(--muted);
  }

  .faq-detail-container {
    max-width: 900px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-2xl);
  }

  .faq-breadcrumb {
    display: flex;
  }

  .faq-detail {
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: var(--space-2xl);
  }

  .faq-detail-header {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    padding-bottom: var(--space-xl);
    border-bottom: 2px solid var(--border);
    margin-bottom: var(--space-xl);
  }

  .faq-question {
    margin: 0;
    font-size: 2rem;
    font-weight: 700;
    color: var(--text);
    line-height: 1.3;
  }

  .faq-meta {
    display: flex;
    gap: var(--space-lg);
    flex-wrap: wrap;
  }

  .meta-item {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    color: var(--muted);
    font-size: 0.9rem;
  }

  .faq-tags-section {
    display: flex;
    align-items: flex-start;
    gap: var(--space-md);
    color: var(--muted);
  }

  .faq-tags {
    display: flex;
    gap: var(--space-xs);
    flex-wrap: wrap;
  }

  .faq-answer {
    color: var(--text);
    line-height: 1.8;
    font-size: 1.05rem;
  }

  .faq-answer :global(h3) {
    font-size: 1.3rem;
    font-weight: 600;
    margin: var(--space-xl) 0 var(--space-md);
    color: var(--text);
  }

  .faq-answer :global(p) {
    margin: var(--space-md) 0;
  }

  .faq-answer :global(ul),
  .faq-answer :global(ol) {
    margin: var(--space-md) 0;
    padding-left: var(--space-2xl);
  }

  .faq-answer :global(li) {
    margin: var(--space-sm) 0;
  }

  .faq-answer :global(table) {
    width: 100%;
    border-collapse: collapse;
    margin: var(--space-xl) 0;
    font-size: 0.95rem;
  }

  .faq-answer :global(th),
  .faq-answer :global(td) {
    padding: var(--space-md) var(--space-md);
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
    padding: 3px 8px;
    border-radius: var(--radius-sm);
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    font-size: 0.9em;
  }

  .faq-attachments {
    margin-top: var(--space-2xl);
    padding-top: var(--space-xl);
    border-top: 1px solid var(--border);
  }

  .faq-attachments h3 {
    margin: 0 0 var(--space-md);
    font-size: 1.1rem;
    font-weight: 600;
  }

  .attachments-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .attachment-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-md);
    background: var(--bg-0);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    text-decoration: none;
    color: var(--text);
    transition: all 0.2s ease;
  }

  .attachment-item:hover {
    border-color: var(--accent-1);
    background: var(--bg-2);
  }

  .attachment-size {
    color: var(--muted);
    font-size: 0.85rem;
  }

  .related-faqs {
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: var(--space-xl);
  }

  .related-faqs h3 {
    margin: 0 0 var(--space-lg);
    font-size: 1.2rem;
    font-weight: 600;
  }

  .related-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .related-item {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-md);
    padding: var(--space-md);
    background: var(--bg-0);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    text-decoration: none;
    color: var(--text);
    transition: all 0.2s ease;
  }

  .related-item:hover {
    border-color: var(--accent-1);
    background: var(--bg-2);
  }

  .related-question {
    flex: 1;
    font-weight: 500;
    line-height: 1.4;
  }

  @media (max-width: 768px) {
    .faq-detail-page {
      padding: var(--space-lg) var(--space-md);
    }

    .faq-detail {
      padding: var(--space-lg);
    }

    .faq-question {
      font-size: 1.5rem;
    }

    .faq-answer {
      font-size: 1rem;
    }
  }
</style>
