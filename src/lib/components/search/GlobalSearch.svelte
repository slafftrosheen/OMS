<!-- src/lib/components/search/GlobalSearch.svelte -->
<script lang="ts">

    import { onMount } from 'svelte';
    import Input from '$lib/components/ui/Input.svelte';
    import Badge from '$lib/components/ui/Badge.svelte';

    let { 
        open = $bindable(false),
        onclose
    }: {
        open?: boolean;
        onclose?: () => void;
    } = $props();

    let searchQuery = $state('');
    let results: Array<{
        id: string;
        type: 'order' | 'file' | 'message' | 'material';
        title: string;
        description?: string;
        url: string;
        highlight?: string;
        relevance: number;
    }> = $state([]);
    let suggestions: string[] = $state([]);
    let loading = $state(false);
    let searchTimeout: number;
    let selectedIndex = $state(-1);
    let searchInput: HTMLInputElement;

    async function search() {
        if (searchQuery.length < 2) {
            results = [];
            return;
        }

        loading = true;

        try {
            const response = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`);
            const data = await response.json();

            if (data.success) {
                results = data.results;
            }
        } catch (error) {
            console.error('Search failed:', error);
        } finally {
            loading = false;
        }
    }

    async function fetchSuggestions() {
        if (searchQuery.length < 2) {
            suggestions = [];
            return;
        }

        try {
            const response = await fetch(`/api/search/suggestions?q=${encodeURIComponent(searchQuery)}`);
            const data = await response.json();

            if (data.success) {
                suggestions = data.suggestions;
            }
        } catch (error) {
            console.error('Failed to fetch suggestions:', error);
        }
    }

    function handleInput() {
        clearTimeout(searchTimeout);
        
        searchTimeout = setTimeout(() => {
            search();
            fetchSuggestions();
        }, 300) as unknown as number;
    }

    function handleKeydown(event: KeyboardEvent) {
        if (event.key === 'Escape') {
            close();
        } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            selectedIndex = Math.min(selectedIndex + 1, results.length - 1);
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            selectedIndex = Math.max(selectedIndex - 1, -1);
        } else if (event.key === 'Enter' && selectedIndex >= 0) {
            navigateToResult(results[selectedIndex]);
        }
    }

    function navigateToResult(result: any) {
        window.location.href = result.url;
        close();
    }

    function selectSuggestion(suggestion: string) {
        searchQuery = suggestion;
        search();
    }

    function getTypeIcon(type: string): string {
        const icons: Record<string, string> = {
            order: '📋',
            file: '📁',
            message: '💬',
            material: '📦'
        };
        return icons[type] || '📄';
    }

    function getTypeBadge(type: string): 'primary' | 'success' | 'warning' | 'info' {
        const badges: Record<string, any> = {
            order: 'primary',
            file: 'warning',
            message: 'info',
            material: 'success'
        };
        return badges[type] || 'primary';
    }

    function close() {
        open = false;
        searchQuery = '';
        results = [];
        suggestions = [];
        selectedIndex = -1;
        onclose?.();
    }

    onMount(() => {
        const handleGlobalKeydown = (event: KeyboardEvent) => {
            // Ctrl/Cmd + K to open search
            if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
                event.preventDefault();
                open = true;
                setTimeout(() => searchInput?.focus(), 50);
            }
        };

        window.addEventListener('keydown', handleGlobalKeydown);

        return () => {
            window.removeEventListener('keydown', handleGlobalKeydown);
        };
    });
</script>

{#if open}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="search-overlay" onclick={close} role="button" tabindex="-1">
        <div class="search-modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
            <div class="search-input-wrapper">
                <span class="search-icon">🔍</span>
                <input
                    bind:this={searchInput}
                    type="text"
                    bind:value={searchQuery}
                    oninput={handleInput}
                    onkeydown={handleKeydown}
                    placeholder="Search orders, files, messages..."
                    class="search-input"
                />
                {#if loading}
                    <div class="search-spinner"></div>
                {/if}
                <kbd class="search-kbd">ESC</kbd>
            </div>

            {#if suggestions.length > 0 && searchQuery.length > 0}
                <div class="suggestions-section">
                    <p class="section-label">Suggestions</p>
                    <div class="suggestions-list">
                        {#each suggestions as suggestion}
                            <button
                                class="suggestion-item"
                                onclick={() => selectSuggestion(suggestion)}
                            >
                                {suggestion}
                            </button>
                        {/each}
                    </div>
                </div>
            {/if}

            {#if results.length > 0}
                <div class="results-section">
                    <p class="section-label">{results.length} result{results.length !== 1 ? 's' : ''}</p>
                    <div class="results-list">
                        {#each results as result, index (result.id)}
                            <button
                                class="result-item"
                                class:selected={index === selectedIndex}
                                onclick={() => navigateToResult(result)}
                                onmouseenter={() => selectedIndex = index}
                            >
                                <span class="result-icon">{getTypeIcon(result.type)}</span>
                                <div class="result-content">
                                    <div class="result-header">
                                        <h4 class="result-title">{result.title}</h4>
                                        <Badge variant={getTypeBadge(result.type)} size="sm">
                                            {result.type}
                                        </Badge>
                                    </div>
                                    {#if result.description}
                                        <p class="result-description">{result.description}</p>
                                    {/if}
                                    {#if result.highlight}
                                        <div class="result-highlight">
                                            {@html result.highlight}
                                        </div>
                                    {/if}
                                </div>
                            </button>
                        {/each}
                    </div>
                </div>
            {:else if searchQuery.length >= 2 && !loading}
                <div class="empty-results">
                    <p class="empty-message">No results found for "{searchQuery}"</p>
                    <p class="empty-hint">Try different keywords or check your spelling</p>
                </div>
            {/if}

            <div class="search-footer">
                <div class="search-shortcuts">
                    <kbd>↑↓</kbd> Navigate
                    <kbd>↵</kbd> Select
                    <kbd>ESC</kbd> Close
                </div>
            </div>
        </div>
    </div>
{/if}

<style>
    .search-overlay {
        position: fixed;
        inset: 0;
        z-index: 9999;
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(4px);
        display: flex;
        align-items: flex-start;
        justify-content: center;
        padding: 4rem 1rem;
        animation: fadeIn 0.2s ease;
    }

    @keyframes fadeIn {
        from {
            opacity: 0;
        }
        to {
            opacity: 1;
        }
    }

    .search-modal {
        width: 100%;
        max-width: 600px;
        background: white;
        border-radius: 0.75rem;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1),
                    0 10px 10px -5px rgba(0, 0, 0, 0.04);
        overflow: hidden;
        animation: slideDown 0.2s ease;
    }

    @keyframes slideDown {
        from {
            transform: translateY(-2rem);
            opacity: 0;
        }
        to {
            transform: translateY(0);
            opacity: 1;
        }
    }

    .search-input-wrapper {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 1rem 1.25rem;
        border-bottom: 1px solid var(--color-border, #e5e7eb);
    }

    .search-icon {
        font-size: 1.25rem;
        color: var(--color-gray-400, #9ca3af);
    }

    .search-input {
        flex: 1;
        border: none;
        outline: none;
        font-size: 1rem;
        color: var(--color-text, #111827);
        background: transparent;
    }

    .search-input::placeholder {
        color: var(--color-gray-400, #9ca3af);
    }

    .search-spinner {
        width: 1.25rem;
        height: 1.25rem;
        border: 2px solid var(--color-gray-200, #e5e7eb);
        border-top-color: var(--color-primary, #0066cc);
        border-radius: 50%;
        animation: spin 0.6s linear infinite;
    }

    @keyframes spin {
        to { transform: rotate(360deg); }
    }

    .search-kbd,
    .search-shortcuts kbd {
        padding: 0.125rem 0.375rem;
        background: var(--color-gray-100, #f3f4f6);
        border: 1px solid var(--color-border, #d1d5db);
        border-radius: 0.25rem;
        font-size: 0.75rem;
        font-family: monospace;
        color: var(--color-gray-600, #6b7280);
    }

    .suggestions-section,
    .results-section {
        max-height: 400px;
        overflow-y: auto;
    }

    .section-label {
        font-size: 0.75rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--color-gray-500, #9ca3af);
        padding: 0.75rem 1.25rem 0.5rem;
        margin: 0;
    }

    .suggestions-list {
        padding: 0 0.5rem 0.5rem;
    }

    .suggestion-item {
        width: 100%;
        text-align: left;
        padding: 0.5rem 0.75rem;
        background: none;
        border: none;
        border-radius: 0.375rem;
        cursor: pointer;
        font-size: 0.875rem;
        color: var(--color-gray-700, #374151);
        transition: background-color 0.15s ease;
    }

    .suggestion-item:hover {
        background-color: var(--color-gray-100, #f3f4f6);
    }

    .results-list {
        padding: 0 0.5rem 0.5rem;
    }

    .result-item {
        width: 100%;
        display: flex;
        gap: 0.75rem;
        padding: 0.75rem;
        background: none;
        border: none;
        border-radius: 0.375rem;
        cursor: pointer;
        text-align: left;
        transition: background-color 0.15s ease;
    }

    .result-item:hover,
    .result-item.selected {
        background-color: var(--color-gray-100, #f3f4f6);
    }

    .result-icon {
        font-size: 1.5rem;
        flex-shrink: 0;
    }

    .result-content {
        flex: 1;
        min-width: 0;
    }

    .result-header {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 0.25rem;
    }

    .result-title {
        font-size: 0.875rem;
        font-weight: 600;
        margin: 0;
        color: var(--color-text, #111827);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .result-description {
        font-size: 0.875rem;
        color: var(--color-gray-600, #6b7280);
        margin: 0.25rem 0 0 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .result-highlight {
        font-size: 0.75rem;
        color: var(--color-gray-500, #9ca3af);
        margin-top: 0.25rem;
    }

    .result-highlight :global(mark) {
        background-color: #fef3c7;
        color: #92400e;
        padding: 0.125rem 0.25rem;
        border-radius: 0.125rem;
    }

    .empty-results {
        padding: 3rem 2rem;
        text-align: center;
    }

    .empty-message {
        font-size: 1rem;
        color: var(--color-gray-700, #374151);
        margin: 0 0 0.5rem 0;
    }

    .empty-hint {
        font-size: 0.875rem;
        color: var(--color-gray-500, #9ca3af);
        margin: 0;
    }

    .search-footer {
        padding: 0.75rem 1.25rem;
        border-top: 1px solid var(--color-border, #e5e7eb);
        background: var(--color-gray-50, #f9fafb);
    }

    .search-shortcuts {
        display: flex;
        align-items: center;
        gap: 1rem;
        font-size: 0.75rem;
        color: var(--color-gray-600, #6b7280);
    }

    /* Custom scrollbar */
    .suggestions-section::-webkit-scrollbar,
    .results-section::-webkit-scrollbar {
        width: 0.5rem;
    }

    .suggestions-section::-webkit-scrollbar-track,
    .results-section::-webkit-scrollbar-track {
        background: var(--color-gray-100, #f3f4f6);
    }

    .suggestions-section::-webkit-scrollbar-thumb,
    .results-section::-webkit-scrollbar-thumb {
        background: var(--color-gray-400, #9ca3af);
        border-radius: 0.25rem;
    }
</style>