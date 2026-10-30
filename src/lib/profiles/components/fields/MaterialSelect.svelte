<script lang="ts">
  import { onDestroy, tick, untrack } from "svelte";
  import { base } from "$app/paths";
  import { ArrowLeft, ChevronDown, ChevronRight, Pencil, RefreshCw, X } from "lucide-svelte";
  import { locale, t } from "$lib/i18n";
  import { materialDisplayName } from "$lib/profiles/helpers";
  import {
    buildMaterialCatalogUrl,
    getMaterialCatalogView,
    materialCatalog,
    MATERIAL_CATEGORY_LABELS,
    type CatalogMaterial as Material
  } from "$lib/profiles/material-catalog";

  let {
    value = $bindable(""),
    category = "",
    categories = [] as string[],
    placeholder = "",
    label = "",
    selectedCategory = "",
    readonly = false,
    showColor = true,
    customColor = "",
    allowCustom = false,
    onchange,
  }: {
    value?: string;
    category?: string;
    categories?: string[];
    placeholder?: string;
    label?: string;
    selectedCategory?: string;
    readonly?: boolean;
    showColor?: boolean;
    customColor?: string;
    allowCustom?: boolean;
    onchange?: (data: {
      value: string;
      material: Material | null;
      hex: string;
      shortName?: string;
    }) => void;
  } = $props();

  const pickerId = $props.id();

  let materials = $state<Material[]>([]);
  let loading = $state(true);
  let loadError = $state(false);
  let open = $state(false);
  let search = $state("");
  let activeCategory = $state("");
  let dropdownRef: HTMLDivElement | undefined = $state();
  let panelRef: HTMLDivElement | undefined = $state();
  let triggerRef: HTMLButtonElement | undefined = $state();
  let searchRef: HTMLInputElement | undefined = $state();
  let customInputRef: HTMLInputElement | undefined = $state();
  let customMode = $state(false);
  let customHex = $state("");
  let requestVersion = 0;
  let initialValueResolved = false;

  let selectedMaterial = $derived(materials.find((material) => material.code === value || material.name_en === value) || null);
  let catalogUrl = $derived(buildMaterialCatalogUrl(base, category, categories));
  let localizedCategoryLabels = $derived(Object.fromEntries(
    [...new Set(materials.map((material) => material.category))].map((category) => [category, categoryLabel(category)])
  ));
  let catalogView = $derived(getMaterialCatalogView(materials, activeCategory, search, localizedCategoryLabels));
  let browsingCategories = $derived(!activeCategory && !search.trim());
  let hexColor = $derived(selectedMaterial?.metadata?.hex || "");

  let shortName = $derived(materialDisplayName(selectedMaterial, value));
  let resolvedCategory = $derived(selectedMaterial?.category || selectedCategory);

  $effect(() => {
    const url = catalogUrl;
    untrack(() => {
      activeCategory = "";
      void loadMaterials(url);
    });
  });

  $effect(() => {
    const color = customColor;
    untrack(() => { customHex = color; });
  });

  onDestroy(() => { requestVersion++; });

  function categoryLabel(category: string): string {
    return $t(`materialPicker.categoryNames.${category}`, {
      default: MATERIAL_CATEGORY_LABELS[category] || (category === "OTHER"
        ? $t("materialPicker.categoryOther", { default: "Other materials" })
        : category.replace(/_/g, " "))
    });
  }

  function materialName(material: Material): string {
    return ($locale === "ru" ? material.name_ru : $locale === "lv" ? material.name_lv : "") || material.name_en || material.code;
  }

  async function loadMaterials(url: string, retry = false) {
    const version = ++requestVersion;
    // The retry control is removed by the loading state; keep focus on a
    // persistent control instead of dropping it onto the document body.
    if (retry && open) searchRef?.focus();
    loading = true;
    loadError = false;
    try {
      const result = await materialCatalog.load(url, retry);
      if (version !== requestVersion) return;
      materials = result;
      // Hydration may resolve metadata, but must never emit an order edit.
      if (!initialValueResolved) {
        initialValueResolved = true;
        if (allowCustom && value && !result.some((material) => material.code === value || material.name_en === value)) {
          customMode = true;
        }
      }
    } catch {
      if (version === requestVersion) loadError = true;
    } finally {
      if (version === requestVersion) loading = false;
    }
  }

  function selectMaterial(material: Material) {
    if (readonly) return;
    value = material.name_en || material.code;
    open = false;
    search = "";
    customMode = false;

    const short = materialDisplayName(material, value);

    onchange?.({ value, material, hex: material.metadata?.hex || "", shortName: short });
    triggerRef?.focus();
  }

  async function clearSelection() {
    if (readonly) return;
    value = "";
    customHex = "";
    customMode = false;
    open = false;
    search = "";
    activeCategory = "";
    // An explicit clear is the same event for catalog and custom selections.
    // Parent fields also discard the old swatch/category/thickness metadata.
    onchange?.({ value: "", material: null, hex: "", shortName: "" });
    await tick();
    triggerRef?.focus();
  }

  async function toggleDropdown() {
    if (readonly) return;
    customMode = false;
    open = !open;
    if (open) {
      search = "";
      activeCategory = "";
      await tick();
      searchRef?.focus();
    }
  }

  async function enterCustomMode() {
    if (readonly || !allowCustom) return;
    customHex = selectedMaterial?.metadata?.hex || customHex;
    customMode = true;
    open = false;
    await tick();
    customInputRef?.focus();
  }

  function handleCustomInput(e: Event) {
    if (readonly) return;
    const target = e.target as HTMLInputElement;
    value = target.value;
    // For custom values, call onchange with custom hex if set
    onchange?.({
      value,
      material: null,
      hex: customHex,
      shortName: value, // Custom value = exact text as entered
    });
  }

  function handleCustomColorChange(e: Event) {
    if (readonly) return;
    const target = e.target as HTMLInputElement;
    customHex = target.value;
    // Re-call onchange with updated color
    onchange?.({
      value,
      material: null,
      hex: customHex,
      shortName: value,
    });
  }

  function handleClickOutside(event: PointerEvent) {
    if (dropdownRef && !dropdownRef.contains(event.target as Node)) {
      open = false;
    }
  }

  async function browseCategory(category: string) {
    searchRef?.focus();
    activeCategory = category;
    search = "";
    await tick();
    if (open) panelRef?.querySelector<HTMLButtonElement>(".option")?.focus();
  }

  async function showCategories() {
    searchRef?.focus();
    activeCategory = "";
    search = "";
    await tick();
    searchRef?.focus();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (!dropdownRef?.contains(event.target as Node)) return;
    if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      open = false;
      triggerRef?.focus();
      return;
    }
    if (!open && event.key === "ArrowDown" && event.target === triggerRef) {
      event.preventDefault();
      void toggleDropdown();
      return;
    }
    if (!open || !panelRef) return;
    const buttons = [...panelRef.querySelectorAll<HTMLButtonElement>("[data-picker-item]")];
    if (!buttons.length) return;
    const current = buttons.indexOf(event.target as HTMLButtonElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const next = current < 0 ? (event.key === "ArrowDown" ? 0 : buttons.length - 1)
        : (current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    } else if (current >= 0 && (event.key === "Home" || event.key === "End")) {
      event.preventDefault();
      buttons[event.key === "Home" ? 0 : buttons.length - 1]?.focus();
    }
  }

  function handleFocusIn(event: FocusEvent) {
    // A focused button disappearing during a render is not an outside focus
    // destination. Dismiss when focus actually arrives outside the picker.
    if (open && dropdownRef && !dropdownRef.contains(event.target as Node)) open = false;
  }
</script>

<svelte:window onpointerdown={handleClickOutside} onkeydown={handleKeydown}
  onfocusin={handleFocusIn} onblur={() => { open = false; }} />

<div class="material-select" class:open bind:this={dropdownRef}>
  <div class="selection-control">
  {#if customMode}
    <div class="custom-mode">
      {#if showColor}
        <input type="color" class="custom-color-picker" value={/^#[0-9a-f]{6}$/i.test(customHex) ? customHex : "#ffffff"}
          oninput={handleCustomColorChange}
          aria-label={$t("materialPicker.customColor", { default: "Custom material color" })}
          disabled={readonly} />
      {/if}
      <input type="text" class="custom-text-input" bind:this={customInputRef}
        {value} oninput={handleCustomInput}
        aria-label={$t("materialPicker.custom", { default: "Enter custom value" })}
        placeholder={$t("materialPicker.customPlaceholder", { default: "Enter custom material…" })}
        disabled={readonly} />
      <button type="button" class="btn-switch-mode" onclick={toggleDropdown} disabled={readonly}
        title={$t("materialPicker.switchToPicker", { default: "Choose from catalog" })}
        aria-label={$t("materialPicker.switchToPicker", { default: "Choose from catalog" })}>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
    </div>
  {:else}
    <button type="button" class="select-trigger" class:open bind:this={triggerRef}
      disabled={readonly} aria-expanded={open}
      aria-label={label ? `${label} · ${$t("materialPicker.select", { default: "Select…" })}`
        : placeholder || $t("materialPicker.select", { default: "Select…" })}
      aria-describedby={value ? `${pickerId}-selection` : undefined}
      aria-controls={open ? `${pickerId}-options` : undefined}
      onclick={toggleDropdown}>
      {#if value}
        <span class="selected-value" id={`${pickerId}-selection`}>
          {#if showColor && hexColor}
            <span class="color-dot" style:background-color={hexColor}></span>
          {/if}
          <span class="value-details">
            <span class="value-text" title={selectedMaterial?.name_en || value}>{shortName || value}</span>
            {#if resolvedCategory}
              <span class="value-category">{categoryLabel(resolvedCategory)}</span>
            {/if}
          </span>
        </span>
      {:else}
        <span class="placeholder">{placeholder || $t("materialPicker.select", { default: "Select…" })}</span>
      {/if}
      <ChevronDown size={14} class="chevron" aria-hidden="true" />
    </button>
  {/if}
  {#if value && !readonly}
    <button type="button" class="clear-selection" onclick={clearSelection}
      aria-label={$t("materialPicker.clear", { default: "Clear selection" })}
      title={$t("materialPicker.clear", { default: "Clear selection" })}>
      <X size={16} aria-hidden="true" />
    </button>
  {/if}
  </div>

  {#if open}
    <div class="dropdown" id={`${pickerId}-options`} bind:this={panelRef} role="group"
      aria-label={$t("materialPicker.categories", { default: "Material categories" })}>
      <div class="search-box">
        <input type="search" bind:this={searchRef} bind:value={search} autocomplete="off"
          placeholder={$t("materialPicker.search", { default: "Search all materials…" })}
          aria-label={$t("materialPicker.search", { default: "Search all materials…" })}
          class="search-input" />
      </div>

      {#if !browsingCategories}
        <button type="button" class="category-back" onclick={showCategories}>
          <ArrowLeft size={14} aria-hidden="true" />
          {$t("materialPicker.backToCategories", { default: "All categories" })}
        </button>
      {/if}

      {#if allowCustom}
        <button type="button" class="custom-option" onclick={enterCustomMode}>
          <Pencil size={14} aria-hidden="true" />
          {$t("materialPicker.custom", { default: "Enter custom value" })}
        </button>
      {/if}

      <div class="options-list" aria-busy={loading}>
        {#if loading}
          <div class="status-message" role="status">{$t("materialPicker.loading", { default: "Loading materials…" })}</div>
        {:else if loadError}
          <div class="error-state" role="status">
            <p>{$t("materialPicker.loadError", { default: "Could not load materials. Try again." })}</p>
            <button type="button" class="retry-button" onclick={() => loadMaterials(catalogUrl, true)}>
              <RefreshCw size={14} aria-hidden="true" />
              {$t("materialPicker.retry", { default: "Retry" })}
            </button>
          </div>
        {:else if browsingCategories && catalogView.categories.length}
          <div class="category-prompt">{$t("materialPicker.chooseCategory", { default: "Choose a category" })}</div>
          {#each catalogView.categories as item (item.category)}
            <button type="button" class="category-option" data-picker-item
              onclick={() => browseCategory(item.category)}>
              <span class="category-name">{categoryLabel(item.category)}</span>
              <span class="category-count">{item.count}</span>
              <ChevronRight size={14} aria-hidden="true" />
            </button>
          {/each}
        {:else if !browsingCategories && catalogView.groups.length}
          {#each catalogView.groups as group (group.category)}
            <div class="category-group">
              <div class="category-header">{categoryLabel(group.category)}</div>
              {#each group.materials as material (material.id)}
                <button type="button" class="option" data-picker-item
                  class:selected={selectedMaterial?.id === material.id}
                  aria-pressed={selectedMaterial?.id === material.id}
                  onclick={() => selectMaterial(material)}>
                  {#if showColor && material.metadata?.hex}
                    <span class="color-dot" style:background-color={material.metadata.hex}></span>
                  {/if}
                  <span class="option-details">
                    <span class="option-name">{materialName(material)}</span>
                    {#if material.thickness_options?.length}
                      <span class="option-thickness">{material.thickness_options.join(" / ")} mm</span>
                    {/if}
                  </span>
                </button>
              {/each}
            </div>
          {/each}
        {:else}
          <div class="status-message" role="status">{$t("materialPicker.noResults", { default: "No materials found" })}</div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .material-select {
    position: relative;
    width: 100%;
    min-width: 0;
    color: var(--text, var(--ink-primary));
  }

  .material-select.open { z-index: var(--z-overlay, 40); }
  .selection-control { display: flex; align-items: stretch; gap: 4px; min-width: 0; }

  .select-trigger {
    width: 100%;
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 6px 8px;
    background: var(--bg-1, white);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm, 4px);
    font-size: var(--font-size-sm, 12px);
    cursor: pointer;
    text-align: left;
    color: inherit;
    min-height: 32px;
    transition: border-color 0.15s;
  }

  .select-trigger:hover:not(:disabled) { border-color: var(--border-strong, var(--muted)); }
  .select-trigger.open { border-color: var(--accent-1, var(--brand)); }
  .select-trigger:disabled, .custom-mode :disabled { cursor: default; opacity: 0.7; }

  .select-trigger:focus-visible,
  .category-option:focus-visible,
  .option:focus-visible,
  .category-back:focus-visible,
  .custom-option:focus-visible,
  .retry-button:focus-visible,
  .btn-switch-mode:focus-visible,
  .clear-selection:focus-visible,
  .custom-color-picker:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
  }

  .selected-value { display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0; }
  .value-details { display: grid; gap: 2px; min-width: 0; }
  .value-text { min-width: 0; overflow-wrap: anywhere; }
  .value-category { color: var(--ink-secondary, var(--muted)); font-size: 11px; overflow-wrap: anywhere; }
  .placeholder { color: var(--ink-secondary, var(--muted)); font-weight: 400; }

  .color-dot {
    width: 14px;
    height: 14px;
    border-radius: 3px;
    border: 1px solid var(--border-strong, var(--border));
    flex-shrink: 0;
  }

  .select-trigger :global(.chevron) { flex-shrink: 0; color: var(--ink-secondary, var(--muted)); transition: transform 0.15s; }
  .select-trigger.open :global(.chevron) { transform: rotate(180deg); }

  .dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    margin-top: 4px;
    background: var(--bg-1, white);
    color: var(--text, var(--ink-primary));
    border: 1px solid var(--border-strong, var(--border));
    border-radius: 6px;
    box-shadow: 0 8px 24px color-mix(in oklab, var(--ink-primary) 16%, transparent);
    z-index: var(--z-modal, 50);
    max-height: min(26rem, 65dvh);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .search-box { padding: 8px; flex-shrink: 0; border-bottom: 1px solid var(--border); }
  .search-input {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    padding: 8px;
    border: 1px solid var(--border);
    border-radius: 4px;
    font-size: 12px;
    background: var(--bg-2);
    color: inherit;
    caret-color: var(--brand);
  }
  .search-input::placeholder, .custom-text-input::placeholder { color: var(--ink-secondary, var(--muted)); }
  .search-input:focus, .custom-text-input:focus { outline: 2px solid var(--brand); outline-offset: -2px; }

  .options-list {
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    scrollbar-color: var(--border-strong, var(--muted)) var(--bg-1);
    padding: 3px;
  }

  .status-message, .error-state { padding: 14px 10px; color: var(--ink-secondary, var(--muted)); font-size: 12px; line-height: 1.5; }
  .error-state p { margin: 0 0 10px; }
  .category-prompt { padding: 6px 7px; color: var(--ink-secondary, var(--muted)); font-size: 11px; }
  .category-option, .option {
    display: flex;
    align-items: center;
    width: 100%;
    min-width: 0;
    min-height: 36px;
    gap: 8px;
    padding: 8px 7px;
    border: 0;
    border-radius: 3px;
    background: transparent;
    color: inherit;
    cursor: pointer;
    text-align: left;
    font-size: 12px;
    line-height: 1.4;
  }
  .category-option:hover, .option:hover { background: var(--bg-2); }
  .category-option :global(svg) { flex-shrink: 0; }
  .category-name { flex: 1; min-width: 0; overflow-wrap: anywhere; }
  .category-count { color: var(--ink-secondary, var(--muted)); font-variant-numeric: tabular-nums; font-size: 11px; }
  .category-back, .custom-option, .retry-button {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 10px;
    min-height: 36px;
    border: 0;
    background: var(--bg-1, white);
    color: inherit;
    cursor: pointer;
    text-align: left;
    font-size: 12px;
    line-height: 1.4;
    flex-shrink: 0;
  }
  .category-back, .custom-option { border-bottom: 1px solid var(--border); }
  .category-back:hover, .custom-option:hover, .retry-button:hover { background: var(--bg-2); }
  .category-back :global(svg), .custom-option :global(svg), .retry-button :global(svg) { flex-shrink: 0; }
  .custom-option :global(svg) { color: var(--brand); }
  .retry-button { border: 1px solid var(--border); border-radius: 4px; }
  .category-group + .category-group { border-top: 1px solid var(--border); }
  .category-header { padding: 7px; font-size: 11px; font-weight: 600; color: var(--ink-secondary, var(--muted)); background: var(--bg-2); overflow-wrap: anywhere; }
  .option.selected { background: color-mix(in oklab, var(--brand) 10%, var(--bg-1, white)); }
  .option-details { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  .option-name { font-weight: 500; overflow-wrap: anywhere; }
  .option-thickness { font-size: 11px; color: var(--ink-secondary, var(--muted)); overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
  .custom-mode { display: flex; align-items: center; flex: 1; min-width: 0; gap: 4px; }
  .custom-color-picker { width: 32px; height: 32px; flex-shrink: 0; padding: 2px; border: 1px solid var(--border); border-radius: 4px; cursor: pointer; background: var(--bg-1, white); }
  .custom-color-picker::-webkit-color-swatch { border: 0; border-radius: 2px; }
  .custom-color-picker::-webkit-color-swatch-wrapper { padding: 0; }
  .custom-text-input { flex: 1; min-width: 0; width: 100%; padding: 6px 8px; border: 1px solid var(--brand); border-radius: 4px; font-size: 12px; background: var(--bg-1, white); color: inherit; min-height: 32px; box-sizing: border-box; }
  .btn-switch-mode { display: flex; align-items: center; justify-content: center; flex-shrink: 0; width: 32px; height: 32px; border: 1px solid var(--border); border-radius: 4px; background: var(--bg-2); cursor: pointer; color: inherit; }
  .btn-switch-mode:hover:not(:disabled) { border-color: var(--brand); }
  .clear-selection { display: flex; align-items: center; justify-content: center; flex-shrink: 0; width: 32px; min-height: 32px; border: 1px solid var(--border); border-radius: var(--radius-sm, 4px); background: var(--bg-1, white); color: var(--ink-secondary, var(--muted)); cursor: pointer; }
  .clear-selection:hover { border-color: var(--border-strong, var(--muted)); color: var(--text, var(--ink-primary)); background: var(--bg-2); }

  @media (pointer: coarse) {
    .select-trigger, .category-option, .option, .category-back, .custom-option, .retry-button, .custom-text-input, .btn-switch-mode, .custom-color-picker, .clear-selection { min-height: 44px; }
    .btn-switch-mode, .custom-color-picker, .clear-selection { min-width: 40px; }
  }

  @media (prefers-reduced-motion: reduce) {
    .select-trigger, .select-trigger :global(.chevron) { transition: none; }
  }
</style>
