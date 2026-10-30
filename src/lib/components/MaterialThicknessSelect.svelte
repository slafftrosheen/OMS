<script lang="ts">
  import { untrack } from 'svelte';
  import { t } from 'svelte-i18n';
  import { base } from '$app/paths';
  import {
    createCatalogThicknessOptions,
    fetchThicknessOptions,
    normalizeThicknessValue,
    thicknessOptionValue,
    type ThicknessOption
  } from '$lib/materials/thickness-options';

  let {
    value = $bindable(''),
    materialType = 'PVC',
    thicknessOptions,
    placeholder,
    label,
    disabled = false,
    readonly = false,
    autoSelectLowest = true,
    onchange
  }: {
    value?: string;
    materialType?: string;
    thicknessOptions?: number[];
    placeholder?: string;
    label?: string;
    disabled?: boolean;
    readonly?: boolean;
    autoSelectLowest?: boolean;
    onchange?: () => void;
  } = $props();

  let options: ThicknessOption[] = $state([]);
  let loading = $state(true);
  let loadError = $state(false);
  let retryVersion = $state(0);

  const selectedValue = $derived(normalizeThicknessValue(value));
  const hasSavedOption = $derived(
    !!selectedValue && !options.some(option => thicknessOptionValue(option) === selectedValue)
  );
  const manualValue = $derived(selectedValue.replace(/mm$/i, ''));

  $effect(() => {
    const type = materialType;
    const hasCatalogOptions = Array.isArray(thicknessOptions);
    const catalogOptions = createCatalogThicknessOptions(thicknessOptions);
    const blocked = disabled || readonly;
    // Retry is an explicit user action, never an automatic fetch loop.
    retryVersion;
    let current = true;
    const controller = new AbortController();
    options = catalogOptions;
    loadError = false;
    loading = false;

    const applyOptions = (next: ThicknessOption[]) => {
      if (!current) return;
      options = next;
      // Reading or opening an order must not replace an existing saved thickness.
      untrack(() => {
        if (!blocked && autoSelectLowest && !value && next.length > 0) {
          value = thicknessOptionValue(next[0]);
          onchange?.();
        }
      });
    };

    if (hasCatalogOptions) {
      applyOptions(catalogOptions);
    } else if (type && !blocked) {
      loading = true;
      void fetchThicknessOptions(type, { signal: controller.signal, basePath: base })
        .then(applyOptions)
        .catch(() => {
          if (current) loadError = true;
        })
        .finally(() => {
          if (current) loading = false;
        });
    }

    // A late response for the previous material cannot replace the current choices.
    return () => {
      current = false;
      controller.abort();
    };
  });

  function handleChange(event: Event) {
    value = normalizeThicknessValue((event.currentTarget as HTMLSelectElement).value);
    onchange?.();
  }

  function handleManualInput(event: Event) {
    value = normalizeThicknessValue((event.currentTarget as HTMLInputElement).value);
    onchange?.();
  }
</script>

<div class="thickness-field" aria-busy={loading}>
  {#if options.length > 0 || loading}
    <select
      value={selectedValue}
      disabled={disabled || readonly || loading}
      class="thickness-select"
      aria-label={label || $t('materialThickness.label')}
      onchange={handleChange}
    >
      <option value="">
        {loading ? $t('materialThickness.loading') : (placeholder || $t('materialThickness.select'))}
      </option>
      {#if hasSavedOption}
        <option value={selectedValue}>{value} · {$t('materialThickness.saved')}</option>
      {/if}
      {#each options as option (thicknessOptionValue(option))}
        <option value={thicknessOptionValue(option)}>{option.thickness} {option.unit}</option>
      {/each}
    </select>
  {:else}
    <div class="manual-input">
      <input
        type="text"
        inputmode="decimal"
        value={manualValue}
        disabled={disabled || readonly}
        aria-label={label || $t('materialThickness.label')}
        placeholder={$t('materialThickness.custom')}
        oninput={handleManualInput}
      />
      <span aria-hidden="true">mm</span>
    </div>
  {/if}

  {#if !loading && !readonly && !disabled && options.length === 0}
    <div class="thickness-status" class:error={loadError} role="status">
      <span>{loadError ? $t('materialThickness.unavailable') : $t('materialThickness.empty')}</span>
      {#if loadError}
        <button type="button" class="retry-button" onclick={() => retryVersion++}>
          {$t('materialThickness.retry')}
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .thickness-field {
    min-width: 0;
    display: grid;
    gap: 6px;
  }

  .thickness-select,
  .manual-input {
    width: 100%;
    min-width: 0;
    min-height: 40px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md, 8px);
    font: inherit;
    font-size: 0.875rem;
    color: var(--text);
    background: var(--bg-1);
    transition: border-color 0.15s ease;
  }

  .thickness-select {
    padding: 9px 10px;
    cursor: pointer;
    text-overflow: ellipsis;
  }

  /* Native popups need explicit colors, including on an OS using the other theme. */
  .thickness-select option {
    color: var(--text);
    background: var(--bg-1);
  }

  .thickness-select:focus-visible,
  .manual-input:focus-within {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
    border-color: var(--brand);
  }

  .thickness-select:disabled {
    background: var(--bg-2);
    color: var(--muted);
    cursor: not-allowed;
    opacity: 1;
  }

  .manual-input {
    display: flex;
    align-items: center;
  }

  .manual-input input {
    flex: 1;
    width: 100%;
    min-width: 0;
    border: 0;
    padding: 9px 10px;
    background: transparent;
    color: var(--text);
    font: inherit;
    outline: none;
  }

  .manual-input input::placeholder {
    color: var(--muted);
  }

  .manual-input input:disabled {
    cursor: not-allowed;
    color: var(--muted);
  }

  .manual-input span {
    padding-right: 10px;
    color: var(--muted);
    font-size: 0.8rem;
  }

  .thickness-status {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 8px;
    align-items: baseline;
    color: var(--muted);
    font-size: 0.75rem;
    line-height: 1.5;
  }

  .thickness-status.error {
    color: var(--error);
  }

  .retry-button {
    border: 0;
    background: transparent;
    padding: 4px 0;
    color: var(--brand);
    font: inherit;
    font-weight: 600;
    text-decoration: underline;
    text-underline-offset: 2px;
    cursor: pointer;
  }

  .retry-button:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 3px;
    border-radius: 2px;
  }
</style>
