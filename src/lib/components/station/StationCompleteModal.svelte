<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { t } from 'svelte-i18n';
  import Icon from '$lib/ui/Icon.svelte';
  import Button from '$lib/ui/Button.svelte';

  type CatalogItem = {
    id: string;
    sku: string;
    name: string;
    unit: string;
    stock: number;
    min: number;
    thicknessMM?: number | null;
    location?: string | null;
  };

  type ConsumeRow = {
    item_id: string;
    sku: string;
    name: string;
    unit: string;
    quantity: number;
  };

  let {
    open = $bindable(false),
    orderRef = '',
    station = '',
    onSubmitted = (_payload: { consumed: number; skipped: boolean; lowStock: any[] }) => {},
    onComplete = async (
      _items: Array<{ item_id: string; quantity: number }>,
      _opts: { skipped: boolean; skipReason: string | null },
    ) => Promise.resolve({ ok: false }) as Promise<{ ok: boolean; consumed?: number; lowStock?: any[]; error?: string }>,
  }: {
    open: boolean;
    orderRef: string;
    station: string;
    onSubmitted?: (p: { consumed: number; skipped: boolean; lowStock: any[] }) => void;
    onComplete: (
      items: Array<{ item_id: string; quantity: number }>,
      opts: { skipped: boolean; skipReason: string | null },
    ) => Promise<{ ok: boolean; consumed?: number; lowStock?: any[]; error?: string }>;
  } = $props();

  let search = $state('');
  let results = $state<CatalogItem[]>([]);
  let searching = $state(false);
  let rows = $state<ConsumeRow[]>([]);
  let submitting = $state(false);
  let errorMsg = $state('');
  let skipMode = $state(false);
  let skipReason = $state('');
  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  let searchInput: HTMLInputElement | undefined = $state();

  $effect(() => {
    if (open) {
      reset();
      tick().then(() => searchInput?.focus());
    }
  });

  function reset() {
    search = '';
    results = [];
    rows = [];
    errorMsg = '';
    skipMode = false;
    skipReason = '';
  }

  function close() {
    if (submitting) return;
    open = false;
  }

  async function runSearch() {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      const q = search.trim();
      if (!q) {
        results = [];
        return;
      }
      searching = true;
      try {
        const res = await fetch(`/api/inventory/items?search=${encodeURIComponent(q)}&limit=20`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const payload = await res.json();
        const list = (payload.data ?? payload) as CatalogItem[];
        results = list.slice(0, 20);
      } catch (err) {
        console.error('Inventory search failed:', err);
        results = [];
      } finally {
        searching = false;
      }
    }, 200);
  }

  function addRow(item: CatalogItem) {
    if (rows.some((r) => r.item_id === item.id)) {
      // already in list — focus its qty input
      return;
    }
    rows = [
      ...rows,
      {
        item_id: item.id,
        sku: item.sku,
        name: item.name,
        unit: item.unit,
        quantity: 1,
      },
    ];
    search = '';
    results = [];
  }

  function removeRow(itemId: string) {
    rows = rows.filter((r) => r.item_id !== itemId);
  }

  async function submit() {
    errorMsg = '';
    if (!skipMode) {
      if (rows.length === 0) {
        errorMsg = $t('station.complete.no_items', {
          default: 'Add at least one material, or choose Skip.',
        });
        return;
      }
      const bad = rows.find((r) => !Number.isFinite(r.quantity) || r.quantity <= 0);
      if (bad) {
        errorMsg = $t('station.complete.bad_qty', {
          default: 'All quantities must be positive numbers.',
        });
        return;
      }
    }

    submitting = true;
    try {
      const result = await onComplete(
        skipMode
          ? []
          : rows.map((r) => ({ item_id: r.item_id, quantity: Math.floor(r.quantity) })),
        { skipped: skipMode, skipReason: skipMode ? skipReason.trim() || null : null },
      );

      if (!result.ok) {
        errorMsg = result.error ?? 'Failed to complete';
        return;
      }
      onSubmitted({
        consumed: result.consumed ?? 0,
        skipped: skipMode,
        lowStock: result.lowStock ?? [],
      });
      open = false;
    } catch (err: any) {
      errorMsg = err?.message ?? 'Failed to complete';
    } finally {
      submitting = false;
    }
  }
</script>

{#if open}
  <div
    class="modal-backdrop"
    role="dialog"
    aria-modal="true"
    aria-labelledby="station-complete-title"
    onclick={close}
    onkeydown={(e) => e.key === 'Escape' && close()}
    tabindex="-1"
  >
    <div class="modal" onclick={(e) => e.stopPropagation()} role="document">
      <header class="modal-header">
        <div>
          <h2 id="station-complete-title">
            {$t('station.complete.title', { default: 'Complete stage' })}
          </h2>
          <p class="muted">{station} · {orderRef}</p>
        </div>
        <button class="icon-btn" onclick={close} aria-label="Close">
          <Icon name="x" size="sm" />
        </button>
      </header>

      <div class="modal-body">
        <div class="mode-toggle" role="tablist">
          <button
            class="mode-btn"
            class:active={!skipMode}
            onclick={() => (skipMode = false)}
            role="tab"
            aria-selected={!skipMode}
          >
            <Icon name="package" size="sm" />
            {$t('station.complete.declare', { default: 'Declare materials' })}
          </button>
          <button
            class="mode-btn"
            class:active={skipMode}
            onclick={() => (skipMode = true)}
            role="tab"
            aria-selected={skipMode}
          >
            <Icon name="skip-forward" size="sm" />
            {$t('station.complete.skip', { default: 'Skip (notify HoP)' })}
          </button>
        </div>

        {#if !skipMode}
          <label for="material-search">
            {$t('station.complete.search_label', { default: 'Search materials' })}
          </label>
          <input
            id="material-search"
            bind:this={searchInput}
            type="text"
            bind:value={search}
            oninput={runSearch}
            placeholder={$t('station.complete.search_placeholder', {
              default: 'SKU, name, location…',
            })}
            autocomplete="off"
          />

          {#if searching}
            <p class="hint">{$t('actions.loading', { default: 'Searching…' })}</p>
          {:else if results.length > 0}
            <ul class="results">
              {#each results as item (item.id)}
                <li>
                  <button class="result-row" onclick={() => addRow(item)}>
                    <span class="sku">{item.sku}</span>
                    <span class="name">{item.name}</span>
                    <span class="stock" class:low={item.stock <= item.min}>
                      {item.stock} {item.unit}
                    </span>
                  </button>
                </li>
              {/each}
            </ul>
          {:else if search.trim()}
            <p class="hint">{$t('station.complete.no_results', { default: 'No matches.' })}</p>
          {/if}

          {#if rows.length > 0}
            <div class="rows">
              <h3>{$t('station.complete.consumed', { default: 'Consumed' })}</h3>
              {#each rows as row (row.item_id)}
                <div class="row">
                  <div class="row-info">
                    <span class="row-sku">{row.sku}</span>
                    <span class="row-name">{row.name}</span>
                  </div>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    bind:value={row.quantity}
                    aria-label="Quantity for {row.sku}"
                  />
                  <span class="row-unit">{row.unit}</span>
                  <button class="icon-btn" onclick={() => removeRow(row.item_id)} aria-label="Remove">
                    <Icon name="trash-2" size="sm" />
                  </button>
                </div>
              {/each}
            </div>
          {/if}
        {:else}
          <label for="skip-reason">
            {$t('station.complete.skip_reason', {
              default: 'Reason for skipping (optional)',
            })}
          </label>
          <textarea
            id="skip-reason"
            bind:value={skipReason}
            rows="3"
            placeholder={$t('station.complete.skip_placeholder', {
              default: 'e.g. used material from another order, will be reconciled by HoP',
            })}
          ></textarea>
          <p class="hint warn">
            {$t('station.complete.skip_warn', {
              default: 'Head of Production will be notified that no materials were declared.',
            })}
          </p>
        {/if}

        {#if errorMsg}
          <div class="banner error">
            <Icon name="alert-circle" size="sm" />
            <span>{errorMsg}</span>
          </div>
        {/if}
      </div>

      <footer class="modal-footer">
        <Button variant="secondary" onclick={close} disabled={submitting}>
          {$t('actions.cancel', { default: 'Cancel' })}
        </Button>
        <Button variant="primary" onclick={submit} disabled={submitting}>
          {#if submitting}
            <Icon name="loader" size="sm" />
            {$t('actions.completing', { default: 'Completing…' })}
          {:else}
            <Icon name="check" size="sm" />
            {$t('station.complete.submit', { default: 'Mark complete' })}
          {/if}
        </Button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1000;
    background: color-mix(in oklab, black 50%, transparent);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .modal {
    background: var(--surface-elevated, var(--glass-bg));
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-lg, 24px);
    width: 100%;
    max-width: 560px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.32);
  }
  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 16px 20px;
    border-bottom: 1px solid var(--glass-border);
  }
  .modal-header h2 { margin: 0; font-size: 18px; font-weight: 600; }
  .muted {
    margin: 4px 0 0;
    font-size: 12px;
    color: var(--ink-tertiary);
    font-family: var(--font-mono, ui-monospace, monospace);
  }
  .modal-body {
    padding: 16px 20px;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 16px 20px;
    border-top: 1px solid var(--glass-border);
  }
  .mode-toggle {
    display: flex;
    gap: 8px;
    margin-bottom: 8px;
  }
  .mode-btn {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 10px 12px;
    background: color-mix(in oklab, var(--ink-primary) 4%, transparent);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-sm, 8px);
    color: var(--ink-secondary);
    cursor: pointer;
    font-size: 13px;
  }
  .mode-btn.active {
    background: color-mix(in oklab, var(--brand) 14%, transparent);
    color: var(--brand);
    border-color: color-mix(in oklab, var(--brand) 30%, transparent);
  }
  label { font-size: 13px; color: var(--ink-secondary); margin-top: 4px; }
  input[type='text'],
  input[type='number'],
  textarea {
    font-size: 14px;
    padding: 8px 10px;
    border-radius: var(--radius-sm, 8px);
    border: 1px solid var(--glass-border);
    background: var(--surface-soft, color-mix(in oklab, var(--ink-primary) 4%, transparent));
    color: var(--ink-primary);
    width: 100%;
    box-sizing: border-box;
  }
  input:focus-visible, textarea:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  .results {
    list-style: none;
    margin: 4px 0 0;
    padding: 0;
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-sm, 8px);
    max-height: 200px;
    overflow: auto;
  }
  .results li + li { border-top: 1px solid var(--glass-border); }
  .result-row {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 8px;
    width: 100%;
    text-align: left;
    padding: 8px 12px;
    background: transparent;
    border: none;
    color: var(--ink-primary);
    cursor: pointer;
    align-items: baseline;
  }
  .result-row:hover {
    background: color-mix(in oklab, var(--ink-primary) 6%, transparent);
  }
  .sku, .row-sku {
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 12px;
    color: var(--ink-tertiary);
  }
  .stock { font-size: 13px; font-variant-numeric: tabular-nums; }
  .stock.low { color: var(--brand); }
  .rows {
    margin-top: 8px;
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-sm, 8px);
    padding: 8px;
    background: color-mix(in oklab, var(--ink-primary) 3%, transparent);
  }
  .rows h3 {
    margin: 0 0 8px;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--ink-tertiary);
  }
  .row {
    display: grid;
    grid-template-columns: 1fr 80px auto auto;
    gap: 8px;
    align-items: center;
    padding: 4px 0;
  }
  .row + .row { border-top: 1px dashed var(--glass-border); padding-top: 8px; margin-top: 4px; }
  .row-info { display: flex; flex-direction: column; min-width: 0; }
  .row-name { font-size: 14px; }
  .row-unit { font-size: 12px; color: var(--ink-tertiary); }
  .icon-btn {
    background: transparent;
    border: none;
    padding: 6px;
    border-radius: var(--radius-sm, 8px);
    color: var(--ink-secondary);
    cursor: pointer;
  }
  .icon-btn:hover { background: color-mix(in oklab, var(--ink-primary) 8%, transparent); }
  .hint { margin: 4px 0 0; font-size: 12px; color: var(--ink-tertiary); }
  .hint.warn { color: var(--brand); }
  .banner.error {
    margin-top: 8px;
    background: color-mix(in oklab, var(--brand) 12%, transparent);
    border: 1px solid color-mix(in oklab, var(--brand) 30%, transparent);
    color: var(--brand);
    padding: 8px 12px;
    border-radius: var(--radius-sm, 8px);
    font-size: 13px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
</style>
