<script lang="ts">
    import { createBubbler, stopPropagation } from "svelte/legacy";

    const bubble = createBubbler();
    import { onMount } from "svelte";
    import {
        Search,
        FileText,
        Package,
        Inbox,
        User,
        X,
        Loader2,
    } from "lucide-svelte";
    import { debounce } from "$lib/utils";

    let { visible = $bindable(false) }: { visible?: boolean } = $props();

    let query = $state("");
    let results = $state<any[]>([]);
    let loading = $state(false);
    let selectedIndex = $state(0);
    let searchInput: HTMLInputElement;

    const entityIcons = {
        order: FileText,
        material: Package,
        inventory: Inbox,
        user: User,
    };

    const entityColors = {
        order: "#3b82f6",
        material: "#10b981",
        inventory: "#f59e0b",
        user: "#8b5cf6",
    };

    const performSearch = debounce(async (searchQuery: string) => {
        if (!searchQuery.trim()) {
            results = [];
            return;
        }

        loading = true;
        try {
            const response = await fetch(
                `/api/search/global?q=${encodeURIComponent(searchQuery)}&limit=20`,
            );
            const data = await response.json();
            results = data.results || [];
        } catch (err) {
            console.error("Search error:", err);
            results = [];
        } finally {
            loading = false;
            selectedIndex = 0;
        }
    }, 300);

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Escape") {
            visible = false;
            query = "";
            results = [];
        } else if (e.key === "ArrowDown") {
            e.preventDefault();
            selectedIndex = Math.min(selectedIndex + 1, results.length - 1);
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            selectedIndex = Math.max(selectedIndex - 1, 0);
        } else if (e.key === "Enter" && results[selectedIndex]) {
            e.preventDefault();
            navigateTo(results[selectedIndex]);
        }
    }

    function navigateTo(result: any) {
        window.location.href = result.url;
        visible = false;
    }

    $effect(() => {
        if (query) {
            performSearch(query);
        }
    });

    $effect(() => {
        if (visible && searchInput) {
            setTimeout(() => searchInput.focus(), 50);
        }
    });

    onMount(() => {
        const handleGlobalKeydown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "k") {
                e.preventDefault();
                visible = !visible;
            }
        };

        window.addEventListener("keydown", handleGlobalKeydown);
        return () => window.removeEventListener("keydown", handleGlobalKeydown);
    });
</script>

{#if visible}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        class="search-overlay"
        onclick={() => {
            visible = false;
        }}
    >
        <div class="search-modal" onclick={stopPropagation(bubble("click"))}>
            <div class="search-header">
                <Search size={20} />
                <input
                    bind:this={searchInput}
                    bind:value={query}
                    onkeydown={handleKeydown}
                    placeholder="Search orders, materials, inventory, users..."
                    class="search-input"
                />
                {#if loading}
                    <div class="spinner">
                        <Loader2 size={20} />
                    </div>
                {/if}
                <button
                    class="close-btn"
                    onclick={() => {
                        visible = false;
                    }}
                >
                    <X size={20} />
                </button>
            </div>

            <div class="search-results">
                {#if query && !loading && results.length === 0}
                    <div class="empty-state">
                        <Search size={48} />
                        <p>No results found for "{query}"</p>
                    </div>
                {:else if results.length > 0}
                    {#each results as result, index}
                        {@const SvelteComponent =
                            entityIcons[result.entity_type] || FileText}
                        <button
                            class="result-item"
                            class:selected={index === selectedIndex}
                            onclick={() => navigateTo(result)}
                        >
                            <div
                                class="result-icon"
                                style="background-color: {entityColors[
                                    result.entity_type
                                ]}20; color: {entityColors[result.entity_type]}"
                            >
                                <SvelteComponent size={20} />
                            </div>

                            <div class="result-content">
                                <div class="result-title">{result.title}</div>
                                <div class="result-subtitle">
                                    {result.subtitle}
                                </div>
                                {#if result.description}
                                    <div class="result-description">
                                        {result.description}
                                    </div>
                                {/if}
                            </div>

                            <div
                                class="result-badge"
                                style="background-color: {entityColors[
                                    result.entity_type
                                ]}"
                            >
                                {result.entity_type}
                            </div>
                        </button>
                    {/each}
                {:else}
                    <div class="search-tips">
                        <p><strong>Search tips:</strong></p>
                        <ul>
                            <li>
                                Try order codes, customer names, or material
                                names
                            </li>
                            <li>
                                Use <kbd>↑</kbd> <kbd>↓</kbd> to navigate results
                            </li>
                            <li>
                                Press <kbd>Enter</kbd> to open selected item
                            </li>
                            <li>Press <kbd>Esc</kbd> to close</li>
                        </ul>
                    </div>
                {/if}
            </div>

            <div class="search-footer">
                <div class="footer-shortcuts">
                    <kbd>↑↓</kbd> Navigate
                    <kbd>Enter</kbd> Select
                    <kbd>Esc</kbd> Close
                </div>
            </div>
        </div>
    </div>
{/if}

<style>
    .search-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(4px);
        display: flex;
        align-items: flex-start;
        justify-content: center;
        padding-top: 15vh;
        z-index: 9999;
        animation: fadeIn 0.15s ease;
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
        width: 90%;
        max-width: 700px;
        background: white;
        border-radius: 12px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        overflow: hidden;
        animation: slideUp 0.2s ease;
    }

    @keyframes slideUp {
        from {
            opacity: 0;
            transform: translateY(20px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    .search-header {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 16px 20px;
        border-bottom: 1px solid #e5e7eb;
    }

    .search-input {
        flex: 1;
        border: none;
        outline: none;
        font-size: 1rem;
        color: #111827;
    }

    .search-input::placeholder {
        color: #9ca3af;
    }

    .close-btn {
        background: none;
        border: none;
        padding: 4px;
        cursor: pointer;
        color: #6b7280;
        border-radius: 4px;
        transition: all 0.2s;
    }

    .close-btn:hover {
        background: #f3f4f6;
        color: #111827;
    }

    .spinner {
        animation: spin 1s linear infinite;
        color: #3b82f6;
    }

    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }

    .search-results {
        max-height: 500px;
        overflow-y: auto;
    }

    .result-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 20px;
        border: none;
        background: white;
        width: 100%;
        text-align: left;
        cursor: pointer;
        transition: background 0.15s;
        border-bottom: 1px solid #f3f4f6;
    }

    .result-item:hover,
    .result-item.selected {
        background: #f9fafb;
    }

    .result-icon {
        width: 40px;
        height: 40px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
    }

    .result-content {
        flex: 1;
        min-width: 0;
    }

    .result-title {
        font-weight: 600;
        color: #111827;
        margin-bottom: 2px;
    }

    .result-subtitle {
        font-size: 0.875rem;
        color: #6b7280;
    }

    .result-description {
        font-size: 0.813rem;
        color: #9ca3af;
        margin-top: 4px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .result-badge {
        padding: 4px 10px;
        border-radius: 12px;
        font-size: 0.75rem;
        font-weight: 600;
        color: white;
        text-transform: capitalize;
    }

    .empty-state,
    .search-tips {
        padding: 60px 40px;
        text-align: center;
        color: #6b7280;
    }

    .empty-state p {
        margin-top: 15px;
        font-size: 1rem;
    }

    .search-tips {
        padding: 40px;
        text-align: left;
    }

    .search-tips strong {
        color: #111827;
    }

    .search-tips ul {
        margin: 15px 0 0 0;
        padding-left: 20px;
    }

    .search-tips li {
        margin: 8px 0;
        color: #6b7280;
    }

    .search-footer {
        padding: 12px 20px;
        border-top: 1px solid #e5e7eb;
        background: #f9fafb;
    }

    .footer-shortcuts {
        display: flex;
        gap: 15px;
        font-size: 0.813rem;
        color: #6b7280;
    }

    kbd {
        padding: 2px 6px;
        background: white;
        border: 1px solid #e5e7eb;
        border-radius: 4px;
        font-family: monospace;
        font-size: 0.75rem;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
    }
</style>
