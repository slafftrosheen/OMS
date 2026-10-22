<script lang="ts">
  import { onDestroy, tick, untrack } from "svelte";
  import { base } from "$app/paths";
  import { ArrowLeft, ChevronDown, ChevronRight, Pencil, RefreshCw } from "lucide-svelte";
  import { locale, t } from "$lib/i18n";
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
    readonly = false,
    showColor = true,
    customColor = "",
    allowCustom = false,
    showValueInTrigger = false,
    onchange,
  }: {
    value?: string;
    category?: string;
    categories?: string[];
    placeholder?: string;
    readonly?: boolean;
    showColor?: boolean;
    customColor?: string;
    allowCustom?: boolean;
    showValueInTrigger?: boolean;
    onchange?: (data: {
      value: string;
      material: Material | null;
      hex: string;
      shortName?: string;
    }) => void;
  } = $props();

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

  // Get short name for display - priority: metadata.short_name > colorCode > code > name
  let shortName = $derived(
    selectedMaterial?.metadata?.short_name ||
      selectedMaterial?.metadata?.colorCode ||
      getShortName(selectedMaterial?.code || value, selectedMaterial?.category),
  );

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

  // Extract short name from value - improved to extract proper codes
  function getShortName(val: string, cat?: string): string {
    if (!val) return "";

    // For Oracal/Vinyl - show FULL code like 8500_064 (series_colorCode)
    if (
      cat?.includes("ORACAL") ||
      cat?.includes("VINYL") ||
      val.toLowerCase().includes("oracal")
    ) {
      // Match complete Oracal codes: 8500-064, 8500_064, 8500 064, etc.
      const fullMatch = val.match(/(\d{4})[-_\s]?(\d{2,3})/);
      if (fullMatch) return `${fullMatch[1]}_${fullMatch[2]}`;
      // Try to extract from ORACAL_8500_064 format
      const oracalMatch = val.match(/ORACAL[_-]?(\d{4})[_-]?(\d{2,3})/i);
      if (oracalMatch) return `${oracalMatch[1]}_${oracalMatch[2]}`;
      // Just series + color code at end
      const seriesMatch = val.match(/(\d{4})/);
      const colorMatch = val.match(/[-_](\d{2,3})(?:\s|$)/);
      if (seriesMatch && colorMatch)
        return `${seriesMatch[1]}_${colorMatch[1]}`;
      // Fallback: try to get any 4-digit + 2-3 digit pattern
      const anyMatch = val.match(/\b(\d{4})\D+(\d{2,3})\b/);
      if (anyMatch) return `${anyMatch[1]}_${anyMatch[2]}`;
      return val
        .replace(/oracal\s*/i, "")
        .replace(/vinyl\s*/i, "")
        .trim()
        .substring(0, 12)
        .toUpperCase();
    }

    // For acrylic - extract colorCode like 3N570, WN071, 0F00, WH10
    if (
      cat?.includes("ACRYLIC") ||
      val.toLowerCase().includes("acrylic") ||
      val.toLowerCase().includes("plexi")
    ) {
      // Look for standard PLEXIGLAS colorCodes: 3N570, WN071, WH10, 0F00, 0E010, 7A670
      const codePatterns = [
        /\b(\d[A-Z]\d{3})\b/i, // 3N570, 0F00, 0E010
        /\b([A-Z]{2}\d{2,3})\b/i, // WN071, WH10, WN297
        /\b(\d[A-Z]{2}\d{2})\b/i, // 7A670
      ];
      for (const pattern of codePatterns) {
        const match = val.match(pattern);
        if (match) return match[1].toUpperCase();
      }
      // Try extracting from PLEXIGLAS_XT_3N570 format
      const plexMatch = val.match(/(?:XT|GS|LED)[_-]?([A-Z0-9]{4,6})/i);
      if (plexMatch) return plexMatch[1].toUpperCase();
      // Descriptive fallbacks
      if (val.toLowerCase().includes("opal")) return "OPAL";
      if (val.toLowerCase().includes("clear") || val.includes("0F00"))
        return "CLEAR";
      if (/white/i.test(val) && !/opal/i.test(val)) return "WHITE";
      // Last part might be the code
      const parts = val.split(/[-_\s]+/);
      const lastPart = parts[parts.length - 1];
      if (lastPart && /^[A-Z0-9]{4,6}$/i.test(lastPart))
        return lastPart.toUpperCase();
      return "PLEX";
    }

    // For ALU - show ALU + thickness or dimensions
    if (cat?.includes("ALU") || val.toLowerCase().includes("alu")) {
      // Extract thickness like 1.5mm, 2.0mm
      const thicknessMatch = val.match(/([\d.,]+)\s*mm/i);
      if (thicknessMatch) return `ALU ${thicknessMatch[1].replace(",", ".")}`;
      // Extract profile dimensions like 40x40, 20x20
      const profileMatch = val.match(/(\d+x\d+)/i);
      if (profileMatch) return `ALU ${profileMatch[1]}`;
      // Extract from code like ALU_MILL_1_5 -> ALU 1.5
      const codeMatch = val.match(
        /ALU[_-]?(?:MILL|BRUSH|ANOD)?[_-]?(\d)[_-]?(\d)/i,
      );
      if (codeMatch) return `ALU ${codeMatch[1]}.${codeMatch[2]}`;
      return "ALU";
    }

    // For PVC
    if (
      cat?.includes("PVC") ||
      val.toLowerCase().includes("pvc") ||
      val.toLowerCase().includes("forex")
    ) {
      const thicknessMatch = val.match(/(\d+)\s*mm/i);
      if (thicknessMatch) return `PVC ${thicknessMatch[1]}`;
      if (val.toLowerCase().includes("forex")) return "FOREX";
      return "PVC";
    }

    // For RAL paint - just the 4-digit code
    if (cat?.includes("RAL") || val.toLowerCase().includes("ral")) {
      const ralMatch = val.match(/\b(\d{4})\b/);
      if (ralMatch) return ralMatch[1];
    }

    // For Pantone
    if (cat?.includes("PANTONE") || val.toLowerCase().includes("pantone")) {
      const pantoneMatch = val.match(/(\d+\s*[A-Z]*)/i);
      if (pantoneMatch) return pantoneMatch[1].trim();
    }

    // For LED modules - Brand + Color Temp (e.g., "BaltLed 4500K")
    if (cat?.includes("LED")) {
      const parts: string[] = [];
      const brandMatch = val.match(
        /\b(BaltLed|Sloan|Samsung|Nichia|Osram|Cree|LemLux|LG|Seoul)\b/i,
      );
      if (brandMatch) parts.push(brandMatch[1]);
      const tempMatch = val.match(/(\d{4})\s*[kK]/);
      if (tempMatch) parts.push(`${tempMatch[1]}K`);
      const colorNameMatch = val.match(
        /\b(warm|cold|neutral|daylight|white|rgb)\b/i,
      );
      if (colorNameMatch && parts.length < 2)
        parts.push(colorNameMatch[1].toUpperCase());
      if (parts.length > 0) return parts.join(" ");
      const wattMatch = val.match(/(\d+\.?\d*)\s*[wW]/);
      if (wattMatch) return `${wattMatch[1]}W`;
      return "LED";
    }

    // For PSU - Brand + Watts (e.g., "MeanWell 100W")
    if (cat?.includes("PSU")) {
      const parts: string[] = [];
      const brandMatch = val.match(
        /\b(MeanWell|Mean\s*Well|Philips|Inventronics|Osram|Tridonic)\b/i,
      );
      if (brandMatch) parts.push(brandMatch[1].replace(/\s+/g, ""));
      const wattMatch = val.match(/(\d+)\s*[wW]/);
      if (wattMatch) parts.push(`${wattMatch[1]}W`);
      if (parts.length > 0) return parts.join(" ");
      return "PSU";
    }

    // For Cables/Wire - Dimensions + Color (e.g., "2x0.75 BLACK")
    if (cat?.includes("WIRE") || cat?.includes("CABLE")) {
      const parts: string[] = [];
      const dimsMatch = val.match(/(\d+x[\d.,]+)/i);
      if (dimsMatch) parts.push(dimsMatch[1]);
      const cableColorMatch = val.match(
        /\b(black|white|red|blue|green|grey|gray)\b/i,
      );
      if (cableColorMatch) parts.push(cableColorMatch[1].toUpperCase());
      if (parts.length > 0) return parts.join(" ");
      return "CABLE";
    }

    // Default: try to find a code-like pattern first
    const codePattern = val.match(/\b([A-Z0-9]{3,8})\b/i);
    if (
      codePattern &&
      !/the|and|for|with|board|sheet|foam/i.test(codePattern[1])
    ) {
      return codePattern[1].toUpperCase();
    }
    const words = val
      .split(/[\s_-]+/)
      .filter((w) => w.length > 1 && !/the|and|for|with/i.test(w));
    if (words.length > 0) {
      return words[0].substring(0, 8).toUpperCase();
    }
    return val.substring(0, 8).toUpperCase();
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

    // Priority: metadata.short_name > metadata.colorCode > extracted from code > extracted from name
    const short =
      material.metadata?.short_name ||
      material.metadata?.colorCode ||
      getShortName(material.code, material.category) ||
      getShortName(value, material.category);

    onchange?.({ value, material, hex: material.metadata?.hex || "", shortName: short });
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
      aria-label={placeholder || $t("materialPicker.select", { default: "Select…" })}
      onclick={toggleDropdown}>
      {#if value && (showValueInTrigger || !selectedMaterial)}
        <span class="selected-value">
          {#if showColor && hexColor}
            <span class="color-dot" style:background-color={hexColor}></span>
          {/if}
          <span class="value-text" title={value}>{shortName || value}</span>
        </span>
      {:else}
        <span class="placeholder">{placeholder || $t("materialPicker.select", { default: "Select…" })}</span>
      {/if}
      <ChevronDown size={14} class="chevron" aria-hidden="true" />
    </button>
  {/if}

  {#if open}
    <div class="dropdown" bind:this={panelRef} role="group"
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

  .select-trigger {
    width: 100%;
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
  .custom-color-picker:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
  }

  .selected-value { display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0; }
  .value-text { flex: 1; min-width: 0; overflow-wrap: anywhere; }
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
  .custom-mode { display: flex; align-items: center; min-width: 0; gap: 4px; }
  .custom-color-picker { width: 32px; height: 32px; flex-shrink: 0; padding: 2px; border: 1px solid var(--border); border-radius: 4px; cursor: pointer; background: var(--bg-1, white); }
  .custom-color-picker::-webkit-color-swatch { border: 0; border-radius: 2px; }
  .custom-color-picker::-webkit-color-swatch-wrapper { padding: 0; }
  .custom-text-input { flex: 1; min-width: 0; width: 100%; padding: 6px 8px; border: 1px solid var(--brand); border-radius: 4px; font-size: 12px; background: var(--bg-1, white); color: inherit; min-height: 32px; box-sizing: border-box; }
  .btn-switch-mode { display: flex; align-items: center; justify-content: center; flex-shrink: 0; width: 32px; height: 32px; border: 1px solid var(--border); border-radius: 4px; background: var(--bg-2); cursor: pointer; color: inherit; }
  .btn-switch-mode:hover:not(:disabled) { border-color: var(--brand); }

  @media (pointer: coarse) {
    .select-trigger, .category-option, .option, .category-back, .custom-option, .retry-button, .custom-text-input, .btn-switch-mode, .custom-color-picker { min-height: 44px; }
    .btn-switch-mode, .custom-color-picker { min-width: 40px; }
  }

  @media (prefers-reduced-motion: reduce) {
    .select-trigger, .select-trigger :global(.chevron) { transition: none; }
  }
</style>
