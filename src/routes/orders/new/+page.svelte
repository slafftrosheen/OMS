<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { t } from 'svelte-i18n';
  import { Save, ArrowLeft, AlertCircle, Plus, Trash2, Upload, FileText, Eye, MapPin, Calendar, User, Phone, ChevronDown, ChevronLeft, ChevronRight, X, Image, ZoomIn, ZoomOut, Maximize2 } from 'lucide-svelte';
  import Profile7stVisual from '$lib/profiles/components/Profile7stVisual.svelte';
  import { createId } from '$lib/utils/id';
  import { currentUser } from '$lib/auth/user-store';
  import { base } from '$app/paths';

  // Accept params prop to silence SvelteKit warning
  export let params = {};

  // Declare pdfjsLib type for TypeScript
  declare global {
    interface Window {
      pdfjsLib: any;
    }
  }

  let saving = false;
  let error = '';
  let successMessage = '';
  
  // Order Details
  let clientName = '';
  let poNumber = '';
  let deadline = '';
  let loadingDate = '';
  let notes = '';
  let priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT' = 'NORMAL';
  
  // Delivery Address
  interface DeliveryPreset {
    id: number;
    clientName: string;
    presetName: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    postalCode?: string;
    country: string;
    contactPerson?: string;
    contactPhone?: string;
    contactEmail?: string;
    deliveryNotes?: string;
    isDefault: boolean;
  }
  
  let deliveryPresets: DeliveryPreset[] = [];
  let selectedPresetId: number | null = null;
  let deliveryAddress = '';
  let deliveryContact = '';
  let deliveryPhone = '';
  let useManualAddress = false;
  let showPresetDropdown = false;
  
  // Files with preview
  interface FileWithPreview {
    file: File;
    preview?: string;
    pdfDataUrl?: string; // For PDF preview
    type: 'pdf' | 'cdr' | 'image' | 'other';
  }
  let uploadedFiles: FileWithPreview[] = [];
  let dragActive = false;
  
  // Preview state
  let selectedFileIndex: number | null = null;
  let previewZoom = 1;
  let previewContainer: HTMLElement;
  let pdfCanvas: HTMLCanvasElement;
  let pdfCurrentPage = 1;
  let pdfTotalPages = 1;
  let pdfDoc: any = null;
  
  function selectFile(index: number) {
    selectedFileIndex = index;
    previewZoom = 1;
    pdfCurrentPage = 1;
    
    // If it's a PDF, render it
    const file = uploadedFiles[index];
    if (file?.type === 'pdf' && file.pdfDataUrl) {
      renderPdfPage(file.pdfDataUrl, 1);
    }
  }
  
  let pdfRendering = false;
  let pdfRenderTask: any = null;
  let pdfPageCache: Map<string, any> = new Map();
  
  async function renderPdfPage(dataUrl: string, pageNum: number) {
    if (typeof window === 'undefined' || !window.pdfjsLib) return;
    if (pdfRendering) return;
    
    pdfRendering = true;
    
    try {
      // Cancel any previous render task
      if (pdfRenderTask) {
        try { pdfRenderTask.cancel(); } catch {}
        pdfRenderTask = null;
      }
      
      // Load the PDF document (with caching)
      const cacheKey = dataUrl.substring(0, 100);
      if (!pdfDoc || !pdfPageCache.has(cacheKey)) {
        pdfDoc = await window.pdfjsLib.getDocument({
          data: atob(dataUrl.split(',')[1]),
          cMapUrl: 'https://unpkg.com/pdfjs-dist@3.11.174/cmaps/',
          cMapPacked: true,
        }).promise;
        pdfTotalPages = pdfDoc.numPages;
        pdfPageCache.set(cacheKey, pdfDoc);
      } else {
        pdfDoc = pdfPageCache.get(cacheKey);
        pdfTotalPages = pdfDoc.numPages;
      }
      
      // Get the page
      const page = await pdfDoc.getPage(pageNum);
      
      // Calculate optimal scale based on container
      const baseScale = 1.0;
      const scale = baseScale * previewZoom;
      const viewport = page.getViewport({ scale });
      
      if (pdfCanvas) {
        const context = pdfCanvas.getContext('2d');
        pdfCanvas.height = viewport.height;
        pdfCanvas.width = viewport.width;
        
        // Clear canvas first
        context?.clearRect(0, 0, pdfCanvas.width, pdfCanvas.height);
        
        // Render the page
        pdfRenderTask = page.render({
          canvasContext: context,
          viewport: viewport
        });
        await pdfRenderTask.promise;
        pdfRenderTask = null;
      }
    } catch (err: any) {
      if (err?.name !== 'RenderingCancelledException') {
        console.error('Error rendering PDF:', err);
      }
    } finally {
      pdfRendering = false;
    }
  }
  
  function nextPdfPage() {
    if (pdfCurrentPage < pdfTotalPages) {
      pdfCurrentPage++;
      const file = uploadedFiles[selectedFileIndex!];
      if (file?.pdfDataUrl) {
        renderPdfPage(file.pdfDataUrl, pdfCurrentPage);
      }
    }
  }
  
  function prevPdfPage() {
    if (pdfCurrentPage > 1) {
      pdfCurrentPage--;
      const file = uploadedFiles[selectedFileIndex!];
      if (file?.pdfDataUrl) {
        renderPdfPage(file.pdfDataUrl, pdfCurrentPage);
      }
    }
  }
  
  // Re-render when zoom changes - debounced
  let zoomTimeout: ReturnType<typeof setTimeout>;
  $: if (selectedFileIndex !== null && uploadedFiles[selectedFileIndex]?.type === 'pdf' && uploadedFiles[selectedFileIndex]?.pdfDataUrl && previewZoom) {
    clearTimeout(zoomTimeout);
    zoomTimeout = setTimeout(() => {
      renderPdfPage(uploadedFiles[selectedFileIndex!].pdfDataUrl!, pdfCurrentPage);
    }, 200);
  }
  
  function zoomIn() {
    previewZoom = Math.min(previewZoom + 0.25, 3);
  }
  
  function zoomOut() {
    previewZoom = Math.max(previewZoom - 0.25, 0.5);
  }
  
  function resetZoom() {
    previewZoom = 1;
  }
  
  // Profiles
  type ProfileItem = {
    id: string;
    quantity: number;
    configuration: any;
    collapsed: boolean;
  };

  const defaultConfiguration = {
    profileName: 'New Profile',
    signType: 'EXTERIOR' as 'INTERIOR' | 'EXTERIOR',
    CNC_FREZER: { face: '', back: '', faceThickness: '', backThickness: '', laser: false, print3d: false, notes: '' },
    BENDER: { sides: '', sidesThickness: '', depth: 100, notes: '' },
    FRONT: { 
      face: false, faceFilm: '', faceCustom: '',
      back: false, backFilm: '', backCustom: '',
      sides: false, sidesFilm: '', sidesCustom: '',
      notes: ''
    },
    PAINTING: { 
      face: false, faceColor: { system: '', code: '', hex: '' }, faceCustom: '',
      sides: true, sidesColor: { system: '', code: '', hex: '' }, sidesCustom: '',
      back: false, backColor: { system: '', code: '', hex: '' }, backCustom: '',
      frame: false, frameColor: { system: '', code: '', hex: '' }, frameCustom: '',
      notes: ''
    },
    ASSEMBLING: { 
      led: true, ledModule: '', ledCustom: '',
      psu: true, psuModel: '', psuType: 'regular' as 'regular' | 'dimmable', psuMounting: '',
      cables: true, cableType: '', cablesLength: '2m', cablesWago: false,
      frame: true, frameMaterial: '', frameDimensions: '40x40x2', frameCustom: '',
      frameWaterholes: true, frameMountingHoles: false,
      shablon: false, notes: ''
    }
  };

  let profiles: ProfileItem[] = [
    { id: createId(), quantity: 1, configuration: JSON.parse(JSON.stringify(defaultConfiguration)), collapsed: false }
  ];

  // Check if user is SuperAdmin
  $: isSuperAdmin = $currentUser?.roles?.Admin === 'SuperAdmin';
  $: isAdmin = $currentUser?.primarySection === 'Admin' || isSuperAdmin;

  onMount(async () => {
    await Promise.all([
      generatePONumber(),
      loadDeliveryPresets()
    ]);
    
    // Set default deadline to 2 weeks from now
    const date = new Date();
    date.setDate(date.getDate() + 14);
    deadline = date.toISOString().split('T')[0];
  });

  async function generatePONumber() {
    try {
      const response = await fetch('/api/draft-orders/generate-po');
      const data = await response.json();
      poNumber = data.poNumber;
    } catch (err) {
      console.error('Failed to generate PO number:', err);
      const now = new Date();
      poNumber = `PO-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
    }
  }

  async function loadDeliveryPresets() {
    try {
      const response = await fetch('/api/delivery-presets');
      if (response.ok) {
        deliveryPresets = await response.json();
      }
    } catch (err) {
      console.error('Failed to load delivery presets:', err);
    }
  }

  function selectPreset(preset: DeliveryPreset) {
    selectedPresetId = preset.id;
    clientName = preset.clientName;
    deliveryAddress = [
      preset.addressLine1,
      preset.addressLine2,
      `${preset.city}${preset.postalCode ? ', ' + preset.postalCode : ''}`,
      preset.country
    ].filter(Boolean).join('\n');
    deliveryContact = preset.contactPerson || '';
    deliveryPhone = preset.contactPhone || '';
    useManualAddress = false;
    showPresetDropdown = false;
  }

  function clearPreset() {
    selectedPresetId = null;
    useManualAddress = true;
  }

  // Group presets by client
  $: groupedPresets = deliveryPresets.reduce((acc, preset) => {
    if (!acc[preset.clientName]) {
      acc[preset.clientName] = [];
    }
    acc[preset.clientName].push(preset);
    return acc;
  }, {} as Record<string, DeliveryPreset[]>);

  function addProfile() {
    const newProfile = {
      id: createId(),
      quantity: 1,
      configuration: JSON.parse(JSON.stringify(defaultConfiguration)),
      collapsed: false
    };
    profiles = [...profiles, newProfile];
  }

  function removeProfile(id: string) {
    if (profiles.length > 1) {
      profiles = profiles.filter(p => p.id !== id);
    }
  }

  function toggleProfileCollapse(id: string) {
    profiles = profiles.map(p => 
      p.id === id ? { ...p, collapsed: !p.collapsed } : p
    );
  }

  function duplicateProfile(id: string) {
    const sourceProfile = profiles.find(p => p.id === id);
    if (sourceProfile) {
      const newProfile = {
        id: createId(),
        quantity: sourceProfile.quantity,
        configuration: JSON.parse(JSON.stringify(sourceProfile.configuration)),
        collapsed: false
      };
      newProfile.configuration.profileName = `${sourceProfile.configuration.profileName} (Copy)`;
      profiles = [...profiles, newProfile];
    }
  }

  // File handling with preview
  function getFileType(file: File): 'pdf' | 'cdr' | 'image' | 'other' {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return 'pdf';
    if (ext === 'cdr') return 'cdr';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext || '')) return 'image';
    return 'other';
  }

  async function handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      await addFiles(Array.from(input.files));
    }
    input.value = '';
  }

  async function addFiles(newFiles: File[]) {
    for (const file of newFiles) {
      const type = getFileType(file);
      const fileWithPreview: FileWithPreview = { file, type };
      
      // Generate preview for images
      if (type === 'image') {
        fileWithPreview.preview = await createImagePreview(file);
      } else if (type === 'pdf') {
        // Create data URL for PDF.js
        fileWithPreview.pdfDataUrl = await createDataUrl(file);
      }
      
      uploadedFiles = [...uploadedFiles, fileWithPreview];
      
      // Auto-select first uploaded file
      if (uploadedFiles.length === 1) {
        selectFile(0);
      }
    }
  }

  function createImagePreview(file: File): Promise<string> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.readAsDataURL(file);
    });
  }

  function createDataUrl(file: File): Promise<string> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.readAsDataURL(file);
    });
  }

  function removeFile(index: number) {
    uploadedFiles = uploadedFiles.filter((_, i) => i !== index);
    // Reset selection if removed file was selected
    if (selectedFileIndex === index) {
      selectedFileIndex = uploadedFiles.length > 0 ? 0 : null;
    } else if (selectedFileIndex !== null && selectedFileIndex > index) {
      selectedFileIndex--;
    }
  }

  // Drag and drop handlers
  function handleDragEnter(e: DragEvent) {
    e.preventDefault();
    dragActive = true;
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    dragActive = false;
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
  }

  async function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragActive = false;
    
    if (e.dataTransfer?.files) {
      await addFiles(Array.from(e.dataTransfer.files));
    }
  }

  async function saveOrder() {
    // Validation
    if (!clientName.trim()) {
      error = 'Client Name is required';
      return;
    }
    if (!poNumber.trim()) {
      error = 'PO Number is required';
      return;
    }
    if (uploadedFiles.length === 0) {
      error = 'Please upload at least one file (CDR or PDF sketch)';
      return;
    }
    if (!deliveryAddress.trim() && !selectedPresetId) {
      error = 'Please select or enter a delivery address';
      return;
    }

    saving = true;
    error = '';
    successMessage = '';

    try {
      // First, upload files
      const fileIds: number[] = [];
      for (const fileItem of uploadedFiles) {
        const formData = new FormData();
        formData.append('file', fileItem.file);
        formData.append('category', 'order_sketch');
        
        const uploadResponse = await fetch('/api/files/upload', {
          method: 'POST',
          body: formData
        });
        
        if (uploadResponse.ok) {
          const uploadResult = await uploadResponse.json();
          fileIds.push(uploadResult.id);
        }
      }

      // Create order data
      const orderData = {
        clientName,
        poNumber,
        deadline,
        loadingDate: loadingDate || null,
        notes,
        priority,
        status: 'draft',
        deliveryPresetId: selectedPresetId,
        deliveryAddress,
        deliveryContact,
        deliveryPhone,
        profiles: profiles.map(p => ({
          profileCode: 'P7st',
          quantity: p.quantity,
          configuration: p.configuration
        })),
        fileIds
      };

      const response = await fetch('/api/draft-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData)
      });

      if (response.ok) {
        successMessage = 'Draft order created successfully! Admin will be notified.';
        setTimeout(() => goto('/orders'), 1500);
      } else {
        const res = await response.json();
        error = res.message || 'Failed to save order';
      }
    } catch (err) {
      console.error('Error saving order:', err);
      error = 'An unexpected error occurred';
    } finally {
      saving = false;
    }
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }
</script>

<svelte:head>
  <script src="https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js"></script>
</svelte:head>

<div class="page-container">
  <header class="page-header">
    <div class="header-left">
      <a href="/orders" class="back-link">
        <ArrowLeft size={20} />
        Back to Orders
      </a>
      <h1>Create Draft Order</h1>
      {#if isSuperAdmin}
        <span class="role-badge superadmin">SuperAdmin</span>
      {:else if isAdmin}
        <span class="role-badge admin">Admin</span>
      {/if}
    </div>
    <div class="header-actions">
      <button class="btn-secondary" on:click={() => goto('/orders')}>
        Cancel
      </button>
      <button class="btn-primary" on:click={saveOrder} disabled={saving}>
        {#if saving}
          <span class="spinner"></span>
          Saving...
        {:else}
          <Save size={18} />
          Save Draft Order
        {/if}
      </button>
    </div>
  </header>

  {#if error}
    <div class="error-banner">
      <AlertCircle size={18} />
      {error}
      <button class="close-btn" on:click={() => error = ''}>
        <X size={16} />
      </button>
    </div>
  {/if}

  {#if successMessage}
    <div class="success-banner">
      <Save size={18} />
      {successMessage}
    </div>
  {/if}

  <!-- 1. PROFILES SECTION (TOP) -->
  <section class="profiles-section full-width">
    <div class="profiles-header">
      <h2>
        <FileText size={20} />
        Order Profiles
      </h2>
      <div class="profiles-actions">
        <span class="profile-count">{profiles.length} profile{profiles.length !== 1 ? 's' : ''}</span>
        <button class="btn-secondary" on:click={addProfile}>
          <Plus size={16} />
          Add Profile
        </button>
      </div>
    </div>

    {#each profiles as profile, i (profile.id)}
      <div class="card profile-card" class:collapsed={profile.collapsed}>
        <div class="profile-card-header">
          <button 
            class="collapse-toggle" 
            class:rotated={profile.collapsed}
            on:click={() => toggleProfileCollapse(profile.id)}
            title={profile.collapsed ? 'Expand' : 'Collapse'}
          >
            <ChevronDown size={20} />
          </button>
          <div class="profile-title">
            <span class="profile-number">#{i + 1}</span>
            <h3>{profile.configuration.profileName || `Profile #${i + 1}`}</h3>
          </div>
          <div class="profile-actions">
            <div class="quantity-control">
              <label for="qty-{profile.id}">Qty:</label>
              <input type="number" id="qty-{profile.id}" bind:value={profile.quantity} min="1" max="100" class="qty-input" />
            </div>
            <button class="btn-icon" on:click={() => duplicateProfile(profile.id)} title="Duplicate">
              <Plus size={16} />
            </button>
            {#if profiles.length > 1}
              <button class="btn-icon danger" on:click={() => removeProfile(profile.id)} title="Remove">
                <Trash2 size={16} />
              </button>
            {/if}
          </div>
        </div>
        {#if !profile.collapsed}
          <div class="visual-wrapper">
            <Profile7stVisual 
              bind:configuration={profile.configuration}
            />
          </div>
        {/if}
      </div>
    {/each}
  </section>

  <!-- 2. FILES SECTION (MIDDLE) -->
  <section class="card files-card full-width">
    <h2>
      <Upload size={20} />
      Sketch Files <span class="required">*</span>
    </h2>
    <p class="help-text">Upload PDF and CDR files with order sketches.</p>
    
    <div class="files-layout">
      <div class="upload-section">
        <div 
          class="file-upload-area"
          class:drag-active={dragActive}
          on:dragenter={handleDragEnter}
          on:dragleave={handleDragLeave}
          on:dragover={handleDragOver}
          on:drop={handleDrop}
          role="button"
          tabindex="0"
        >
          <input 
            type="file" 
            id="file-upload" 
            multiple 
            accept=".pdf,.cdr,.ai,.eps,.jpg,.jpeg,.png"
            on:change={handleFileSelect}
            style="display: none;"
          />
          <label for="file-upload" class="upload-label">
            <Upload size={32} />
            <span class="upload-text">Drag & drop or click</span>
            <span class="upload-hint">PDF, CDR, AI, EPS, JPG, PNG</span>
          </label>
        </div>
        
        {#if uploadedFiles.length > 0}
          <div class="file-list">
            <h3>Files ({uploadedFiles.length})</h3>
            <div class="file-list-items">
              {#each uploadedFiles as fileItem, i}
                <div 
                  class="file-list-item" 
                  class:selected={selectedFileIndex === i}
                  on:click={() => selectFile(i)}
                  on:keydown={(e) => e.key === 'Enter' && selectFile(i)}
                  role="button"
                  tabindex="0"
                >
                  <div class="file-list-icon">
                    {#if fileItem.type === 'pdf'}
                      <FileText size={20} />
                    {:else if fileItem.type === 'image'}
                      <Image size={20} />
                    {:else}
                      <FileText size={20} />
                    {/if}
                  </div>
                  <div class="file-list-info">
                    <span class="file-list-name" title={fileItem.file.name}>{fileItem.file.name}</span>
                    <span class="file-list-size">{formatFileSize(fileItem.file.size)}</span>
                  </div>
                  <div class="file-list-actions">
                    {#if fileItem.type === 'pdf' || fileItem.type === 'image'}
                      <button class="btn-icon-sm" on:click|stopPropagation={() => selectFile(i)} title="Preview">
                        <Eye size={14} />
                      </button>
                    {/if}
                    <button class="btn-icon-sm danger" on:click|stopPropagation={() => removeFile(i)} title="Remove">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
      
      <!-- Preview Section -->
      <div class="preview-section">
        {#if selectedFileIndex !== null && uploadedFiles[selectedFileIndex]}
          {@const selectedFile = uploadedFiles[selectedFileIndex]}
          <div class="preview-header">
            <span class="preview-filename">{selectedFile.file.name}</span>
            <div class="preview-controls">
              {#if selectedFile.type === 'pdf' && pdfTotalPages > 1}
                <button class="btn-icon-sm" on:click={prevPdfPage} disabled={pdfCurrentPage <= 1} title="Previous Page">
                  <ChevronLeft size={16} />
                </button>
                <span class="page-indicator">{pdfCurrentPage} / {pdfTotalPages}</span>
                <button class="btn-icon-sm" on:click={nextPdfPage} disabled={pdfCurrentPage >= pdfTotalPages} title="Next Page">
                  <ChevronRight size={16} />
                </button>
                <span class="divider">|</span>
              {/if}
              <button class="btn-icon-sm" on:click={zoomOut} title="Zoom Out" disabled={previewZoom <= 0.5}>
                <ZoomOut size={16} />
              </button>
              <span class="zoom-level">{Math.round(previewZoom * 100)}%</span>
              <button class="btn-icon-sm" on:click={zoomIn} title="Zoom In" disabled={previewZoom >= 3}>
                <ZoomIn size={16} />
              </button>
              <button class="btn-icon-sm" on:click={resetZoom} title="Reset">
                <Maximize2 size={16} />
              </button>
            </div>
          </div>
          <div class="preview-container" bind:this={previewContainer}>
            {#if selectedFile.type === 'image' && selectedFile.preview}
              <img 
                src={selectedFile.preview} 
                alt={selectedFile.file.name} 
                class="preview-image"
                style="transform: scale({previewZoom})"
              />
            {:else if selectedFile.type === 'pdf' && selectedFile.pdfDataUrl}
              <canvas bind:this={pdfCanvas} class="pdf-canvas"></canvas>
            {:else if selectedFile.type === 'pdf'}
              <div class="pdf-preview-placeholder">
                <FileText size={48} />
                <span>Loading PDF...</span>
              </div>
            {:else}
              <div class="preview-placeholder">
                <FileText size={48} />
                <span>No preview</span>
              </div>
            {/if}
          </div>
        {:else}
          <div class="no-preview">
            <Eye size={48} />
            <span>Select a file to preview</span>
          </div>
        {/if}
      </div>
    </div>
  </section>

  <!-- 3. CLIENT & DELIVERY SECTION (BOTTOM) -->
  <div class="client-delivery-row">
    <!-- Order Details Card -->
    <section class="card details-card">
      <h2>
        <FileText size={20} />
        Order Details
      </h2>
      <div class="form-row">
        <div class="form-group">
          <label for="poNumber">PO Number</label>
          <input type="text" id="poNumber" bind:value={poNumber} readonly class="readonly" />
        </div>
        <div class="form-group">
          <label for="priority">Priority</label>
          <select id="priority" bind:value={priority}>
            <option value="LOW">Low</option>
            <option value="NORMAL">Normal</option>
            <option value="HIGH">High</option>
            <option value="URGENT">Urgent</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label for="clientName">Client Name <span class="required">*</span></label>
        <input type="text" id="clientName" bind:value={clientName} placeholder="Enter client name or select from presets" />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="deadline">
            <Calendar size={14} />
            Delivery Date
          </label>
          <input type="date" id="deadline" bind:value={deadline} />
        </div>
        <div class="form-group">
          <label for="loadingDate">
            <Calendar size={14} />
            Loading Date
          </label>
          <input type="date" id="loadingDate" bind:value={loadingDate} placeholder="Can be assigned later" />
          <span class="help-text">Can be assigned later by admin</span>
        </div>
      </div>
      <div class="form-group">
        <label for="notes">Notes</label>
        <textarea id="notes" bind:value={notes} rows="2" placeholder="Additional notes for production..."></textarea>
      </div>
    </section>

    <!-- Delivery Address Card -->
    <section class="card delivery-card">
      <h2>
          <MapPin size={20} />
          Delivery Address
        </h2>
        
        <!-- Preset Selector -->
        {#if deliveryPresets.length > 0}
          <div class="preset-selector">
            <button 
              class="preset-dropdown-trigger"
              class:active={showPresetDropdown}
              on:click={() => showPresetDropdown = !showPresetDropdown}
            >
              {#if selectedPresetId}
                {deliveryPresets.find(p => p.id === selectedPresetId)?.clientName} - {deliveryPresets.find(p => p.id === selectedPresetId)?.presetName}
              {:else}
                Select from saved addresses...
              {/if}
              <ChevronDown size={16} />
            </button>
            
            {#if showPresetDropdown}
              <div class="preset-dropdown">
                {#each Object.entries(groupedPresets) as [clientName, presets]}
                  <div class="preset-group">
                    <div class="preset-group-header">{clientName}</div>
                    {#each presets as preset}
                      <button 
                        class="preset-option"
                        class:selected={selectedPresetId === preset.id}
                        on:click={() => selectPreset(preset)}
                      >
                        <span class="preset-name">{preset.presetName}</span>
                        <span class="preset-address">{preset.addressLine1}, {preset.city}</span>
                        {#if preset.isDefault}
                          <span class="default-badge">Default</span>
                        {/if}
                      </button>
                    {/each}
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/if}

        <div class="manual-address-toggle">
          <label class="toggle-label">
            <input type="checkbox" bind:checked={useManualAddress} on:change={clearPreset} />
            <span>Enter address manually</span>
          </label>
        </div>

        <div class="form-group">
          <label for="deliveryAddress">Address <span class="required">*</span></label>
          <textarea 
            id="deliveryAddress" 
            bind:value={deliveryAddress} 
            rows="3" 
            placeholder="Street, City, Postal Code, Country"
            disabled={!useManualAddress && selectedPresetId !== null}
          ></textarea>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="deliveryContact">
              <User size={14} />
              Contact Person
            </label>
            <input 
              type="text" 
              id="deliveryContact" 
              bind:value={deliveryContact} 
              placeholder="Name"
              disabled={!useManualAddress && selectedPresetId !== null}
            />
          </div>
          <div class="form-group">
            <label for="deliveryPhone">
              <Phone size={14} />
              Phone
            </label>
            <input 
              type="tel" 
              id="deliveryPhone" 
              bind:value={deliveryPhone} 
              placeholder="+371..."
              disabled={!useManualAddress && selectedPresetId !== null}
            />
          </div>
        </div>
      </section>
    </div>
</div>

<style>
  .page-container {
    padding: var(--space-sm, 8px) var(--space-xs, 4px);
    max-width: 100%;
    margin: 0 auto;
  }
  
  @media (min-width: 1200px) {
    .page-container {
      padding: var(--space-md, 12px) var(--space-sm, 8px);
    }
  }

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
    flex-wrap: wrap;
    gap: 16px;
  }

  .header-left {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .back-link {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--text-secondary, #6b7280);
    text-decoration: none;
    font-size: 14px;
    font-weight: 500;
    transition: color 0.2s;
  }

  .back-link:hover {
    color: var(--text-primary, #1a1a1a);
  }

  h1 {
    margin: 0;
    font-size: 24px;
    font-weight: 700;
    color: var(--text-primary, #1a1a1a);
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .role-badge {
    font-size: 11px;
    font-weight: 600;
    padding: 4px 8px;
    border-radius: 4px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .role-badge.superadmin {
    background: linear-gradient(135deg, #7c3aed, #a855f7);
    color: white;
  }

  .role-badge.admin {
    background: linear-gradient(135deg, #3b82f6, #60a5fa);
    color: white;
  }

  .header-actions {
    display: flex;
    gap: 12px;
  }

  .btn-primary {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    background: linear-gradient(135deg, #ff6b35, #f7931e);
    color: white;
    border: none;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: 0 2px 8px rgba(255, 107, 53, 0.3);
  }

  .btn-primary:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(255, 107, 53, 0.4);
  }

  .btn-primary:disabled {
    opacity: 0.7;
    cursor: not-allowed;
    transform: none;
  }

  .btn-secondary {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 10px 16px;
    background: white;
    border: 1px solid var(--border, #d1d5db);
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
    color: var(--text-secondary, #374151);
    transition: all 0.2s;
  }

  .btn-secondary:hover {
    background: var(--bg-hover, #f9fafb);
    border-color: var(--border-hover, #9ca3af);
  }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .error-banner, .success-banner {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    border-radius: 8px;
    margin-bottom: 24px;
    font-weight: 500;
  }

  .error-banner {
    background: #fee2e2;
    color: #dc2626;
    border: 1px solid #fecaca;
  }

  .success-banner {
    background: #dcfce7;
    color: #16a34a;
    border: 1px solid #bbf7d0;
  }

  .close-btn {
    margin-left: auto;
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    color: inherit;
    opacity: 0.7;
  }

  .close-btn:hover {
    opacity: 1;
    background: rgba(0,0,0,0.1);
  }

  /* Client/Delivery row at bottom */
  .client-delivery-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-md, 16px);
    margin-bottom: var(--space-md, 16px);
  }

  .full-width {
    width: 100%;
    margin-bottom: var(--space-md, 16px);
  }

  .profiles-section {
    background: transparent;
    padding: 0;
  }

  .card {
    background: var(--bg-1, white);
    border: 1px solid var(--border, #e5e7eb);
    border-radius: var(--radius-md, 12px);
    padding: var(--space-md, 16px);
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
  }

  h2 {
    margin: 0 0 16px 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--text, #1a1a1a);
    padding-bottom: 12px;
    border-bottom: 1px solid var(--border, #e5e7eb);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  h2 :global(svg) {
    color: var(--muted, #6b7280);
  }

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-bottom: 16px;
  }

  .form-group {
    margin-bottom: 16px;
  }

  .form-row .form-group {
    margin-bottom: 0;
  }

  .form-group label {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-secondary, #374151);
  }

  .form-group label :global(svg) {
    color: var(--text-muted, #9ca3af);
  }

  .required {
    color: #dc2626;
  }

  .help-text {
    font-size: 12px;
    color: var(--text-muted, #9ca3af);
    margin-top: 4px;
  }

  input, textarea, select {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--border, #d1d5db);
    border-radius: 8px;
    font-size: 14px;
    color: var(--text-primary, #1a1a1a);
    font-family: inherit;
    background: var(--input-bg, white);
    transition: all 0.2s;
  }

  input:focus, textarea:focus, select:focus {
    outline: none;
    border-color: #ff6b35;
    box-shadow: 0 0 0 3px rgba(255, 107, 53, 0.1);
  }

  input:disabled, textarea:disabled {
    background: var(--bg-disabled, #f3f4f6);
    color: var(--text-muted, #9ca3af);
    cursor: not-allowed;
  }

  input.readonly {
    background: var(--bg-disabled, #f3f4f6);
    color: var(--text-secondary, #6b7280);
    cursor: default;
  }

  select {
    cursor: pointer;
  }

  /* Delivery Presets */
  .preset-selector {
    position: relative;
    margin-bottom: 16px;
  }

  .preset-dropdown-trigger {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    background: white;
    border: 1px solid var(--border, #d1d5db);
    border-radius: 8px;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .preset-dropdown-trigger:hover, .preset-dropdown-trigger.active {
    border-color: #ff6b35;
  }

  .preset-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    margin-top: 4px;
    background: white;
    border: 1px solid var(--border, #e5e7eb);
    border-radius: 8px;
    box-shadow: 0 10px 40px rgba(0,0,0,0.15);
    z-index: 100;
    max-height: 300px;
    overflow-y: auto;
  }

  .preset-group {
    border-bottom: 1px solid var(--border, #e5e7eb);
  }

  .preset-group:last-child {
    border-bottom: none;
  }

  .preset-group-header {
    padding: 8px 12px;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted, #9ca3af);
    background: var(--bg-subtle, #f9fafb);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .preset-option {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    padding: 10px 12px;
    border: none;
    background: transparent;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s;
  }

  .preset-option:hover {
    background: var(--bg-hover, #f3f4f6);
  }

  .preset-option.selected {
    background: rgba(255, 107, 53, 0.1);
  }

  .preset-name {
    font-weight: 600;
    font-size: 14px;
    color: var(--text-primary, #1a1a1a);
  }

  .preset-address {
    font-size: 12px;
    color: var(--text-muted, #9ca3af);
    margin-top: 2px;
  }

  .default-badge {
    font-size: 10px;
    padding: 2px 6px;
    background: #dbeafe;
    color: #2563eb;
    border-radius: 4px;
    margin-top: 4px;
  }

  .manual-address-toggle {
    margin-bottom: 12px;
  }

  .toggle-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    cursor: pointer;
    color: var(--text-secondary, #374151);
  }

  .toggle-label input {
    width: auto;
    cursor: pointer;
  }

  /* File Upload */
  .file-upload-area {
    margin-bottom: 16px;
  }

  .file-upload-area.drag-active .upload-label {
    border-color: #ff6b35;
    background: rgba(255, 107, 53, 0.05);
  }

  .upload-label {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 32px 16px;
    border: 2px dashed var(--border, #d1d5db);
    border-radius: 12px;
    cursor: pointer;
    color: var(--text-muted, #6b7280);
    transition: all 0.2s;
    background: var(--bg-subtle, #fafafa);
  }

  .upload-label:hover {
    border-color: #ff6b35;
    color: #ff6b35;
    background: rgba(255, 107, 53, 0.05);
  }

  .upload-text {
    font-weight: 500;
    font-size: 14px;
  }

  .upload-hint {
    font-size: 12px;
    opacity: 0.7;
  }

  .file-list {
    margin-top: 16px;
  }

  .file-list h3 {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-secondary, #374151);
    margin: 0 0 12px 0;
  }

  .file-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 12px;
  }

  .file-item {
    position: relative;
    display: flex;
    flex-direction: column;
    padding: 12px;
    background: var(--bg-subtle, #f9fafb);
    border: 1px solid var(--border, #e5e7eb);
    border-radius: 8px;
    transition: all 0.2s;
  }

  .file-item:hover {
    border-color: #ff6b35;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  }

  .file-preview {
    width: 100%;
    aspect-ratio: 4/3;
    border-radius: 6px;
    overflow: hidden;
    margin-bottom: 8px;
    background: #f0f0f0;
  }

  .file-preview img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .file-icon {
    width: 100%;
    aspect-ratio: 4/3;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #f8fafc, #f1f5f9);
    border-radius: 6px;
    margin-bottom: 8px;
    color: var(--text-muted, #9ca3af);
  }

  .file-type-badge {
    font-size: 10px;
    font-weight: 700;
    padding: 2px 6px;
    background: var(--text-muted, #9ca3af);
    color: white;
    border-radius: 4px;
    margin-top: 4px;
  }

  .file-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .file-name {
    font-weight: 500;
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--text-primary, #1a1a1a);
  }

  .file-size {
    font-size: 11px;
    color: var(--text-muted, #9ca3af);
  }

  .remove-file {
    position: absolute;
    top: 4px;
    right: 4px;
    background: white;
    border: 1px solid var(--border, #e5e7eb);
    border-radius: 50%;
    padding: 4px;
    opacity: 0;
    transition: opacity 0.2s;
  }

  .file-item:hover .remove-file {
    opacity: 1;
  }

  .remove-file:hover {
    background: #fee2e2;
    border-color: #fecaca;
    color: #dc2626;
  }

  .btn-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--text-muted, #6b7280);
    padding: 6px;
    border-radius: 6px;
    transition: all 0.15s;
  }

  .btn-icon:hover {
    background: var(--bg-hover, #e5e7eb);
    color: var(--text-primary, #1a1a1a);
  }

  .btn-icon.danger:hover {
    background: #fee2e2;
    color: #dc2626;
  }

  /* Profiles */
  .profiles-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
  }

  .profiles-header h2 {
    margin: 0;
    padding: 0;
    border: none;
  }

  .profiles-actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .profile-count {
    font-size: 13px;
    color: var(--text-muted, #9ca3af);
    padding: 4px 10px;
    background: var(--bg-subtle, #f3f4f6);
    border-radius: 20px;
  }

  .profiles-help {
    color: var(--text-muted, #9ca3af);
    font-size: 13px;
    margin: 0 0 16px 0;
    line-height: 1.5;
  }

  .profile-card {
    transition: all 0.2s;
  }

  .profile-card.collapsed {
    padding-bottom: 12px;
  }

  .profile-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--border, #e5e7eb);
  }

  .profile-card.collapsed .profile-header {
    margin-bottom: 0;
    padding-bottom: 0;
    border-bottom: none;
  }

  .collapse-toggle {
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    color: var(--text-muted, #9ca3af);
    transition: all 0.2s;
  }

  .collapse-toggle:hover {
    background: var(--bg-hover, #f3f4f6);
    color: var(--text-primary, #1a1a1a);
  }

  .collapse-toggle :global(svg) {
    transition: transform 0.2s;
  }

  .collapse-toggle.rotated :global(svg) {
    transform: rotate(-90deg);
  }

  .profile-title {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
  }

  .profile-number {
    font-size: 12px;
    font-weight: 600;
    color: white;
    background: var(--text-muted, #9ca3af);
    padding: 2px 8px;
    border-radius: 4px;
  }

  .profile-header h3 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: var(--text-primary, #1a1a1a);
  }

  .profile-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .quantity-control {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 500;
    color: var(--text, #374151);
  }

  .qty-input {
    width: 50px;
    text-align: center;
    padding: 6px;
    font-size: 13px;
  }

  .visual-wrapper {
    overflow-x: auto;
  }

  /* Files Layout with Preview */
  .files-layout {
    display: grid;
    grid-template-columns: 300px 1fr;
    gap: 20px;
    min-height: 400px;
  }

  .upload-section {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .file-list-items {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 280px;
    overflow-y: auto;
  }

  .file-list-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    background: var(--bg-2, #f9fafb);
    border: 1px solid var(--border, #e5e7eb);
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .file-list-item:hover {
    border-color: var(--accent-1, #ff6b35);
    background: var(--bg-1, white);
  }

  .file-list-item.selected {
    border-color: var(--accent-1, #ff6b35);
    background: color-mix(in oklab, var(--accent-1, #ff6b35) 8%, var(--bg-1, white));
  }

  .file-list-icon {
    color: var(--muted, #6b7280);
    flex-shrink: 0;
  }

  .file-list-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .file-list-name {
    font-weight: 500;
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--text, #1a1a1a);
  }

  .file-list-size {
    font-size: 11px;
    color: var(--muted, #9ca3af);
  }

  .file-list-actions {
    display: flex;
    gap: 4px;
    opacity: 0;
    transition: opacity 0.15s;
  }

  .file-list-item:hover .file-list-actions {
    opacity: 1;
  }

  .btn-icon-sm {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    background: var(--bg-1, white);
    border: 1px solid var(--border, #e5e7eb);
    border-radius: 4px;
    cursor: pointer;
    color: var(--muted, #6b7280);
    transition: all 0.15s;
  }

  .btn-icon-sm:hover {
    border-color: var(--accent-1, #ff6b35);
    color: var(--accent-1, #ff6b35);
  }

  .btn-icon-sm.danger:hover {
    border-color: var(--danger, #dc2626);
    color: var(--danger, #dc2626);
    background: color-mix(in oklab, var(--danger, #dc2626) 8%, var(--bg-1, white));
  }

  .btn-icon-sm:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Preview Section */
  .preview-section {
    display: flex;
    flex-direction: column;
    background: var(--bg-2, #f3f4f6);
    border: 1px solid var(--border, #e5e7eb);
    border-radius: 8px;
    overflow: hidden;
  }

  .preview-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    background: var(--bg-1, white);
    border-bottom: 1px solid var(--border, #e5e7eb);
    flex-wrap: wrap;
    gap: 8px;
  }

  .preview-filename {
    font-weight: 500;
    font-size: 13px;
    color: var(--text, #1a1a1a);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
    min-width: 100px;
  }

  .preview-controls {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .page-indicator {
    font-size: 12px;
    color: var(--muted, #6b7280);
    min-width: 50px;
    text-align: center;
  }

  .divider {
    color: var(--border, #e5e7eb);
    margin: 0 4px;
  }

  .zoom-level {
    font-size: 12px;
    color: var(--muted, #6b7280);
    min-width: 40px;
    text-align: center;
  }

  .preview-container {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: auto;
    padding: 20px;
    min-height: 300px;
    background: var(--bg-2, #f9fafb);
  }

  .preview-image {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    transition: transform 0.2s ease;
    transform-origin: center;
  }

  .pdf-canvas {
    max-width: 100%;
    height: auto;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  }

  .no-preview,
  .pdf-preview-placeholder,
  .preview-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: var(--muted, #9ca3af);
    text-align: center;
    padding: 40px;
  }

  .no-preview span,
  .pdf-preview-placeholder span,
  .preview-placeholder span {
    font-size: 14px;
  }

  .muted {
    font-size: 12px;
    opacity: 0.7;
  }

  /* Profile Card Header - renamed to avoid conflict */
  .profile-card-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--border, #e5e7eb);
  }

  .profile-card.collapsed .profile-card-header {
    margin-bottom: 0;
    padding-bottom: 0;
    border-bottom: none;
  }

  @media (max-width: 1200px) {
    .client-delivery-row {
      grid-template-columns: 1fr;
    }
    
    .files-layout {
      grid-template-columns: 1fr;
    }
    
    .preview-section {
      min-height: 350px;
    }
  }

  @media (max-width: 640px) {
    .page-container {
      padding: var(--space-sm, 8px);
    }

    .form-row {
      grid-template-columns: 1fr;
    }

    .profiles-header {
      flex-direction: column;
      align-items: flex-start;
    }
  }
</style>
