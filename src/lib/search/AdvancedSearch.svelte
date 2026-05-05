<script lang="ts">
  import Clock from 'lucide-svelte/icons/clock';
  import Filter from 'lucide-svelte/icons/filter';
  import Save from 'lucide-svelte/icons/save';
  import Search from 'lucide-svelte/icons/search';
  import Star from 'lucide-svelte/icons/star';
  import Tag from 'lucide-svelte/icons/tag';
  import X from 'lucide-svelte/icons/x';

/**
 * Advanced Search Component
 * Complex query builder with saved filters
 */

import { onMount } from 'svelte';
import { notifications } from '$lib/notify/store';
import { slide } from 'svelte/transition';
import Icon from '$lib/ui/Icon.svelte';

let {
  initialQuery = '',
  initialFilters = {},
  onsearch
}: {
  initialQuery?: string;
  initialFilters?: Record<string, any>;
  onsearch?: (data: { results: any; pagination: any; query: string; filters: any }) => void;
} = $props();

let query = $state(initialQuery);
let filters = $state({
  status: '',
  client: '',
  dateFrom: '',
  dateTo: '',
  assignee: '',
  tags: [] as string[],
  ...initialFilters
});

let showFilters = $state(false);
let showSaveDialog = $state(false);
let savedFilters: any[] = $state([]);
let recentSearches: any[] = $state([]);
let suggestions: any[] = $state([]);
let searching = $state(false);

let filterName = $state('');
let filterDescription = $state('');
let saveAsPublic = $state(false);
let saveAsFavorite = $state(false);

onMount(() => {
  loadSavedFilters();
  loadRecentSearches();
});

async function loadSavedFilters() {
  try {
    const response = await fetch('/api/filters?favorites=true');
    const result = await response.json();
    savedFilters = result.data;
  } catch (err) {
    console.error('Failed to load filters:', err);
  }
}

async function loadRecentSearches() {
  try {
    const response = await fetch('/api/search/suggestions?type=recent');
    const result = await response.json();
    recentSearches = result.data;
  } catch (err) {
    console.error('Failed to load recent searches:', err);
  }
}

async function loadSuggestions(type: string, value: string) {
  if (!value || value.length < 2) {
    suggestions = [];
    return;
  }

  try {
    const response = await fetch(
      `/api/search/suggestions?type=${type}&query=${encodeURIComponent(value)}`
    );
    const result = await response.json();
    suggestions = result.data;
  } catch (err) {
    console.error('Failed to load suggestions:', err);
    suggestions = [];
  }
}

async function handleSearch() {
  if (!query && !hasActiveFilters()) {
    return;
  }

  searching = true;

  try {
    const response = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        filters: cleanFilters(filters)
      })
    });

    if (!response.ok) throw new Error('Search failed');

    const result = await response.json();
    
    onsearch?.({
      results: result.data,
      pagination: result.pagination,
      query,
      filters: result.filters
    });

  } catch (err) {
    console.error('Search error:', err);
    notifications.error('Search failed. Please try again.');
  } finally {
    searching = false;
  }
}

function cleanFilters(filters: any) {
  const cleaned: any = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value && value !== '' && (!Array.isArray(value) || value.length > 0)) {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

function hasActiveFilters() {
  return Object.values(filters).some(v => 
    v && v !== '' && (!Array.isArray(v) || v.length > 0)
  );
}

function clearFilters() {
  filters = {
    status: '',
    client: '',
    dateFrom: '',
    dateTo: '',
    assignee: '',
    tags: []
  };
  query = '';
}

function applyFilter(filter: any) {
  filters = { ...filter.filters };
  query = '';
  handleSearch();
  
  // Update usage
  fetch(`/api/filters/${filter.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      use_count: filter.use_count + 1,
      last_used_at: new Date().toISOString()
    })
  });
}

async function saveFilter() {
  if (!filterName) {
    notifications.warning('Please enter a filter name');
    return;
  }

  try {
    const response = await fetch('/api/filters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: filterName,
        description: filterDescription,
        filters: cleanFilters(filters),
        isPublic: saveAsPublic,
        isFavorite: saveAsFavorite
      })
    });

    if (!response.ok) throw new Error('Failed to save filter');

    const result = await response.json();
    savedFilters = [result.data, ...savedFilters];
    
    // Reset dialog
    showSaveDialog = false;
    filterName = '';
    filterDescription = '';
    saveAsPublic = false;
    saveAsFavorite = false;

  } catch (err) {
    console.error('Save filter error:', err);
    notifications.error('Failed to save filter');
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    handleSearch();
  }
}

  function handleInput(e: Event) {
    const target = e.target as HTMLInputElement;
    loadSuggestions('recent', target.value);
  }

  function handleClientInput(e: Event) {
    const target = e.target as HTMLInputElement;
    loadSuggestions('client', target.value);
  }
</script>

<div class="advanced-search">
  <div class="search-header">
    <div class="search-input-group">
      <Search size={20} class="search-icon" />
      <input
        type="text"
        bind:value={query}
        onkeydown={handleKeydown}
        oninput={handleInput}
        placeholder="Search orders, PO numbers, clients..."
        class="search-input"
        aria-label="Search query"
      />
      
      {#if query || hasActiveFilters()}
        <button 
          class="clear-btn"
          onclick={clearFilters}
          aria-label="Clear search"
        >
          <X size={16} />
        </button>
      {/if}

      <button 
        class="filter-toggle-btn"
        class:active={showFilters}
        onclick={() => showFilters = !showFilters}
        aria-label="Toggle filters"
        aria-expanded={showFilters}
      >
        <Filter size={16} />
        {#if hasActiveFilters()}
          <span class="filter-badge">{Object.keys(cleanFilters(filters)).length}</span>
        {/if}
      </button>

      <button 
        class="search-btn"
        onclick={handleSearch}
        disabled={searching || (!query && !hasActiveFilters())}
        aria-label="Search"
      >
        {#if searching}
          <Clock size={16} class="spinner" />
        {:else}
          Search
        {/if}
      </button>
    </div>

    {#if savedFilters.length > 0}
      <div class="saved-filters-quick">
        {#each savedFilters.slice(0, 3) as filter}
          <button
            class="saved-filter-chip"
            onclick={() => applyFilter(filter)}
            title={filter.description || filter.name}
          >
            {#if filter.is_favorite}
              <Star size={12} />
            {/if}
            {filter.name}
          </button>
        {/each}
      </div>
    {/if}
  </div>

  {#if showFilters}
    <div class="filters-panel" transition:slide>
      <div class="filters-grid">
        <div class="filter-field">
          <label for="filter-status">Status</label>
          <select id="filter-status" bind:value={filters.status}>
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="in-progress">In Progress</option>
            <option value="ready">Ready</option>
            <option value="loaded">Loaded</option>
            <option value="completed">Completed</option>
            <option value="on-hold">On Hold</option>
          </select>
        </div>

        <div class="filter-field">
          <label for="filter-client">Client</label>
          <input
            id="filter-client"
            type="text"
            bind:value={filters.client}
            oninput={handleClientInput}
            placeholder="Client name..."
          />
        </div>

        <div class="filter-field">
          <label for="filter-date-from">Date From</label>
          <input
            id="filter-date-from"
            type="date"
            bind:value={filters.dateFrom}
          />
        </div>

        <div class="filter-field">
          <label for="filter-date-to">Date To</label>
          <input
            id="filter-date-to"
            type="date"
            bind:value={filters.dateTo}
          />
        </div>
      </div>

      <div class="filters-actions">
        <button class="btn-secondary" onclick={clearFilters}>
          Clear All
        </button>
        <button class="btn-secondary" onclick={() => showSaveDialog = true}>
          <Save size={14} />
          Save Filter
        </button>
        <button class="btn-primary" onclick={handleSearch}>
          Apply Filters
        </button>
      </div>
    </div>
  {/if}

  {#if suggestions.length > 0 && query.length >= 2}
    <div class="suggestions-dropdown">
      {#each suggestions as suggestion}
        <button
          class="suggestion-item"
          onclick={() => {
            if (suggestion.type === 'client') {
              filters.client = suggestion.value;
            } else {
              query = suggestion.value;
            }
            suggestions = [];
            handleSearch();
          }}
        >
          <Tag size={14} />
          <span>{suggestion.label}</span>
          {#if suggestion.frequency}
            <span class="frequency">{suggestion.frequency}</span>
          {/if}
        </button>
      {/each}
    </div>
  {/if}
</div>

{#if showSaveDialog}
  <div class="modal-overlay" onclick={() => showSaveDialog = false}>
    <div class="modal-content" onclick={(e) => e.stopPropagation()}>
      <div class="modal-header">
        <h3>Save Search Filter</h3>
        <button 
          class="close-btn"
          onclick={() => showSaveDialog = false}
          aria-label="Close"
        >
          <X size={20} />
        </button>
      </div>

      <div class="modal-body">
        <div class="form-field">
          <label for="filter-name">Filter Name *</label>
          <input
            id="filter-name"
            type="text"
            bind:value={filterName}
            placeholder="e.g., Orders This Week"
            required
          />
        </div>

        <div class="form-field">
          <label for="filter-description">Description</label>
          <textarea
            id="filter-description"
            bind:value={filterDescription}
            placeholder="Optional description..."
            rows="2"
          ></textarea>
        </div>

        <div class="form-field-checkbox">
          <input
            id="save-as-favorite"
            type="checkbox"
            bind:checked={saveAsFavorite}
          />
          <label for="save-as-favorite">
            <Star size={14} />
            Add to favorites
          </label>
        </div>

        <div class="form-field-checkbox">
          <input
            id="save-as-public"
            type="checkbox"
            bind:checked={saveAsPublic}
          />
          <label for="save-as-public">
            Share with team (public)
          </label>
        </div>
      </div>

      <div class="modal-actions">
        <button class="btn-secondary" onclick={() => showSaveDialog = false}>
          Cancel
        </button>
        <button class="btn-primary" onclick={saveFilter}>
          <Save size={14} />
          Save Filter
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .advanced-search {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .search-header {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .search-input-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: var(--bg-0);
    border: 2px solid var(--border);
    border-radius: 8px;
    transition: border-color 0.2s;
  }

  .search-input-group:focus-within {
    border-color: var(--accent-1);
  }

  .search-icon {
    color: var(--muted);
    flex-shrink: 0;
  }

  .search-input {
    flex: 1;
    background: transparent;
    border: none;
    font-size: 1rem;
    color: var(--text);
    outline: none;
  }

  .search-input::placeholder {
    color: var(--muted);
  }

  .clear-btn,
  .filter-toggle-btn {
    padding: 0.375rem;
    background: transparent;
    border: none;
    color: var(--muted);
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.2s;
    position: relative;
    flex-shrink: 0;
  }

  .clear-btn:hover,
  .filter-toggle-btn:hover {
    background: var(--bg-2);
    color: var(--text);
  }

  .filter-toggle-btn.active {
    color: var(--accent-1);
    background: var(--bg-1);
  }

  .filter-badge {
    position: absolute;
    top: -4px;
    right: -4px;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    background: var(--accent-1);
    color: var(--bg-0);
    font-size: 10px;
    font-weight: 600;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .search-btn {
    padding: 0.5rem 1.25rem;
    background: var(--accent-1);
    color: var(--bg-0);
    border: none;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: opacity 0.2s;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .search-btn:hover:not(:disabled) {
    opacity: 0.9;
  }

  .search-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .saved-filters-quick {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .saved-filter-chip {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.375rem 0.75rem;
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: 16px;
    font-size: 0.75rem;
    color: var(--text);
    cursor: pointer;
    transition: all 0.2s;
  }

  .saved-filter-chip:hover {
    background: var(--bg-2);
    border-color: var(--accent-1);
  }

  .filters-panel {
    padding: 1.5rem;
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: 8px;
  }

  .filters-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .filter-field {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .filter-field label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text);
  }

  .filter-field input,
  .filter-field select {
    padding: 0.5rem;
    background: var(--bg-0);
    border: 1px solid var(--border);
    border-radius: 4px;
    font-size: 0.875rem;
    color: var(--text);
  }

  .filter-field input:focus,
  .filter-field select:focus {
    outline: 2px solid var(--focus);
    outline-offset: 1px;
  }

  .filters-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border);
  }

  .suggestions-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    margin-top: 0.5rem;
    max-height: 300px;
    overflow-y: auto;
    background: var(--bg-0);
    border: 1px solid var(--border);
    border-radius: 6px;
    box-shadow: 0 4px 12px color-mix(in oklab, var(--bg-0) 10%, transparent);
    z-index: var(--z-overlay);
  }

  .suggestion-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    padding: 0.75rem 1rem;
    background: transparent;
    border: none;
    border-bottom: 1px solid var(--border);
    text-align: left;
    cursor: pointer;
    transition: background 0.2s;
  }

  .suggestion-item:last-child {
    border-bottom: none;
  }

  .suggestion-item:hover {
    background: var(--bg-1);
  }

  .suggestion-item .frequency {
    margin-left: auto;
    font-size: 0.75rem;
    color: var(--muted);
  }

  .modal-overlay {
    position: fixed;
    inset: 0;
    background: color-mix(in oklab, var(--bg-0) 55%, transparent);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--z-modal);
    padding: 1rem;
  }

  .modal-content {
    background: var(--bg-0);
    border-radius: 8px;
    width: 100%;
    max-width: 500px;
    max-height: 90vh;
    overflow: auto;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.5rem;
    border-bottom: 1px solid var(--border);
  }

  .modal-header h3 {
    margin: 0;
    font-size: 1.25rem;
  }

  .close-btn {
    padding: 0.5rem;
    background: transparent;
    border: none;
    color: var(--muted);
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.2s;
  }

  .close-btn:hover {
    background: var(--bg-2);
    color: var(--text);
  }

  .modal-body {
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .form-field {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .form-field label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text);
  }

  .form-field input,
  .form-field textarea {
    padding: 0.5rem;
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: 4px;
    font-size: 0.875rem;
    color: var(--text);
    font-family: inherit;
  }

  .form-field input:focus,
  .form-field textarea:focus {
    outline: 2px solid var(--focus);
    outline-offset: 1px;
  }

  .form-field-checkbox {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .form-field-checkbox input[type="checkbox"] {
    width: 18px;
    height: 18px;
    cursor: pointer;
  }

  .form-field-checkbox label {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.875rem;
    color: var(--text);
    cursor: pointer;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    padding: 1.5rem;
    border-top: 1px solid var(--border);
  }

  button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 4px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-secondary {
    background: var(--bg-2);
    color: var(--text);
    border: 1px solid var(--border);
  }

  .btn-secondary:hover {
    background: var(--bg-1);
  }

  .btn-primary {
    background: var(--accent-1);
    color: var(--bg-0);
  }

  .btn-primary:hover {
    opacity: 0.9;
  }

  :global(.spinner) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  @media (max-width: 768px) {
    .filters-grid {
      grid-template-columns: 1fr;
    }
  }
</style>