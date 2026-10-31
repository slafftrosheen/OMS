<script lang="ts">
  import { onDestroy, tick, untrack, type Snippet } from "svelte";
  import { base } from "$app/paths";
  import { ArrowLeft, ChevronDown, ChevronRight, Pencil, RefreshCw, X } from "lucide-svelte";
  import { locale, t } from "$lib/i18n";
  import { materialDisplayName } from "$lib/profiles/helpers";
  import { getProfileMaterialBadge, type ProfileMaterialBadgeKind } from "$lib/profiles/material-badge";
  import { getMaterialSelectionSummary, type MaterialSummaryKind } from "$lib/materials/selection-summary";
  import { materialColorVariables, materialSelectionTone, materialSwatch } from "$lib/materials/selection-colors";
  import "$lib/materials/selection-colors.css";
  import { filterProfileMaterials, type ProfileMaterialRole } from "$lib/profiles/material-roles";
  import {
    getMaterialSpecificationFacts,
    MATERIAL_SPECIFICATION_LABELS,
    type MaterialSpecificationKey
  } from "$lib/materials/catalog-presentation";
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
    summaryKind,
    selectionLength = "",
    materialRole,
    compactSelection = false,
    badgeKind,
    badgeThickness = "",
    badgeShortName = "",
    badgeDimensions = "",
    editorDetails,
    finishOnSelect = true,
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
    summaryKind?: MaterialSummaryKind;
    selectionLength?: string;
    materialRole?: ProfileMaterialRole;
    compactSelection?: boolean;
    badgeKind?: ProfileMaterialBadgeKind;
    badgeThickness?: string;
    badgeShortName?: string;
    badgeDimensions?: string;
    editorDetails?: Snippet;
    finishOnSelect?: boolean;
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
  let pickerControlRef: HTMLDivElement | undefined = $state();
  let panelRef: HTMLDivElement | undefined = $state();
  let triggerRef: HTMLButtonElement | undefined = $state();
  let editRef: HTMLButtonElement | undefined = $state();
  let searchRef: HTMLInputElement | undefined = $state();
  let customInputRef: HTMLInputElement | undefined = $state();
  let customMode = $state(false);
  let customHex = $state("");
  let editing = $state(false);
  let requestVersion = 0;
  let initialValueResolved = false;
  let knownValue = untrack(() => value);

  let selectedMaterial = $derived(materials.find((material) => material.code === value || material.name_en === value) || null);
  let candidateMaterials = $derived(filterProfileMaterials(materials, materialRole));
  let catalogUrl = $derived(buildMaterialCatalogUrl(base, category, categories));
  let localizedCategoryLabels = $derived(Object.fromEntries(
    [...new Set(candidateMaterials.map((material) => material.category))].map((category) => [category, categoryLabel(category)])
  ));
  let catalogView = $derived(getMaterialCatalogView(candidateMaterials, activeCategory, search, localizedCategoryLabels));
  let browsingCategories = $derived(!activeCategory && !search.trim());
  let hexColor = $derived(materialSwatch(selectedMaterial?.metadata?.hex || customColor));

  let shortName = $derived(materialDisplayName(selectedMaterial, value));
  let resolvedCategory = $derived(candidateMaterials.find(material => material.code === selectedMaterial?.code)?.category
    || selectedMaterial?.category || selectedCategory);
  let selectedBadge = $derived(getProfileMaterialBadge(selectedMaterial, {
    value, shortName: badgeShortName, category: resolvedCategory,
    thickness: badgeThickness, hex: customColor, kind: badgeKind, dimensions: badgeDimensions
  }));
  let selectedSummary = $derived(getMaterialSelectionSummary(selectedMaterial, {
    kind: summaryKind, value, length: selectionLength, locale: $locale
  }));
  let selectionTone = $derived(materialSelectionTone(
    resolvedCategory || category || categories[0], materialRole, summaryKind
  ));
  let collapsed = $derived(compactSelection && Boolean(value) && (readonly || !editing));
  let selectionIdentity = $derived(selectedSummary?.identity || selectedMaterial?.name_en || value);

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

  $effect(() => {
    if (readonly) {
      open = false;
      editing = false;
    }
  });

  $effect(() => {
    const nextValue = value;
    untrack(() => {
      // Parent resets can reuse this component. A new saved selection must not
      // inherit the previous editor, while explicit local typing stays open.
      if (compactSelection && nextValue !== knownValue) {
        open = false;
        editing = false;
        customMode = false;
      }
      knownValue = nextValue;
    });
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

  const specificationPriority: MaterialSpecificationKey[] = [
    "voltage", "ratedVoltage", "power", "powerPerMetre", "maxPowerPerMetre", "series", "ledType",
    "whiteColorTemperature", "colorTemperature", "material", "diameter",
    "outerDiameter", "crossSection", "cores", "connections", "cableType", "cableApplication",
    "current", "ledDensity", "ipRating", "bodyLength"
  ];
  const visibleSpecificationLabels = new Set<MaterialSpecificationKey>([
    "ratedVoltage", "maxPowerPerMetre", "whiteColorTemperature", "outerDiameter", "cores", "connections",
    "cableType", "cableApplication", "bodyLength", "package", "unit"
  ]);

  function compactSpecifications(material: Material | null) {
    const facts = getMaterialSpecificationFacts(material);
    const technical = facts.filter(fact => fact.key !== "package" && fact.key !== "unit")
      .sort((a, b) => specificationPriority.indexOf(a.key) - specificationPriority.indexOf(b.key)).slice(0, 4);
    return [...technical, ...facts.filter(fact => fact.key === "package" || fact.key === "unit")];
  }

  function specificationLabel(key: MaterialSpecificationKey): string {
    return $t(`materialSpecifications.${key}`, { default: MATERIAL_SPECIFICATION_LABELS[key] });
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
          const restoreCustomFocus = compactSelection && editing && triggerRef
            && triggerRef.ownerDocument.activeElement === triggerRef;
          customMode = true;
          if (restoreCustomFocus) {
            await tick();
            if (version === requestVersion && editing && !readonly) customInputRef?.focus();
          }
        }
      }
    } catch {
      if (version === requestVersion) loadError = true;
    } finally {
      if (version === requestVersion) loading = false;
    }
  }

  async function selectMaterial(material: Material) {
    if (readonly) return;
    setSelectionValue(material.name_en || material.code);
    open = false;
    search = "";
    customMode = false;
    if (compactSelection) editing = !finishOnSelect;

    const short = materialDisplayName(material, value);
    const hex = compactSelection
      ? getProfileMaterialBadge(material, { value, kind: badgeKind, category: material.category }).hex || ""
      : material.metadata?.hex || "";

    onchange?.({ value, material, hex, shortName: short });
    await tick();
    if (collapsed) editRef?.focus();
    else triggerRef?.focus();
  }

  async function clearSelection() {
    if (readonly) return;
    setSelectionValue("");
    customHex = "";
    customMode = false;
    open = false;
    search = "";
    activeCategory = "";
    editing = true;
    // An explicit clear is the same event for catalog and custom selections.
    // Parent fields also discard the old swatch/category/thickness metadata.
    onchange?.({ value: "", material: null, hex: "", shortName: "" });
    await tick();
    triggerRef?.focus();
  }

  async function editSelection() {
    if (readonly) return;
    if (!loading && !loadError) customMode = allowCustom && Boolean(value) && !selectedMaterial;
    editing = true;
    await tick();
    if (customMode) customInputRef?.focus();
    else triggerRef?.focus();
  }

  async function finishEditing() {
    if (readonly || !value) return;
    open = false;
    editing = false;
    await tick();
    editRef?.focus();
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
    customHex = (compactSelection ? selectedBadge.hex : selectedMaterial?.metadata?.hex) || customHex;
    editing = true;
    customMode = true;
    open = false;
    await tick();
    customInputRef?.focus();
  }

  function handleCustomInput(e: Event) {
    if (readonly) return;
    const target = e.target as HTMLInputElement;
    setSelectionValue(target.value);
    // For custom values, call onchange with custom hex if set
    onchange?.({
      value,
      material: null,
      hex: customHex,
      shortName: value, // Custom value = exact text as entered
    });
  }

  function setSelectionValue(nextValue: string) {
    knownValue = nextValue;
    value = nextValue;
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
    if (open && pickerControlRef && !pickerControlRef.contains(event.target as Node)) {
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
    if (event.key === "Escape" && compactSelection && editing && value) {
      event.preventDefault();
      event.stopPropagation();
      void finishEditing();
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
    // destination. Moving into editor details leaves the picker, but keeps the
    // material editor open so thickness, notes and geometry remain available.
    if (open && pickerControlRef && !pickerControlRef.contains(event.target as Node)) open = false;
  }
</script>

{#snippet specificationSummary(material: Material | null)}
  {@const facts = compactSpecifications(material)}
  {#if facts.length}
    <span class="specification-summary">
      {#each facts as fact (fact.key)}
        <span class="specification-fact" data-specification={fact.key} title={specificationLabel(fact.key)}>
          <span class:visually-hidden={!visibleSpecificationLabels.has(fact.key)}>{`${specificationLabel(fact.key)}: `}</span>{fact.value}
        </span>
      {/each}
    </span>
  {/if}
{/snippet}

<svelte:window onpointerdown={handleClickOutside} onkeydown={handleKeydown}
  onfocusin={handleFocusIn} onblur={() => { open = false; }} />

<div class="material-select material-context" class:open class:has-selection={Boolean(value)}
  data-material-tone={selectionTone} data-readonly={readonly}
  style={materialColorVariables(selectionTone)} bind:this={dropdownRef}>
  {#if collapsed}
    <div class="material-selection-summary">
      <span class="material-selection-badge material-context material-swatch"
        data-material-badge={badgeKind || summaryKind || "material"}
        data-material-tone={selectionTone}
        style={materialColorVariables(selectionTone, selectedBadge.hex)}
        title={selectionIdentity}
        aria-describedby={`${pickerId}-identity`}>
        {#if selectedSummary?.facts.length}
          <span class="selected-summary" data-selection-summary={selectedSummary.kind}>
            {#each selectedSummary.facts as fact, index (fact.key)}
              <span class="summary-fact" data-selection-fact={fact.key} title={fact.label}>
                {#if index}<span class="summary-separator" aria-hidden="true">{' · '}</span>{/if}{fact.value}
              </span>
            {/each}
          </span>
        {:else}
          <span class="badge-label">{selectedBadge.label || shortName || value}</span>
        {/if}
      </span>
      <span class="visually-hidden" id={`${pickerId}-identity`}>{selectionIdentity}</span>
      {#if !readonly}
        <button type="button" class="edit-selection" bind:this={editRef}
          aria-label={label ? `${label} · ${$t("materialPicker.editSelection", { default: "Edit" })}`
            : $t("materialPicker.editSelection", { default: "Edit" })}
          aria-describedby={`${pickerId}-identity`}
          onclick={editSelection}>
          <Pencil size={14} aria-hidden="true" />
          {$t("materialPicker.editSelection", { default: "Edit" })}
        </button>
      {/if}
    </div>
  {:else}
  <div class="selection-editor">
  <div class="picker-control" bind:this={pickerControlRef}>
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
        style:background={value ? 'var(--material-surface)' : undefined}
        style:color={value ? 'var(--material-ink)' : undefined}
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
    <button type="button" class="select-trigger" class:open class:compact-selection={Boolean(selectedSummary?.facts.length)} bind:this={triggerRef}
      disabled={readonly} aria-expanded={open}
      title={value && selectedSummary?.identity ? selectedSummary.identity : undefined}
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
            {#if selectedSummary?.facts.length}
              <span class="selected-summary" data-selection-summary={selectedSummary.kind}>
                {#each selectedSummary.facts as fact, index (fact.key)}
                  <span class="summary-fact" data-selection-fact={fact.key} title={fact.label}>
                    {#if index}<span class="summary-separator" aria-hidden="true">{' · '}</span>{/if}{fact.value}
                  </span>
                {/each}
              </span>
              {#if selectedSummary.identity && !selectedSummary.facts.some(fact => fact.key === 'identity')}
                <span class="visually-hidden">{selectedSummary.identityLabel}: {selectedSummary.identity}</span>
              {/if}
            {:else}
              <span class="value-text" title={selectedMaterial?.name_en || value}>{shortName || value}</span>
              {#if resolvedCategory}
                <span class="value-category">{categoryLabel(resolvedCategory)}</span>
              {/if}
              {@render specificationSummary(selectedMaterial)}
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
      {#if value && selectedSummary?.identity}
        <div class="current-selection">
          <span class="current-selection-label">{selectedSummary.identityLabel}</span>
          <p>{selectedSummary.identity}</p>
        </div>
      {/if}
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
                  {#if showColor && materialSwatch(material.metadata?.hex)}
                    <span class="color-dot" style:background-color={materialSwatch(material.metadata?.hex)}></span>
                  {/if}
                  <span class="option-details">
                    <span class="option-name">{materialName(material)}</span>
                    {#if material.thickness_options?.length}
                      <span class="option-thickness">{material.thickness_options.join(" / ")} mm</span>
                    {/if}
                    {@render specificationSummary(material)}
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
  {#if compactSelection && editorDetails}
    <div class="editor-details">
      {@render editorDetails()}
    </div>
  {/if}
  {#if compactSelection && value && !readonly}
    <div class="editor-actions">
      <button type="button" class="done-editing"
        aria-label={label ? `${label} · ${$t("materialPicker.doneEditing", { default: "Done" })}`
          : $t("materialPicker.doneEditing", { default: "Done" })}
        onclick={finishEditing}>
        {$t("materialPicker.doneEditing", { default: "Done" })}
      </button>
    </div>
  {/if}
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
  .material-selection-summary {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: stretch;
    gap: var(--space-xs);
    min-width: 0;
  }
  .material-selection-badge {
    display: flex;
    align-items: center;
    min-width: 0;
    min-height: var(--control-sm);
    padding: var(--space-sm) var(--space-md);
    border: 1px solid var(--material-edge);
    border-radius: var(--radius-sm);
    box-sizing: border-box;
    font-size: var(--text-sm);
    font-weight: 600;
    line-height: var(--leading-snug);
    text-align: start;
  }
  .badge-label { min-width: 0; overflow-wrap: anywhere; }
  .material-selection-badge .selected-summary { line-height: inherit; }
  .material-selection-badge .summary-separator { color: inherit; }
  .edit-selection,
  .done-editing {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-xs);
    min-height: var(--control-sm);
    padding: var(--space-xs) var(--space-sm);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-1);
    color: var(--ink-primary);
    font: inherit;
    font-size: var(--text-sm);
    font-weight: 600;
    line-height: var(--leading-snug);
    cursor: pointer;
  }
  .edit-selection { align-self: start; }
  .edit-selection :global(svg) { flex-shrink: 0; }
  .edit-selection:hover,
  .done-editing:hover { border-color: var(--border-strong); background: var(--bg-2); }
  .edit-selection:focus-visible,
  .done-editing:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  .selection-editor,
  .editor-details { display: grid; gap: var(--space-sm); min-width: 0; }
  .picker-control { position: relative; min-width: 0; }
  .editor-actions { display: flex; justify-content: flex-end; }
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
  .select-trigger:disabled, .custom-mode :disabled { cursor: default; opacity: 1; }
  .select-trigger:disabled, .custom-text-input:disabled { border-style: dashed; }
  .custom-text-input:disabled { -webkit-text-fill-color: currentColor; }

  .has-selection .select-trigger, .has-selection .custom-text-input {
    background: var(--material-surface);
    color: var(--material-ink);
    border-color: var(--material-edge);
  }
  .has-selection .select-trigger:hover:not(:disabled) { border-color: var(--material-ink); }
  .has-selection .select-trigger.open { border-color: var(--focus, var(--brand)); }
  .has-selection .select-trigger .value-category,
  .has-selection .select-trigger .specification-summary,
  .has-selection .select-trigger .summary-separator,
  .has-selection .select-trigger :global(.chevron) { color: inherit; }

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
  .compact-selection { min-height: 38px; padding: 8px 10px; }
  .selected-summary { display: flex; flex-wrap: wrap; align-items: baseline; min-width: 0; line-height: 1.5; font-variant-numeric: tabular-nums; }
  .summary-fact { min-width: 0; overflow-wrap: anywhere; }
  .summary-fact:first-child { font-weight: 600; }
  .summary-separator { color: var(--ink-secondary, var(--muted)); white-space: pre; }
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

  .current-selection { padding: 8px 10px; flex-shrink: 0; min-width: 0; background: var(--material-surface); color: var(--material-ink); border-bottom: 1px solid var(--material-edge); }
  .current-selection-label { color: inherit; font-size: 11px; }
  .current-selection p { margin: 3px 0 0; font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
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
  .search-input::placeholder, .custom-text-input::placeholder { color: var(--ink-secondary, var(--muted)); opacity: 1; }
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
  .option.selected { background: var(--material-surface); color: var(--material-ink); box-shadow: inset 0 0 0 1px var(--material-edge); }
  .option.selected .option-thickness, .option.selected .specification-summary { color: inherit; }
  .option-details { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  .option-name { font-weight: 500; overflow-wrap: anywhere; }
  .option-thickness { font-size: 11px; color: var(--ink-secondary, var(--muted)); overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
  .specification-summary { display: flex; flex-wrap: wrap; gap: 2px 8px; min-width: 0; color: var(--ink-secondary, var(--muted)); font-size: 11px; font-weight: 400; line-height: 1.5; }
  .specification-fact { min-width: 0; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
  .visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
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
    .edit-selection, .done-editing { min-height: var(--control-size); }
    .select-trigger, .category-option, .option, .category-back, .custom-option, .retry-button, .custom-text-input, .btn-switch-mode, .custom-color-picker, .clear-selection { min-height: 44px; }
    .btn-switch-mode, .custom-color-picker, .clear-selection { min-width: 40px; }
  }

  @media (prefers-reduced-motion: reduce) {
    .select-trigger, .select-trigger :global(.chevron) { transition: none; }
  }
</style>
