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
  import {
    PROFILE_STATIONS, PROFILE_ELEMENT_NAME_LIMIT, nextProfileStationElementId, readProfileStationElements,
    type ProfileStation as StationSection, type ProfileStationElement, type ProfileStationElements,
  } from "$lib/profiles/station-elements";
  import { materialColorVariables } from "$lib/materials/selection-colors";
  import "$lib/materials/selection-colors.css";
  import { t } from "svelte-i18n";

  import {
    readFaceMaterials,
    withFaceMaterials,
    applyProfileMaterialSelection,
    readLegacyPrintMaterial,
    assignLegacyPrintMaterial,
    nextFaceMaterialId,
    type FaceMaterialSelection,
    type ProfileMaterialChange,
  } from "$lib/profiles/face-materials";
  import {
    type ColorValue,
    defaultColor,
    extractShortName,
    paintMaterialValue,
    applyPaintMaterialSelection,
  } from "$lib/profiles/helpers";
  import { readLegacyFrameThickness, withFrameThickness } from "$lib/profiles/frame-sizing";
  import { PROFILE_MATERIAL_CATEGORIES, PROFILE_PRINT_MATERIAL_CATEGORIES, isProfilePrintMaterial } from "$lib/profiles/material-roles";
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
  interface StationConfiguration {
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
      backProcess?: string;
      backThicknessOptions?: number[];
      laser?: boolean;
      print3d?: boolean;
      print3dMaterial?: string;
      print3dMaterialHex?: string;
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
      facePrint?: boolean;
      back: boolean;
      backFilm: string;
      backFilmHex?: string;
      backFilmShort?: string;
      backFilmCategory?: string;
      backCustom?: string;
      backPrint?: boolean;
      sides: boolean;
      sidesFilm: string;
      sidesFilmHex?: string;
      sidesFilmShort?: string;
      sidesFilmCategory?: string;
      sidesCustom?: string;
      sidesPrint?: boolean;
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

  type ProfileConfiguration = Omit<StationConfiguration, StationSection> & {
    [K in StationSection]: StationConfiguration[K] & ProfileStationElements<StationConfiguration[K]>;
  };

  // defaultColor + helper fns are imported from $lib/profiles/helpers.

  // A baseline configuration to ensure all necessary properties are present.
  const defaultConfiguration: ProfileConfiguration = {
    profileName: "New Profile",
    signType: "EXTERIOR",
    CNC_FREZER: { face: "", back: "", laser: false, notes: "" },
    BENDER: { sides: "", depth: 100, notes: "" },
    FRONT: {
      face: false,
      faceFilm: "",
      faceCustom: "",
      facePrint: false,
      back: false,
      backFilm: "",
      backCustom: "",
      backPrint: false,
      sides: false,
      sidesFilm: "",
      sidesCustom: "",
      sidesPrint: false,
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
    canvasLayout = false,
    /** Callback for configuration changes. */
    onchange,
  }: {
    configuration?: Partial<ProfileConfiguration> | null;
    readonly?: boolean;
    canvasLayout?: boolean;
    onchange?: (config: ProfileConfiguration) => void;
  } = $props();

  import { onDestroy, tick, untrack, type Snippet } from "svelte";

  function normalizeConfiguration(value: Partial<ProfileConfiguration> | null | undefined, includeElements = true): ProfileConfiguration {
      const currentConfig = value ?? {};
      const normalized: ProfileConfiguration = {
        ...defaultConfiguration,
        ...currentConfig,
        CNC_FREZER: {
          ...defaultConfiguration.CNC_FREZER,
          ...(currentConfig.CNC_FREZER || {}),
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
      for (const station of PROFILE_STATIONS) {
        const section: ProfileStationElements<StationConfiguration[StationSection]> = normalized[station];
        // Hydrate only one level. Each element is a set of inputs for its own station.
        if (!includeElements || !Array.isArray(currentConfig[station]?.elements)) {
          delete section.elements;
          continue;
        }
        section.elements = readProfileStationElements(currentConfig[station]).map(element => ({
          ...element,
          values: normalizeConfiguration({ [station]: element.values }, false)[station],
        }));
      }
      return normalized;
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
  const print3dMaterials = PROFILE_PRINT_MATERIAL_CATEGORIES;

  const nameLimit = PROFILE_ELEMENT_NAME_LIMIT;
  const elementScope = (station: StationSection, id: string) => `${formId}-${station}-${id}`;

  async function addStationElement(station: StationSection) {
    if (readonly) return;
    const target: ProfileStationElements<StationConfiguration[StationSection]> = configuration[station];
    const rows = target.elements ?? [];
    const id = nextProfileStationElementId(rows);
    const defaults = {
      ...defaultConfiguration[station],
      ...(station === 'ASSEMBLING' ? { led: false, psu: false, cables: false, frame: false } : {}),
      ...(station === 'FRONT' ? { face: true } : {}),
      ...(station === 'PAINTING' ? { face: true, sides: false } : {}),
    };
    const values = normalizeConfiguration({ [station]: defaults }, false)[station];
    target.elements = [...rows, { id, name: '', values }];
    emit();
    await tick();
    document.getElementById(`${elementScope(station, id)}-name`)?.focus();
  }

  function removeStationElement(station: StationSection, id: string) {
    if (readonly) return;
    const target: ProfileStationElements<StationConfiguration[StationSection]> = configuration[station];
    target.elements = target.elements?.filter(element => element.id !== id);
    emit();
  }

  function faceRows(section: StationConfiguration['CNC_FREZER']) {
    return section.faceMaterials ?? readFaceMaterials(section);
  }

  async function assignEarlierPrint(part: 'face' | 'back', section: StationConfiguration['CNC_FREZER'], scope: string) {
    if (readonly || (part === 'back' && section.back.trim())) return;
    const rows = faceRows(section);
    const faceId = rows.find(row => !row.value.trim())?.id || nextFaceMaterialId(rows);
    Object.assign(section, assignLegacyPrintMaterial(section, part));
    emit();
    await tick();
    document.getElementById(part === 'face' ? `${scope}-${faceId}` : `${scope}-back`)
      ?.querySelector<HTMLButtonElement>('.edit-selection')?.focus();
  }

  async function addFaceMaterial(section: StationConfiguration['CNC_FREZER'], scope: string) {
    if (readonly) return;
    const rows = faceRows(section), id = nextFaceMaterialId(rows);
    section.faceMaterials = [...rows, { id, value: '' }];
    emit();
    await tick();
    document.getElementById(`${scope}-${id}-name`)?.focus();
  }

  function removeFaceMaterial(section: StationConfiguration['CNC_FREZER'], id: string) {
    if (readonly) return;
    section.faceMaterials = faceRows(section).filter(entry => entry.id !== id);
    emit();
  }

  function selectFaceMaterial(entry: FaceMaterialSelection, data: ProfileMaterialChange) {
    if (readonly) return;
    Object.assign(entry, applyProfileMaterialSelection(entry, data));
    emit();
  }

  function selectBackMaterial(section: StationConfiguration['CNC_FREZER'], data: ProfileMaterialChange) {
    if (readonly) return;
    const entry = applyProfileMaterialSelection({
      id: "back", value: section.back,
      thickness: section.backThickness,
      category: section.backCategory,
      process: section.backProcess,
    }, data, "ALU");
    Object.assign(section, {
      back: entry.value, backHex: entry.hex, backShort: entry.shortName,
      backThickness: entry.thickness, backCategory: entry.category,
      backProcess: entry.process,
      backThicknessOptions: entry.thicknessOptions,
    });
    emit();
  }

  function selectSidesMaterial(section: StationConfiguration['BENDER'], data: ProfileMaterialChange) {
    if (readonly) return;
    const entry = applyProfileMaterialSelection({
      id: "sides", value: section.sides,
      thickness: section.sidesThickness,
      category: section.sidesCategory,
    }, data, "ALU");
    Object.assign(section, {
      sides: entry.value, sidesHex: entry.hex, sidesShort: entry.shortName,
      sidesThickness: entry.thickness, sidesCategory: entry.category,
      sidesThicknessOptions: entry.thicknessOptions,
    });
    emit();
  }

  function selectFrameMaterial(section: StationConfiguration['ASSEMBLING'], data: ProfileMaterialChange) {
    if (readonly) return;
    const entry = applyProfileMaterialSelection({
      id: "frame", value: section.frameMaterial,
      thickness: section.frameThickness,
      category: section.frameMaterialCategory,
    }, data, "ALU");
    Object.assign(section, {
      frameMaterial: entry.value, frameMaterialHex: entry.hex, frameMaterialShort: entry.shortName,
      frameThickness: entry.thickness, frameMaterialCategory: entry.category,
      frameThicknessOptions: entry.thicknessOptions,
      frameDimensions: withFrameThickness(section.frameDimensions, entry.thickness),
    });
    emit();
  }

  function changeFrameThickness(section: StationConfiguration['ASSEMBLING']) {
    section.frameDimensions = withFrameThickness(
      section.frameDimensions, section.frameThickness,
    );
    emit();
  }

  function changeFrameDimensions(section: StationConfiguration['ASSEMBLING'], event: Event) {
    if (readonly) return;
    const dimensions = (event.currentTarget as HTMLInputElement).value;
    section.frameDimensions = dimensions;
    const embeddedThickness = readLegacyFrameThickness(dimensions);
    if (embeddedThickness) section.frameThickness = embeddedThickness;
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
      for (const section of [configuration.CNC_FREZER, ...(configuration.CNC_FREZER.elements ?? []).map(element => element.values)]) {
        Object.assign(section, withFaceMaterials(section, faceRows(section)));
      }
      incomingConfiguration = configuration;
      onchange?.(configuration);
    });
  }

  const hasFilm = (value: StationConfiguration['FRONT']) => value.face || value.back || value.sides;
  let hasFront = $derived(hasFilm(configuration.FRONT) || configuration.FRONT.elements?.some(element => hasFilm(element.values)));

  function isRoundFrame(section: StationConfiguration['ASSEMBLING']) {
    return /\b(?:round|circular)\b|(?:^|[\s_(])(?:D|Ø|⌀)\s*\d/i.test([
      section.frameMaterial, section.frameMaterialShort, section.frameDimensions,
    ].filter(Boolean).join(" "));
  }

  const stationNames: Record<StationSection, string> = {
    CNC_FREZER: 'CNC FREZER', BENDER: 'BENDER', FRONT: 'FRONT', PAINTING: 'PAINTING', ASSEMBLING: 'ASSEMBLING'
  };
  const nonblank = (value: unknown): string => typeof value === 'string' ? value.trim() : '';

  function stationAnnotations(station: StationSection, section: StationConfiguration[StationSection]): { label: string; value: string }[] {
    if (station === 'FRONT') return ['face', 'back', 'sides'].flatMap(part => {
      const value = nonblank(section[`${part}Custom`]);
      return section[part] && value ? [{ label: part.toUpperCase(), value }] : [];
    });
    if (station === 'PAINTING') return ['face', 'sides', 'back', 'frame'].flatMap(part => {
      const value = nonblank(section[`${part}Custom`]);
      return section[part] && value ? [{ label: part === 'face' ? 'FRONT' : part.toUpperCase(), value }] : [];
    });
    if (station === 'ASSEMBLING') return ['led', 'frame'].flatMap(part => {
      const value = nonblank(section[`${part}Custom`]);
      return section[part] && value ? [{ label: part.toUpperCase(), value }] : [];
    });
    return [];
  }

  function hasElementNotes(station: StationSection, section: StationConfiguration[StationSection]): boolean {
    return Boolean(nonblank(section.notes) || stationAnnotations(station, section).length);
  }

  function stationNoteTarget(station: StationSection): string | undefined {
    if (hasElementNotes(station, configuration[station])) return `${formId}-${station}-notes`;
    const first = configuration[station].elements?.find(element => hasElementNotes(station, element.values));
    return first ? `${elementScope(station, first.id)}-${station}-notes` : undefined;
  }

  function focusStationNotes(station: StationSection) {
    const id = stationNoteTarget(station);
    const target = id ? document.getElementById(id) : null;
    target?.scrollIntoView({ block: 'nearest' });
    target?.focus({ preventScroll: true });
  }
</script>

{#snippet noteWarning(station: StationSection)}
  {#if stationNoteTarget(station)}
    <button type="button" class="section-note-warning"
      aria-label={$t('profiles.materials.showNotes', { section: stationNames[station] })}
      onclick={() => focusStationNotes(station)}>
      <AlertCircle size={14} aria-hidden="true" /> {$t('profiles.materials.notes')}
    </button>
  {/if}
{/snippet}

{#snippet stationNotes(station: StationSection, section: StationConfiguration[StationSection], scope: string)}
  {@const annotations = stationAnnotations(station, section)}
  {#if !readonly || hasElementNotes(station, section)}
    <div class="station-notes" class:has-note={hasElementNotes(station, section)}
      id={`${scope}-${station}-notes`} tabindex="-1" role="group"
      aria-label={`${stationNames[station]} · ${$t('profiles.materials.notes')}`}>
      {#each annotations as annotation (annotation.label)}
        <p class="material-note"><strong>{annotation.label}:</strong> {annotation.value}</p>
      {/each}
      {#if readonly}
        {#if nonblank(section.notes)}
          <div class="notes-readonly" role="note">
            <strong><StickyNote size={14} aria-hidden="true" /> {$t('profiles.materials.notes')}</strong>
            <p>{section.notes}</p>
          </div>
        {/if}
      {:else}
        <div class="notes-field" class:has-note={Boolean(nonblank(section.notes))}>
          <StickyNote size={12} class="note-placeholder-icon" aria-hidden="true" />
          <textarea class="notes" bind:value={section.notes} oninput={emit}
            aria-label={`${stationNames[station]} · ${$t('profiles.materials.notes')}`}
            placeholder={$t('profiles.materials.notesPlaceholder')} rows="2"></textarea>
        </div>
      {/if}
    </div>
  {/if}
{/snippet}

{#snippet primaryElementName(station: StationSection)}
  {#if configuration[station].elementName || configuration[station].elements?.length}
    {#if readonly}
      <p class="element-title">{configuration[station].elementName?.trim() || $t('profiles.materials.elementNumber', { number: 1 })}</p>
    {:else}
      <input type="text" class="element-name" maxlength={nameLimit}
        aria-label={`${stationNames[station]} · ${$t('profiles.materials.elementNumber', { number: 1 })} · ${$t('profiles.materials.elementName')}`}
        placeholder={$t('profiles.materials.elementNumber', { number: 1 })}
        bind:value={configuration[station].elementName} oninput={emit} />
    {/if}
  {/if}
{/snippet}

{#snippet stationElement(station: StationSection, element: ProfileStationElement<StationConfiguration[StationSection]>, number: number, fields: Snippet)}
  {@const fallback = $t('profiles.materials.elementNumber', { number })}
  <div class="station-element" role="group" aria-label={element.name.trim() || fallback} data-profile-element>
    <div class="face-material-heading">
      {#if readonly}
        <span class="element-title">{element.name.trim() || fallback}</span>
      {:else}
        <input type="text" class="element-name" id={`${elementScope(station, element.id)}-name`}
          aria-label={`${stationNames[station]} · ${fallback} · ${$t('profiles.materials.elementName')}`}
          placeholder={fallback} maxlength={nameLimit} bind:value={element.name} oninput={emit} />
        <button type="button" class="remove-face"
          aria-label={$t('profiles.materials.removeElement', { name: element.name.trim() || fallback })}
          onclick={() => removeStationElement(station, element.id)}>
          <Trash2 size={14} />
        </button>
      {/if}
    </div>
    {@render fields()}
  </div>
{/snippet}

{#snippet addElementButton(station: StationSection)}
  {#if !readonly}
    <button type="button" class="add-face" onclick={() => addStationElement(station)}
      aria-label={`${stationNames[station]} · ${$t('profiles.materials.addElement')}`}>
      <Plus size={14} /> {$t('profiles.materials.addElement')}
    </button>
  {/if}
{/snippet}

{#snippet cncFields(section: StationConfiguration['CNC_FREZER'], scope: string)}
  {@const faceEntries = faceRows(section)}
  {@const legacyPrint = readLegacyPrintMaterial(section)}
  <!-- FACE -->
  <div class="field face-materials">
    <span class="field-label">FACE</span>
    {#each faceEntries as material, index (material.id)}
      <div class="face-material-entry" id={`${scope}-${material.id}`}
        class:print3d-material={isProfilePrintMaterial(material.category) || material.process === '3D_PRINT'} role="group"
        aria-label={$t('profiles.materials.faceNumber', { number: index + 1 })}>
        {#if material.name || faceEntries.length > 1 || material.id !== 'legacy-face'}
          <div class="face-material-heading">
            {#if readonly}
              <span>{material.name?.trim() || $t('profiles.materials.faceNumber', { number: index + 1 })}</span>
            {:else}
              <input type="text" class="element-name" id={`${scope}-${material.id}-name`}
                aria-label={`${$t('profiles.materials.faceNumber', { number: index + 1 })} · ${$t('profiles.materials.elementName')}`}
                placeholder={$t('profiles.materials.faceNumber', { number: index + 1 })}
                maxlength={nameLimit} bind:value={material.name} oninput={emit} />
            {/if}
            {#if !readonly}
              <button type="button" class="remove-face"
                aria-label={$t('profiles.materials.removeFace', { number: index + 1 })}
                title={$t('profiles.materials.removeFace', { number: index + 1 })}
                onclick={() => removeFaceMaterial(section, material.id)}>
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
            compactSelection
            badgeKind={material.process === '3D_PRINT' ? 'print3d' : 'sheet'}
            badgeThickness={material.thickness}
            badgeShortName={material.shortName}
            finishOnSelect={false}
            allowCustom={true}
            {readonly}
            onchange={(data) => selectFaceMaterial(material, data)}
          >
            {#snippet editorDetails(selectedMaterial, complete)}
              {#if material.value && material.process !== '3D_PRINT' && !isProfilePrintMaterial(selectedMaterial?.category || material.category)}
                <MaterialThicknessSelect
                  bind:value={material.thickness}
                  materialType={material.category || material.value}
                  thicknessOptions={material.thicknessOptions}
                  autoSelectLowest={false}
                  label={`${$t('profiles.materials.faceNumber', { number: index + 1 })} · ${$t('materialThickness.select')}`}
                  {readonly}
                  onchange={() => { emit(); complete(); }}
                />
              {/if}
            {/snippet}
          </MaterialSelect>
        </div>
      </div>
    {/each}
    {#if !readonly}
      <button type="button" class="add-face" onclick={() => addFaceMaterial(section, scope)}>
        <Plus size={14} /> {$t('profiles.materials.addFace')}
      </button>
    {/if}
  </div>

  <!-- BACK -->
  <fieldset class="field" id={`${scope}-back`}>
    <legend class="field-label">BACK</legend>
    <div class="picker-row">
      <MaterialSelect
        bind:value={section.back}
        label="BACK"
        selectedCategory={section.backCategory}
        customColor={section.backHex ?? ""}
        categories={backMaterials}
        materialRole="back"
        compactSelection
        badgeKind={section.backProcess === '3D_PRINT' ? 'print3d' : 'sheet'}
        badgeThickness={section.backThickness}
        badgeShortName={section.backShort}
        finishOnSelect={false}
        allowCustom={true}
        {readonly}
        onchange={(data) => selectBackMaterial(section, data)}
      >
        {#snippet editorDetails(selectedMaterial, complete)}
          {#if section.back && section.backProcess !== '3D_PRINT' && !isProfilePrintMaterial(selectedMaterial?.category || section.backCategory)}
            <MaterialThicknessSelect
              bind:value={section.backThickness}
              materialType={section.backCategory || section.back}
              thicknessOptions={section.backThicknessOptions}
              autoSelectLowest={false}
              label={`BACK · ${$t('materialThickness.select')}`}
              {readonly}
              onchange={() => { emit(); complete(); }}
            />
          {/if}
        {/snippet}
      </MaterialSelect>
    </div>
  </fieldset>

  <!-- Options -->
  <div class="options">
    <label class="option" class:active={section.laser}>
      <input
        type="checkbox"
        bind:checked={section.laser}
        disabled={readonly}
        onchange={emit}
      />
      <Scissors size={12} /> LASER
    </label>
  </div>

  {#if legacyPrint}
    <div class="legacy-print-notice" role="note">
      <p>{$t(readonly ? 'profiles.materials.legacyPrintUnassigned' : 'profiles.materials.legacyPrint')}</p>
      <MaterialSelect
        value={legacyPrint.value}
        label={$t('profiles.materials.print3d', { default: '3D printing material' })}
        selectedCategory={legacyPrint.category}
        customColor={legacyPrint.hex ?? ""}
        categories={print3dMaterials}
        compactSelection
        badgeKind="print3d"
        badgeShortName={legacyPrint.shortName}
        readonly
      />
      {#if !readonly}
        <div class="legacy-print-actions">
          <button type="button" onclick={() => assignEarlierPrint('face', section, scope)}>{$t('profiles.materials.assignPrintFace')}</button>
          <button type="button" disabled={Boolean(section.back.trim())}
            title={section.back.trim() ? $t('profiles.materials.clearBackBeforeAssigning') : undefined}
            onclick={() => assignEarlierPrint('back', section, scope)}>{$t('profiles.materials.assignPrintBack')}</button>
        </div>
      {/if}
    </div>
  {/if}
  {@render stationNotes('CNC_FREZER', section, scope)}
{/snippet}

{#snippet benderFields(section: StationConfiguration['BENDER'], scope: string)}
  <fieldset class="field">
    <legend class="field-label">SIDES</legend>
    <div class="picker-row">
      <MaterialSelect
        bind:value={section.sides}
        label="SIDES"
        selectedCategory={section.sidesCategory}
        customColor={section.sidesHex ?? ""}
        categories={sidesMaterials}
        materialRole="sides"
        compactSelection
        badgeKind="sheet"
        badgeThickness={section.sidesThickness}
        badgeShortName={section.sidesShort}
        finishOnSelect={false}
        allowCustom={true}
        {readonly}
        onchange={(data) => selectSidesMaterial(section, data)}
      >
        {#snippet editorDetails(_selectedMaterial, complete)}
          {#if section.sides}
            <MaterialThicknessSelect
              bind:value={section.sidesThickness}
              materialType={section.sidesCategory || section.sides}
              thicknessOptions={section.sidesThicknessOptions}
              autoSelectLowest={false}
              label={`SIDES · ${$t('materialThickness.select')}`}
              {readonly}
              onchange={() => { emit(); complete(); }}
            />
          {/if}
        {/snippet}
      </MaterialSelect>
    </div>
  </fieldset>

  <div class="depth-box">
    <label for={`${scope}-depth`}>DEPTH</label>
    <input
      id={`${scope}-depth`}
      type="number"
      class="depth-input"
      bind:value={section.depth}
      disabled={readonly}
      oninput={emit}
      min="30"
      max="500"
    />
  </div>

  {@render stationNotes('BENDER', section, scope)}
{/snippet}

{#snippet filmFields(section: StationConfiguration['FRONT'], scope: string)}
  {#each ["face", "back", "sides"] as part}
    <div class="inline-field">
      <div class="film-part-header">
      <label
        class="toggle-label"
        class:active={section[part]}
      >
        <input
          type="checkbox"
          bind:checked={section[part]}
          disabled={readonly}
          onchange={emit}
        />
        {part.toUpperCase()}
      </label>
      {#if section[part]}
        <label class="film-print" class:active={section[`${part}Print`]}>
          <input type="checkbox" bind:checked={section[`${part}Print`]}
            aria-label={`FRONT · ${part.toUpperCase()} · ${$t('profiles.materials.printFilm')}`}
            disabled={readonly} onchange={emit} />
          {$t('profiles.materials.print')}
        </label>
      {/if}
      </div>
      {#if section[part]}
        <div class="picker-row">
          <MaterialSelect
            bind:value={section[`${part}Film`]}
            label={`FRONT · ${part.toUpperCase()}`}
            customColor={section[`${part}FilmHex`] ?? ""}
            selectedCategory={section[`${part}FilmCategory`]}
            categories={filmCategories}
            compactSelection
            badgeKind="film"
            badgeShortName={section[`${part}FilmShort`]}
            allowCustom={true}
            {readonly}
            onchange={(data) => {
              section[`${part}FilmHex`] = data.hex;
              section[`${part}FilmCategory`] = data.material?.category || "";
              section[`${part}FilmShort`] = extractShortName(
                data,
                "ORACAL",
              );
              emit();
            }}
          >
            {#snippet editorDetails(_selectedMaterial, complete)}
              {#if !readonly}
                <input
                  type="text"
                  class="custom-input"
                  bind:value={section[`${part}Custom`]}
                  aria-label={`FRONT · ${part.toUpperCase()} · ${$t('profiles.materials.materialNote')}`}
                  oninput={emit}
                  placeholder={$t('profiles.materials.materialNote')}
                />
              {/if}
            {/snippet}
          </MaterialSelect>
        </div>
      {/if}
    </div>
  {/each}

  {@render stationNotes('FRONT', section, scope)}
{/snippet}

{#snippet paintFields(section: StationConfiguration['PAINTING'], scope: string)}
  <div class="paint-grid">
    {#each [{ key: "face", label: "FRONT" }, { key: "sides", label: "SIDES" }, { key: "back", label: "BACK" }, { key: "frame", label: "FRAME" }] as item}
      <div
        class="paint-item"
        class:inactive={!section[item.key]}
      >
        <label
          class="paint-label"
          class:active={section[item.key]}
        >
          <input
            type="checkbox"
            bind:checked={section[item.key]}
            disabled={readonly}
            onchange={emit}
          />
          {item.label}
        </label>
        {#if section[item.key]}
          <MaterialSelect
            value={paintMaterialValue(section[`${item.key}Color`])}
            label={`PAINTING · ${item.label}`}
            customColor={section[`${item.key}Color`].hex ?? ""}
            selectedCategory={section[`${item.key}Color`].system?.toUpperCase() === 'PANTONE'
              ? 'PAINT_PANTONE' : section[`${item.key}Color`].system?.toUpperCase() === 'RAL' ? 'PAINT_RAL' : ''}
            categories={paintCategories}
            compactSelection
            badgeKind="paint"
            badgeShortName={section[`${item.key}Color`].code}
            allowCustom={true}
            {readonly}
            onchange={(data) => {
              section[`${item.key}Color`] = applyPaintMaterialSelection(data);
              emit();
            }}
          >
            {#snippet editorDetails(_selectedMaterial, complete)}
              {#if !readonly}
                <input
                  type="text"
                  class="custom-input"
                  bind:value={section[`${item.key}Custom`]}
                  aria-label={`PAINTING · ${item.label} · ${$t('profiles.materials.materialNote')}`}
                  oninput={emit}
                  placeholder={$t('profiles.materials.materialNote')}
                />
              {/if}
            {/snippet}
          </MaterialSelect>
        {:else}
          <span class="no-badge">NO</span>
        {/if}
      </div>
    {/each}
  </div>

  {@render stationNotes('PAINTING', section, scope)}
{/snippet}

{#snippet assemblyFields(section: StationConfiguration['ASSEMBLING'], scope: string)}
  {@const roundFrame = isRoundFrame(section)}
  <div class="assembly-grid-2x2">
    <!-- LED -->
    <div class="assembly-item material-context"
      class:configured={Boolean(section.led && section.ledModule)}
      data-material-tone="led" style={materialColorVariables('led')}>
      <div class="item-header">
        <label
          class="toggle-label"
          class:active={section.led}
        >
          <input
            type="checkbox"
            bind:checked={section.led}
            disabled={readonly}
            onchange={emit}
          />
          <Zap size={14} /> LED
        </label>
      </div>
      {#if section.led}
        <div class="picker-row">
          <MaterialSelect
            bind:value={section.ledModule}
            label="LED"
            selectedCategory={section.ledModuleCategory}
            categories={ledCategories}
            summaryKind="led"
            compactSelection
            allowCustom={true}
            showColor={false}
            {readonly}
            onchange={(data) => {
              section.ledModuleHex = data.hex;
              section.ledModuleCategory = data.material?.category || "";
              section.ledModuleShort = extractShortName(
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
      class:configured={Boolean(section.psu && section.psuModel)}
      data-material-tone="psu" style={materialColorVariables('psu')}>
      <div class="item-header">
        <label
          class="toggle-label"
          class:active={section.psu}
        >
          <input
            type="checkbox"
            bind:checked={section.psu}
            disabled={readonly}
            onchange={emit}
          />
          <Power size={14} /> PSU
        </label>
      </div>
      {#if section.psu}
        <div class="psu-type" role="radiogroup"
          aria-label={$t("profiles.materials.psuType", { default: "Power supply type" })}>
          <label
            class:active={section.psuType === "regular"}
          >
            <input
              type="radio"
              name={`${scope}-psu-type`}
              checked={section.psuType === "regular"}
              value="regular"
              disabled={readonly}
              onchange={() => { section.psuType = "regular"; emit(); }}
            />
            <Sun size={12} /> {$t('profiles.materials.regular')}
          </label>
          <label
            class:active={section.psuType === "dimmable"}
          >
            <input
              type="radio"
              name={`${scope}-psu-type`}
              checked={section.psuType === "dimmable"}
              value="dimmable"
              disabled={readonly}
              onchange={() => { section.psuType = "dimmable"; emit(); }}
            />
            <Moon size={12} /> {$t('profiles.materials.dimmable')}
          </label>
        </div>
        <div class="picker-row">
          <MaterialSelect
            bind:value={section.psuModel}
            label="PSU"
            selectedCategory={section.psuModelCategory}
            categories={psuCategories}
            summaryKind="psu"
            compactSelection
            allowCustom={true}
            showColor={false}
            {readonly}
            onchange={(data) => {
              section.psuModelCategory = data.material?.category || "";
              section.psuModelShort = extractShortName(
                data,
                "PSU",
              );
              emit();
            }}
          />
        </div>
        <div class="field">
          <label for={`${scope}-psu-mounting`}>{$t('profiles.materials.psuMounting')}</label>
          <input
            id={`${scope}-psu-mounting`}
            type="text"
            class="custom-input"
            bind:value={section.psuMounting}
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
      class:configured={Boolean(section.cables && section.cableType)}
      data-material-tone="cable" style={materialColorVariables('cable')}>
      <div class="item-header">
        <label
          class="toggle-label"
          class:active={section.cables}
        >
          <input
            type="checkbox"
            bind:checked={section.cables}
            disabled={readonly}
            onchange={emit}
          />
          <Cable size={14} /> {$t('profiles.materials.mainCable')}
        </label>
      </div>
      {#if section.cables}
        <div class="cable-row">
          <MaterialSelect
            bind:value={section.cableType}
            label={$t('profiles.materials.mainCable')}
            selectedCategory={section.cableTypeCategory}
            categories={wireCategories}
            materialRole="mainCable"
            summaryKind="cable"
            selectionLength={section.cablesLength}
            compactSelection
            finishOnSelect={false}
            allowCustom={true}
            showColor={false}
            {readonly}
            onchange={(data) => {
              section.cableTypeCategory = data.material?.category || "";
              section.cableTypeShort = extractShortName(
                data,
                "WIRE",
              );
              emit();
            }}
          >
            {#snippet editorDetails(_selectedMaterial, complete)}
              <div class="field cable-length">
                <label for={`${scope}-cable-length`}>{$t('profiles.materials.cableLength')}</label>
                <input
                  id={`${scope}-cable-length`}
                  type="text"
                  class="length-input"
                  bind:value={section.cablesLength}
                  disabled={readonly}
                  oninput={emit}
                  placeholder="2 m"
                />
              </div>
            {/snippet}
          </MaterialSelect>
        </div>
        <label
          class="wago-label"
          class:active={section.cablesWago}
        >
          <input
            type="checkbox"
            bind:checked={section.cablesWago}
            disabled={readonly}
            onchange={emit}
          />
          <span class="wago-badge material-context" style={materialColorVariables('connector')}><span aria-hidden="true">{section.cablesWago ? "✓" : ""}</span> WAGO</span>
        </label>
        {#if section.cablesWago}
          <fieldset class="field connector-material">
            <legend class="field-label">{$t('profiles.materials.connector', { default: 'Connector model' })}</legend>
            <MaterialSelect
              bind:value={section.cablesConnector}
              label={$t('profiles.materials.connector', { default: 'Connector model' })}
              selectedCategory={section.cablesConnectorCategory}
              categories={connectorCategories}
              compactSelection
              badgeKind="connector"
              badgeShortName={section.cablesConnectorShort}
              showColor={false}
              allowCustom={true}
              {readonly}
              onchange={(data) => {
                section.cablesConnectorShort = extractShortName(data, 'LED_ACCESSORY');
                section.cablesConnectorCategory = data.material?.category || '';
                emit();
              }}
            />
          </fieldset>
        {/if}
      {:else}
        <span class="no-badge-lg"><X size={14} /> NO CABLES</span>
      {/if}
    </div>

    <!-- FRAME -->
    <div class="assembly-item material-context"
      class:configured={Boolean(section.frame && section.frameMaterial)}
      data-material-tone="frame" style={materialColorVariables('frame')}>
      <div class="item-header">
        <label
          class="toggle-label"
          class:active={section.frame}
        >
          <input
            type="checkbox"
            bind:checked={section.frame}
            disabled={readonly}
            onchange={emit}
          />
          <Square size={14} /> FRAME
        </label>
      </div>
      {#if section.frame}
        <div class="picker-row">
          <MaterialSelect
            bind:value={section.frameMaterial}
            label="FRAME"
            selectedCategory={section.frameMaterialCategory}
            customColor={section.frameMaterialHex ?? ""}
            categories={frameMaterials}
            materialRole="frame"
            compactSelection
            badgeKind="frame"
            badgeThickness={section.frameThickness}
            badgeShortName={section.frameMaterialShort}
            badgeDimensions={section.frameDimensions}
            finishOnSelect={false}
            allowCustom={true}
            {readonly}
            onchange={(data) => selectFrameMaterial(section, data)}
          >
            {#snippet editorDetails(_selectedMaterial, complete)}
              {#if section.frameMaterial}
                <MaterialThicknessSelect
                  bind:value={section.frameThickness}
                  materialType={section.frameMaterialCategory || section.frameMaterial}
                  thicknessOptions={section.frameThicknessOptions}
                  autoSelectLowest={false}
                  label={`FRAME · ${$t('materialThickness.select')}`}
                  {readonly}
                  onchange={() => { changeFrameThickness(section); complete(); }}
                />
                <div class="field">
                  <label for={`${scope}-frame-size`}>{roundFrame ? "DIAMETER (mm)" : "FRAME SIZE"}</label>
                  <input
                    id={`${scope}-frame-size`}
                    type="text"
                    value={section.frameDimensions}
                    placeholder={roundFrame ? "e.g. D20" : "e.g. 40x40"}
                    disabled={readonly}
                    oninput={(event) => changeFrameDimensions(section, event)}
                    class="custom-input"
                  />
                </div>
              {/if}
            {/snippet}
          </MaterialSelect>
        </div>
        <div class="frame-options">
          <label
            class="opt waterholes"
            class:active={section.frameWaterholes}
          >
            <input
              type="checkbox"
              bind:checked={section.frameWaterholes}
              aria-label={$t("profiles.materials.frameWaterholes", { default: "Frame waterholes" })}
              disabled={readonly}
              onchange={emit}
            />
            <Droplets size={12} /> WATER
          </label>
          <label
            class="opt warning"
            class:active={section.frameMountingHoles}
          >
            <input
              type="checkbox"
              bind:checked={section.frameMountingHoles}
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
    <label class="extra" class:active={section.shablon}>
      <input
        type="checkbox"
        bind:checked={section.shablon}
        aria-label={$t("profiles.materials.template", { default: "Template" })}
        disabled={readonly}
        onchange={emit}
      />
      <Layers size={14} /> SHABLON
    </label>
    {#if !section.frameWaterholes && section.frame}
      <span class="no-badge small"><X size={10} /> NO WATERHOLES</span>
    {/if}
  </div>

  {@render stationNotes('ASSEMBLING', section, scope)}
{/snippet}

<div class="profile-form" class:readonly class:canvas-sheet={canvasLayout}>
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
    <div class="section" data-station="CNC">
      <div class="section-title"><span><Scissors size={12} /> CNC FREZER</span> {@render noteWarning('CNC_FREZER')}</div>
      <div class="section-content">
        {@render primaryElementName('CNC_FREZER')}
        {@render cncFields(configuration.CNC_FREZER, formId)}
        {#each configuration.CNC_FREZER.elements ?? [] as element, index (element.id)}
          {#snippet fields()}{@render cncFields(element.values, elementScope('CNC_FREZER', element.id))}{/snippet}
          {@render stationElement('CNC_FREZER', element, index + 2, fields)}
        {/each}
        {@render addElementButton('CNC_FREZER')}
      </div>
    </div>

    <!-- BENDER -->
    <div class="section section-sm" data-station="EDGE">
      <div class="section-title"><span><Square size={12} /> BENDER</span> {@render noteWarning('BENDER')}</div>
      <div class="section-content">
        {@render primaryElementName('BENDER')}
        {@render benderFields(configuration.BENDER, formId)}
        {#each configuration.BENDER.elements ?? [] as element, index (element.id)}
          {#snippet fields()}{@render benderFields(element.values, elementScope('BENDER', element.id))}{/snippet}
          {@render stationElement('BENDER', element, index + 2, fields)}
        {/each}
        {@render addElementButton('BENDER')}
      </div>
    </div>

    <!-- FRONT (Film) -->
    <div class="section" data-station="FRONT" class:collapsed={!hasFront}>
      <div class="section-title">
        <span><Layers size={12} /> FRONT <span class="hint">(Film)</span></span>
        {@render noteWarning('FRONT')}
      </div>
      <div class="section-content">
        {@render primaryElementName('FRONT')}
        {@render filmFields(configuration.FRONT, formId)}
        {#each configuration.FRONT.elements ?? [] as element, index (element.id)}
          {#snippet fields()}{@render filmFields(element.values, elementScope('FRONT', element.id))}{/snippet}
          {@render stationElement('FRONT', element, index + 2, fields)}
        {/each}
        {@render addElementButton('FRONT')}
      </div>
    </div>

    <!-- PAINTING -->
    <div class="section section-lg" data-station="PAINT">
      <div class="section-title"><span><Paintbrush size={12} /> PAINTING</span> {@render noteWarning('PAINTING')}</div>
      <div class="section-content">
        {@render primaryElementName('PAINTING')}
        {@render paintFields(configuration.PAINTING, formId)}
        {#each configuration.PAINTING.elements ?? [] as element, index (element.id)}
          {#snippet fields()}{@render paintFields(element.values, elementScope('PAINTING', element.id))}{/snippet}
          {@render stationElement('PAINTING', element, index + 2, fields)}
        {/each}
        {@render addElementButton('PAINTING')}
      </div>
    </div>

    <!-- ASSEMBLING -->
    <div class="section section-xl" data-station="ASSEMBLY">
      <div class="section-title"><span><Wrench size={12} /> ASSEMBLING</span> {@render noteWarning('ASSEMBLING')}</div>
      <div class="section-content">
        {@render primaryElementName('ASSEMBLING')}
        {@render assemblyFields(configuration.ASSEMBLING, formId)}
        {#each configuration.ASSEMBLING.elements ?? [] as element, index (element.id)}
          {#snippet fields()}{@render assemblyFields(element.values, elementScope('ASSEMBLING', element.id))}{/snippet}
          {@render stationElement('ASSEMBLING', element, index + 2, fields)}
        {/each}
        {@render addElementButton('ASSEMBLING')}
      </div>
    </div>
  </div>
</div>

<style>
  .profile-form {
    container: production-profile / inline-size;
    min-width: 0;
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
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--space-xs);
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

  .section-title > span { display: inline-flex; align-items: center; gap: var(--space-xs); }
  .section-note-warning {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    min-height: var(--control-xs);
    padding: var(--space-xs) var(--space-sm);
    background: var(--warn-soft);
    color: var(--ink-primary);
    border: 1px solid var(--warn);
    border-radius: var(--radius-sm);
    font-size: var(--text-xs);
    font-weight: 700;
    line-height: var(--leading-snug);
    cursor: pointer;
  }
  .section-note-warning:focus-visible,
  .legacy-print-actions button:focus-visible,
  .station-notes:focus { outline: 2px solid var(--focus); outline-offset: 2px; }

  .legacy-print-notice {
    display: grid;
    gap: var(--space-sm);
    padding: var(--space-sm);
    border: 1px solid var(--warn);
    border-radius: var(--radius-sm);
    background: var(--bg-2);
    color: var(--ink-primary);
    font-size: var(--text-sm);
    line-height: var(--leading-normal);
  }
  .legacy-print-notice p { margin: 0; }
  .legacy-print-actions { display: flex; flex-wrap: wrap; gap: var(--space-xs); }
  .legacy-print-actions button {
    min-height: var(--control-sm);
    padding: var(--space-xs) var(--space-sm);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-1);
    color: var(--ink-primary);
    font: inherit;
    cursor: pointer;
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

  .station-element {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm, 8px);
    min-width: 0;
    padding-block-start: var(--space-sm, 8px);
    border-top: 1px solid var(--border);
  }

  .element-name {
    width: 100%;
    min-width: 0;
    min-height: 36px;
    padding: 6px 8px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm, 4px);
    background: var(--bg-1);
    color: var(--ink-primary);
    font: inherit;
    font-size: 11px;
  }

  .element-title {
    margin: 0;
    font-size: 11px;
    font-weight: 700;
    overflow-wrap: anywhere;
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
    min-width: 0;
  }

  .picker-row :global(.material-select) {
    min-width: 0;
  }

  .material-note {
    margin: 0;
    color: var(--ink-primary);
    font-size: var(--text-sm);
    line-height: var(--leading-normal);
    overflow-wrap: anywhere;
    white-space: pre-wrap;
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

  .film-part-header { display: flex; justify-content: space-between; flex-wrap: wrap; align-items: center; gap: var(--space-sm); }
  .film-print {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-xs) var(--space-sm);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--ink-primary);
    background: var(--bg-1);
    font-size: var(--text-xs);
    font-weight: 700;
    cursor: pointer;
  }
  .film-print.active { border-color: var(--brand); background: var(--brand-soft); }
  .film-print input { accent-color: var(--brand); }

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
    .sign-toggle button, .toggle-label, .option, .paint-label,
    .section-note-warning, .film-print, .legacy-print-actions button { min-height: 44px; }
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
  .station-notes {
    display: grid;
    gap: var(--space-sm);
    min-width: 0;
    margin-top: auto;
  }
  .station-notes.has-note {
    padding: var(--space-sm);
    border: 1px solid var(--warn);
    border-radius: var(--radius-sm);
    background: var(--warn-soft);
    color: var(--ink-primary);
  }
  .notes-readonly { min-width: 0; font-size: var(--text-sm); line-height: var(--leading-normal); }
  .notes-readonly strong { display: flex; align-items: center; gap: var(--space-xs); }
  .notes-readonly p { margin: var(--space-xs) 0 0; white-space: pre-wrap; overflow-wrap: anywhere; }
  .notes-field {
    position: relative;
    display: flex;
    align-items: flex-start;
    gap: var(--space-xs, 4px);
    margin-top: auto;
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

  /* The same production form also lives in station packets and order panels.
     Respond to that available width, not only to the browser viewport. */
  @container production-profile (max-width: 1400px) {
    .form-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .section-xl { grid-column: 1 / -1; }
  }
  @container production-profile (max-width: 900px) {
    .form-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .assembly-grid-2x2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  @container production-profile (max-width: 600px) {
    .form-grid, .assembly-grid-2x2 { grid-template-columns: minmax(0, 1fr); }
    .section-sm, .section-lg, .section-xl { min-width: 0; }
    .form-header { flex-direction: column; align-items: stretch; }
    .sign-toggle { justify-content: center; }
    .paint-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  .profile-form.canvas-sheet .form-header { flex-direction: row; align-items: center; }
  /* A drawing sheet scales as a whole; viewport/container queries must never
     stack its five production sections when the user zooms or resizes it. */
  .profile-form.canvas-sheet .form-grid { grid-template-columns: repeat(6, minmax(0, 1fr)); }
  .profile-form.canvas-sheet .section-xl { grid-column: span 2; }
  .profile-form.canvas-sheet .section-sm, .profile-form.canvas-sheet .section-lg, .profile-form.canvas-sheet .section-xl { min-width: 0; }
  .profile-form.canvas-sheet .assembly-grid-2x2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
</style>
