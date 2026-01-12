<script lang="ts">
  export let params = {};
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import type { FAQListResponse } from '$lib/faq/types';
  import FAQSearch from '$lib/faq/components/FAQSearch.svelte';
  import FAQCategories from '$lib/faq/components/FAQCategories.svelte';
  import FAQTags from '$lib/faq/components/FAQTags.svelte';
  import FAQList from '$lib/faq/components/FAQList.svelte';
  import { BookOpen } from 'lucide-svelte';

  let data: FAQListResponse = {
    items: [],
    total: 0,
    categories: [],
    tags: []
  };

  let loading = true;
  let selectedCategoryId: number | null = null;
  let selectedTag: string | null = null;
  let searchQuery = '';
  let lang: 'en' | 'ru' | 'lv' = 'en';

  async function loadFAQs() {
    loading = true;
    try {
      const params = new URLSearchParams();
      if (selectedCategoryId) params.append('categoryId', selectedCategoryId.toString());
      if (selectedTag) params.append('tag', selectedTag);
      if (searchQuery) params.append('search', searchQuery);
      params.append('lang', lang);

      const response = await fetch(`/api/faq?${params}`);
      if (response.ok) {
        data = await response.json();
      }
    } catch (error) {
      console.error('Failed to load FAQs:', error);
    } finally {
      loading = false;
    }
  }

  function handleCategorySelect(event: CustomEvent<number | null>) {
    selectedCategoryId = event.detail;
    selectedTag = null;
    loadFAQs();
  }

  function handleTagSelect(event: CustomEvent<string | null>) {
    selectedTag = event.detail;
    loadFAQs();
  }

  function handleSearch(event: CustomEvent<string>) {
    searchQuery = event.detail;
    loadFAQs();
  }

  onMount(() => {
    // Get lang from URL or localStorage
    const urlLang = $page.url.searchParams.get('lang');
    if (urlLang && ['en', 'ru', 'lv'].includes(urlLang)) {
      lang = urlLang as 'en' | 'ru' | 'lv';
    }
    loadFAQs();
  });
</script>

<svelte:head>
  <title>FAQ - Knowledge Base | Reclame OMS</title>
  <meta name="description" content="Comprehensive FAQ and knowledge base for Reclame OMS" />
</svelte:head>

<div class="faq-page">
  <header class="faq-header">
    <div class="header-content">
      <div class="header-title">
        <BookOpen size={32} />
        <h1>Knowledge Base</h1>
      </div>
      <p class="header-subtitle">
        Find answers to common questions about profiles, materials, manufacturing, and more
      </p>
    </div>
    
    <div class="header-search">
      <FAQSearch 
        bind:value={searchQuery}
        on:search={handleSearch}
        placeholder="Search for answers..."
      />
    </div>
  </header>

  <div class="faq-content">
    <aside class="faq-sidebar">
      <FAQCategories 
        categories={data.categories}
        selectedId={selectedCategoryId}
        {lang}
        on:select={handleCategorySelect}
      />
      
      {#if data.tags.length > 0}
        <div class="sidebar-section">
          <FAQTags 
            tags={data.tags}
            selectedTag={selectedTag}
            on:select={handleTagSelect}
          />
        </div>
      {/if}
    </aside>

    <main class="faq-main">
      {#if loading}
        <div class="loading-state">
          <div class="spinner"></div>
          <p>Loading FAQs...</p>
        </div>
      {:else}
        <div class="faq-results-header">
          <h2>
            {#if selectedCategoryId}
              {data.categories.find(c => c.id === selectedCategoryId)?.nameEn || 'Category'}
            {:else if selectedTag}
              Tag: {data.tags.find(t => t.slug === selectedTag)?.name || selectedTag}
            {:else if searchQuery}
              Search Results
            {:else}
              All FAQs
            {/if}
          </h2>
          <span class="results-count">{data.total} {data.total === 1 ? 'result' : 'results'}</span>
        </div>

        <FAQList items={data.items} {lang} />
      {/if}
    </main>
  </div>
</div>

<style>
  .faq-page {
    min-height: 100vh;
    background: var(--bg-0);
    padding: var(--space-xl) var(--space-lg);
  }

  .faq-header {
    max-width: 1400px;
    margin: 0 auto var(--space-2xl);
    display: flex;
    flex-direction: column;
    gap: var(--space-xl);
  }

  .header-content {
    text-align: center;
  }

  .header-title {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-md);
    margin-bottom: var(--space-md);
  }

  .header-title :global(svg) {
    color: var(--accent-1);
  }

  .header-title h1 {
    margin: 0;
    font-size: 2.5rem;
    font-weight: 700;
    color: var(--text);
  }

  .header-subtitle {
    margin: 0;
    font-size: 1.1rem;
    color: var(--muted);
    max-width: 600px;
    margin: 0 auto;
  }

  .header-search {
    display: flex;
    justify-content: center;
  }

  .faq-content {
    max-width: 1400px;
    margin: 0 auto;
    display: grid;
    grid-template-columns: 280px 1fr;
    gap: var(--space-2xl);
    align-items: start;
  }

  .faq-sidebar {
    position: sticky;
    top: var(--space-xl);
    display: flex;
    flex-direction: column;
    gap: var(--space-2xl);
  }

  .sidebar-section {
    padding-top: var(--space-lg);
    border-top: 1px solid var(--border);
  }

  .faq-main {
    min-height: 400px;
  }

  .faq-results-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-lg);
    padding-bottom: var(--space-md);
    border-bottom: 2px solid var(--border);
  }

  .faq-results-header h2 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--text);
  }

  .results-count {
    font-size: 0.9rem;
    color: var(--muted);
  }

  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-2xl);
    gap: var(--space-lg);
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

  @media (max-width: 1024px) {
    .faq-content {
      grid-template-columns: 1fr;
    }

    .faq-sidebar {
      position: static;
      grid-row: 2;
    }
  }

  @media (max-width: 768px) {
    .faq-page {
      padding: var(--space-lg) var(--space-md);
    }

    .header-title h1 {
      font-size: 2rem;
    }

    .header-subtitle {
      font-size: 1rem;
    }
  }
</style>
