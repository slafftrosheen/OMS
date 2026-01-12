<script lang="ts">
  import { Search } from 'lucide-svelte';
  import Input from '$lib/ui/Input.svelte';
  import { createEventDispatcher } from 'svelte';

  export let value = '';
  export let placeholder = 'Search FAQs...';

  const dispatch = createEventDispatcher<{ search: string }>();

  let debounceTimer: ReturnType<typeof setTimeout>;

  const handleInput = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      dispatch('search', value);
    }, 300);
  };
</script>

<div class="faq-search">
  <Search class="search-icon" size={18} />
  <input 
    type="search"
    bind:value
    on:input={handleInput}
    {placeholder}
    class="search-input"
    aria-label="Search FAQs"
  />
</div>

<style>
  .faq-search {
    position: relative;
    width: 100%;
    max-width: 600px;
  }

  .search-icon {
    position: absolute;
    left: var(--space-md);
    top: 50%;
    transform: translateY(-50%);
    color: var(--muted);
    pointer-events: none;
  }

  .search-input {
    width: 100%;
    padding: calc(var(--space-xs) + var(--space-xxs)) var(--space-md);
    padding-left: calc(var(--space-md) * 2.5);
    min-height: calc(var(--control-size) * 0.9);
    border-radius: var(--radius-md);
    border: 1px solid var(--border);
    background: var(--bg-0);
    color: var(--text);
    font: inherit;
    line-height: 1.4;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
  }

  .search-input:focus-visible {
    outline: none;
    border-color: var(--focus);
    box-shadow: 0 0 0 2px color-mix(in oklab, var(--focus) 28%, transparent);
  }

  .search-input::placeholder {
    color: var(--muted);
  }
</style>
