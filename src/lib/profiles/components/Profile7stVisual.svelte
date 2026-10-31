<!-- src/lib/profiles/components/Profile7stVisual.svelte -->
<!-- Clean, scalable work form -->
<script lang="ts">
  /**
   * @file Profile7stVisual.svelte
   * @description A detailed, multi-section form for configuring sign profiles.
   * This component is designed to manage complex production specifications,
   * breaking them down into logical sections like CNC, Bending, Painting, etc.
   * It is highly interactive and emits events whenever the configuration changes.
   *
   * @component
   * @props {ProfileConfiguration} configuration - The main object holding all the form's data.
   *   It is structured by production station (e.g., CNC_FREZER, BENDER).
   * @props {boolean} [readonly=false] - When true, all form inputs are disabled,
   *   making the component a visual display of a profile's configuration.
   *
   * @emits change - Fired whenever any value in the `configuration` object is modified.
   *   The event detail contains the entire updated `configuration` object.
   */
  import MaterialSelect from "./fields/MaterialSelect.svelte";
  import MaterialThicknessSelect from "$lib/components/MaterialThicknessSelect.svelte";
  import { materialColorVariables } from "$lib/materials/selection-colors";
  import "$lib/materials/selection-colors.css";
  import { t } from "svelte-i18n";

  import {
    readFaceMaterials,
    withFaceMaterials,
    applyProfileMaterialSelection,
    nextFaceMaterialId,
    type FaceMaterialSelection,
    type ProfileMaterialChange,
  } from "$lib/profiles/face-materials";
  import {
    type ColorValue,
    defaultColor,
    extractShortName,
    selectionBadgeLabel,
    paintMaterialValue,
    applyPaintMaterialSelection,
  } from "$lib/profiles/helpers";
  import { frameBadgeLabel, readLegacyFrameThickness, withFrameThickness } from "$lib/profiles/frame-sizing";
  import { PROFILE_MATERIAL_CATEGORIES } from "$lib/profiles/material-roles";
  import {
    AlertCircle,
    Zap,
    Power,
    Cable,
    Square,
    Droplets,
    Wrench,
    Paintbrush,
    Layers,
    Scissors,
    StickyNote,
    Sun,
    Moon,
    Check,
    X,
    Plus,
    Trash2,
  } from "lucide-svelte";

  const formId = $props.id();

  // ColorValue is imported from $lib/profiles/helpers (extracted in Phase 6.1).

  /**
   * @typedef {object} ProfileConfiguration
   * @description The main data structure for the form, organized by production station.
   */
  interface ProfileConfiguration {
    profileName?: string;
    signType: "INTERIOR" | "EXTERIOR";

    CNC_FREZER: {
      face: string;
      faceHex?: string;
      faceShort?: string;
      faceThickness?: string;
      faceMaterials?: FaceMaterialSelection[];
      faceCategory?: string;
      faceThicknessOptions?: number[];
      back: string;
      backHex?: string;
      backShort?: string;
      backThickness?: string;
      backCategory?: string;
      backThicknessOptions?: number[];
      laser?: boolean;
      print3d?: boolean;
      print3dMaterial?: string;
      print3dMaterialShort?: string;
      print3dMaterialCategory?: string;
      notes?: string;
    };

    BENDER: {
      sides: string;
      sidesHex?: string;
      sidesShort?: string;
      sidesThickness?: string;
      sidesCategory?: string;
      sidesThicknessOptions?: number[];
      depth: number;
      notes?: string;
    };

    FRONT: {
      face: boolean;
      faceFilm: string;
      faceFilmHex?: string;
      faceFilmShort?: string;
      faceFilmCategory?: string;
      faceCustom?: string;
      back: boolean;
      backFilm: string;
      backFilmHex?: string;
      backFilmShort?: string;
      backFilmCategory?: string;
      backCustom?: string;
      sides: boolean;
      sidesFilm: string;
      sidesFilmHex?: string;
      sidesFilmShort?: string;
      sidesFilmCategory?: string;
      sidesCustom?: string;
      notes?: string;
    };

    PAINTING: {
      face: boolean;
      faceColor: ColorValue;
      faceCustom?: string;
      sides: boolean;
      sidesColor: ColorValue;
      sidesCustom?: string;
      back: boolean;
      backColor: ColorValue;
      backCustom?: string;
      frame: boolean;
      frameColor: ColorValue;
      frameCustom?: string;
      notes?: string;
    };

    ASSEMBLING: {
      led: boolean;
      ledModule: string;
      ledModuleHex?: string;
      ledModuleShort?: string;
      ledModuleCategory?: string;
      ledCustom?: string;

      psu: boolean;
      psuModel: string;
      psuModelShort?: string;
      psuModelCategory?: string;
      psuType: "regular" | "dimmable";
      psuMounting?: string;

      cables: boolean;
      cableType: string;
      cableTypeShort?: string;
      cableTypeCategory?: string;
      cablesLength: string;
      cablesWago: boolean;
      cablesConnector?: string;
      cablesConnectorShort?: string;
      cablesConnectorCategory?: string;

      frame: boolean;
      frameMaterial: string;
      frameMaterialHex?: string;
      frameMaterialShort?: string;
      frameMaterialCategory?: string;
      frameThickness?: string;
      frameThicknessOptions?: number[];
      frameDimensions?: string;
      frameCustom?: string;
      frameWaterholes: boolean;
      frameMountingHoles: boolean;

      shablon?: boolean;
      notes?: string;
    };
  }

  // defaultColor + helper fns are imported from $lib/profiles/helpers.

  // A baseline configuration to ensure all necessary properties are present.
  const defaultConfiguration: ProfileConfiguration = {
    profileName: "New Profile",
    signType: "EXTERIOR",
    CNC_FREZER: { face: "", back: "", laser: false, print3d: false, print3dMaterial: "", notes: "" },
    BENDER: { sides: "", depth: 100, notes: "" },
    FRONT: {
      face: false,
      faceFilm: "",
      faceCustom: "",
      back: false,
      backFilm: "",
      backCustom: "",
      sides: false,
      sidesFilm: "",
      sidesCustom: "",
      notes: "",
    },
    PAINTING: {
      face: false,
      faceColor: { ...defaultColor },
      faceCustom: "",
      sides: true,
      sidesColor: { ...defaultColor },
      sidesCustom: "",
      back: false,
      backColor: { ...defaultColor },
      backCustom: "",
      frame: false,
      frameColor: { ...defaultColor },
      frameCustom: "",
      notes: "",
    },
    ASSEMBLING: {
      led: true,
      ledModule: "",
      ledCustom: "",
      psu: true,
      psuModel: "",
      psuType: "regular",
      psuMounting: "",
      cables: true,
      cableType: "",
      cablesLength: "2m",
      cablesWago: false,
      cablesConnector: "",
      frame: true,
      frameMaterial: "",
      frameDimensions: "40x40x2",
      frameCustom: "",
      frameWaterholes: true,
      frameMountingHoles: false,
      shablon: false,
      notes: "",
    },
  };

  /** Props for the profile form. */
  let {
    /** The configuration object for the profile form. */
    configuration: incomingConfiguration = $bindable({}),
    /** If true, disables all inputs, making the form read-only. */
    readonly = false,
    /** Callback for configuration changes. */
    onchange,
  }: {
    configuration?: Partial<ProfileConfiguration> | null;
    readonly?: boolean;
    onchange?: (config: ProfileConfiguration) => void;
  } = $props();

  import { onDestroy, untrack } from "svelte";

  function normalizeConfiguration(value: Partial<ProfileConfiguration> | null | undefined): ProfileConfiguration {
      const currentConfig = value ?? {};
      return {
        ...defaultConfiguration,
        ...currentConfig,
        CNC_FREZER: {
          ...defaultConfiguration.CNC_FREZER,
          ...(currentConfig.CNC_FREZER || {}),
          // MaterialSelect's bindable value has a string fallback. Legacy
          // profiles must supply a concrete value before mounting this picker.
          print3dMaterial: currentConfig.CNC_FREZER?.print3dMaterial ?? "",
          backThickness: currentConfig.CNC_FREZER?.backThickness ?? "",
          // Hydration only: legacy scalar selections are untouched until an edit.
          faceMaterials: readFaceMaterials(currentConfig.CNC_FREZER),
        },
        BENDER: {
          ...defaultConfiguration.BENDER,
          ...(currentConfig.BENDER || {}),
          sidesThickness: currentConfig.BENDER?.sidesThickness ?? "",
        },
        FRONT: {
          ...defaultConfiguration.FRONT,
          ...(currentConfig.FRONT || {}),
        },
        PAINTING: {
          ...defaultConfiguration.PAINTING,
          ...(currentConfig.PAINTING || {}),
          faceColor: {
            ...defaultColor,
            ...(currentConfig.PAINTING?.faceColor || {}),
          },
          sidesColor: {
            ...defaultColor,
            ...(currentConfig.PAINTING?.sidesColor || {}),
          },
          backColor: {
            ...defaultColor,
            ...(currentConfig.PAINTING?.backColor || {}),
          },
          frameColor: {
            ...defaultColor,
            ...(currentConfig.PAINTING?.frameColor || {}),
          },
        },
        ASSEMBLING: {
          ...defaultConfiguration.ASSEMBLING,
          ...(currentConfig.ASSEMBLING || {}),
          cablesConnector: currentConfig.ASSEMBLING?.cablesConnector ?? "",
          frameThickness: currentConfig.ASSEMBLING?.frameThickness ??
            readLegacyFrameThickness(currentConfig.ASSEMBLING?.frameDimensions),
        },
      };
  }

  // The first render needs complete sections too: effects run after rendering.
  // Keep normalization local so opening an old profile never edits its source.
  let configuration = $state(normalizeConfiguration(untrack(() => incomingConfiguration)));

  $effect(() => {
    const nextConfiguration = normalizeConfiguration(incomingConfiguration);
    const fingerprint = JSON.stringify(nextConfiguration);
    untrack(() => {
      if (JSON.stringify(configuration) !== fingerprint) configuration = nextConfiguration;
    });
  });

  // A role also filters the physical form of legacy materials within a category.
  const faceMaterials = PROFILE_MATERIAL_CATEGORIES.face;
  const backMaterials = PROFILE_MATERIAL_CATEGORIES.back;
  const sidesMaterials = PROFILE_MATERIAL_CATEGORIES.sides;
  const filmCategories = ["VINYL_ORACAL"];
  const paintCategories = ["PAINT_RAL", "PAINT_PANTONE"];
  const ledCategories = ["LED_MODULE", "LED_STRIP", "LED_NEON"];
  const psuCategories = ["PSU_MEANWELL"];
  const wireCategories = PROFILE_MATERIAL_CATEGORIES.mainCable;
  const connectorCategories = ["LED_ACCESSORY"];
  const frameMaterials = PROFILE_MATERIAL_CATEGORIES.frame;
  const print3dMaterials = ["FDM_PLA", "FDM_PETG", "FDM_ABS", "FDM_ASA", "FDM_TPU", "FDM_OTHER", "RESIN_ANYCUBIC", "RESIN_ELEGOO", "RESIN_OTHER"];

  let faceEntries = $derived(
    configuration.CNC_FREZER.faceMaterials ?? readFaceMaterials(configuration.CNC_FREZER),
  );

  function addFaceMaterial() {
    if (readonly) return;
    configuration.CNC_FREZER.faceMaterials = [
      ...faceEntries,
      { id: nextFaceMaterialId(faceEntries), value: "" },
    ];
    emit();
  }

  function removeFaceMaterial(id: string) {
    if (readonly) return;
    configuration.CNC_FREZER.faceMaterials = faceEntries.filter(entry => entry.id !== id);
    emit();
  }

  function selectFaceMaterial(entry: FaceMaterialSelection, data: ProfileMaterialChange) {
    if (readonly) return;
    Object.assign(entry, applyProfileMaterialSelection(entry, data));
    emit();
  }

  function selectBackMaterial(data: ProfileMaterialChange) {
    if (readonly) return;
    const entry = applyProfileMaterialSelection({
      id: "back", value: configuration.CNC_FREZER.back,
      thickness: configuration.CNC_FREZER.backThickness,
      category: configuration.CNC_FREZER.backCategory,
    }, data, "ALU");
    Object.assign(configuration.CNC_FREZER, {
      back: entry.value, backHex: entry.hex, backShort: entry.shortName,
      backThickness: entry.thickness, backCategory: entry.category,
      backThicknessOptions: entry.thicknessOptions,
    });
    emit();
  }

  function selectSidesMaterial(data: ProfileMaterialChange) {
    if (readonly) return;
    const entry = applyProfileMaterialSelection({
      id: "sides", value: configuration.BENDER.sides,
      thickness: configuration.BENDER.sidesThickness,
      category: configuration.BENDER.sidesCategory,
    }, data, "ALU");
    Object.assign(configuration.BENDER, {
      sides: entry.value, sidesHex: entry.hex, sidesShort: entry.shortName,
      sidesThickness: entry.thickness, sidesCategory: entry.category,
      sidesThicknessOptions: entry.thicknessOptions,
    });
    emit();
  }

  function selectFrameMaterial(data: ProfileMaterialChange) {
    if (readonly) return;
    const entry = applyProfileMaterialSelection({
      id: "frame", value: configuration.ASSEMBLING.frameMaterial,
      thickness: configuration.ASSEMBLING.frameThickness,
      category: configuration.ASSEMBLING.frameMaterialCategory,
    }, data, "ALU");
    Object.assign(configuration.ASSEMBLING, {
      frameMaterial: entry.value, frameMaterialHex: entry.hex, frameMaterialShort: entry.shortName,
      frameThickness: entry.thickness, frameMaterialCategory: entry.category,
      frameThicknessOptions: entry.thicknessOptions,
      frameDimensions: withFrameThickness(configuration.ASSEMBLING.frameDimensions, entry.thickness),
    });
    emit();
  }

  function changeFrameThickness() {
    configuration.ASSEMBLING.frameDimensions = withFrameThickness(
      configuration.ASSEMBLING.frameDimensions, configuration.ASSEMBLING.frameThickness,
    );
    emit();
  }

  function changeFrameDimensions(event: Event) {
    if (readonly) return;
    const dimensions = (event.currentTarget as HTMLInputElement).value;
    configuration.ASSEMBLING.frameDimensions = dimensions;
    const embeddedThickness = readLegacyFrameThickness(dimensions);
    if (embeddedThickness) configuration.ASSEMBLING.frameThickness = embeddedThickness;
    emit();
  }

  let emitQueued = false;
  let destroyed = false;
  onDestroy(() => { destroyed = true; });

  /** Forward explicit edits after Svelte finishes the current DOM bindings. */
  function emit() {
    if (readonly || destroyed || emitQueued) return;
    emitQueued = true;
    // oninput/onchange runs before bind:value/bind:checked updates the model.
    // Parents clone this snapshot immediately, so synchronous forwarding would
    // persist the previous character or checkbox state. Coalesce one DOM turn.
    queueMicrotask(() => {
      emitQueued = false;
      if (readonly || destroyed) return;
      configuration.CNC_FREZER = withFaceMaterials(configuration.CNC_FREZER, faceEntries);
      incomingConfiguration = configuration;
      onchange?.(configuration);
    });
  }

  // A derived variable to determine if the "FRONT" section should be expanded.
  let hasFront = $derived(
    configuration.FRONT.face ||
      configuration.FRONT.back ||
      configuration.FRONT.sides,
  );

  let isRoundFrame = $derived(
    // A tube may be square. Only explicit round/diameter notation earns the
    // diameter label; a generic tube or 40x40 profile keeps the frame-size label.
    /\b(?:round|circular)\b|(?:^|[\s_(])(?:D|Ø|⌀)\s*\d/i.test([
      configuration.ASSEMBLING.frameMaterial,
      configuration.ASSEMBLING.frameMaterialShort,
      configuration.ASSEMBLING.frameDimensions,
    ].filter(Boolean).join(" ")),
  );
</script>

<div class="profile-form" class:readonly>
  <!-- HEADER -->
  <div class="form-header">
    <div class="profile-name">
      <input
        type="text"
        bind:value={configuration.profileName}
        aria-label={$t('profiles.materials.profileName')}
        placeholder={$t('profiles.materials.profileName')}
        disabled={readonly}
        oninput={emit}
      />
    </div>
    <div class="sign-toggle" role="group" aria-label={$t('profiles.materials.signEnvironment')}>
      <button
        type="button"
        class:active={configuration.signType === "EXTERIOR"}
        aria-pressed={configuration.signType === "EXTERIOR"}
        disabled={readonly}
        onclick={() => {
          configuration.signType = "EXTERIOR";
          emit();
        }}
      >
        <Sun size={14} /> {$t('profiles.materials.outdoor')}
      </button>
      <button
        type="button"
        class:active={configuration.signType === "INTERIOR"}
        aria-pressed={configuration.signType === "INTERIOR"}
        disabled={readonly}
        onclick={() => {
          configuration.signType = "INTERIOR";
          emit();
        }}
      >
        <Moon size={14} /> {$t('profiles.materials.indoor')}
      </button>
    </div>
  </div>

  <!-- MAIN GRID -->
  <div class="form-grid">
    <!-- CNC FREZER -->
    <div class="section">
      <div class="section-title"><Scissors size={12} /> CNC FREZER</div>
      <div class="section-content">
        <!-- FACE -->
        <div class="field face-materials">
          <span class="field-label">FACE</span>
          {#each faceEntries as material, index (material.id)}
            <div class="face-material-entry" role="group"
              aria-label={$t('profiles.materials.faceNumber', { number: index + 1 })}>
              {#if faceEntries.length > 1}
                <div class="face-material-heading">
                  <span>{$t('profiles.materials.faceNumber', { number: index + 1 })}</span>
                  {#if !readonly}
                    <button type="button" class="remove-face"
                      aria-label={$t('profiles.materials.removeFace', { number: index + 1 })}
                      title={$t('profiles.materials.removeFace', { number: index + 1 })}
                      onclick={() => removeFaceMaterial(material.id)}>
                      <Trash2 size={14} />
                    </button>
                  {/if}
                </div>
              {/if}
              <div class="picker-row">
                <MaterialSelect
                  bind:value={material.value}
                  label={$t('profiles.materials.faceNumber', { number: index + 1 })}
                  selectedCategory={material.category}
                  customColor={material.hex ?? ""}
                  categories={faceMaterials}
                  materialRole="face"
                  allowCustom={true}
                  {readonly}
                  onchange={(data) => selectFaceMaterial(material, data)}
                />
              </div>
              {#if material.value}
                <span class="material-badge-lg material-context material-swatch"
                  data-material-tone="face" style={materialColorVariables('face', material.hex)}>
                  {selectionBadgeLabel(material.value, material.shortName, material.category || "ACRYLIC")}{#if material.thickness}/{material.thickness}{/if}
                </span>
                <MaterialThicknessSelect
                  bind:value={material.thickness}
                  materialType={material.category || material.value}
                  thicknessOptions={material.thicknessOptions}
                  autoSelectLowest={false}
                  label={`${$t('profiles.materials.faceNumber', { number: index + 1 })} · ${$t('materialThickness.select')}`}
                  {readonly}
                  onchange={emit}
                />
              {/if}
            </div>
          {/each}
          {#if !readonly}
            <button type="button" class="add-face" onclick={addFaceMaterial}>
              <Plus size={14} /> {$t('profiles.materials.addFace')}
            </button>
          {/if}
        </div>

        <!-- BACK -->
        <fieldset class="field">
          <legend class="field-label">BACK</legend>
          <div class="picker-row">
            <MaterialSelect
              bind:value={configuration.CNC_FREZER.back}
              label="BACK"
              selectedCategory={configuration.CNC_FREZER.backCategory}
              customColor={configuration.CNC_FREZER.backHex ?? ""}
              categories={backMaterials}
              materialRole="back"
              allowCustom={true}
              {readonly}
              onchange={selectBackMaterial}
            />
          </div>
          {#if configuration.CNC_FREZER.back}
            <span
              class="material-badge-lg material-context material-swatch"
              data-material-tone="back" style={materialColorVariables('back', configuration.CNC_FREZER.backHex)}
            >
              {selectionBadgeLabel(configuration.CNC_FREZER.back, configuration.CNC_FREZER.backShort, configuration.CNC_FREZER.backCategory || "ALU")}{#if configuration.CNC_FREZER.backThickness}/{configuration.CNC_FREZER.backThickness}{/if}
            </span>
            <MaterialThicknessSelect
              bind:value={configuration.CNC_FREZER.backThickness}
              materialType={configuration.CNC_FREZER.backCategory || configuration.CNC_FREZER.back}
              thicknessOptions={configuration.CNC_FREZER.backThicknessOptions}
              autoSelectLowest={false}
              label={`BACK · ${$t('materialThickness.select')}`}
              {readonly}
              onchange={emit}
            />
          {/if}
        </fieldset>

        <!-- Options -->
        <div class="options">
          <label class="option" class:active={configuration.CNC_FREZER.laser}>
            <input
              type="checkbox"
              bind:checked={configuration.CNC_FREZER.laser}
              disabled={readonly}
              onchange={emit}
            />
            <Scissors size={12} /> LASER
          </label>
          <label class="option" class:active={configuration.CNC_FREZER.print3d}>
            <input
              type="checkbox"
              bind:checked={configuration.CNC_FREZER.print3d}
              disabled={readonly}
              onchange={emit}
            />
            <Layers size={12} /> 3D
          </label>
        </div>

        {#if configuration.CNC_FREZER.print3d}
          <fieldset class="field print3d-material">
            <legend class="field-label">{$t('profiles.materials.print3d', { default: '3D printing material' })}</legend>
            <MaterialSelect
              bind:value={configuration.CNC_FREZER.print3dMaterial}
              label={$t('profiles.materials.print3d', { default: '3D printing material' })}
              selectedCategory={configuration.CNC_FREZER.print3dMaterialCategory}
              categories={print3dMaterials}
              allowCustom={true}
              showColor={false}
              {readonly}
              onchange={(data) => {
                configuration.CNC_FREZER.print3dMaterialShort = extractShortName(data, "FDM");
                configuration.CNC_FREZER.print3dMaterialCategory = data.material?.category || "";
                emit();
              }}
            />
            {#if configuration.CNC_FREZER.print3dMaterial}
              <span class="material-badge-lg print3d-badge material-context material-swatch"
                data-material-tone="print3d" style={materialColorVariables('print3d')}>
                <Layers size={16} />
                {selectionBadgeLabel(configuration.CNC_FREZER.print3dMaterial, configuration.CNC_FREZER.print3dMaterialShort, "FDM")}
              </span>
            {/if}
          </fieldset>
        {/if}

        <div
          class="notes-field"
          class:has-note={configuration.CNC_FREZER.notes}
        >
          {#if configuration.CNC_FREZER.notes}
            <span class="note-icon"><AlertCircle size={14} /></span>
          {/if}
          <StickyNote size={12} class="note-placeholder-icon" />
          <textarea
            class="notes"
            bind:value={configuration.CNC_FREZER.notes}
            disabled={readonly}
            oninput={emit}
            placeholder="Notes..."
            rows="2"
          ></textarea>
        </div>
      </div>
    </div>

    <!-- BENDER -->
    <div class="section section-sm">
      <div class="section-title"><Square size={12} /> BENDER</div>
      <div class="section-content">
        <fieldset class="field">
          <legend class="field-label">SIDES</legend>
          <div class="picker-row">
            <MaterialSelect
              bind:value={configuration.BENDER.sides}
              label="SIDES"
              selectedCategory={configuration.BENDER.sidesCategory}
              customColor={configuration.BENDER.sidesHex ?? ""}
              categories={sidesMaterials}
              materialRole="sides"
              allowCustom={true}
              {readonly}
              onchange={selectSidesMaterial}
            />
          </div>
          {#if configuration.BENDER.sides}
            <span
              class="material-badge-lg material-context material-swatch"
              data-material-tone="sides" style={materialColorVariables('sides', configuration.BENDER.sidesHex)}
            >
              {selectionBadgeLabel(configuration.BENDER.sides, configuration.BENDER.sidesShort, configuration.BENDER.sidesCategory || "ALU")}{#if configuration.BENDER.sidesThickness}/{configuration.BENDER.sidesThickness}{/if}
            </span>
            <MaterialThicknessSelect
              bind:value={configuration.BENDER.sidesThickness}
              materialType={configuration.BENDER.sidesCategory || configuration.BENDER.sides}
              thicknessOptions={configuration.BENDER.sidesThicknessOptions}
              autoSelectLowest={false}
              label={`SIDES · ${$t('materialThickness.select')}`}
              {readonly}
              onchange={emit}
            />
          {/if}
        </fieldset>

        <div class="depth-box">
          <label for={`${formId}-depth`}>DEPTH</label>
          <input
            id={`${formId}-depth`}
            type="number"
            class="depth-input"
            bind:value={configuration.BENDER.depth}
            disabled={readonly}
            oninput={emit}
            min="30"
            max="500"
          />
        </div>

        <div class="notes-field" class:has-note={configuration.BENDER.notes}>
          {#if configuration.BENDER.notes}
            <span class="note-icon"><AlertCircle size={14} /></span>
          {/if}
          <StickyNote size={12} class="note-placeholder-icon" />
          <textarea
            class="notes"
            bind:value={configuration.BENDER.notes}
            disabled={readonly}
            oninput={emit}
            placeholder="Notes..."
            rows="2"
          ></textarea>
        </div>
      </div>
    </div>

    <!-- FRONT (Film) -->
    <div class="section" class:collapsed={!hasFront}>
      <div class="section-title">
        <Layers size={12} /> FRONT <span class="hint">(Film)</span>
      </div>
      <div class="section-content">
        {#each ["face", "back", "sides"] as part}
          <div class="inline-field">
            <label
              class="toggle-label"
              class:active={configuration.FRONT[part]}
            >
              <input
                type="checkbox"
                bind:checked={configuration.FRONT[part]}
                disabled={readonly}
                onchange={emit}
              />
              {part.toUpperCase()}
            </label>
            {#if configuration.FRONT[part]}
              <div class="picker-row">
                <MaterialSelect
                  bind:value={configuration.FRONT[`${part}Film`]}
                  label={`FRONT · ${part.toUpperCase()}`}
                  customColor={configuration.FRONT[`${part}FilmHex`] ?? ""}
                  selectedCategory={configuration.FRONT[`${part}FilmCategory`]}
                  categories={filmCategories}
                  allowCustom={true}
                  {readonly}
                  onchange={(data) => {
                    configuration.FRONT[`${part}FilmHex`] = data.hex;
                    configuration.FRONT[`${part}FilmCategory`] = data.material?.category || "";
                    configuration.FRONT[`${part}FilmShort`] = extractShortName(
                      data,
                      "ORACAL",
                    );
                    emit();
                  }}
                />
                {#if configuration.FRONT[`${part}Film`]}
                  <span
                    class="material-badge-lg material-context material-swatch"
                    data-material-tone="film" style={materialColorVariables('film', configuration.FRONT[`${part}FilmHex`])}
                  >
                    {selectionBadgeLabel(configuration.FRONT[`${part}Film`], configuration.FRONT[`${part}FilmShort`], "ORACAL")}
                  </span>
                {/if}
              </div>
              <input
                type="text"
                class="custom-input"
                bind:value={configuration.FRONT[`${part}Custom`]}
                disabled={readonly}
                oninput={emit}
                placeholder="Custom..."
              />
            {/if}
          </div>
        {/each}

        <div class="notes-field" class:has-note={configuration.FRONT.notes}>
          {#if configuration.FRONT.notes}
            <span class="note-icon"><AlertCircle size={14} /></span>
          {/if}
          <StickyNote size={12} class="note-placeholder-icon" />
          <textarea
            class="notes"
            bind:value={configuration.FRONT.notes}
            disabled={readonly}
            oninput={emit}
            placeholder="Notes..."
            rows="2"
          ></textarea>
        </div>
      </div>
    </div>

    <!-- PAINTING -->
    <div class="section section-lg">
      <div class="section-title"><Paintbrush size={12} /> PAINTING</div>
      <div class="section-content">
        <div class="paint-grid">
          {#each [{ key: "face", label: "FRONT" }, { key: "sides", label: "SIDES" }, { key: "back", label: "BACK" }, { key: "frame", label: "FRAME" }] as item}
            <div
              class="paint-item"
              class:inactive={!configuration.PAINTING[item.key]}
            >
              <label
                class="paint-label"
                class:active={configuration.PAINTING[item.key]}
              >
                <input
                  type="checkbox"
                  bind:checked={configuration.PAINTING[item.key]}
                  disabled={readonly}
                  onchange={emit}
                />
                {item.label}
              </label>
              {#if configuration.PAINTING[item.key]}
                <MaterialSelect
                  value={paintMaterialValue(configuration.PAINTING[`${item.key}Color`])}
                  label={`PAINTING · ${item.label}`}
                  customColor={configuration.PAINTING[`${item.key}Color`].hex ?? ""}
                  selectedCategory={configuration.PAINTING[`${item.key}Color`].system?.toUpperCase() === 'PANTONE'
                    ? 'PAINT_PANTONE' : configuration.PAINTING[`${item.key}Color`].system?.toUpperCase() === 'RAL' ? 'PAINT_RAL' : ''}
                  categories={paintCategories}
                  allowCustom={true}
                  {readonly}
                  onchange={(data) => {
                    configuration.PAINTING[`${item.key}Color`] = applyPaintMaterialSelection(data);
                    emit();
                  }}
                />
                {#if configuration.PAINTING[`${item.key}Color`].code}
                  <span
                    class="ral-badge material-context material-swatch"
                    data-material-tone="paint" style={materialColorVariables('paint', configuration.PAINTING[`${item.key}Color`].hex)}
                  >
                    {configuration.PAINTING[`${item.key}Color`].code}
                  </span>
                {/if}
                <input
                  type="text"
                  class="custom-input"
                  bind:value={configuration.PAINTING[`${item.key}Custom`]}
                  disabled={readonly}
                  oninput={emit}
                  placeholder="Custom..."
                />
              {:else}
                <span class="no-badge">NO</span>
              {/if}
            </div>
          {/each}
        </div>

        <div class="notes-field" class:has-note={configuration.PAINTING.notes}>
          {#if configuration.PAINTING.notes}
            <span class="note-icon"><AlertCircle size={14} /></span>
          {/if}
          <StickyNote size={12} class="note-placeholder-icon" />
          <textarea
            class="notes"
            bind:value={configuration.PAINTING.notes}
            disabled={readonly}
            oninput={emit}
            placeholder="Notes..."
            rows="2"
          ></textarea>
        </div>
      </div>
    </div>

    <!-- ASSEMBLING -->
    <div class="section section-xl">
      <div class="section-title"><Wrench size={12} /> ASSEMBLING</div>
      <div class="section-content">
        <div class="assembly-grid-2x2">
          <!-- LED -->
          <div class="assembly-item material-context"
            class:configured={Boolean(configuration.ASSEMBLING.led && configuration.ASSEMBLING.ledModule)}
            data-material-tone="led" style={materialColorVariables('led')}>
            <div class="item-header">
              <label
                class="toggle-label"
                class:active={configuration.ASSEMBLING.led}
              >
                <input
                  type="checkbox"
                  bind:checked={configuration.ASSEMBLING.led}
                  disabled={readonly}
                  onchange={emit}
                />
                <Zap size={14} /> LED
              </label>
            </div>
            {#if configuration.ASSEMBLING.led}
              <div class="picker-row">
                <MaterialSelect
                  bind:value={configuration.ASSEMBLING.ledModule}
                  label="LED"
                  selectedCategory={configuration.ASSEMBLING.ledModuleCategory}
                  categories={ledCategories}
                  summaryKind="led"
                  allowCustom={true}
                  showColor={false}
                  {readonly}
                  onchange={(data) => {
                    configuration.ASSEMBLING.ledModuleHex = data.hex;
                    configuration.ASSEMBLING.ledModuleCategory = data.material?.category || "";
                    configuration.ASSEMBLING.ledModuleShort = extractShortName(
                      data,
                      "LED",
                    );
                    emit();
                  }}
                />
              </div>
            {:else}
              <span class="no-badge-lg"><X size={14} /> NO LED</span>
            {/if}
          </div>

          <!-- PSU -->
          <div class="assembly-item material-context"
            class:configured={Boolean(configuration.ASSEMBLING.psu && configuration.ASSEMBLING.psuModel)}
            data-material-tone="psu" style={materialColorVariables('psu')}>
            <div class="item-header">
              <label
                class="toggle-label"
                class:active={configuration.ASSEMBLING.psu}
              >
                <input
                  type="checkbox"
                  bind:checked={configuration.ASSEMBLING.psu}
                  disabled={readonly}
                  onchange={emit}
                />
                <Power size={14} /> PSU
              </label>
            </div>
            {#if configuration.ASSEMBLING.psu}
              <div class="psu-type" role="radiogroup"
                aria-label={$t("profiles.materials.psuType", { default: "Power supply type" })}>
                <label
                  class:active={configuration.ASSEMBLING.psuType === "regular"}
                >
                  <input
                    type="radio"
                    name={`${formId}-psu-type`}
                    bind:group={configuration.ASSEMBLING.psuType}
                    value="regular"
                    disabled={readonly}
                    onchange={emit}
                  />
                  <Sun size={12} /> {$t('profiles.materials.regular')}
                </label>
                <label
                  class:active={configuration.ASSEMBLING.psuType === "dimmable"}
                >
                  <input
                    type="radio"
                    name={`${formId}-psu-type`}
                    bind:group={configuration.ASSEMBLING.psuType}
                    value="dimmable"
                    disabled={readonly}
                    onchange={emit}
                  />
                  <Moon size={12} /> {$t('profiles.materials.dimmable')}
                </label>
              </div>
              <div class="picker-row">
                <MaterialSelect
                  bind:value={configuration.ASSEMBLING.psuModel}
                  label="PSU"
                  selectedCategory={configuration.ASSEMBLING.psuModelCategory}
                  categories={psuCategories}
                  summaryKind="psu"
                  allowCustom={true}
                  showColor={false}
                  {readonly}
                  onchange={(data) => {
                    configuration.ASSEMBLING.psuModelCategory = data.material?.category || "";
                    configuration.ASSEMBLING.psuModelShort = extractShortName(
                      data,
                      "PSU",
                    );
                    emit();
                  }}
                />
              </div>
              <div class="field">
                <label for={`${formId}-psu-mounting`}>{$t('profiles.materials.psuMounting')}</label>
                <input
                  id={`${formId}-psu-mounting`}
                  type="text"
                  class="custom-input"
                  bind:value={configuration.ASSEMBLING.psuMounting}
                  disabled={readonly}
                  oninput={emit}
                />
              </div>
            {:else}
              <span class="no-badge-lg"><X size={14} /> NO PSU</span>
            {/if}
          </div>

          <!-- CABLES -->
          <div class="assembly-item material-context"
            class:configured={Boolean(configuration.ASSEMBLING.cables && configuration.ASSEMBLING.cableType)}
            data-material-tone="cable" style={materialColorVariables('cable')}>
            <div class="item-header">
              <label
                class="toggle-label"
                class:active={configuration.ASSEMBLING.cables}
              >
                <input
                  type="checkbox"
                  bind:checked={configuration.ASSEMBLING.cables}
                  disabled={readonly}
                  onchange={emit}
                />
                <Cable size={14} /> {$t('profiles.materials.mainCable')}
              </label>
            </div>
            {#if configuration.ASSEMBLING.cables}
              <div class="cable-row">
                <MaterialSelect
                  bind:value={configuration.ASSEMBLING.cableType}
                  label={$t('profiles.materials.mainCable')}
                  selectedCategory={configuration.ASSEMBLING.cableTypeCategory}
                  categories={wireCategories}
                  materialRole="mainCable"
                  summaryKind="cable"
                  selectionLength={configuration.ASSEMBLING.cablesLength}
                  allowCustom={true}
                  showColor={false}
                  {readonly}
                  onchange={(data) => {
                    configuration.ASSEMBLING.cableTypeCategory = data.material?.category || "";
                    configuration.ASSEMBLING.cableTypeShort = extractShortName(
                      data,
                      "WIRE",
                    );
                    emit();
                  }}
                />
                <div class="field cable-length">
                  <label for={`${formId}-cable-length`}>{$t('profiles.materials.cableLength')}</label>
                  <input
                    id={`${formId}-cable-length`}
                    type="text"
                    class="length-input"
                    bind:value={configuration.ASSEMBLING.cablesLength}
                    disabled={readonly}
                    oninput={emit}
                    placeholder="2 m"
                  />
                </div>
              </div>
              <label
                class="wago-label"
                class:active={configuration.ASSEMBLING.cablesWago}
              >
                <input
                  type="checkbox"
                  bind:checked={configuration.ASSEMBLING.cablesWago}
                  disabled={readonly}
                  onchange={emit}
                />
                <span class="wago-badge material-context" style={materialColorVariables('connector')}><span aria-hidden="true">{configuration.ASSEMBLING.cablesWago ? "✓" : ""}</span> WAGO</span>
              </label>
              {#if configuration.ASSEMBLING.cablesWago}
                <fieldset class="field connector-material">
                  <legend class="field-label">{$t('profiles.materials.connector', { default: 'Connector model' })}</legend>
                  <MaterialSelect
                    bind:value={configuration.ASSEMBLING.cablesConnector}
                    label={$t('profiles.materials.connector', { default: 'Connector model' })}
                    selectedCategory={configuration.ASSEMBLING.cablesConnectorCategory}
                    categories={connectorCategories}
                    showColor={false}
                    allowCustom={true}
                    {readonly}
                    onchange={(data) => {
                      configuration.ASSEMBLING.cablesConnectorShort = extractShortName(data, 'LED_ACCESSORY');
                      configuration.ASSEMBLING.cablesConnectorCategory = data.material?.category || '';
                      emit();
                    }}
                  />
                  {#if configuration.ASSEMBLING.cablesConnector}
                    <span class="material-badge-lg connector-badge material-context material-swatch"
                      data-material-tone="connector" style={materialColorVariables('connector')}>
                      <Cable size={16} />
                      {selectionBadgeLabel(configuration.ASSEMBLING.cablesConnector, configuration.ASSEMBLING.cablesConnectorShort, 'LED_ACCESSORY')}
                    </span>
                  {/if}
                </fieldset>
              {/if}
            {:else}
              <span class="no-badge-lg"><X size={14} /> NO CABLES</span>
            {/if}
          </div>

          <!-- FRAME -->
          <div class="assembly-item material-context"
            class:configured={Boolean(configuration.ASSEMBLING.frame && configuration.ASSEMBLING.frameMaterial)}
            data-material-tone="frame" style={materialColorVariables('frame')}>
            <div class="item-header">
              <label
                class="toggle-label"
                class:active={configuration.ASSEMBLING.frame}
              >
                <input
                  type="checkbox"
                  bind:checked={configuration.ASSEMBLING.frame}
                  disabled={readonly}
                  onchange={emit}
                />
                <Square size={14} /> FRAME
              </label>
            </div>
            {#if configuration.ASSEMBLING.frame}
              <div class="picker-row">
                <MaterialSelect
                  bind:value={configuration.ASSEMBLING.frameMaterial}
                  label="FRAME"
                  selectedCategory={configuration.ASSEMBLING.frameMaterialCategory}
                  customColor={configuration.ASSEMBLING.frameMaterialHex ?? ""}
                  categories={frameMaterials}
                  materialRole="frame"
                  allowCustom={true}
                  {readonly}
                  onchange={selectFrameMaterial}
                />
              </div>
              {#if configuration.ASSEMBLING.frameMaterial}
                <span
                  class="material-badge-lg material-context material-swatch"
                  data-material-tone="frame" style={materialColorVariables('frame', configuration.ASSEMBLING.frameMaterialHex)}
                >
                  <Square size={16} />
                  {frameBadgeLabel(
                    selectionBadgeLabel(configuration.ASSEMBLING.frameMaterial, configuration.ASSEMBLING.frameMaterialShort, configuration.ASSEMBLING.frameMaterialCategory || "ALU"),
                    configuration.ASSEMBLING.frameDimensions, configuration.ASSEMBLING.frameThickness,
                  )}
                </span>
                <MaterialThicknessSelect
                  bind:value={configuration.ASSEMBLING.frameThickness}
                  materialType={configuration.ASSEMBLING.frameMaterialCategory || configuration.ASSEMBLING.frameMaterial}
                  thicknessOptions={configuration.ASSEMBLING.frameThicknessOptions}
                  autoSelectLowest={false}
                  label={`FRAME · ${$t('materialThickness.select')}`}
                  {readonly}
                  onchange={changeFrameThickness}
                />
                <div class="field">
                  <label for={`${formId}-frame-size`}>{isRoundFrame ? "DIAMETER (mm)" : "FRAME SIZE"}</label>
                  <input
                    id={`${formId}-frame-size`}
                    type="text"
                    value={configuration.ASSEMBLING.frameDimensions}
                    placeholder={isRoundFrame ? "e.g. D20" : "e.g. 40x40"}
                    disabled={readonly}
                    oninput={changeFrameDimensions}
                    class="custom-input"
                  />
                </div>
              {/if}
              <div class="frame-options">
                <label
                  class="opt waterholes"
                  class:active={configuration.ASSEMBLING.frameWaterholes}
                >
                  <input
                    type="checkbox"
                    bind:checked={configuration.ASSEMBLING.frameWaterholes}
                    aria-label={$t("profiles.materials.frameWaterholes", { default: "Frame waterholes" })}
                    disabled={readonly}
                    onchange={emit}
                  />
                  <Droplets size={12} /> WATER
                </label>
                <label
                  class="opt warning"
                  class:active={configuration.ASSEMBLING.frameMountingHoles}
                >
                  <input
                    type="checkbox"
                    bind:checked={configuration.ASSEMBLING.frameMountingHoles}
                    aria-label={$t("profiles.materials.frameMountingHoles", { default: "Frame mounting holes" })}
                    disabled={readonly}
                    onchange={emit}
                  />
                  <AlertCircle size={12} /> MOUNT
                </label>
              </div>
            {:else}
              <span class="no-badge-lg"><X size={14} /> NO FRAME</span>
            {/if}
          </div>
        </div>

        <!-- Bottom options -->
        <div class="assembly-extras">
          <label class="extra" class:active={configuration.ASSEMBLING.shablon}>
            <input
              type="checkbox"
              bind:checked={configuration.ASSEMBLING.shablon}
              aria-label={$t("profiles.materials.template", { default: "Template" })}
              disabled={readonly}
              onchange={emit}
            />
            <Layers size={14} /> SHABLON
          </label>
          {#if !configuration.ASSEMBLING.frameWaterholes && configuration.ASSEMBLING.frame}
            <span class="no-badge small"><X size={10} /> NO WATERHOLES</span>
          {/if}
        </div>

        <div
          class="notes-field"
          class:has-note={configuration.ASSEMBLING.notes}
        >
          {#if configuration.ASSEMBLING.notes}
            <span class="note-icon"><AlertCircle size={14} /></span>
          {/if}
          <StickyNote size={12} class="note-placeholder-icon" />
          <textarea
            class="notes"
            bind:value={configuration.ASSEMBLING.notes}
            disabled={readonly}
            oninput={emit}
            placeholder="Notes..."
            rows="2"
          ></textarea>
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .profile-form {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
      sans-serif;
    background: var(--bg-1, var(--bg-0));
    border: 1px solid var(--border, var(--border));
    border-radius: var(--radius-md, 8px);
    overflow: visible;
  }

  .profile-form.readonly { border-style: dashed; }
  .profile-form :global(input:disabled), .profile-form :global(textarea:disabled),
  .profile-form :global(select:disabled) { opacity: 1; -webkit-text-fill-color: currentColor; }

  /* HEADER */
  .form-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-lg, 16px);
    padding: var(--space-md, 12px) var(--space-lg, 16px);
    background: var(--bg-2, var(--bg-2));
    border-bottom: 2px solid var(--border, var(--border));
    flex-wrap: wrap;
  }

  .profile-name input {
    background: var(--bg-1);
    color: var(--ink-primary);
    border: 1px solid var(--border);
    padding: var(--space-sm, 8px) var(--space-md, 14px);
    border-radius: var(--radius-sm, 6px);
    font-weight: 600;
    font-size: var(--step-0, 14px);
    min-width: 150px;
  }

  .profile-name input::placeholder {
    color: var(--ink-secondary);
    opacity: 1;
  }

  .sign-toggle {
    display: flex;
    gap: var(--space-xs, 4px);
    background: var(--bg-1, var(--bg-0));
    padding: var(--space-xs, 4px);
    border-radius: var(--radius-sm, 6px);
    border: 1px solid var(--border, var(--border));
  }

  .sign-toggle button {
    background: transparent;
    border: none;
    padding: var(--space-sm, 8px) var(--space-lg, 16px);
    font-size: var(--step-0, 13px);
    font-weight: 600;
    color: var(--muted, var(--ink-tertiary));
    cursor: pointer;
    border-radius: var(--radius-sm, 4px);
    transition: background 0.15s, color 0.15s;
  }

  .sign-toggle button.active {
    background: var(--ink-0, var(--ink-primary));
    color: var(--bg-0);
  }

  .sign-toggle button:focus-visible,
  .profile-name input:focus-visible,
  .length-input:focus-visible {
    outline: 2px solid var(--focus, var(--brand));
    outline-offset: 2px;
  }

  /* MAIN GRID */
  .form-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 1px;
    background: var(--border);
  }

  .section {
    background: var(--bg-1, var(--bg-0));
    display: flex;
    flex-direction: column;
    min-width: 0;
    position: relative;
    z-index: 1;
  }

  .section:focus-within {
    z-index: var(--z-sticky);
  }

  .section-sm {
    min-width: 140px;
  }
  .section-lg {
    min-width: 0;
  }
  .section-xl {
    min-width: 0;
    grid-column: span 2;
  }

  .section.collapsed .section-title { background: var(--bg-2); color: var(--ink-secondary); }

  .section-title {
    background: var(--ink-secondary);
    color: var(--bg-0);
    padding: var(--space-sm, 8px) var(--space-md, 12px);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }

  .section-title .hint {
    font-weight: 400;
  }

  .section-content {
    padding: var(--space-md, 12px);
    display: flex;
    flex-direction: column;
    gap: var(--space-sm, 8px);
    flex: 1;
  }

  /* FIELDS */
  .field {
    min-inline-size: 0;
    margin: 0;
    padding: 0;
    border: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-xs, 4px);
  }

  .field > label,
  .field-label {
    font-size: 10px;
    font-weight: 600;
    color: var(--muted, var(--ink-tertiary));
    text-transform: uppercase;
  }

  .field > legend {
    padding: 0;
    margin-bottom: var(--space-xs, 4px);
  }

  .face-materials,
  .face-material-entry {
    min-width: 0;
  }

  .face-material-entry {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs, 4px);
  }

  .face-material-entry + .face-material-entry {
    margin-top: var(--space-sm, 8px);
    padding-top: var(--space-sm, 8px);
    border-top: 1px solid var(--border);
  }

  .face-material-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-sm, 8px);
    font-size: 11px;
    font-weight: 600;
    color: var(--ink-secondary);
  }

  .add-face,
  .remove-face {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 36px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm, 4px);
    background: var(--bg-1);
    color: var(--ink-secondary);
    cursor: pointer;
  }

  .add-face {
    margin-top: var(--space-xs, 4px);
    padding: 7px 8px;
    font-size: 11px;
    font-weight: 600;
    text-align: start;
  }

  .remove-face {
    min-width: 36px;
    padding: 6px;
    flex-shrink: 0;
  }

  .add-face:hover,
  .remove-face:hover {
    background: var(--bg-2);
    color: var(--ink-primary);
  }

  .add-face:focus-visible,
  .remove-face:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
  }

  /* PICKER ROW - consistent layout for all material pickers */
  .picker-row {
    display: flex;
    gap: var(--space-sm, 8px);
    align-items: center;
  }

  .picker-row :global(.material-select) {
    flex: 1;
    min-width: 80px;
  }

  /* DEPTH */
  .depth-box {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .depth-box label {
    font-size: 10px;
    font-weight: 600;
    color: var(--muted, var(--ink-tertiary));
    text-transform: uppercase;
  }

  .depth-input {
    width: 80px;
    height: 60px;
    border: 3px solid var(--ink-primary);
    border-radius: 6px;
    font-size: 28px;
    font-weight: 900;
    text-align: center;
    appearance: textfield;
    -moz-appearance: textfield;
  }

  .depth-input::-webkit-outer-spin-button,
  .depth-input::-webkit-inner-spin-button {
    -webkit-appearance: none;
  }

  /* OPTIONS */
  .options {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .option {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    font-weight: 600;
    color: var(--muted, var(--ink-tertiary));
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
    background: var(--bg-2, var(--bg-2));
  }

  .option.active {
    background: var(--brand-soft);
    color: var(--ink-primary);
  }
  .option input {
    width: 14px;
    height: 14px;
  }

  /* INLINE FIELDS */
  .inline-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px 0;
    border-bottom: 1px solid var(--border, var(--bg-2));
  }

  .inline-field:last-of-type {
    border-bottom: none;
  }

  .toggle-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 600;
    color: var(--muted, var(--ink-tertiary));
    cursor: pointer;
  }

  .toggle-label.active {
    color: var(--ink-primary);
  }
  .toggle-label input {
    width: 14px;
    height: 14px;
  }

  /* PAINT GRID */
  .paint-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 10px;
  }

  .paint-item {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
    background: var(--bg-2, var(--bg-2));
    border-radius: 6px;
  }

  .paint-item.inactive {
    background: var(--bg-1);
  }

  .paint-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 600;
    color: var(--muted, var(--ink-tertiary));
    cursor: pointer;
  }

  .paint-label.active {
    color: var(--ink-primary);
  }
  .paint-label input {
    width: 14px;
    height: 14px;
  }

  .ral-badge {
    padding: 8px 12px;
    border-radius: 4px;
    font-size: 16px;
    font-weight: 900;
    text-align: center;
    border: 1px solid var(--material-edge, var(--border));
    overflow-wrap: anywhere;
  }

  /* NO BADGE */
  .no-badge {
    background: var(--bg-1);
    color: var(--ink-secondary);
    border: 1px dashed var(--border);
    padding: 6px 10px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 700;
    text-align: center;
  }

  .no-badge.small {
    font-size: 11px;
    padding: 4px 6px;
  }

  /* ASSEMBLY 2x2 GRID */
  .assembly-grid-2x2 {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-md, 12px);
    align-items: start;
  }

  .assembly-item {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: var(--space-sm, 8px);
    padding: var(--space-md, 12px);
    background: var(--bg-2, var(--bg-2));
    border-radius: var(--radius-md, 6px);
    border: 1px solid transparent;
  }

  .assembly-item.configured { border-color: var(--material-edge); }
  .assembly-item.configured .item-header .toggle-label { color: var(--material-ink); }

  .item-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  /* Material identity and geometry share the actual swatch or role accent. */
  .material-badge-lg {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-sm, 8px);
    padding: var(--space-md, 12px);
    border-radius: var(--radius-md, 6px);
    font-weight: 800;
    font-size: 14px;
    white-space: normal;
    overflow-wrap: anywhere;
    line-height: 1.4;
    border: 1px solid var(--material-edge, var(--border));
    min-height: 48px;
    flex: 1;
    min-width: 0;
    box-sizing: border-box;
    text-align: center;
  }

  .material-badge-lg :global(svg) { flex-shrink: 0; }

  .no-badge-lg {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-xs, 4px);
    background: var(--bg-1);
    color: var(--ink-tertiary);
    border: 1px dashed var(--border);
    padding: var(--space-sm, 8px) var(--space-md, 12px);
    border-radius: var(--radius-md, 6px);
    font-size: 12px;
    font-weight: 600;
    text-align: center;
    min-height: 36px;
    width: 100%;
    box-sizing: border-box;
  }

  /* PSU TYPE */
  .psu-type {
    display: flex;
    gap: 4px;
  }

  .psu-type label {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 6px 8px;
    background: var(--bg-1, var(--bg-0));
    border: 1px solid var(--border, var(--border));
    border-radius: 4px;
    font-size: 10px;
    font-weight: 600;
    cursor: pointer;
    min-height: 32px;
    box-sizing: border-box;
  }

  .psu-type label.active {
    background: var(--material-surface);
    color: var(--material-ink);
    border-color: var(--material-edge);
  }

  .psu-type input, .opt input, .extra input, .wago-label input {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    margin: 0;
    accent-color: var(--brand);
  }

  .psu-type input:focus-visible, .opt input:focus-visible, .extra input:focus-visible,
  .wago-label input:focus-visible {
    outline: 2px solid var(--focus, var(--brand));
    outline-offset: 3px;
  }

  /* CABLES */
  .cable-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
    min-width: 0;
  }

  .cable-length { min-width: 0; }

  .length-input {
    width: 100%;
    min-width: 0;
    max-width: 100%;
    padding: 6px;
    border: 1px solid var(--border, var(--border));
    border-radius: 4px;
    font-size: 12px;
    min-height: 36px;
    background: var(--bg-1);
    color: var(--ink-primary);
    box-sizing: border-box;
  }

  .cable-row :global(.material-select) {
    min-width: 0;
  }

  .wago-label {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
  }

  .wago-badge {
    background: var(--bg-1);
    color: var(--ink-secondary);
    border: 1px solid var(--border);
    padding: 4px 10px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 700;
  }

  .wago-label.active .wago-badge {
    background: var(--material-surface);
    color: var(--material-ink);
    border-color: var(--material-edge);
  }

  /* FRAME */
  .frame-options {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .opt {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 600;
    cursor: pointer;
    background: var(--bg-1, var(--bg-0));
    border: 1px solid var(--border, var(--border));
    min-height: 32px;
    box-sizing: border-box;
  }
  .opt.waterholes.active {
    background: var(--ok-soft);
    color: var(--ink-primary);
    border-color: var(--ok);
  }
  .opt.warning.active {
    background: var(--error-soft);
    color: var(--error);
    border-color: var(--error);
  }

  /* EXTRAS */
  .assembly-extras {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    padding-top: 10px;
    border-top: 1px solid var(--border, var(--bg-2));
  }

  .extra {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: var(--bg-2, var(--bg-2));
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    min-height: 32px;
    box-sizing: border-box;
  }

  .extra.active {
    background: var(--ink-secondary);
    color: var(--bg-0);
  }
  @media (pointer: coarse) {
    .psu-type label, .opt, .extra, .wago-label, .length-input,
    .sign-toggle button, .toggle-label, .option, .paint-label { min-height: 44px; }
  }

  /* INPUTS */
  .custom-input {
    width: 100%;
    padding: var(--space-xs, 4px) var(--space-sm, 8px);
    border: 1px solid var(--border, var(--border));
    border-radius: var(--radius-sm, 4px);
    font-size: 12px;
    min-height: 36px;
    box-sizing: border-box;
    color: var(--ink-primary);
    background: var(--bg-1);
  }

  .custom-input:focus {
    outline: none;
    border-color: var(--brand);
  }

  /* NOTES FIELD with wrap and alert icon */
  .notes-field {
    position: relative;
    display: flex;
    align-items: flex-start;
    gap: var(--space-xs, 4px);
    margin-top: auto;
  }

  .notes-field .note-icon {
    position: absolute;
    top: var(--space-sm, 8px);
    right: var(--space-sm, 8px);
    color: var(--warn);
  }

  .notes-field.has-note .notes {
    border-color: var(--warn);
    background: var(--warn-soft);
  }

  .notes-field :global(.note-placeholder-icon) {
    position: absolute;
    left: var(--space-sm, 8px);
    top: var(--space-sm, 8px);
    color: var(--muted, var(--muted));
    opacity: 0.5;
    pointer-events: none;
  }

  .notes {
    width: 100%;
    padding: var(--space-sm, 8px) var(--space-sm, 8px) var(--space-sm, 8px)
      var(--space-xl, 28px);
    border: 1px dashed var(--border, var(--border));
    border-radius: var(--radius-sm, 4px);
    font-size: 12px;
    background: var(--bg-2, var(--bg-2));
    resize: vertical;
    min-height: 36px;
    word-wrap: break-word;
    overflow-wrap: break-word;
    white-space: pre-wrap;
  }

  .notes:focus {
    outline: none;
    border-color: var(--brand);
    border-style: solid;
  }

  .notes::placeholder {
    color: var(--muted, var(--muted));
    opacity: 1;
  }

  .custom-input::placeholder, .length-input::placeholder { color: var(--ink-secondary); opacity: 1; }

  @media (prefers-reduced-motion: reduce) {
    .sign-toggle button { transition: none; }
  }

  /* RESPONSIVE */
  @media (max-width: 1400px) {
    .form-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }

    .section-xl {
      grid-column: 1 / -1;
    }
  }

  @media (max-width: 900px) {
    .form-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .assembly-grid-2x2 {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 600px) {
    .form-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .section-sm,
    .section-lg,
    .section-xl {
      min-width: 0;
    }

    .form-header {
      flex-direction: column;
      align-items: stretch;
    }

    .sign-toggle {
      justify-content: center;
    }

    .paint-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .assembly-grid-2x2 {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
