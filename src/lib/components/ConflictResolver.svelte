<script lang="ts">
    import { onMount } from "svelte";
    import {
        AlertTriangle,
        Check,
        X,
        GitMerge,
        ArrowRight,
    } from "lucide-svelte";
    import { supabase } from "$lib/supabase-client";
    import { toasts } from "$lib/stores/toast";

    let { visible = $bindable(false) }: { visible?: boolean } = $props();

    interface Conflict {
        id: string;
        entity_type: string;
        entity_id: string;
        client_version: Record<string, unknown>;
        server_version: Record<string, unknown>;
        created_at: string;
    }

    let conflicts: Conflict[] = [];
    let selectedConflict: Conflict | null = null;
    let resolutionStrategy: "client_wins" | "server_wins" | "merge" =
        "server_wins";
    let mergedData: Record<string, unknown> | null = null;
    let loading = false;

    async function loadConflicts() {
        try {
            const { data, error } = await supabase
                .from("sync_conflicts")
                .select("*")
                .eq("resolved", false)
                .order("created_at", { ascending: false });

            if (error) throw error;
            conflicts = data || [];
        } catch (err) {
            console.error("Failed to load conflicts:", err);
        }
    }

    async function resolveConflict() {
        if (!selectedConflict) return;

        loading = true;
        try {
            const { error } = await supabase.rpc("resolve_sync_conflict", {
                p_conflict_id: selectedConflict.id,
                p_resolution_strategy: resolutionStrategy,
                p_merged_data:
                    resolutionStrategy === "merge" ? mergedData : null,
            });

            if (error) throw error;

            toasts.push({
                message: "Conflict resolved successfully",
                kind: "success",
            });
            selectedConflict = null;
            await loadConflicts();
        } catch (err: unknown) {
            const errorMessage =
                err instanceof Error ? err.message : "Unknown error";
            toasts.push({
                message: "Failed to resolve conflict: " + errorMessage,
                kind: "error",
            });
        } finally {
            loading = false;
        }
    }

    function selectConflict(conflict: Conflict) {
        selectedConflict = conflict;
        resolutionStrategy = "server_wins";

        // Initialize merged data with server version
        mergedData = { ...conflict.server_version };
    }

    function updateMergedField(key: string, source: "client" | "server") {
        if (!selectedConflict || !mergedData) return;

        mergedData = {
            ...mergedData,
            [key]:
                source === "client"
                    ? selectedConflict.client_version[key]
                    : selectedConflict.server_version[key],
        };
    }

    function close() {
        visible = false;
    }

    function handleBackdropClick() {
        close();
    }

    function handleModalClick(event: MouseEvent) {
        event.stopPropagation();
    }

    function handleBackdropKeydown(event: KeyboardEvent) {
        if (event.key === "Escape") {
            close();
        }
    }

    function handleConflictClick(conflict: Conflict) {
        selectConflict(conflict);
    }

    function handleConflictKeydown(event: KeyboardEvent, conflict: Conflict) {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            selectConflict(conflict);
        }
    }

    onMount(() => {
        if (visible) loadConflicts();
    });

    $effect(() => {
        if (visible) loadConflicts();
    });
</script>

{#if visible}
    <div
        class="modal-backdrop"
        onclick={handleBackdropClick}
        onkeydown={handleBackdropKeydown}
        role="button"
        tabindex="0"
    >
        <div
            class="modal"
            onclick={handleModalClick}
            onkeydown={() => {}}
            role="dialog"
            aria-modal="true"
            aria-labelledby="conflict-resolver-title"
            tabindex="-1"
        >
            <div class="modal-header">
                <h2 id="conflict-resolver-title">
                    <AlertTriangle size={24} /> Sync Conflicts ({conflicts.length})
                </h2>
                <button class="close-btn" onclick={close} aria-label="Close"
                    >×</button
                >
            </div>

            <div class="modal-body">
                {#if conflicts.length === 0}
                    <div class="no-conflicts">
                        <Check size={48} />
                        <p>No sync conflicts</p>
                    </div>
                {:else if !selectedConflict}
                    <div class="conflicts-list">
                        {#each conflicts as conflict (conflict.id)}
                            <div
                                class="conflict-item"
                                onclick={() => handleConflictClick(conflict)}
                                onkeydown={(e) =>
                                    handleConflictKeydown(e, conflict)}
                                role="button"
                                tabindex="0"
                            >
                                <div class="conflict-icon">
                                    <AlertTriangle size={20} />
                                </div>
                                <div class="conflict-info">
                                    <strong>{conflict.entity_type}</strong>
                                    <small
                                        >{new Date(
                                            conflict.created_at,
                                        ).toLocaleString()}</small
                                    >
                                </div>
                                <ArrowRight size={16} />
                            </div>
                        {/each}
                    </div>
                {:else}
                    <div class="conflict-resolver">
                        <div class="resolver-header">
                            <button
                                class="back-btn"
                                onclick={() => (selectedConflict = null)}
                            >
                                ← Back
                            </button>
                            <h3>
                                Resolve {selectedConflict.entity_type} Conflict
                            </h3>
                        </div>

                        <div class="resolution-options">
                            <label class="option">
                                <input
                                    type="radio"
                                    bind:group={resolutionStrategy}
                                    value="client_wins"
                                />
                                <span>Use My Version</span>
                            </label>
                            <label class="option">
                                <input
                                    type="radio"
                                    bind:group={resolutionStrategy}
                                    value="server_wins"
                                />
                                <span>Use Server Version</span>
                            </label>
                            <label class="option">
                                <input
                                    type="radio"
                                    bind:group={resolutionStrategy}
                                    value="merge"
                                />
                                <span>Merge Manually</span>
                            </label>
                        </div>

                        <div class="versions-comparison">
                            <div class="version-panel">
                                <h4>Your Version</h4>
                                <div class="version-content">
                                    {#each Object.entries(selectedConflict.client_version) as [key, value] (key)}
                                        <div class="field">
                                            <span class="field-key">{key}:</span
                                            >
                                            <span class="field-value"
                                                >{JSON.stringify(value)}</span
                                            >
                                            {#if resolutionStrategy === "merge"}
                                                <button
                                                    class="use-btn"
                                                    onclick={() =>
                                                        updateMergedField(
                                                            key,
                                                            "client",
                                                        )}
                                                >
                                                    Use
                                                </button>
                                            {/if}
                                        </div>
                                    {/each}
                                </div>
                            </div>

                            <div class="version-panel">
                                <h4>Server Version</h4>
                                <div class="version-content">
                                    {#each Object.entries(selectedConflict.server_version) as [key, value] (key)}
                                        <div class="field">
                                            <span class="field-key">{key}:</span
                                            >
                                            <span class="field-value"
                                                >{JSON.stringify(value)}</span
                                            >
                                            {#if resolutionStrategy === "merge"}
                                                <button
                                                    class="use-btn"
                                                    onclick={() =>
                                                        updateMergedField(
                                                            key,
                                                            "server",
                                                        )}
                                                >
                                                    Use
                                                </button>
                                            {/if}
                                        </div>
                                    {/each}
                                </div>
                            </div>

                            {#if resolutionStrategy === "merge" && mergedData}
                                <div class="version-panel merged">
                                    <h4>
                                        <GitMerge size={16} /> Merged Result
                                    </h4>
                                    <div class="version-content">
                                        {#each Object.entries(mergedData) as [key, value] (key)}
                                            <div class="field">
                                                <span class="field-key"
                                                    >{key}:</span
                                                >
                                                <span class="field-value"
                                                    >{JSON.stringify(
                                                        value,
                                                    )}</span
                                                >
                                            </div>
                                        {/each}
                                    </div>
                                </div>
                            {/if}
                        </div>

                        <div class="resolver-actions">
                            <button
                                class="resolve-btn"
                                onclick={resolveConflict}
                                disabled={loading}
                            >
                                {loading ? "Resolving..." : "Resolve Conflict"}
                            </button>
                        </div>
                    </div>
                {/if}
            </div>
        </div>
    </div>
{/if}

<style>
    .modal-backdrop {
        position: fixed;
        inset: 0;
        background: color-mix(in oklab, var(--bg-0) 55%, transparent);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: var(--z-modal);
    }

    .modal {
        background: white;
        border-radius: 12px;
        width: min(900px, 90vw);
        max-height: 90vh;
        overflow: hidden;
        display: flex;
        flex-direction: column;
    }

    .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 20px;
        border-bottom: 1px solid var(--border);
    }

    .modal-header h2 {
        display: flex;
        align-items: center;
        gap: 10px;
        margin: 0;
        color: var(--warn);
    }

    .close-btn {
        background: none;
        border: none;
        font-size: 2rem;
        cursor: pointer;
        color: var(--ink-tertiary);
    }

    .modal-body {
        padding: 20px;
        overflow-y: auto;
        flex: 1;
    }

    .no-conflicts {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 60px 20px;
        color: var(--ok);
    }

    .no-conflicts p {
        margin-top: 15px;
        font-size: 1.125rem;
    }

    .conflicts-list {
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .conflict-item {
        display: flex;
        align-items: center;
        gap: 15px;
        padding: 15px;
        background: var(--warn-soft);
        border: 1px solid color-mix(in oklab, var(--warn) 75%, var(--bg-0));
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s;
    }

    .conflict-item:hover {
        background: var(--warn-soft);
        transform: translateX(5px);
    }

    .conflict-icon {
        color: var(--warn);
    }

    .conflict-info {
        flex: 1;
        display: flex;
        flex-direction: column;
    }

    .conflict-info strong {
        text-transform: capitalize;
    }

    .conflict-info small {
        color: var(--ink-tertiary);
        font-size: 0.875rem;
    }

    .conflict-resolver {
        display: flex;
        flex-direction: column;
        gap: 20px;
    }

    .resolver-header {
        display: flex;
        align-items: center;
        gap: 15px;
    }

    .back-btn {
        padding: 8px 16px;
        background: var(--bg-2);
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 500;
    }

    .back-btn:hover {
        background: var(--border);
    }

    .resolver-header h3 {
        margin: 0;
        flex: 1;
    }

    .resolution-options {
        display: flex;
        gap: 15px;
        padding: 15px;
        background: var(--bg-2);
        border-radius: 8px;
    }

    .option {
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        font-weight: 500;
    }

    .option input[type="radio"] {
        width: 18px;
        height: 18px;
        cursor: pointer;
    }

    .versions-comparison {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 15px;
    }

    .version-panel {
        border: 2px solid var(--border);
        border-radius: 8px;
        padding: 15px;
        background: white;
    }

    .version-panel.merged {
        grid-column: 1 / -1;
        background: var(--ok-soft);
        border-color: var(--ok);
    }

    .version-panel h4 {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 0 0 15px 0;
        font-size: 0.938rem;
        font-weight: 600;
        color: var(--ink-secondary);
    }

    .version-content {
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .field {
        display: flex;
        gap: 8px;
        padding: 8px;
        background: var(--bg-2);
        border-radius: 4px;
        font-size: 0.875rem;
    }

    .field-key {
        font-weight: 600;
        color: var(--ink-tertiary);
        min-width: 100px;
    }

    .field-value {
        flex: 1;
        word-break: break-all;
    }

    .use-btn {
        padding: 4px 12px;
        background: var(--brand);
        color: var(--bg-0);
        border: none;
        border-radius: 4px;
        font-size: 0.75rem;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.2s;
    }

    .use-btn:hover {
        background: var(--brand);
    }

    .resolver-actions {
        display: flex;
        justify-content: flex-end;
        padding-top: 15px;
        border-top: 1px solid var(--border);
    }

    .resolve-btn {
        padding: 12px 24px;
        background: var(--ok);
        color: var(--bg-0);
        border: none;
        border-radius: 8px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.2s;
    }

    .resolve-btn:hover:not(:disabled) {
        background: color-mix(in oklab, var(--ok) 85%, black);
    }

    .resolve-btn:disabled {
        background: var(--muted);
        cursor: not-allowed;
    }
</style>
