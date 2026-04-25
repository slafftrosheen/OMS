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
    type ColorValue,
    defaultColor,
    extractShortName,
    getTextColor,
    getShortName,
  } from "$lib/profiles/helpers";
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
  } from "lucide-svelte";

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
      back: string;
      backHex?: string;
      backShort?: string;
      backThickness?: string;
      laser?: boolean;
      print3d?: boolean;
      notes?: string;
    };

    BENDER: {
      sides: string;
      sidesHex?: string;
      sidesShort?: string;
      sidesThickness?: string;
      depth: number;
      notes?: string;
    };

    FRONT: {
      face: boolean;
      faceFilm: string;
      faceFilmHex?: string;
      faceFilmShort?: string;
      faceCustom?: string;
      back: boolean;
      backFilm: string;
      backFilmHex?: string;
      backFilmShort?: string;
      backCustom?: string;
      sides: boolean;
      sidesFilm: string;
      sidesFilmHex?: string;
      sidesFilmShort?: string;
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
      ledCustom?: string;

      psu: boolean;
      psuModel: string;
      psuModelShort?: string;
      psuType: "regular" | "dimmable";
      psuMounting?: string;

      cables: boolean;
      cableType: string;
      cableTypeShort?: string;
      cablesLength: string;
      cablesWago: boolean;

      frame: boolean;
      frameMaterial: string;
      frameMaterialHex?: string;
      frameMaterialShort?: string;
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
    CNC_FREZER: { face: "", back: "", laser: false, print3d: false, notes: "" },
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
    configuration = $bindable({ ...defaultConfiguration }),
    /** If true, disables all inputs, making the form read-only. */
    readonly = false,
    /** Callback for configuration changes. */
    onchange,
  }: {
    configuration?: ProfileConfiguration;
    readonly?: boolean;
    onchange?: (config: ProfileConfiguration) => void;
  } = $props();

  import { untrack } from "svelte";

  /**
   * Effect to merge the incoming configuration with the default.
   * This ensures that the component can handle partially-defined configuration objects
   * without crashing due to missing nested properties.
   * Uses untrack() to prevent infinite loop when modifying configuration.
   */
  /**
   * Effect to merge the incoming configuration with the default.
   * This ensures that the component can handle partially-defined configuration objects
   * without crashing due to missing nested properties.
   * Uses JSON comparison to prevent infinite loops when updating configuration.
   */
  $effect(() => {
    // Read configuration to create dependency
    const currentConfig = configuration;
    if (currentConfig) {
      // Create the new merged configuration
      const newConfig: ProfileConfiguration = {
        ...defaultConfiguration,
        ...currentConfig,
        CNC_FREZER: {
          ...defaultConfiguration.CNC_FREZER,
          ...(currentConfig.CNC_FREZER || {}),
        },
        BENDER: {
          ...defaultConfiguration.BENDER,
          ...(currentConfig.BENDER || {}),
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
        },
      };

      // Only update if actually different to prevent infinite loops
      // Simple JSON stringify is sufficient for configuration objects like this
      if (JSON.stringify(currentConfig) !== JSON.stringify(newConfig)) {
        untrack(() => {
          configuration = newConfig;
        });
      }
    }
  });

  // Pre-defined material categories for the MaterialSelect component.
  const faceMaterials = [
    "ACRYLIC_XT",
    "ACRYLIC_GS",
    "ACRYLIC_LED",
    "ALU_SHEET",
    "ALU_COMPOSITE",
    "PVC_FOAM",
  ];
  const backMaterials = [
    "ALU_SHEET",
    "ALU_COMPOSITE",
    "ACRYLIC_XT",
    "PVC_FOAM",
  ];
  const sidesMaterials = ["ALU_SHEET", "ALU_PROFILE"];
  const filmCategories = ["VINYL_ORACAL"];
  const paintCategories = ["PAINT_RAL", "PAINT_PANTONE"];
  const ledCategories = ["LED_MODULE", "LED_STRIP"];
  const psuCategories = ["PSU_MEANWELL"];
  const wireCategories = ["WIRE", "LED_ACCESSORY"];
  const frameMaterials = ["ALU_PROFILE", "ALU_SHEET"];

  // Local state for material thickness options
  let faceThicknessOptions: number[] = [];
  let backThicknessOptions: number[] = [];
  let sidesThicknessOptions: number[] = [];

  /**
   * Emits a 'change' event with the current configuration.
   * This function is called after any user interaction that modifies the form data.
   */
  function emit() {
    onchange?.(configuration);
  }

  // A derived variable to determine if the "FRONT" section should be expanded.
  let hasFront = $derived(
    configuration.FRONT.face ||
      configuration.FRONT.back ||
      configuration.FRONT.sides,
  );

  let isRoundFrame = $derived(
    configuration.ASSEMBLING.frameMaterial?.toLowerCase().includes("tube") ||
      configuration.ASSEMBLING.frameMaterial?.toLowerCase().includes("round") ||
      configuration.ASSEMBLING.frameMaterial?.toLowerCase().includes(" d") ||
      configuration.ASSEMBLING.frameMaterial?.startsWith("D") ||
      configuration.ASSEMBLING.frameMaterialShort?.startsWith("D"),
  );
</script>

<div class="profile-form" class:readonly>
  <!-- HEADER -->
  <div class="form-header">
    <div class="profile-name">
      <input
        type="text"
        bind:value={configuration.profileName}
        placeholder="Profile Name"
        disabled={readonly}
        oninput={emit}
      />
    </div>
    <div class="sign-toggle">
      <button
        type="button"
        class:active={configuration.signType === "EXTERIOR"}
        disabled={readonly}
        onclick={() => {
          configuration.signType = "EXTERIOR";
          emit();
        }}
      >
        <Sun size={14} /> OUTDOOR
      </button>
      <button
        type="button"
        class:active={configuration.signType === "INTERIOR"}
        disabled={readonly}
        onclick={() => {
          configuration.signType = "INTERIOR";
          emit();
        }}
      >
        <Moon size={14} /> INDOOR
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
        <div class="field">
          <label>FACE</label>
          <div class="picker-row">
            <MaterialSelect
              bind:value={configuration.CNC_FREZER.face}
              categories={faceMaterials}
              placeholder="Select..."
              allowCustom={true}
              {readonly}
              onchange={(data) => {
                configuration.CNC_FREZER.faceHex = data.hex;
                configuration.CNC_FREZER.faceShort = extractShortName(
                  data,
                  "ACRYLIC",
                );
                faceThicknessOptions = data.material?.thickness_options || [];
                if (
                  faceThicknessOptions.length > 0 &&
                  !faceThicknessOptions.includes(
                    Number(configuration.CNC_FREZER.faceThickness),
                  )
                ) {
                  configuration.CNC_FREZER.faceThickness =
                    faceThicknessOptions[0].toString();
                } else if (
                  !configuration.CNC_FREZER.faceThickness &&
                  faceThicknessOptions.length > 0
                ) {
                  configuration.CNC_FREZER.faceThickness =
                    faceThicknessOptions[0].toString();
                }
                emit();
              }}
            />
          </div>
          {#if configuration.CNC_FREZER.face}
            <span
              class="material-badge-lg"
              style:background={configuration.CNC_FREZER.faceHex || "#87CEEB"}
              style:color={getTextColor(
                configuration.CNC_FREZER.faceHex || "#87CEEB",
              )}
            >
              {configuration.CNC_FREZER.faceShort ||
                getShortName(configuration.CNC_FREZER.face, "ACRYLIC")}{#if configuration.CNC_FREZER.faceThickness}/{configuration.CNC_FREZER.faceThickness}{/if}
            </span>
            <MaterialThicknessSelect
              bind:value={configuration.CNC_FREZER.faceThickness}
              materialType={configuration.CNC_FREZER.face.split("_")[0] ||
                "PVC"}
              placeholder="Select thickness"
              {readonly}
              onchange={emit}
            />
          {/if}
        </div>

        <!-- BACK -->
        <div class="field">
          <label>BACK</label>
          <div class="picker-row">
            <MaterialSelect
              bind:value={configuration.CNC_FREZER.back}
              categories={backMaterials}
              placeholder="Select..."
              allowCustom={true}
              {readonly}
              onchange={(data) => {
                configuration.CNC_FREZER.backHex = data.hex;
                configuration.CNC_FREZER.backShort = extractShortName(
                  data,
                  "ALU",
                );
                backThicknessOptions = data.material?.thickness_options || [];
                if (
                  backThicknessOptions.length > 0 &&
                  !backThicknessOptions.includes(
                    Number(configuration.CNC_FREZER.backThickness),
                  )
                ) {
                  configuration.CNC_FREZER.backThickness =
                    backThicknessOptions[0].toString();
                } else if (
                  !configuration.CNC_FREZER.backThickness &&
                  backThicknessOptions.length > 0
                ) {
                  configuration.CNC_FREZER.backThickness =
                    backThicknessOptions[0].toString();
                }
                emit();
              }}
            />
          </div>
          {#if configuration.CNC_FREZER.back}
            <span
              class="material-badge-lg"
              style:background={configuration.CNC_FREZER.backHex || "#A0A0A0"}
              style:color={getTextColor(
                configuration.CNC_FREZER.backHex || "#A0A0A0",
              )}
            >
              {configuration.CNC_FREZER.backShort ||
                getShortName(configuration.CNC_FREZER.back, "ALU")}{#if configuration.CNC_FREZER.backThickness}/{configuration.CNC_FREZER.backThickness}{/if}
            </span>
            <MaterialThicknessSelect
              bind:value={configuration.CNC_FREZER.backThickness}
              materialType={configuration.CNC_FREZER.back.split("_")[0] ||
                "PVC"}
              placeholder="Select thickness"
              {readonly}
              onchange={emit}
            />
          {/if}
        </div>

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
        <div class="field">
          <label>SIDES</label>
          <div class="picker-row">
            <MaterialSelect
              bind:value={configuration.BENDER.sides}
              categories={sidesMaterials}
              placeholder="Select..."
              allowCustom={true}
              {readonly}
              onchange={(data) => {
                configuration.BENDER.sidesHex = data.hex;
                configuration.BENDER.sidesShort = extractShortName(data, "ALU");
                sidesThicknessOptions = data.material?.thickness_options || [];
                if (
                  sidesThicknessOptions.length > 0 &&
                  !sidesThicknessOptions.includes(
                    Number(configuration.BENDER.sidesThickness),
                  )
                ) {
                  configuration.BENDER.sidesThickness =
                    sidesThicknessOptions[0].toString();
                } else if (
                  !configuration.BENDER.sidesThickness &&
                  sidesThicknessOptions.length > 0
                ) {
                  configuration.BENDER.sidesThickness =
                    sidesThicknessOptions[0].toString();
                }
                emit();
              }}
            />
          </div>
          {#if configuration.BENDER.sides}
            <span
              class="material-badge-lg"
              style:background={configuration.BENDER.sidesHex || "#A0A0A0"}
              style:color={getTextColor(
                configuration.BENDER.sidesHex || "#A0A0A0",
              )}
            >
              {configuration.BENDER.sidesShort ||
                getShortName(configuration.BENDER.sides, "ALU")}{#if configuration.BENDER.sidesThickness}/{configuration.BENDER.sidesThickness}{/if}
            </span>
            <MaterialThicknessSelect
              bind:value={configuration.BENDER.sidesThickness}
              materialType={configuration.BENDER.sides.split("_")[0] || "ALU"}
              placeholder="Select thickness"
              {readonly}
              onchange={emit}
            />
          {/if}
        </div>

        <div class="depth-box">
          <label>DEPTH</label>
          <input
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
                  categories={filmCategories}
                  placeholder="Select..."
                  allowCustom={true}
                  {readonly}
                  onchange={(data) => {
                    configuration.FRONT[`${part}FilmHex`] = data.hex;
                    configuration.FRONT[`${part}FilmShort`] = extractShortName(
                      data,
                      "ORACAL",
                    );
                    emit();
                  }}
                />
                {#if configuration.FRONT[`${part}Film`]}
                  <span
                    class="material-badge-lg"
                    style:background={configuration.FRONT[`${part}FilmHex`] ||
                      "var(--bg-2)"}
                    style:color={getTextColor(
                      configuration.FRONT[`${part}FilmHex`] || "#f0f0f0",
                    )}
                  >
                    {configuration.FRONT[`${part}FilmShort`] ||
                      getShortName(
                        configuration.FRONT[`${part}Film`],
                        "ORACAL",
                      )}
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
                  value={configuration.PAINTING[`${item.key}Color`].code
                    ? `RAL ${configuration.PAINTING[`${item.key}Color`].code}`
                    : ""}
                  categories={paintCategories}
                  placeholder="RAL..."
                  allowCustom={true}
                  {readonly}
                  onchange={(data) => {
                    const material = data.material;
                    if (material) {
                      configuration.PAINTING[`${item.key}Color`] = {
                        system:
                          material.category === "PAINT_RAL" ? "RAL" : "Pantone",
                        code: material.code
                          .replace("RAL_", "")
                          .replace("PANTONE_", ""),
                        hex: data.hex || "",
                      };
                    } else if (data.value) {
                      const code = data.value.match(/\d{4}/)?.[0] || data.value;
                      configuration.PAINTING[`${item.key}Color`] = {
                        system: "RAL",
                        code,
                        hex: "",
                      };
                    }
                    emit();
                  }}
                />
                {#if configuration.PAINTING[`${item.key}Color`].code}
                  <span
                    class="ral-badge"
                    style:background={configuration.PAINTING[`${item.key}Color`]
                      .hex || "#4A5568"}
                    style:color={getTextColor(
                      configuration.PAINTING[`${item.key}Color`].hex ||
                        "#4A5568",
                    )}
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
          <div class="assembly-item">
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
                  categories={ledCategories}
                  placeholder="Select..."
                  allowCustom={true}
                  showColor={false}
                  {readonly}
                  onchange={(data) => {
                    configuration.ASSEMBLING.ledModuleHex = data.hex;
                    configuration.ASSEMBLING.ledModuleShort = extractShortName(
                      data,
                      "LED",
                    );
                    emit();
                  }}
                />
              </div>
              {#if configuration.ASSEMBLING.ledModule}
                <span
                  class="material-badge-lg"
                  style:background={configuration.ASSEMBLING.ledModuleHex ||
                    "#fbbf24"}
                  style:color={getTextColor(
                    configuration.ASSEMBLING.ledModuleHex || "#fbbf24",
                  )}
                >
                  <Zap size={16} />
                  {configuration.ASSEMBLING.ledModuleShort ||
                    getShortName(configuration.ASSEMBLING.ledModule, "LED")}
                </span>
              {/if}
            {:else}
              <span class="no-badge-lg"><X size={14} /> NO LED</span>
            {/if}
          </div>

          <!-- PSU -->
          <div class="assembly-item">
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
              <div class="psu-type">
                <label
                  class:active={configuration.ASSEMBLING.psuType === "regular"}
                >
                  <input
                    type="radio"
                    bind:group={configuration.ASSEMBLING.psuType}
                    value="regular"
                    disabled={readonly}
                    onchange={emit}
                  />
                  <Sun size={12} /> Regular
                </label>
                <label
                  class:active={configuration.ASSEMBLING.psuType === "dimmable"}
                >
                  <input
                    type="radio"
                    bind:group={configuration.ASSEMBLING.psuType}
                    value="dimmable"
                    disabled={readonly}
                    onchange={emit}
                  />
                  <Moon size={12} /> Dimmable
                </label>
              </div>
              <div class="picker-row">
                <MaterialSelect
                  bind:value={configuration.ASSEMBLING.psuModel}
                  categories={psuCategories}
                  placeholder="Select..."
                  allowCustom={true}
                  showColor={false}
                  {readonly}
                  onchange={(data) => {
                    configuration.ASSEMBLING.psuModelShort = extractShortName(
                      data,
                      "PSU",
                    );
                    emit();
                  }}
                />
              </div>
              {#if configuration.ASSEMBLING.psuModel}
                <span
                  class="material-badge-lg"
                  style:background="#6366f1"
                  style:color="#fff"
                >
                  <Power size={16} />
                  {configuration.ASSEMBLING.psuModelShort ||
                    getShortName(configuration.ASSEMBLING.psuModel, "PSU")}
                </span>
              {/if}
              <input
                type="text"
                class="custom-input"
                bind:value={configuration.ASSEMBLING.psuMounting}
                disabled={readonly}
                oninput={emit}
                placeholder="Mounting..."
              />
            {:else}
              <span class="no-badge-lg"><X size={14} /> NO PSU</span>
            {/if}
          </div>

          <!-- CABLES -->
          <div class="assembly-item">
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
                <Cable size={14} /> CABLES
              </label>
            </div>
            {#if configuration.ASSEMBLING.cables}
              <div class="cable-row">
                <input
                  type="text"
                  class="length-input"
                  bind:value={configuration.ASSEMBLING.cablesLength}
                  disabled={readonly}
                  oninput={emit}
                  placeholder="2m"
                />
                <MaterialSelect
                  bind:value={configuration.ASSEMBLING.cableType}
                  categories={wireCategories}
                  placeholder="Select..."
                  allowCustom={true}
                  showColor={false}
                  {readonly}
                  onchange={(data) => {
                    configuration.ASSEMBLING.cableTypeShort = extractShortName(
                      data,
                      "WIRE",
                    );
                    emit();
                  }}
                />
              </div>
              {#if configuration.ASSEMBLING.cableType || configuration.ASSEMBLING.cablesLength}
                <span
                  class="material-badge-lg"
                  style:background="#374151"
                  style:color="#fff"
                >
                  <Cable size={16} />
                  {configuration.ASSEMBLING.cablesLength || ""}
                  {configuration.ASSEMBLING.cableTypeShort
                    ? ` ${configuration.ASSEMBLING.cableTypeShort}`
                    : ""}
                </span>
              {/if}
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
                <span class="wago-badge"
                  >{configuration.ASSEMBLING.cablesWago ? "✓" : ""} WAGO</span
                >
              </label>
            {:else}
              <span class="no-badge-lg"><X size={14} /> NO CABLES</span>
            {/if}
          </div>

          <!-- FRAME -->
          <div class="assembly-item">
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
                  categories={frameMaterials}
                  placeholder="Select..."
                  allowCustom={true}
                  {readonly}
                  onchange={(data) => {
                    configuration.ASSEMBLING.frameMaterialHex = data.hex;
                    configuration.ASSEMBLING.frameMaterialShort =
                      extractShortName(data, "ALU");
                    emit();
                  }}
                />
              </div>
              {#if configuration.ASSEMBLING.frameMaterial}
                <span
                  class="material-badge-lg"
                  style:background={configuration.ASSEMBLING.frameMaterialHex ||
                    "#9ca3af"}
                  style:color={getTextColor(
                    configuration.ASSEMBLING.frameMaterialHex || "#9ca3af",
                  )}
                >
                  <Square size={16} />
                  {configuration.ASSEMBLING.frameMaterialShort || "ALU"}{#if configuration.ASSEMBLING.frameDimensions}/{configuration.ASSEMBLING.frameDimensions}{/if}
                </span>
                <div class="field">
                  <label>{isRoundFrame ? "DIAMETER (mm)" : "FRAME SIZE"}</label>
                  <input
                    type="text"
                    bind:value={configuration.ASSEMBLING.frameDimensions}
                    placeholder={isRoundFrame ? "e.g. D20" : "e.g. 40x40"}
                    disabled={readonly}
                    oninput={emit}
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

  .profile-form.readonly {
    pointer-events: none;
    opacity: 0.85;
  }

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
    background: var(--brand);
    color: var(--bg-0);
    border: none;
    padding: var(--space-sm, 8px) var(--space-md, 14px);
    border-radius: var(--radius-sm, 6px);
    font-weight: 600;
    font-size: var(--step-0, 14px);
    min-width: 150px;
  }

  .profile-name input::placeholder {
    color: color-mix(in oklab, var(--bg-0) 7%, transparent);
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
    transition: all 0.15s;
  }

  .sign-toggle button.active {
    background: var(--ink-0, var(--ink-primary));
    color: var(--bg-0);
  }

  /* MAIN GRID */
  .form-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 1px;
    background: var(--ink-0, var(--ink-primary));
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
    min-width: 240px;
  }
  .section-xl {
    min-width: 350px;
    grid-column: span 2;
  }

  .section.collapsed {
    opacity: 0.6;
  }

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
    opacity: 0.7;
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
    display: flex;
    flex-direction: column;
    gap: var(--space-xs, 4px);
  }

  .field > label {
    font-size: 10px;
    font-weight: 600;
    color: var(--muted, var(--ink-tertiary));
    text-transform: uppercase;
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

  .material-badge {
    padding: var(--space-xs, 4px) var(--space-sm, 8px);
    border-radius: var(--radius-sm, 4px);
    font-weight: 700;
    font-size: 12px;
    text-transform: uppercase;
    white-space: nowrap;
    flex-shrink: 0;
    border: 1px solid color-mix(in oklab, var(--bg-0) 10%, transparent);
  }

  .thickness-input {
    width: 45px;
    padding: var(--space-xs, 4px) var(--space-sm, 6px);
    border: 1px solid var(--border, var(--border));
    border-radius: var(--radius-sm, 4px);
    font-size: 12px;
    font-weight: 600;
    text-align: center;
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
    color: color-mix(in oklab, var(--brand) 90%, black);
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

  .inline-controls {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    padding-left: 20px;
  }

  .inline-controls :global(.material-select) {
    flex: 1;
    min-width: 120px;
    max-width: 200px;
  }

  /* FILM BADGE */
  .film-badge {
    padding: 4px 10px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
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
    opacity: 0.6;
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
  }

  /* NO BADGE */
  .no-badge {
    background: var(--error);
    color: var(--bg-0);
    padding: 6px 10px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 700;
    text-align: center;
  }

  .no-badge.small {
    font-size: 9px;
    padding: 4px 6px;
  }

  /* ASSEMBLY 2x2 GRID */
  .assembly-grid-2x2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-md, 12px);
  }

  .assembly-item {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm, 8px);
    padding: var(--space-md, 12px);
    background: var(--bg-2, var(--bg-2));
    border-radius: var(--radius-md, 6px);
  }

  .item-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  /* LARGE MATERIAL BADGE - 4x size */
  /* Standardized Material Badges */
  .material-badge,
  .film-badge,
  .color-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    background: var(--bg-2, var(--bg-2));
    border: 1px solid var(--border, var(--border));
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    color: var(--text-secondary, var(--ink-secondary));
    white-space: nowrap;
    min-height: 28px; /* Fixed height for consistency */
    max-width: 100%; /* Prevent overflow */
  }

  .material-badge {
    background: linear-gradient(135deg, var(--brand-soft), var(--brand-soft));
    border-color: var(--brand-soft);
    color: color-mix(in oklab, var(--brand) 85%, black);
  }

  .film-badge {
    background: linear-gradient(135deg, var(--error-soft), var(--error-soft));
    border-color: color-mix(in oklab, var(--error) 40%, transparent);
    color: #be185d;
  }

  .color-badge {
    background: linear-gradient(135deg, var(--warn-soft), color-mix(in oklab, var(--warn) 35%, transparent));
    border-color: color-mix(in oklab, var(--warn) 65%, var(--bg-0));
    color: color-mix(in oklab, var(--warn) 65%, black);
  }

  .badge-swatch {
    width: 16px;
    height: 16px;
    border-radius: 3px;
    border: 1px solid color-mix(in oklab, var(--bg-0) 10%, transparent);
    flex-shrink: 0;
  }

  .badge-remove {
    background: transparent;
    border: none;
    padding: 0;
    width: 14px;
    height: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: currentColor;
    opacity: 0.6;
    transition: opacity 0.15s;
  }

  .badge-remove:hover {
    opacity: 1;
  }

  /* Ensure all selectors show badges the same way */
  .material-selector,
  .film-selector,
  .color-selector {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .material-selector > select,
  .film-selector > select,
  .color-selector > .color-input-group {
    flex: 1;
    min-width: 120px;
  }

  .material-badge-lg {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-sm, 8px);
    padding: var(--space-md, 12px);
    border-radius: var(--radius-md, 6px);
    font-weight: 800;
    font-size: 14px;
    text-transform: uppercase;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    border: 2px solid color-mix(in oklab, var(--bg-0) 10%, transparent);
    height: 48px;
    flex: 1;
    min-width: 0;
    box-sizing: border-box;
    text-align: center;
  }

  .thickness-select {
    width: 100%;
    padding: var(--space-xs, 4px) var(--space-sm, 6px);
    border: 1px solid var(--border, var(--border));
    border-radius: var(--radius-sm, 4px);
    font-size: 12px;
    font-weight: 600;
    background: white;
    cursor: pointer;
  }

  .thickness-select:focus {
    outline: none;
    border-color: var(--brand);
  }

  .no-badge-lg {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-xs, 4px);
    background: var(--error);
    color: var(--bg-0);
    padding: var(--space-md, 12px) var(--space-lg, 16px);
    border-radius: var(--radius-md, 6px);
    font-size: 14px;
    font-weight: 700;
    text-align: center;
    height: 48px;
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
  }

  .psu-type label.active {
    background: var(--ink-secondary);
    color: var(--bg-0);
    border-color: var(--ink-secondary);
  }

  .psu-type input {
    display: none;
  }

  /* CABLES */
  .cable-row {
    display: flex;
    gap: 8px;
  }

  .length-input {
    width: 50px;
    padding: 6px;
    border: 1px solid var(--border, var(--border));
    border-radius: 4px;
    font-size: 12px;
    text-align: center;
  }

  .cable-row :global(.material-select) {
    flex: 1;
  }

  .wago-label {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
  }

  .wago-label input {
    display: none;
  }

  .wago-badge {
    background: var(--border);
    color: var(--ink-tertiary);
    padding: 4px 10px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 700;
  }

  .wago-label.active .wago-badge {
    background: var(--warn);
    color: var(--bg-0);
  }

  /* FRAME */
  .dims-input {
    width: 100%;
    padding: 8px;
    border: 2px solid var(--ink-primary);
    border-radius: 4px;
    font-size: 13px;
    font-weight: 700;
    text-align: center;
  }

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
  }

  .opt input {
    display: none;
  }
  .opt.waterholes.active {
    background: var(--ok-soft);
    color: color-mix(in oklab, var(--ok) 85%, black);
    border-color: color-mix(in oklab, var(--ok) 85%, black);
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
  }

  .extra.active {
    background: var(--ink-secondary);
    color: var(--bg-0);
  }
  .extra input {
    display: none;
  }

  /* INPUTS */
  .custom-input {
    width: 100%;
    padding: var(--space-xs, 4px) var(--space-sm, 8px);
    border: 1px solid var(--border, var(--border));
    border-radius: var(--radius-sm, 4px);
    font-size: 12px;
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
    animation: pulse 2s infinite;
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

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
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
  }

  /* RESPONSIVE */
  @media (max-width: 1400px) {
    .section-xl {
      grid-column: span 1;
    }
  }

  @media (max-width: 900px) {
    .form-grid {
      grid-template-columns: 1fr 1fr;
    }

    .assembly-grid-2x2 {
      grid-template-columns: 1fr 1fr;
    }
  }

  @media (max-width: 600px) {
    .form-grid {
      grid-template-columns: 1fr;
    }

    .form-header {
      flex-direction: column;
      align-items: stretch;
    }

    .sign-toggle {
      justify-content: center;
    }

    .paint-grid {
      grid-template-columns: 1fr 1fr;
    }

    .assembly-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
