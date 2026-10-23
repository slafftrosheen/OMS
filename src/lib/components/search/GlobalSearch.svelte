<!-- src/lib/components/search/GlobalSearch.svelte -->
<script lang="ts">

    import { onMount, onDestroy, untrack } from 'svelte';
    import { currentUser } from '$lib/auth/authState.svelte';
    import { goto } from '$app/navigation';
    import { base } from '$app/paths';
    import { modalDialog } from '$lib/ui/modal-dialog';
    import Badge from '$lib/components/ui/Badge.svelte';
    import Icon from '$lib/ui/Icon.svelte';
    import type { IconName } from '$lib/ui/icons';

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
        relevance: number;
    }> = $state([]);
    let loading = $state(false);
    let searchTimeout: ReturnType<typeof setTimeout> | undefined;
    let selectedIndex = $state(-1);
    let request: AbortController | undefined;
    let generation = 0;
    let searchError = $state('');
    const dialogId = $props.id();
    let observedOwner: string | null | undefined;
    $effect(() => {
        const owner = $currentUser?.id ?? null;
        if (observedOwner !== undefined && owner !== observedOwner) untrack(close);
        observedOwner = owner;
    });

    function cancelSearch() {
        generation++;
        clearTimeout(searchTimeout);
        request?.abort();
        request = undefined;
        loading = false;
    }

    async function search(query: string, token: number) {
        const controller = new AbortController();
        request = controller;
        const owner = $currentUser?.id ?? null;
        try {
            const response = await fetch(`${base}/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal });
            const data = await response.json();
            if (!open || token !== generation || owner !== ($currentUser?.id ?? null)) return;
            if (!response.ok || !Array.isArray(data.results)) throw new Error('Search unavailable');
            results = data.results.flatMap((result: any) => {
                const url = result.href ?? result.url;
                if (typeof result.id !== 'string' || typeof result.title !== 'string' ||
                    typeof url !== 'string' || !url.startsWith('/') || url.startsWith('//')) return [];
                return [{ ...result, url, description: result.subtitle ?? result.description }];
            });
            selectedIndex = -1;
        } catch (error) {
            if (controller.signal.aborted || !open || token !== generation) return;
            searchError = 'Search is unavailable. Please try again.';
        } finally {
            if (token === generation) loading = false;
        }
    }

    function handleInput(event: Event) {
        searchQuery = (event.currentTarget as HTMLInputElement).value;
        cancelSearch();
        results = [];
        selectedIndex = -1;
        searchError = '';
        const query = searchQuery.trim();
        if (query.length < 2) return;
        loading = true;
        const token = generation;
        searchTimeout = setTimeout(() => { void search(query, token); }, 300);
    }

    $effect(() => { if (!open) { cancelSearch(); searchQuery = ''; results = []; selectedIndex = -1; searchError = ''; } });
    onDestroy(cancelSearch);

    function handleKeydown(event: KeyboardEvent) {
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            selectedIndex = Math.min(selectedIndex + 1, results.length - 1);
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            selectedIndex = Math.max(selectedIndex - 1, -1);
        } else if (event.key === 'Enter' && selectedIndex >= 0) {
            event.preventDefault();
            if (results[selectedIndex]) navigateToResult(results[selectedIndex]);
        }
    }

    function navigateToResult(result: any) {
        void goto(`${base}${result.url}`);
        close();
    }

    function getTypeIcon(type: string): IconName {
        const map: Record<string, IconName> = {
            order:    'clipboard-list',
            file:     'folder-open',
            message:  'message-square',
            material: 'package'
        };
        return map[type] ?? 'file';
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
        cancelSearch();
        open = false;
        searchQuery = '';
        results = [];
        selectedIndex = -1;
        onclose?.();
    }

    onMount(() => {
        const handleGlobalKeydown = (event: KeyboardEvent) => {
            // Ctrl/Cmd + K to open search
            if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
                event.preventDefault();
                open = true;
            }
        };

        window.addEventListener('keydown', handleGlobalKeydown);

        return () => {
            window.removeEventListener('keydown', handleGlobalKeydown);
        };
    });
</script>

{#if open}
    <dialog class="search-overlay" aria-label="Search orders"
        use:modalDialog={{ onClose: close, initialFocus: `#${dialogId}-query` }}>
        <div class="search-modal">
            <div class="search-input-wrapper">
                <span class="search-icon" aria-hidden="true"><Icon name="search" size="md" /></span>
                <input
                    id={`${dialogId}-query`}
                    aria-label="Search orders"
                    type="text"
                    bind:value={searchQuery}
                    oninput={handleInput}
                    onkeydown={handleKeydown}
                    placeholder="Search orders..."
                    class="search-input"
                />
                {#if loading}
                    <div class="search-spinner" role="status" aria-label="Searching"></div>
                {/if}
                <button type="button" class="search-kbd" onclick={close} aria-label="Close search">ESC</button>
            </div>

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
                                <span class="result-icon" aria-hidden="true">
                                    <Icon name={getTypeIcon(result.type)} size="md" />
                                </span>
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
                                </div>
                            </button>
                        {/each}
                    </div>
                </div>
            {:else if searchError}
                <p class="empty-message" role="alert">{searchError}</p>
            {:else if searchQuery.trim().length >= 2 && !loading}
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
    </dialog>
{/if}

<style>
    .search-overlay:not([open]) { display:none; }
    .search-overlay::backdrop { background:transparent; }
    .search-overlay {
        margin:0;width:100%;height:100%;max-width:none;max-height:none;border:0;color:inherit;
        position: fixed;
        inset: 0;
        z-index: var(--z-tooltip);
        background: color-mix(in oklab, var(--bg-0) 55%, transparent);
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
        background: var(--bg-1);
        border-radius: 0.75rem;
        box-shadow: 0 20px 25px -5px color-mix(in oklab, var(--bg-0) 10%, transparent),
                    0 10px 10px -5px oklch(0% 0 0 / 4%);
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
        border-bottom: 1px solid var(--color-border, var(--border));
    }

    .search-icon {
        font-size: 1.25rem;
        color: var(--color-gray-400, var(--muted));
    }

    .search-input {
        flex: 1;
        border: none;
        outline: none;
        font-size: 1rem;
        color: var(--color-text, var(--ink-primary));
        background: transparent;
    }

    .search-input::placeholder {
        color: var(--color-gray-400, var(--muted));
    }

    .search-spinner {
        width: 1.25rem;
        height: 1.25rem;
        border: 2px solid var(--color-gray-200, var(--border));
        border-top-color: var(--color-primary, var(--brand));
        border-radius: 50%;
        animation: spin 0.6s linear infinite;
    }

    @keyframes spin {
        to { transform: rotate(360deg); }
    }

    .search-kbd,
    .search-shortcuts kbd {
        padding: 0.125rem 0.375rem;
        background: var(--color-gray-100, var(--bg-2));
        border: 1px solid var(--color-border, var(--border));
        border-radius: 0.25rem;
        font-size: 0.75rem;
        font-family: monospace;
        color: var(--color-gray-600, var(--ink-tertiary));
    }

    .results-section {
        max-height: 400px;
        overflow-y: auto;
    }

    .section-label {
        font-size: 0.75rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--color-gray-500, var(--muted));
        padding: 0.75rem 1.25rem 0.5rem;
        margin: 0;
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
        background-color: var(--color-gray-100, var(--bg-2));
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
        color: var(--color-text, var(--ink-primary));
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .result-description {
        font-size: 0.875rem;
        color: var(--color-gray-600, var(--ink-tertiary));
        margin: 0.25rem 0 0 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }



    .empty-results {
        padding: 3rem 2rem;
        text-align: center;
    }

    .empty-message {
        font-size: 1rem;
        color: var(--color-gray-700, var(--ink-secondary));
        margin: 0 0 0.5rem 0;
    }

    .empty-hint {
        font-size: 0.875rem;
        color: var(--color-gray-500, var(--muted));
        margin: 0;
    }

    .search-footer {
        padding: 0.75rem 1.25rem;
        border-top: 1px solid var(--color-border, var(--border));
        background: var(--color-gray-50, var(--bg-2));
    }

    .search-shortcuts {
        display: flex;
        align-items: center;
        gap: 1rem;
        font-size: 0.75rem;
        color: var(--color-gray-600, var(--ink-tertiary));
    }

    /* Custom scrollbar */
    .results-section::-webkit-scrollbar {
        width: 0.5rem;
    }

    .results-section::-webkit-scrollbar-track {
        background: var(--color-gray-100, var(--bg-2));
    }

    .results-section::-webkit-scrollbar-thumb {
        background: var(--color-gray-400, var(--muted));
        border-radius: 0.25rem;
    }
</style>