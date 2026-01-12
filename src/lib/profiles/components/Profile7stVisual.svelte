<!-- src/lib/profiles/components/Profile7stVisual.svelte -->
<!-- Clean, scalable work form -->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import MaterialSelect from './fields/MaterialSelect.svelte';
  import { 
    AlertCircle, Zap, Power, Cable, Square, Droplets, 
    Wrench, Paintbrush, Layers, Scissors, StickyNote,
    Sun, Moon, Check, X
  } from 'lucide-svelte';
  
  interface ColorValue {
    system: string;
    code: string;
    hex: string;
  }
  
  interface ProfileConfiguration {
    profileName?: string;
    signType: 'INTERIOR' | 'EXTERIOR';
    
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
      psuType: 'regular' | 'dimmable';
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
  
  const defaultColor: ColorValue = { system: '', code: '', hex: '' };
  
  const defaultConfiguration: ProfileConfiguration = {
    profileName: 'New Profile',
    signType: 'EXTERIOR',
    CNC_FREZER: { face: '', back: '', laser: false, print3d: false, notes: '' },
    BENDER: { sides: '', depth: 100, notes: '' },
    FRONT: { 
      face: false, faceFilm: '', faceCustom: '',
      back: false, backFilm: '', backCustom: '',
      sides: false, sidesFilm: '', sidesCustom: '',
      notes: ''
    },
    PAINTING: { 
      face: false, faceColor: { ...defaultColor }, faceCustom: '',
      sides: true, sidesColor: { ...defaultColor }, sidesCustom: '',
      back: false, backColor: { ...defaultColor }, backCustom: '',
      frame: false, frameColor: { ...defaultColor }, frameCustom: '',
      notes: ''
    },
    ASSEMBLING: { 
      led: true, ledModule: '', ledCustom: '',
      psu: true, psuModel: '', psuType: 'regular', psuMounting: '',
      cables: true, cableType: '', cablesLength: '2m', cablesWago: false,
      frame: true, frameMaterial: '', frameDimensions: '40x40x2', frameCustom: '',
      frameWaterholes: true, frameMountingHoles: false,
      shablon: false, notes: ''
    }
  };
  
  export let configuration: ProfileConfiguration = { ...defaultConfiguration };
  export let readonly: boolean = false;
  
  // Merge with defaults
  $: if (configuration) {
    configuration = {
      ...defaultConfiguration,
      ...configuration,
      CNC_FREZER: { ...defaultConfiguration.CNC_FREZER, ...(configuration.CNC_FREZER || {}) },
      BENDER: { ...defaultConfiguration.BENDER, ...(configuration.BENDER || {}) },
      FRONT: { ...defaultConfiguration.FRONT, ...(configuration.FRONT || {}) },
      PAINTING: { 
        ...defaultConfiguration.PAINTING, 
        ...(configuration.PAINTING || {}),
        faceColor: { ...defaultColor, ...(configuration.PAINTING?.faceColor || {}) },
        sidesColor: { ...defaultColor, ...(configuration.PAINTING?.sidesColor || {}) },
        backColor: { ...defaultColor, ...(configuration.PAINTING?.backColor || {}) },
        frameColor: { ...defaultColor, ...(configuration.PAINTING?.frameColor || {}) }
      },
      ASSEMBLING: { ...defaultConfiguration.ASSEMBLING, ...(configuration.ASSEMBLING || {}) }
    };
  }
  
  const dispatch = createEventDispatcher();
  
  // Material categories
  const faceMaterials = ['ACRYLIC_XT', 'ACRYLIC_GS', 'ACRYLIC_LED', 'ALU_SHEET', 'ALU_COMPOSITE', 'PVC_FOAM'];
  const backMaterials = ['ALU_SHEET', 'ALU_COMPOSITE', 'ACRYLIC_XT', 'PVC_FOAM'];
  const sidesMaterials = ['ALU_SHEET', 'ALU_PROFILE'];
  const filmCategories = ['VINYL_ORACAL'];
  const paintCategories = ['PAINT_RAL', 'PAINT_PANTONE'];
  const ledCategories = ['LED_MODULE', 'LED_STRIP'];
  const psuCategories = ['PSU_MEANWELL'];
  const wireCategories = ['WIRE', 'LED_ACCESSORY'];
  const frameMaterials = ['ALU_PROFILE', 'ALU_SHEET'];
  
  function emit() {
    dispatch('change', configuration);
  }
  
  // Extract short name from change event - prioritizes metadata
  function extractShortName(e: any, fallbackCategory: string): string {
    return e.detail.shortName || 
           e.detail.material?.metadata?.short_name ||
           e.detail.material?.metadata?.colorCode || 
           getShortName(e.detail.material?.code || e.detail.value, fallbackCategory);
  }
  
  // Get contrasting text color for badges
  function getTextColor(hex: string): string {
    if (!hex || hex.length < 4) return '#000';
    try {
      const r = parseInt(hex.slice(1,3), 16);
      const g = parseInt(hex.slice(3,5), 16);
      const b = parseInt(hex.slice(5,7), 16);
      return (0.299*r + 0.587*g + 0.114*b) / 255 > 0.5 ? '#000' : '#fff';
    } catch {
      return '#000';
    }
  }
  
  // Get short display name from material value - improved extraction
  function getShortName(value: string, category?: string): string {
    if (!value) return '';
    
    // For Oracal/Vinyl - show FULL code like 8500_064 (series_colorCode)
    if (category?.includes('ORACAL') || category?.includes('VINYL') || value.toLowerCase().includes('oracal')) {
      // Match complete Oracal codes: 8500-064, 8500_064, 8500 064, etc.
      const fullMatch = value.match(/(\d{4})[-_\s]?(\d{2,3})/);
      if (fullMatch) return `${fullMatch[1]}_${fullMatch[2]}`;
      // Try to extract from ORACAL_8500_064 format
      const oracalMatch = value.match(/ORACAL[_-]?(\d{4})[_-]?(\d{2,3})/i);
      if (oracalMatch) return `${oracalMatch[1]}_${oracalMatch[2]}`;
      // Just series + color code at end
      const seriesMatch = value.match(/(\d{4})/);
      const colorMatch = value.match(/[-_](\d{2,3})(?:\s|$)/);
      if (seriesMatch && colorMatch) return `${seriesMatch[1]}_${colorMatch[1]}`;
      // Fallback: try to get any 4-digit + 2-3 digit pattern
      const anyMatch = value.match(/\b(\d{4})\D+(\d{2,3})\b/);
      if (anyMatch) return `${anyMatch[1]}_${anyMatch[2]}`;
      return value.replace(/oracal\s*/i, '').replace(/vinyl\s*/i, '').trim().substring(0, 12).toUpperCase();
    }
    
    // For acrylic - extract colorCode like 3N570, WN071, 0F00, WH10
    if (category?.includes('ACRYLIC') || value.toLowerCase().includes('acrylic') || value.toLowerCase().includes('plexi')) {
      // Look for standard PLEXIGLAS colorCodes: 3N570, WN071, WH10, 0F00, 0E010, 7A670
      // Format: 1-2 alphanumeric + N/F/H/A + 2-3 digits, OR 2 letters + 2 digits
      const codePatterns = [
        /\b(\d[A-Z]\d{3})\b/i,       // 3N570, 0F00, 0E010
        /\b([A-Z]{2}\d{2,3})\b/i,    // WN071, WH10, WN297
        /\b(\d[A-Z]{2}\d{2})\b/i,    // 7A670
      ];
      for (const pattern of codePatterns) {
        const match = value.match(pattern);
        if (match) return match[1].toUpperCase();
      }
      // Try extracting from PLEXIGLAS_XT_3N570 format
      const plexMatch = value.match(/(?:XT|GS|LED)[_-]?([A-Z0-9]{4,6})/i);
      if (plexMatch) return plexMatch[1].toUpperCase();
      // Descriptive fallbacks
      if (value.toLowerCase().includes('opal')) return 'OPAL';
      if (value.toLowerCase().includes('clear') || value.includes('0F00')) return 'CLEAR';
      if (/white/i.test(value) && !/opal/i.test(value)) return 'WHITE';
      // Last part might be the code
      const parts = value.split(/[-_\s]+/);
      const lastPart = parts[parts.length - 1];
      if (lastPart && /^[A-Z0-9]{4,6}$/i.test(lastPart)) return lastPart.toUpperCase();
      return 'PLEX';
    }
    
    // For ALU - show ALU + thickness or dimensions
    if (category?.includes('ALU') || value.toLowerCase().includes('alu')) {
      // Extract thickness like 1.5mm, 2.0mm
      const thicknessMatch = value.match(/([\d.,]+)\s*mm/i);
      if (thicknessMatch) return `ALU ${thicknessMatch[1].replace(',', '.')}`;
      // Extract profile dimensions like 40x40, 20x20
      const profileMatch = value.match(/(\d+x\d+)/i);
      if (profileMatch) return `ALU ${profileMatch[1]}`;
      // Extract from code like ALU_MILL_1_5 -> ALU 1.5
      const codeMatch = value.match(/ALU[_-]?(?:MILL|BRUSH|ANOD)?[_-]?(\d)[_-]?(\d)/i);
      if (codeMatch) return `ALU ${codeMatch[1]}.${codeMatch[2]}`;
      return 'ALU';
    }
    
    // For PVC
    if (category?.includes('PVC') || value.toLowerCase().includes('pvc') || value.toLowerCase().includes('forex')) {
      const thicknessMatch = value.match(/(\d+)\s*mm/i);
      if (thicknessMatch) return `PVC ${thicknessMatch[1]}`;
      if (value.toLowerCase().includes('forex')) return 'FOREX';
      return 'PVC';
    }
    
    // For RAL paint - just the 4-digit code
    if (category?.includes('RAL') || value.toLowerCase().includes('ral')) {
      const ralMatch = value.match(/\b(\d{4})\b/);
      if (ralMatch) return ralMatch[1];
    }
    
    // For Pantone
    if (category?.includes('PANTONE') || value.toLowerCase().includes('pantone')) {
      const pantoneMatch = value.match(/(\d+\s*[A-Z]*)/i);
      if (pantoneMatch) return pantoneMatch[1].trim();
    }
    
    // For LED modules - Brand + Color Temp (e.g., "BaltLed 4500K" or "Sloan 6500K")
    if (category?.includes('LED')) {
      const parts: string[] = [];
      const brandMatch = value.match(/\b(BaltLed|Sloan|Samsung|Nichia|Osram|Cree|LemLux|LG|Seoul)\b/i);
      if (brandMatch) parts.push(brandMatch[1]);
      const tempMatch = value.match(/(\d{4})\s*[kK]/);
      if (tempMatch) parts.push(`${tempMatch[1]}K`);
      // Color name as fallback
      const colorMatch = value.match(/\b(warm|cold|neutral|daylight|white|rgb)\b/i);
      if (colorMatch && parts.length < 2) parts.push(colorMatch[1].toUpperCase());
      if (parts.length > 0) return parts.join(' ');
      // Wattage
      const wattMatch = value.match(/(\d+\.?\d*)\s*[wW]/);
      if (wattMatch) return `${wattMatch[1]}W`;
      return 'LED';
    }
    
    // For PSU - Brand + Watts (e.g., "MeanWell 100W")
    if (category?.includes('PSU')) {
      const parts: string[] = [];
      const brandMatch = value.match(/\b(MeanWell|Mean\s*Well|Philips|Inventronics|Osram|Tridonic)\b/i);
      if (brandMatch) parts.push(brandMatch[1].replace(/\s+/g, ''));
      const wattMatch = value.match(/(\d+)\s*[wW]/);
      if (wattMatch) parts.push(`${wattMatch[1]}W`);
      if (parts.length > 0) return parts.join(' ');
      return 'PSU';
    }
    
    // For Cables/Wire - Dimensions + Color (e.g., "2x0.75 BLACK")
    if (category?.includes('WIRE') || category?.includes('CABLE')) {
      const parts: string[] = [];
      const dimsMatch = value.match(/(\d+x[\d.,]+)/i);
      if (dimsMatch) parts.push(dimsMatch[1]);
      const colorMatch = value.match(/\b(black|white|red|blue|green|grey|gray)\b/i);
      if (colorMatch) parts.push(colorMatch[1].toUpperCase());
      if (parts.length > 0) return parts.join(' ');
      return 'CABLE';
    }
    
    // Default: try to find a code-like pattern
    const codePattern = value.match(/\b([A-Z0-9]{3,8})\b/i);
    if (codePattern && !/the|and|for|with|board|sheet|foam/i.test(codePattern[1])) {
      return codePattern[1].toUpperCase();
    }
    const words = value.split(/[\s_-]+/).filter(w => w.length > 1 && !/the|and|for|with/i.test(w));
    if (words.length > 0) return words[0].substring(0, 8).toUpperCase();
    return value.substring(0, 8).toUpperCase();
  }
  
  // Check if any FRONT items are enabled
  $: hasFront = configuration.FRONT.face || configuration.FRONT.back || configuration.FRONT.sides;
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
        on:input={emit}
      />
    </div>
    <div class="sign-toggle">
      <button type="button" class:active={configuration.signType === 'EXTERIOR'}
        disabled={readonly} on:click={() => { configuration.signType = 'EXTERIOR'; emit(); }}>
        <Sun size={14} /> OUTDOOR
      </button>
      <button type="button" class:active={configuration.signType === 'INTERIOR'}
        disabled={readonly} on:click={() => { configuration.signType = 'INTERIOR'; emit(); }}>
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
              on:change={(e) => {
                configuration.CNC_FREZER.faceHex = e.detail.hex;
                configuration.CNC_FREZER.faceShort = extractShortName(e, 'ACRYLIC');
                configuration.CNC_FREZER.faceThickness = e.detail.material?.thickness_options?.[0]?.toString() || configuration.CNC_FREZER.faceThickness || '';
                emit();
              }}
            />
          </div>
          {#if configuration.CNC_FREZER.face}
            <span class="material-badge-lg" 
              style:background={configuration.CNC_FREZER.faceHex || '#87CEEB'} 
              style:color={getTextColor(configuration.CNC_FREZER.faceHex || '#87CEEB')}>
              {configuration.CNC_FREZER.faceShort || getShortName(configuration.CNC_FREZER.face, 'ACRYLIC')}
            </span>
            <input type="text" class="thickness-input" 
              bind:value={configuration.CNC_FREZER.faceThickness}
              disabled={readonly} on:input={emit} placeholder="mm" />
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
              on:change={(e) => {
                configuration.CNC_FREZER.backHex = e.detail.hex;
                configuration.CNC_FREZER.backShort = extractShortName(e, 'ALU');
                configuration.CNC_FREZER.backThickness = e.detail.material?.thickness_options?.[0]?.toString() || configuration.CNC_FREZER.backThickness || '';
                emit();
              }}
            />
          </div>
          {#if configuration.CNC_FREZER.back}
            <span class="material-badge-lg" 
              style:background={configuration.CNC_FREZER.backHex || '#A0A0A0'} 
              style:color={getTextColor(configuration.CNC_FREZER.backHex || '#A0A0A0')}>
              {configuration.CNC_FREZER.backShort || getShortName(configuration.CNC_FREZER.back, 'ALU')}
            </span>
            <input type="text" class="thickness-input" 
              bind:value={configuration.CNC_FREZER.backThickness}
              disabled={readonly} on:input={emit} placeholder="mm" />
          {/if}
        </div>
        
        <!-- Options -->
        <div class="options">
          <label class="option" class:active={configuration.CNC_FREZER.laser}>
            <input type="checkbox" bind:checked={configuration.CNC_FREZER.laser} disabled={readonly} on:change={emit} />
            <Scissors size={12} /> LASER
          </label>
          <label class="option" class:active={configuration.CNC_FREZER.print3d}>
            <input type="checkbox" bind:checked={configuration.CNC_FREZER.print3d} disabled={readonly} on:change={emit} />
            <Layers size={12} /> 3D
          </label>
        </div>
        
        <div class="notes-field" class:has-note={configuration.CNC_FREZER.notes}>
          {#if configuration.CNC_FREZER.notes}
            <span class="note-icon"><AlertCircle size={14} /></span>
          {/if}
          <StickyNote size={12} class="note-placeholder-icon" />
          <textarea class="notes" bind:value={configuration.CNC_FREZER.notes} 
            disabled={readonly} on:input={emit} placeholder="Notes..." rows="2"></textarea>
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
              on:change={(e) => {
                configuration.BENDER.sidesHex = e.detail.hex;
                configuration.BENDER.sidesShort = extractShortName(e, 'ALU');
                configuration.BENDER.sidesThickness = e.detail.material?.thickness_options?.[0]?.toString() || '';
                emit();
              }}
            />
          </div>
          {#if configuration.BENDER.sides}
            <span class="material-badge-lg" 
              style:background={configuration.BENDER.sidesHex || '#A0A0A0'} 
              style:color={getTextColor(configuration.BENDER.sidesHex || '#A0A0A0')}>
              {configuration.BENDER.sidesShort || getShortName(configuration.BENDER.sides, 'ALU')}
            </span>
          {/if}
        </div>
        
        <div class="depth-box">
          <label>DEPTH</label>
          <input type="number" class="depth-input" 
            bind:value={configuration.BENDER.depth}
            disabled={readonly} on:input={emit} min="30" max="500" />
        </div>
        
        <div class="notes-field" class:has-note={configuration.BENDER.notes}>
          {#if configuration.BENDER.notes}
            <span class="note-icon"><AlertCircle size={14} /></span>
          {/if}
          <StickyNote size={12} class="note-placeholder-icon" />
          <textarea class="notes" bind:value={configuration.BENDER.notes} 
            disabled={readonly} on:input={emit} placeholder="Notes..." rows="2"></textarea>
        </div>
      </div>
    </div>

    <!-- FRONT (Film) -->
    <div class="section" class:collapsed={!hasFront}>
      <div class="section-title"><Layers size={12} /> FRONT <span class="hint">(Film)</span></div>
      <div class="section-content">
        {#each ['face', 'back', 'sides'] as part}
          <div class="inline-field">
            <label class="toggle-label" class:active={configuration.FRONT[part]}>
              <input type="checkbox" bind:checked={configuration.FRONT[part]} disabled={readonly} on:change={emit} />
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
                  on:change={(e) => {
                    configuration.FRONT[`${part}FilmHex`] = e.detail.hex;
                    configuration.FRONT[`${part}FilmShort`] = extractShortName(e, 'ORACAL');
                    emit();
                  }}
                />
                {#if configuration.FRONT[`${part}Film`]}
                  <span class="material-badge-lg" 
                    style:background={configuration.FRONT[`${part}FilmHex`] || 'var(--bg-2)'}
                    style:color={getTextColor(configuration.FRONT[`${part}FilmHex`] || '#f0f0f0')}>
                    {configuration.FRONT[`${part}FilmShort`] || getShortName(configuration.FRONT[`${part}Film`], 'ORACAL')}
                  </span>
                {/if}
              </div>
              <input type="text" class="custom-input" 
                bind:value={configuration.FRONT[`${part}Custom`]}
                disabled={readonly} on:input={emit} placeholder="Custom..." />
            {/if}
          </div>
        {/each}
        
        <div class="notes-field" class:has-note={configuration.FRONT.notes}>
          {#if configuration.FRONT.notes}
            <span class="note-icon"><AlertCircle size={14} /></span>
          {/if}
          <StickyNote size={12} class="note-placeholder-icon" />
          <textarea class="notes" bind:value={configuration.FRONT.notes} 
            disabled={readonly} on:input={emit} placeholder="Notes..." rows="2"></textarea>
        </div>
      </div>
    </div>

    <!-- PAINTING -->
    <div class="section section-lg">
      <div class="section-title"><Paintbrush size={12} /> PAINTING</div>
      <div class="section-content">
        <div class="paint-grid">
          {#each [
            { key: 'face', label: 'FRONT' },
            { key: 'sides', label: 'SIDES' },
            { key: 'back', label: 'BACK' },
            { key: 'frame', label: 'FRAME' }
          ] as item}
            <div class="paint-item" class:inactive={!configuration.PAINTING[item.key]}>
              <label class="paint-label" class:active={configuration.PAINTING[item.key]}>
                <input type="checkbox" bind:checked={configuration.PAINTING[item.key]} disabled={readonly} on:change={emit} />
                {item.label}
              </label>
              {#if configuration.PAINTING[item.key]}
                <MaterialSelect
                  value={configuration.PAINTING[`${item.key}Color`].code ? `RAL ${configuration.PAINTING[`${item.key}Color`].code}` : ''}
                  categories={paintCategories}
                  placeholder="RAL..."
                  allowCustom={true}
                  {readonly}
                  on:change={(e) => {
                    const material = e.detail.material;
                    if (material) {
                      configuration.PAINTING[`${item.key}Color`] = {
                        system: material.category === 'PAINT_RAL' ? 'RAL' : 'Pantone',
                        code: material.code.replace('RAL_', '').replace('PANTONE_', ''),
                        hex: e.detail.hex || ''
                      };
                    } else if (e.detail.value) {
                      const code = e.detail.value.match(/\d{4}/)?.[0] || e.detail.value;
                      configuration.PAINTING[`${item.key}Color`] = { system: 'RAL', code, hex: '' };
                    }
                    emit();
                  }}
                />
                {#if configuration.PAINTING[`${item.key}Color`].code}
                  <span class="ral-badge" 
                    style:background={configuration.PAINTING[`${item.key}Color`].hex || '#4A5568'} 
                    style:color={getTextColor(configuration.PAINTING[`${item.key}Color`].hex || '#4A5568')}>
                    {configuration.PAINTING[`${item.key}Color`].code}
                  </span>
                {/if}
                <input type="text" class="custom-input" 
                  bind:value={configuration.PAINTING[`${item.key}Custom`]}
                  disabled={readonly} on:input={emit} placeholder="Custom..." />
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
          <textarea class="notes" bind:value={configuration.PAINTING.notes} 
            disabled={readonly} on:input={emit} placeholder="Notes..." rows="2"></textarea>
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
              <label class="toggle-label" class:active={configuration.ASSEMBLING.led}>
                <input type="checkbox" bind:checked={configuration.ASSEMBLING.led} disabled={readonly} on:change={emit} />
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
                  on:change={(e) => { 
                    configuration.ASSEMBLING.ledModuleHex = e.detail.hex;
                    configuration.ASSEMBLING.ledModuleShort = extractShortName(e, 'LED');
                    emit(); 
                  }}
                />
              </div>
              {#if configuration.ASSEMBLING.ledModule}
                <span class="material-badge-lg" 
                  style:background={configuration.ASSEMBLING.ledModuleHex || '#fbbf24'} 
                  style:color={getTextColor(configuration.ASSEMBLING.ledModuleHex || '#fbbf24')}>
                  <Zap size={16} />
                  {configuration.ASSEMBLING.ledModuleShort || getShortName(configuration.ASSEMBLING.ledModule, 'LED')}
                </span>
              {/if}
            {:else}
              <span class="no-badge-lg"><X size={14} /> NO LED</span>
            {/if}
          </div>

          <!-- PSU -->
          <div class="assembly-item">
            <div class="item-header">
              <label class="toggle-label" class:active={configuration.ASSEMBLING.psu}>
                <input type="checkbox" bind:checked={configuration.ASSEMBLING.psu} disabled={readonly} on:change={emit} />
                <Power size={14} /> PSU
              </label>
            </div>
            {#if configuration.ASSEMBLING.psu}
              <div class="psu-type">
                <label class:active={configuration.ASSEMBLING.psuType === 'regular'}>
                  <input type="radio" bind:group={configuration.ASSEMBLING.psuType} value="regular" disabled={readonly} on:change={emit} />
                  <Sun size={12} /> Regular
                </label>
                <label class:active={configuration.ASSEMBLING.psuType === 'dimmable'}>
                  <input type="radio" bind:group={configuration.ASSEMBLING.psuType} value="dimmable" disabled={readonly} on:change={emit} />
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
                  on:change={(e) => {
                    configuration.ASSEMBLING.psuModelShort = extractShortName(e, 'PSU');
                    emit();
                  }}
                />
              </div>
              {#if configuration.ASSEMBLING.psuModel}
                <span class="material-badge-lg" 
                  style:background="#6366f1" 
                  style:color="#fff">
                  <Power size={16} />
                  {configuration.ASSEMBLING.psuModelShort || getShortName(configuration.ASSEMBLING.psuModel, 'PSU')}
                </span>
              {/if}
              <input type="text" class="custom-input" bind:value={configuration.ASSEMBLING.psuMounting}
                disabled={readonly} on:input={emit} placeholder="Mounting..." />
            {:else}
              <span class="no-badge-lg"><X size={14} /> NO PSU</span>
            {/if}
          </div>

          <!-- CABLES -->
          <div class="assembly-item">
            <div class="item-header">
              <label class="toggle-label" class:active={configuration.ASSEMBLING.cables}>
                <input type="checkbox" bind:checked={configuration.ASSEMBLING.cables} disabled={readonly} on:change={emit} />
                <Cable size={14} /> CABLES
              </label>
            </div>
            {#if configuration.ASSEMBLING.cables}
              <div class="cable-row">
                <input type="text" class="length-input" bind:value={configuration.ASSEMBLING.cablesLength}
                  disabled={readonly} on:input={emit} placeholder="2m" />
                <MaterialSelect
                  bind:value={configuration.ASSEMBLING.cableType}
                  categories={wireCategories}
                  placeholder="Select..."
                  allowCustom={true}
                  showColor={false}
                  {readonly}
                  on:change={(e) => {
                    configuration.ASSEMBLING.cableTypeShort = extractShortName(e, 'WIRE');
                    emit();
                  }}
                />
              </div>
              {#if configuration.ASSEMBLING.cableType || configuration.ASSEMBLING.cablesLength}
                <span class="material-badge-lg" 
                  style:background="#374151" 
                  style:color="#fff">
                  <Cable size={16} />
                  {configuration.ASSEMBLING.cablesLength || ''}
                  {configuration.ASSEMBLING.cableTypeShort ? ` ${configuration.ASSEMBLING.cableTypeShort}` : ''}
                </span>
              {/if}
              <label class="wago-label" class:active={configuration.ASSEMBLING.cablesWago}>
                <input type="checkbox" bind:checked={configuration.ASSEMBLING.cablesWago} disabled={readonly} on:change={emit} />
                <span class="wago-badge">{configuration.ASSEMBLING.cablesWago ? '✓' : ''} WAGO</span>
              </label>
            {:else}
              <span class="no-badge-lg"><X size={14} /> NO CABLES</span>
            {/if}
          </div>

          <!-- FRAME -->
          <div class="assembly-item">
            <div class="item-header">
              <label class="toggle-label" class:active={configuration.ASSEMBLING.frame}>
                <input type="checkbox" bind:checked={configuration.ASSEMBLING.frame} disabled={readonly} on:change={emit} />
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
                  on:change={(e) => { 
                    configuration.ASSEMBLING.frameMaterialHex = e.detail.hex;
                    configuration.ASSEMBLING.frameMaterialShort = extractShortName(e, 'ALU');
                    emit(); 
                  }}
                />
              </div>
              {#if configuration.ASSEMBLING.frameMaterial}
                <span class="material-badge-lg" 
                  style:background={configuration.ASSEMBLING.frameMaterialHex || '#9ca3af'} 
                  style:color={getTextColor(configuration.ASSEMBLING.frameMaterialHex || '#9ca3af')}>
                  <Square size={16} />
                  {configuration.ASSEMBLING.frameMaterialShort || 'ALU'}
                </span>
              {/if}
              <div class="frame-options">
                <label class="opt waterholes" class:active={configuration.ASSEMBLING.frameWaterholes}>
                  <input type="checkbox" bind:checked={configuration.ASSEMBLING.frameWaterholes} disabled={readonly} on:change={emit} />
                  <Droplets size={12} /> WATER
                </label>
                <label class="opt warning" class:active={configuration.ASSEMBLING.frameMountingHoles}>
                  <input type="checkbox" bind:checked={configuration.ASSEMBLING.frameMountingHoles} disabled={readonly} on:change={emit} />
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
            <input type="checkbox" bind:checked={configuration.ASSEMBLING.shablon} disabled={readonly} on:change={emit} />
            <Layers size={14} /> SHABLON
          </label>
          {#if !configuration.ASSEMBLING.frameWaterholes && configuration.ASSEMBLING.frame}
            <span class="no-badge small"><X size={10} /> NO WATERHOLES</span>
          {/if}
        </div>
        
        <div class="notes-field" class:has-note={configuration.ASSEMBLING.notes}>
          {#if configuration.ASSEMBLING.notes}
            <span class="note-icon"><AlertCircle size={14} /></span>
          {/if}
          <StickyNote size={12} class="note-placeholder-icon" />
          <textarea class="notes" bind:value={configuration.ASSEMBLING.notes} 
            disabled={readonly} on:input={emit} placeholder="Notes..." rows="2"></textarea>
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .profile-form {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: var(--bg-1, #fff);
    border: 1px solid var(--border, #e0e0e0);
    border-radius: var(--radius-md, 8px);
    overflow: hidden;
  }
  
  .profile-form.readonly { pointer-events: none; opacity: 0.85; }

  /* HEADER */
  .form-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-lg, 16px);
    padding: var(--space-md, 12px) var(--space-lg, 16px);
    background: var(--bg-2, #f5f5f5);
    border-bottom: 2px solid var(--border, #e0e0e0);
    flex-wrap: wrap;
  }
  
  .profile-name input {
    background: #E91E63;
    color: white;
    border: none;
    padding: var(--space-sm, 8px) var(--space-md, 14px);
    border-radius: var(--radius-sm, 6px);
    font-weight: 600;
    font-size: var(--step-0, 14px);
    min-width: 150px;
  }
  
  .profile-name input::placeholder { color: rgba(255,255,255,0.7); }
  
  .sign-toggle {
    display: flex;
    gap: var(--space-xs, 4px);
    background: var(--bg-1, #fff);
    padding: var(--space-xs, 4px);
    border-radius: var(--radius-sm, 6px);
    border: 1px solid var(--border, #e0e0e0);
  }
  
  .sign-toggle button {
    background: transparent;
    border: none;
    padding: var(--space-sm, 8px) var(--space-lg, 16px);
    font-size: var(--step-0, 13px);
    font-weight: 600;
    color: var(--muted, #666);
    cursor: pointer;
    border-radius: var(--radius-sm, 4px);
    transition: all 0.15s;
  }
  
  .sign-toggle button.active {
    background: var(--ink-0, #1f2937);
    color: white;
  }

  /* MAIN GRID */
  .form-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 1px;
    background: var(--ink-0, #1f2937);
  }
  
  .section {
    background: var(--bg-1, #fff);
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  
  .section-sm { min-width: 140px; }
  .section-lg { min-width: 240px; }
  .section-xl { min-width: 350px; grid-column: span 2; }
  
  .section.collapsed { opacity: 0.6; }
  
  .section-title {
    background: #4A5568;
    color: white;
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
    color: var(--muted, #666);
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
    border: 1px solid rgba(0,0,0,0.1);
  }
  
  .thickness-input {
    width: 45px;
    padding: var(--space-xs, 4px) var(--space-sm, 6px);
    border: 1px solid var(--border, #ccc);
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
    color: var(--muted, #666);
    text-transform: uppercase;
  }
  
  .depth-input {
    width: 80px;
    height: 60px;
    border: 3px solid #1f2937;
    border-radius: 6px;
    font-size: 28px;
    font-weight: 900;
    text-align: center;
    -moz-appearance: textfield;
  }
  
  .depth-input::-webkit-outer-spin-button,
  .depth-input::-webkit-inner-spin-button { -webkit-appearance: none; }

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
    color: var(--muted, #666);
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
    background: var(--bg-2, #f5f5f5);
  }
  
  .option.active { background: #dbeafe; color: #1d4ed8; }
  .option input { width: 14px; height: 14px; }

  /* INLINE FIELDS */
  .inline-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px 0;
    border-bottom: 1px solid var(--border, #eee);
  }
  
  .inline-field:last-of-type { border-bottom: none; }
  
  .toggle-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 600;
    color: var(--muted, #666);
    cursor: pointer;
  }
  
  .toggle-label.active { color: #1f2937; }
  .toggle-label input { width: 14px; height: 14px; }
  
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
    background: var(--bg-2, #f9f9f9);
    border-radius: 6px;
  }
  
  .paint-item.inactive { opacity: 0.6; }
  
  .paint-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 600;
    color: var(--muted, #666);
    cursor: pointer;
  }
  
  .paint-label.active { color: #1f2937; }
  .paint-label input { width: 14px; height: 14px; }
  
  .ral-badge {
    padding: 8px 12px;
    border-radius: 4px;
    font-size: 16px;
    font-weight: 900;
    text-align: center;
  }

  /* NO BADGE */
  .no-badge {
    background: #dc2626;
    color: white;
    padding: 6px 10px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 700;
    text-align: center;
  }
  
  .no-badge.small { font-size: 9px; padding: 4px 6px; }

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
    background: var(--bg-2, #f9f9f9);
    border-radius: var(--radius-md, 6px);
  }
  
  .item-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  /* LARGE MATERIAL BADGE - 4x size */
  .material-badge-lg {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-sm, 8px);
    padding: var(--space-md, 12px) var(--space-lg, 16px);
    border-radius: var(--radius-md, 6px);
    font-weight: 800;
    font-size: 16px;
    text-transform: uppercase;
    white-space: nowrap;
    border: 2px solid rgba(0,0,0,0.1);
    min-height: 48px;
  }
  
  .no-badge-lg {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-xs, 4px);
    background: #dc2626;
    color: white;
    padding: var(--space-md, 12px) var(--space-lg, 16px);
    border-radius: var(--radius-md, 6px);
    font-size: 14px;
    font-weight: 700;
    text-align: center;
    min-height: 48px;
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
    background: var(--bg-1, #fff);
    border: 1px solid var(--border, #ddd);
    border-radius: 4px;
    font-size: 10px;
    font-weight: 600;
    cursor: pointer;
  }
  
  .psu-type label.active {
    background: #4A5568;
    color: white;
    border-color: #4A5568;
  }
  
  .psu-type input { display: none; }

  /* CABLES */
  .cable-row {
    display: flex;
    gap: 8px;
  }
  
  .length-input {
    width: 50px;
    padding: 6px;
    border: 1px solid var(--border, #ddd);
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
  
  .wago-label input { display: none; }
  
  .wago-badge {
    background: #e5e5e5;
    color: #666;
    padding: 4px 10px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 700;
  }
  
  .wago-label.active .wago-badge {
    background: #f59e0b;
    color: white;
  }

  /* FRAME */
  .dims-input {
    width: 100%;
    padding: 8px;
    border: 2px solid #1f2937;
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
    background: var(--bg-1, #fff);
    border: 1px solid var(--border, #ddd);
  }
  
  .opt input { display: none; }
  .opt.waterholes.active { background: #d1fae5; color: #059669; border-color: #059669; }
  .opt.warning.active { background: #fee2e2; color: #dc2626; border-color: #dc2626; }

  /* EXTRAS */
  .assembly-extras {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    padding-top: 10px;
    border-top: 1px solid var(--border, #eee);
  }
  
  .extra {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: var(--bg-2, #f5f5f5);
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
  }
  
  .extra.active { background: #4A5568; color: white; }
  .extra input { display: none; }

  /* INPUTS */
  .custom-input {
    width: 100%;
    padding: var(--space-xs, 4px) var(--space-sm, 8px);
    border: 1px solid var(--border, #ddd);
    border-radius: var(--radius-sm, 4px);
    font-size: 12px;
  }
  
  .custom-input:focus {
    outline: none;
    border-color: #3b82f6;
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
    color: #f59e0b;
    animation: pulse 2s infinite;
  }
  
  .notes-field.has-note .notes {
    border-color: #f59e0b;
    background: #fffbeb;
  }
  
  .notes-field :global(.note-placeholder-icon) {
    position: absolute;
    left: var(--space-sm, 8px);
    top: var(--space-sm, 8px);
    color: var(--muted, #999);
    opacity: 0.5;
    pointer-events: none;
  }
  
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
  
  .notes {
    width: 100%;
    padding: var(--space-sm, 8px) var(--space-sm, 8px) var(--space-sm, 8px) var(--space-xl, 28px);
    border: 1px dashed var(--border, #ddd);
    border-radius: var(--radius-sm, 4px);
    font-size: 12px;
    background: var(--bg-2, #fafafa);
    resize: vertical;
    min-height: 36px;
    word-wrap: break-word;
    overflow-wrap: break-word;
    white-space: pre-wrap;
  }
  
  .notes:focus {
    outline: none;
    border-color: #3b82f6;
    border-style: solid;
  }
  
  .notes::placeholder {
    color: var(--muted, #999);
  }

  /* RESPONSIVE */
  @media (max-width: 1400px) {
    .section-xl { grid-column: span 1; }
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
