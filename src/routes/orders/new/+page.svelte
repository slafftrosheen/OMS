<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { t } from 'svelte-i18n';
  import Icon from '$lib/ui/Icon.svelte';
  import Profile7stVisual from '$lib/profiles/components/Profile7stVisual.svelte';
  import { createId } from '$lib/utils/id';
  import { currentUser } from '$lib/auth/authState.svelte';
  import { base } from '$app/paths';
  import { validateOrderForm } from '$lib/validation/orderSchema';


  // SVELTE 5: Convert all reactive state to $state()
  let saving = $state(false);
  let error = $state('');
  // Field-level validation errors keyed by input name (the "ali points").
  let fieldErrors = $state<Record<string, string>>({});
  let successMessage = $state('');
  
  // Order Details
  let clientName = $state('');
  let poNumber = $state('');
  let deadline = $state('');
  let loadingDate = $state('');
  let notes = $state('');
  let priority = $state<'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'>('NORMAL');
  
  // Delivery Address
  interface DeliveryPreset {
    id: string | number;  // UUID from backend returns as string, but allow number for compatibility
    name?: string;
    clientName: string;
    presetName: string;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    postalCode?: string;
    country?: string;
    contactPerson?: string;
    contactPhone?: string;
    contactEmail?: string;
    deliveryNotes?: string;
    isDefault?: boolean;
    // Alternative field names from API
    address?: string;
    contact?: string;
    phone?: string;
    status?: string;
    visibility?: string;
    tags?: string[];
  }
  
  let deliveryPresets = $state<DeliveryPreset[]>([]);
  let selectedPresetId = $state<string | number | null>(null);
  let deliveryAddress = $state('');
  let deliveryContact = $state('');
  let deliveryPhone = $state('');
  let useManualAddress = $state(false);
  let showPresetDropdown = $state(false);
  
  // Files with preview
  interface FileWithPreview {
    file: File;
    preview?: string;
    pdfDataUrl?: string;
    type: 'pdf' | 'cdr' | 'image' | 'other';
  }
  let uploadedFiles = $state<FileWithPreview[]>([]);
  let dragActive = $state(false);

  // Profile Presets
  let profilePresets = $state<Array<{
    id: number;
    name: string;
    description: string;
    profileCode: string;
    configuration: any;
    isPublic: boolean;
  }>>([]);
  let showPresetModal = $state(false);
  let showSavePresetModal = $state(false);
  let selectedPresetForLoad = $state<number | null>(null);
  let savePresetName = $state('');
  let savePresetDescription = $state('');
  let savePresetPublic = $state(false);
  let savingPreset = $state(false);
  let selectedFileIndex = $state<number | null>(null);
  let previewZoom = $state(1);
  let previewContainer = $state<HTMLElement | undefined>(undefined);
  let pdfCanvas = $state<HTMLCanvasElement | undefined>(undefined);
  let pdfCurrentPage = $state(1);
  let pdfTotalPages = $state(1);
  let pdfDoc = $state<any>(null);
  
  function selectFile(index: number) {
    selectedFileIndex = index;
    previewZoom = 1;
    pdfCurrentPage = 1;
    
    const file = uploadedFiles[index];
    if (file?.type === 'pdf' && file.pdfDataUrl) {
      renderPdfPage(file.pdfDataUrl, 1);
    }
  }
  
  let pdfRendering = $state(false);
  let pdfRenderTask = $state<any>(null);
  let pdfPageCache = $state(new Map<string, any>());
  let pdfjsLib: any = null;
  
  // Initialize pdfjs on client-side
  onMount(() => {
    if (typeof window !== 'undefined') {
      import('pdfjs-dist').then((module) => {
        pdfjsLib = module;
        if (module.GlobalWorkerOptions) {
          module.GlobalWorkerOptions.workerSrc = new URL(
            'pdfjs-dist/build/pdf.worker.min.js',
            import.meta.url
          ).href;
        }
      }).catch((err) => {
        console.error('Failed to load pdfjs-dist:', err);
      });
    }
  });
  
  async function renderPdfPage(dataUrl: string, pageNum: number) {
    if (!pdfjsLib) return;
    if (pdfRendering) return;
    
    pdfRendering = true;
    
    try {
      if (pdfRenderTask) {
        try { pdfRenderTask.cancel(); } catch (error) {
          console.warn('Error cancelling PDF render task:', error);
        }
        pdfRenderTask = null;
      }
      
      const cacheKey = dataUrl.substring(0, 100);
      if (!pdfDoc || !pdfPageCache.has(cacheKey)) {
        pdfDoc = await pdfjsLib.getDocument({
          data: atob(dataUrl.split(',')[1]),
        }).promise;
        pdfTotalPages = pdfDoc.numPages;
        pdfPageCache.set(cacheKey, pdfDoc);
      } else {
        pdfDoc = pdfPageCache.get(cacheKey);
        pdfTotalPages = pdfDoc.numPages;
      }
      
      const page = await pdfDoc.getPage(pageNum);
      const baseScale = 1.0;
      const scale = baseScale * previewZoom;
      const viewport = page.getViewport({ scale });
      
      if (pdfCanvas) {
        const context = pdfCanvas.getContext('2d');
        pdfCanvas.height = viewport.height;
        pdfCanvas.width = viewport.width;
        context?.clearRect(0, 0, pdfCanvas.width, pdfCanvas.height);
        
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
  
  let zoomTimeout: ReturnType<typeof setTimeout>;
  $effect(() => {
    if (selectedFileIndex !== null && uploadedFiles[selectedFileIndex]?.type === 'pdf' && uploadedFiles[selectedFileIndex]?.pdfDataUrl && previewZoom) {
      clearTimeout(zoomTimeout);
      zoomTimeout = setTimeout(() => {
        renderPdfPage(uploadedFiles[selectedFileIndex!].pdfDataUrl!, pdfCurrentPage);
      }, 200);
    }
  });

  function zoomIn() {
    previewZoom = Math.min(previewZoom + 0.25, 3);
  }

  function zoomOut() {
    previewZoom = Math.max(previewZoom - 0.25, 0.5);
  }

  function resetZoom() {
    previewZoom = 1;
  }

  async function loadProfilePresets() {
    try {
      const response = await fetch('/api/order-profile-presets');
      if (response.ok) {
        profilePresets = await response.json();
      }
    } catch (err) {
      console.error('Failed to load profile presets:', err);
    }
  }

  async function saveAsPreset(profileIndex: number) {
    const profile = profiles[profileIndex];
    savePresetName = profile.configuration.profileName || '';
    savePresetDescription = '';
    savePresetPublic = false;
    selectedPresetForLoad = profileIndex;
    showSavePresetModal = true;
  }

  async function confirmSavePreset() {
    if (!savePresetName.trim() || selectedPresetForLoad === null) return;

    savingPreset = true;
    try {
      const profile = profiles[selectedPresetForLoad];
      const response = await fetch('/api/order-profile-presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: savePresetName,
          description: savePresetDescription,
          profileCode: 'P7st',
          configuration: profile.configuration,
          isPublic: savePresetPublic
        })
      });

      if (response.ok) {
        successMessage = 'Profile preset saved successfully!';
        await loadProfilePresets();
        closeSavePresetModal();
      } else {
        error = 'Failed to save preset';
      }
    } catch (err) {
      console.error('Error saving preset:', err);
      error = 'An error occurred while saving preset';
    } finally {
      savingPreset = false;
    }
  }

  function loadPreset(presetId: number | string) {
    const preset = profilePresets.find(p => p.id === presetId);
    if (!preset) return;

    const newProfile = {
      id: createId(),
      quantity: 1,
      configuration: JSON.parse(JSON.stringify(preset.configuration)),
      collapsed: false
    };
    profiles = [...profiles, newProfile];
    showPresetModal = false;
    successMessage = `Loaded preset: ${preset.name}`;
    setTimeout(() => successMessage = '', 3000);
  }

  async function deletePreset(presetId: number | string) {
    if (!confirm('Are you sure you want to delete this preset?')) return;

    try {
      const response = await fetch(`/api/order-profile-presets/${presetId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        successMessage = 'Preset deleted successfully';
        await loadProfilePresets();
      } else {
        error = 'Failed to delete preset';
      }
    } catch (err) {
      console.error('Error deleting preset:', err);
      error = 'An error occurred while deleting preset';
    }
  }

  function closeSavePresetModal() {
    showSavePresetModal = false;
    savePresetName = '';
    savePresetDescription = '';
    savePresetPublic = false;
    selectedPresetForLoad = null;
  }
  
  // Profiles
  type ProfileItem = {
    id: string;
    quantity: number;
    configuration: any;
    collapsed: boolean;
    profileTemplateId?: string | null;
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

  let profiles = $state<ProfileItem[]>([
    { id: createId(), quantity: 1, configuration: JSON.parse(JSON.stringify(defaultConfiguration)), collapsed: false }
  ]);

  let isAdmin = $derived(
    $currentUser?.role === 'RD' || 
    $currentUser?.role === 'Boss' || 
    $currentUser?.role === 'HeadOfProduction'
  );
  let isSuperAdmin = $derived($currentUser?.role === 'RD' || $currentUser?.role === 'Boss');

  onMount(() => {
    Promise.all([
      loadDeliveryPresets(),
      loadProfilePresets()
    ]);

    const date = new Date();
    date.setDate(date.getDate() + 14);
    deadline = date.toISOString().split('T')[0];
  });

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
    clientName = preset.clientName || preset.name || '';
    
    if (preset.address) {
      deliveryAddress = preset.address;
    } else {
      deliveryAddress = [
        preset.addressLine1,
        preset.addressLine2,
        preset.city ? `${preset.city}${preset.postalCode ? ', ' + preset.postalCode : ''}` : '',
        preset.country
      ].filter(Boolean).join('\n');
    }
    
    deliveryContact = preset.contactPerson || preset.contact || '';
    deliveryPhone = preset.contactPhone || preset.phone || '';
    useManualAddress = false;
    showPresetDropdown = false;
  }

  function clearPreset() {
    selectedPresetId = null;
    useManualAddress = true;
  }

  let groupedPresets = $derived(deliveryPresets.reduce((acc, preset) => {
    const ClientName = preset.clientName || preset.name || 'Unknown';
    if (!acc[ClientName]) {
      acc[ClientName] = [];
    }
    acc[ClientName].push(preset);
    return acc;
  }, {} as Record<string, DeliveryPreset[]>));

  function addProfile() {
    const newProfile = {
      id: createId(),
      quantity: 1,
      configuration: JSON.parse(JSON.stringify(defaultConfiguration)),
      collapsed: false,
      profileTemplateId: null
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
        collapsed: false,
        profileTemplateId: sourceProfile.profileTemplateId ?? null
      };
      newProfile.configuration.profileName = `${sourceProfile.configuration.profileName} (Copy)`;
      profiles = [...profiles, newProfile];
    }
  }

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
      
      if (type === 'image') {
        fileWithPreview.preview = await createImagePreview(file);
      } else if (type === 'pdf') {
        fileWithPreview.pdfDataUrl = await createDataUrl(file);
      }
      
      uploadedFiles = [...uploadedFiles, fileWithPreview];
      
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
    if (selectedFileIndex === index) {
      selectedFileIndex = uploadedFiles.length > 0 ? 0 : null;
    } else if (selectedFileIndex !== null && selectedFileIndex > index) {
      selectedFileIndex--;
    }
  }

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
    error = '';
    fieldErrors = {};

    // Validate files requirement first (not part of the zod schema).
    if (uploadedFiles.length === 0) {
      fieldErrors = { ...fieldErrors, files: $t('orders.new.messages.validation.files') };
    }

    // Validate the rest of the form with the shared schema ("ali points").
    const { ok, errors } = validateOrderForm({
      clientName,
      deadline,
      loadingDate,
      priority,
      deliveryAddress,
      deliveryContact,
      deliveryPhone,
      notes,
      hasFiles: uploadedFiles.length > 0,
      selectedPresetId,
      profiles: profiles.map((p) => ({
        profileTemplateId: p.profileTemplateId ?? null,
        quantity: p.quantity,
        configuration: p.configuration
      }))
    });

    if (!ok) {
      fieldErrors = { ...fieldErrors, ...errors };
    }

    // If any validation failed, surface the first message as the banner error.
    if (Object.keys(fieldErrors).length > 0) {
      error = $t('orders.new.messages.validation.summary') || 'Please fix the highlighted fields.';
      return;
    }

    saving = true;
    successMessage = '';

    try {
      const orderData = {
        clientName,
        deadline,
        loadingDate: loadingDate || null,
        notes,
        priority,
        status: 'PENDING_REVIEW',
        deliveryPresetId: selectedPresetId,
        deliveryAddress,
        deliveryContact,
        deliveryPhone,
        profiles: profiles.map(p => ({
          profileTemplateId: p.profileTemplateId ?? null,
          quantity: p.quantity,
          configuration: p.configuration
        }))
      };

      const orderResponse = await fetch('/api/draft-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData)
      });

      if (!orderResponse.ok) {
        const res = await orderResponse.json();
        error = res.error || res.message || $t('admin.users.messages.save_error');
        saving = false;
        return;
      }

      const orderResult = await orderResponse.json();
      const newOrderId = orderResult.order?.id || orderResult.id;
      if (!newOrderId) {
        error = 'Failed to get order ID from response';
        saving = false;
        return;
      }

      const fileIds: string[] = [];
      for (const fileItem of uploadedFiles) {
        const formData = new FormData();
        formData.append('file', fileItem.file);
        formData.append('order_id', String(newOrderId));
        formData.append('file_type', 'sketch');
        
        const uploadResponse = await fetch('/api/files/upload', {
          method: 'POST',
          body: formData
        });
        
        if (uploadResponse.ok) {
          const uploadResult = await uploadResponse.json();
          if (uploadResult.file?.id) {
            fileIds.push(String(uploadResult.file.id));
          }
        } else {
          console.warn('Failed to upload file:', fileItem.file.name);
        }
      }

      successMessage = $t('orders.new.messages.success');
      setTimeout(() => goto(`/orders`), 1500);
    } catch (err) {
      console.error('Error saving order:', err);
      error = $t('admin.users.messages.save_error');
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
  <!-- PDF.js loaded locally via runes import to avoid external CDN dependency -->
  <script lang="ts">
    // This script block will be replaced with dynamic import on client
  </script>
</svelte:head>

<div class="page-container">
  <header class="page-header">
    <div class="header-left">
      <a href="/orders" class="back-link">
        <Icon name="arrow-left" size="md" />
        {$t('orders.new.back')}
      </a>
      <h1>{$t('orders.new.title')}</h1>
      {#if isSuperAdmin}
        <span class="role-badge superadmin">{$t('roles.superadmin')}</span>
      {:else if isAdmin}
        <span class="role-badge admin">{$t('roles.admin')}</span>
      {/if}
    </div>
    <div class="header-actions">
      <button class="btn-secondary" onclick={() => goto('/orders')}>
        {$t('actions.cancel')}
      </button>
      <button class="btn-primary" onclick={saveOrder} disabled={saving}>
        {#if saving}
          <span class="spinner"></span>
          {$t('actions.saving')}
        {:else}
          <Icon name="save" size="sm" />
          {$t('orders.new.save')}
        {/if}
      </button>
    </div>
  </header>

  {#if error}
    <div class="error-banner">
      <Icon name="alert-circle" size="sm" />
      {error}
      <button class="close-btn" onclick={() => error = ''}>
        <Icon name="x" size="sm" />
      </button>
    </div>
  {/if}

  {#if successMessage}
    <div class="success-banner">
      <Icon name="save" size="sm" />
      {successMessage}
    </div>
  {/if}

  <!-- 1. PROFILES SECTION (TOP) -->
  <section class="profiles-section full-width">
    <div class="profiles-header">
      <h2>
        <Icon name="file-text" size="md" />
        {$t('orders.new.sections.profiles')}
      </h2>
      <div class="profiles-actions">
        <span class="profile-count">{profiles.length}</span>
        <button class="btn-secondary" onclick={() => showPresetModal = true}>
          <Icon name="book-open" size="sm" />
          {$t('orders.new.presets.load')}
        </button>
        <button class="btn-secondary" onclick={addProfile}>
          <Icon name="plus" size="sm" />
          {$t('materials.add')}
        </button>
      </div>
    </div>

    {#each profiles as profile, i (profile.id)}
      <div class="card profile-card" class:collapsed={profile.collapsed}>
        <div class="profile-card-header">
          <button 
            class="collapse-toggle" 
            class:rotated={profile.collapsed}
            onclick={() => toggleProfileCollapse(profile.id)}
            title={profile.collapsed ? 'Expand' : 'Collapse'}
          >
            <Icon name="chevron-down" size="md" />
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
            <button class="btn-icon" onclick={() => saveAsPreset(i)} title={$t('orderForm.save_as_preset')} aria-label={$t('orderForm.save_as_preset')}>
              <Icon name="bookmark-plus" size="sm" />
            </button>
            <button class="btn-icon" onclick={() => duplicateProfile(profile.id)} title={$t('common.duplicate')} aria-label={$t('common.duplicate')}>
              <Icon name="plus" size="sm" />
            </button>
            {#if profiles.length > 1}
              <button class="btn-icon danger" onclick={() => removeProfile(profile.id)} title={$t('common.remove')} aria-label={$t('common.remove')}>
                <Icon name="trash-2" size="sm" />
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
      <Icon name="upload" size="md" />
      {$t('orders.new.sections.files')} <span class="required">*</span>
    </h2>
    <p class="help-text">{$t('orders.new.files.hint')}</p>
    
    <div class="files-layout">
      <div class="upload-section">
        <div 
          class="file-upload-area"
          class:drag-active={dragActive}
          ondragenter={handleDragEnter}
          ondragleave={handleDragLeave}
          ondragover={handleDragOver}
          ondrop={handleDrop}
          role="button"
          tabindex="0"
        >
          <input 
            type="file" 
            id="file-upload" 
            multiple 
            accept=".pdf,.cdr,.ai,.eps,.jpg,.jpeg,.png"
            onchange={handleFileSelect}
            style="display: none;"
          />
          <label for="file-upload" class="upload-label">
            <Icon name="upload" size="lg" />
            <span class="upload-text">{$t('orders.new.files.drag_drop')}</span>
            <span class="upload-hint">{$t('orders.new.files.formats')}</span>
          </label>
        </div>
        
        {#if uploadedFiles.length > 0}
          <div class="file-list">
            <h3>{$t('files.title')} ({uploadedFiles.length})</h3>
            <div class="file-list-items">
              {#each uploadedFiles as fileItem, i}
                <div 
                  class="file-list-item" 
                  class:selected={selectedFileIndex === i}
                  onclick={() => selectFile(i)}
                  onkeydown={(e) => e.key === 'Enter' && selectFile(i)}
                  role="button"
                  tabindex="0"
                >
                  <div class="file-list-icon">
                    {#if fileItem.type === 'pdf'}
                      <Icon name="file-text" size="md" />
                    {:else if fileItem.type === 'image'}
                      <Icon name="image" size="md" />
                    {:else}
                      <Icon name="file-text" size="md" />
                    {/if}
                  </div>
                  <div class="file-list-info">
                    <span class="file-list-name" title={fileItem.file.name}>{fileItem.file.name}</span>
                    <span class="file-list-size">{formatFileSize(fileItem.file.size)}</span>
                  </div>
                  <div class="file-list-actions">
                    {#if fileItem.type === 'pdf' || fileItem.type === 'image'}
                      <button class="btn-icon-sm" onclick={(e) => { e.stopPropagation(); selectFile(i); }} title={$t('common.preview')} aria-label={$t('common.preview')}>
                        <Icon name="eye" size="xs" />
                      </button>
                    {/if}
                    <button class="btn-icon-sm danger" onclick={(e) => { e.stopPropagation(); removeFile(i); }} title={$t('common.remove')} aria-label={$t('common.remove')}>
                      <Icon name="trash-2" size="xs" />
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
                <button class="btn-icon-sm" onclick={prevPdfPage} disabled={pdfCurrentPage <= 1} title={$t('common.previous_page')} aria-label={$t('common.previous_page')}>
                  <Icon name="chevron-left" size="sm" />
                </button>
                <span class="page-indicator">{pdfCurrentPage} / {pdfTotalPages}</span>
                <button class="btn-icon-sm" onclick={nextPdfPage} disabled={pdfCurrentPage >= pdfTotalPages} title={$t('common.next_page')} aria-label={$t('common.next_page')}>
                  <Icon name="chevron-right" size="sm" />
                </button>
                <span class="divider">|</span>
              {/if}
              <button class="btn-icon-sm" onclick={zoomOut} title={$t('common.zoom_out')} aria-label={$t('common.zoom_out')} disabled={previewZoom <= 0.5}>
                <Icon name="zoom-out" size="sm" />
              </button>
              <span class="zoom-level">{Math.round(previewZoom * 100)}%</span>
              <button class="btn-icon-sm" onclick={zoomIn} title={$t('common.zoom_in')} aria-label={$t('common.zoom_in')} disabled={previewZoom >= 3}>
                <Icon name="zoom-in" size="sm" />
              </button>
              <button class="btn-icon-sm" onclick={resetZoom} title={$t('common.reset')} aria-label={$t('common.reset')}>
                <Icon name="maximize" size="sm" />
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
                <Icon name="file-text" size="xl" />
                <span>{$t('orders.new.files.loading_pdf')}</span>
              </div>
            {:else}
              <div class="preview-placeholder">
                <Icon name="file-text" size="xl" />
                <span>{$t('orders.new.files.no_preview')}</span>
              </div>
            {/if}
          </div>
        {:else}
          <div class="no-preview">
            <Icon name="eye" size="xl" />
            <span>{$t('orders.new.files.no_preview')}</span>
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
        <Icon name="file-text" size="md" />
        {$t('orders.new.sections.details')}
      </h2>
      <div class="form-row">
        <div class="form-group">
          <label for="poNumber">{$t('orders.new.details.po')}</label>
          <div class="po-pending" id="poNumber" aria-live="polite">
            <Icon name="info" size="xs" />
            <span>{$t('orders.new.details.po_pending', { default: 'Will be assigned by Boss at confirmation' })}</span>
          </div>
        </div>
        <div class="form-group">
          <label for="priority">{$t('orders.new.details.priority')}</label>
          <select id="priority" bind:value={priority}>
            <option value="LOW">{$t('orderForm.priority.LOW')}</option>
            <option value="NORMAL">{$t('orderForm.priority.NORMAL')}</option>
            <option value="HIGH">{$t('orderForm.priority.HIGH')}</option>
            <option value="URGENT">{$t('orderForm.priority.URGENT')}</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label for="clientName">{$t('orders.new.details.client')} <span class="required">*</span></label>
        <input type="text" id="clientName" bind:value={clientName} placeholder={$t('orders.new.details.client_placeholder')} class:invalid={fieldErrors.clientName} />
        {#if fieldErrors.clientName}<p class="field-error">{fieldErrors.clientName}</p>{/if}
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="deadline">
            <Icon name="calendar" size="xs" />
            {$t('orders.new.details.deadline')}
          </label>
          <input type="date" id="deadline" bind:value={deadline} class:invalid={fieldErrors.deadline} />
          {#if fieldErrors.deadline}<p class="field-error">{fieldErrors.deadline}</p>{/if}
        </div>
        <div class="form-group">
          <label for="loadingDate">
            <Icon name="calendar" size="xs" />
            {$t('orders.new.details.loading')}
          </label>
          <input type="date" id="loadingDate" bind:value={loadingDate} placeholder={$t('orders.new.details.loading_hint')} />
          <span class="help-text">{$t('orders.new.details.loading_hint')}</span>
        </div>
      </div>
      <div class="form-group">
        <label for="notes">{$t('orders.new.details.notes')}</label>
        <textarea id="notes" bind:value={notes} rows="2" placeholder={$t('orders.new.details.notes_placeholder')}></textarea>
      </div>
    </section>

    <!-- Delivery Address Card -->
    <section class="card delivery-card">
      <h2>
          <Icon name="map-pin" size="md" />
          {$t('orders.new.sections.delivery')}
        </h2>
        
        <!-- Preset Selector -->
        {#if deliveryPresets.length > 0}
          <div class="preset-selector">
            <button 
              class="preset-dropdown-trigger"
              class:active={showPresetDropdown}
              onclick={() => showPresetDropdown = !showPresetDropdown}
            >
              {#if selectedPresetId}
                {deliveryPresets.find(p => p.id === selectedPresetId)?.clientName} - {deliveryPresets.find(p => p.id === selectedPresetId)?.presetName}
              {:else}
                {$t('orders.new.delivery.select_preset')}
              {/if}
              <Icon name="chevron-down" size="sm" />
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
                        onclick={() => selectPreset(preset)}
                      >
                        <span class="preset-name">{preset.presetName}</span>
                        <span class="preset-address">{preset.addressLine1}, {preset.city}</span>
                        {#if preset.isDefault}
                          <span class="default-badge">{$t('orderForm.default_badge')}</span>
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
            <input type="checkbox" bind:checked={useManualAddress} onchange={clearPreset} />
            <span>{$t('orders.new.delivery.manual')}</span>
          </label>
        </div>

        <div class="form-group">
          <label for="deliveryAddress">{$t('orders.new.delivery.address')} <span class="required">*</span></label>
          <textarea 
            id="deliveryAddress" 
            bind:value={deliveryAddress} 
            rows="3" 
            placeholder={$t('orders.new.delivery.address_placeholder')}
            disabled={!useManualAddress && selectedPresetId !== null}
          ></textarea>
          {#if fieldErrors.deliveryAddress}<p class="field-error">{fieldErrors.deliveryAddress}</p>{/if}
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="deliveryContact">
              <Icon name="user" size="xs" />
              {$t('orders.new.delivery.contact')}
            </label>
            <input 
              type="text" 
              id="deliveryContact" 
              bind:value={deliveryContact} 
              placeholder={$t('orders.new.delivery.contact')}
              disabled={!useManualAddress && selectedPresetId !== null}
            />
            {#if fieldErrors.deliveryContact}<p class="field-error">{fieldErrors.deliveryContact}</p>{/if}
          </div>
          <div class="form-group">
            <label for="deliveryPhone">
              <Icon name="phone" size="xs" />
              {$t('orders.new.delivery.phone')}
            </label>
            <input 
              type="tel" 
              id="deliveryPhone" 
              bind:value={deliveryPhone} 
              placeholder="+371..."
              class:invalid={fieldErrors.deliveryPhone}
              disabled={!useManualAddress && selectedPresetId !== null}
            />
            {#if fieldErrors.deliveryPhone}<p class="field-error">{fieldErrors.deliveryPhone}</p>{/if}
          </div>
        </div>
      </section>
    </div>

  <!-- Load Preset Modal -->
  {#if showPresetModal}
    <div
      class="modal-overlay"
      onclick={() => showPresetModal = false}
      onkeydown={(e) => e.key === 'Escape' && (showPresetModal = false)}
      role="button"
      tabindex="0"
    >
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <div
        class="modal"
        onclick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        aria-labelledby="load-preset-title"
      >
        <div class="modal-header">
          <h3>
            <Icon name="book-open" size="md" />
            Load Profile Preset
          </h3>
          <button class="btn-icon" onclick={() => showPresetModal = false}>
            <Icon name="x" size="md" />
          </button>
        </div>
        <div class="modal-body">
          {#if profilePresets.length === 0}
            <p class="empty-state">{$t('orderForm.preset_empty_hint')}</p>
          {:else}
            <div class="preset-list">
              {#each profilePresets as preset}
                <div class="preset-item">
                  <div class="preset-item-content">
                    <div class="preset-item-header">
                      <strong>{preset.name}</strong>
                      {#if preset.isPublic}
                        <span class="public-badge">{$t('orderForm.public_badge')}</span>
                      {/if}
                    </div>
                    {#if preset.description}
                      <p class="preset-description">{preset.description}</p>
                    {/if}
                  </div>
                  <div class="preset-item-actions">
                    <button class="btn-icon" onclick={() => loadPreset(preset.id)} title={$t('orderForm.load_preset', { default: 'Load' })} aria-label={$t('orderForm.load_preset', { default: 'Load' })}>
                      <Icon name="download" size="sm" />
                    </button>
                    <button class="btn-icon danger" onclick={() => deletePreset(preset.id)} title={$t('orderForm.delete_preset')} aria-label={$t('orderForm.delete_preset')}>
                      <Icon name="trash-2" size="sm" />
                    </button>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </div>
  {/if}

  <!-- Save Preset Modal -->
  {#if showSavePresetModal}
    <div
      class="modal-overlay"
      onclick={closeSavePresetModal}
      onkeydown={(e) => e.key === 'Escape' && closeSavePresetModal()}
      role="button"
      tabindex="0"
    >
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <div
        class="modal"
        onclick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        aria-labelledby="save-preset-title"
      >
        <div class="modal-header">
          <h3 id="save-preset-title">
            <Icon name="bookmark-plus" size="md" />
            Save Profile as Preset
          </h3>
          <button class="btn-icon" onclick={closeSavePresetModal}>
            <Icon name="x" size="md" />
          </button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label for="preset-name">Preset Name <span class="required">*</span></label>
            <input
              type="text"
              id="preset-name"
              bind:value={savePresetName}
              placeholder="e.g., Standard Exterior Sign"
            />
          </div>
          <div class="form-group">
            <label for="preset-description">Description</label>
            <textarea
              id="preset-description"
              bind:value={savePresetDescription}
              rows="3"
              placeholder="Optional description of this preset..."
            ></textarea>
          </div>
          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" bind:checked={savePresetPublic} />
              <span>Make this preset public (visible to all users)</span>
            </label>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick={closeSavePresetModal}>Cancel</button>
          <button
            class="btn-primary"
            onclick={confirmSavePreset}
            disabled={!savePresetName.trim() || savingPreset}
          >
            {#if savingPreset}
              <span class="spinner"></span>
              Saving...
            {:else}
              <Icon name="bookmark-plus" size="sm" />
              Save Preset
            {/if}
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  /* [All existing styles remain exactly the same - only script section changed] */
  .po-pending {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    border: 1px dashed var(--border-color, color-mix(in oklab, var(--ink-primary) 20%, transparent));
    border-radius: var(--radius-sm, 8px);
    background: var(--surface-soft, color-mix(in oklab, var(--ink-primary) 4%, transparent));
    color: var(--text-secondary, var(--ink-tertiary));
    font-size: 13px;
    line-height: 1.3;
  }
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
    color: var(--text-secondary, var(--ink-tertiary));
    text-decoration: none;
    font-size: 14px;
    font-weight: 500;
    transition: color 0.2s;
  }

  .back-link:hover {
    color: var(--text-primary, var(--ink-primary));
  }

  h1 {
    margin: 0;
    font-size: 24px;
    font-weight: 700;
    color: var(--text-primary, var(--ink-primary));
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
    background: var(--brand);
    color: var(--bg-0);
  }

  .role-badge.admin {
    background: linear-gradient(135deg, var(--brand), color-mix(in oklab, var(--brand) 70%, var(--bg-0)));
    color: var(--bg-0);
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
    background: var(--brand);
    color: var(--bg-0);
    border: none;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: 0 2px 8px color-mix(in oklab, var(--brand) 30%, transparent);
  }

  .btn-primary:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px color-mix(in oklab, var(--brand) 40%, transparent);
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
    border: 1px solid var(--border, var(--border));
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
    color: var(--text-secondary, var(--ink-secondary));
    transition: all 0.2s;
  }

  .btn-secondary:hover {
    background: var(--bg-hover, var(--bg-2));
    border-color: var(--border-hover, var(--muted));
  }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid color-mix(in oklab, var(--bg-0) 3%, transparent);
    border-top-color: var(--bg-0);
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
    background: var(--error-soft);
    color: var(--error);
    border: 1px solid color-mix(in oklab, var(--error) 30%, transparent);
  }

  .success-banner {
    background: var(--ok-soft);
    color: var(--ok);
    border: 1px solid color-mix(in oklab, var(--ok) 30%, transparent);
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
    background: color-mix(in oklab, var(--bg-0) 10%, transparent);
  }

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
    border: 1px solid var(--border, var(--border));
    border-radius: var(--radius-md, 12px);
    padding: var(--space-md, 16px);
    box-shadow: 0 1px 3px color-mix(in oklab, var(--bg-0) 5%, transparent);
  }

  h2 {
    margin: 0 0 16px 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--text, var(--ink-primary));
    padding-bottom: 12px;
    border-bottom: 1px solid var(--border, var(--border));
    display: flex;
    align-items: center;
    gap: 8px;
  }

  h2 :global(svg) {
    color: var(--muted, var(--ink-tertiary));
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
    color: var(--text-secondary, var(--ink-secondary));
  }

  .form-group label :global(svg) {
    color: var(--text-muted, var(--muted));
  }

  .required {
    color: var(--error);
  }

  .field-error {
    color: var(--error);
    font-size: 12px;
    margin-top: 4px;
  }

  input.invalid,
  textarea.invalid {
    border-color: var(--error);
    box-shadow: 0 0 0 2px color-mix(in oklab, var(--error) 25%, transparent);
  }

  .help-text {
    font-size: 12px;
    color: var(--text-muted, var(--muted));
    margin-top: 4px;
  }

  input, textarea, select {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--border, var(--border));
    border-radius: 8px;
    font-size: 14px;
    color: var(--text-primary, var(--ink-primary));
    font-family: inherit;
    background: var(--input-bg, white);
    transition: all 0.2s;
  }

  input:focus, textarea:focus, select:focus {
    outline: none;
    border-color: var(--brand);
    box-shadow: 0 0 0 3px color-mix(in oklab, var(--brand) 10%, transparent);
  }

  input:disabled, textarea:disabled {
    background: var(--bg-disabled, var(--bg-2));
    color: var(--text-muted, var(--muted));
    cursor: not-allowed;
  }

  input.readonly {
    background: var(--bg-disabled, var(--bg-2));
    color: var(--text-secondary, var(--ink-tertiary));
    cursor: default;
  }

  select {
    cursor: pointer;
  }

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
    border: 1px solid var(--border, var(--border));
    border-radius: 8px;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .preset-dropdown-trigger:hover, .preset-dropdown-trigger.active {
    border-color: var(--brand);
  }

  .preset-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    margin-top: 4px;
    background: white;
    border: 1px solid var(--border, var(--border));
    border-radius: 8px;
    box-shadow: 0 10px 40px color-mix(in oklab, var(--bg-0) 15%, transparent);
    z-index: var(--z-overlay);
    max-height: 300px;
    overflow-y: auto;
  }

  .preset-group {
    border-bottom: 1px solid var(--border, var(--border));
  }

  .preset-group:last-child {
    border-bottom: none;
  }

  .preset-group-header {
    padding: 8px 12px;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted, var(--muted));
    background: var(--bg-subtle, var(--bg-2));
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
    background: var(--bg-hover, var(--bg-2));
  }

  .preset-option.selected {
    background: color-mix(in oklab, var(--brand) 10%, transparent);
  }

  .preset-name {
    font-weight: 600;
    font-size: 14px;
    color: var(--text-primary, var(--ink-primary));
  }

  .preset-address {
    font-size: 12px;
    color: var(--text-muted, var(--muted));
    margin-top: 2px;
  }

  .default-badge {
    font-size: 10px;
    padding: 2px 6px;
    background: var(--brand-soft);
    color: var(--brand);
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
    color: var(--text-secondary, var(--ink-secondary));
  }

  .toggle-label input {
    width: auto;
    cursor: pointer;
  }

  .file-upload-area {
    margin-bottom: 16px;
  }

  .file-upload-area.drag-active .upload-label {
    border-color: var(--brand);
    background: color-mix(in oklab, var(--brand) 5%, transparent);
  }

  .upload-label {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 32px 16px;
    border: 2px dashed var(--border, var(--border));
    border-radius: 12px;
    cursor: pointer;
    color: var(--text-muted, var(--ink-tertiary));
    transition: all 0.2s;
    background: var(--bg-subtle, var(--bg-2));
  }

  .upload-label:hover {
    border-color: var(--brand);
    color: var(--brand);
    background: color-mix(in oklab, var(--brand) 5%, transparent);
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
    color: var(--text-secondary, var(--ink-secondary));
    margin: 0 0 12px 0;
  }

  .btn-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--text-muted, var(--ink-tertiary));
    padding: 6px;
    border-radius: 6px;
    transition: all 0.15s;
  }

  .btn-icon:hover {
    background: var(--bg-hover, var(--border));
    color: var(--text-primary, var(--ink-primary));
  }

  .btn-icon.danger:hover {
    background: var(--error-soft);
    color: var(--error);
  }

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
    color: var(--text-muted, var(--muted));
    padding: 4px 10px;
    background: var(--bg-subtle, var(--bg-2));
    border-radius: 20px;
  }

  .profile-card {
    transition: all 0.2s;
  }

  .profile-card.collapsed {
    padding-bottom: 12px;
  }

  .collapse-toggle {
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    color: var(--text-muted, var(--muted));
    transition: all 0.2s;
  }

  .collapse-toggle:hover {
    background: var(--bg-hover, var(--bg-2));
    color: var(--text-primary, var(--ink-primary));
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
    color: var(--bg-0);
    background: var(--text-muted, var(--muted));
    padding: 2px 8px;
    border-radius: 4px;
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
    color: var(--text, var(--ink-secondary));
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
    background: var(--bg-2, var(--bg-2));
    border: 1px solid var(--border, var(--border));
    border-radius: 8px;
    cursor: pointer;
    transition: background var(--motion-sm) var(--ease-standard), color var(--motion-sm) var(--ease-standard);
  }

  .file-list-item:hover {
    border-color: var(--accent-1, var(--brand));
    background: var(--bg-1, white);
  }

  .file-list-item.selected {
    border-color: var(--accent-1, var(--brand));
    background: color-mix(in oklab, var(--accent-1, var(--brand)) 8%, var(--bg-1, white));
  }

  .file-list-icon {
    color: var(--muted, var(--ink-tertiary));
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
    color: var(--text, var(--ink-primary));
  }

  .file-list-size {
    font-size: 11px;
    color: var(--muted, var(--muted));
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
    border: 1px solid var(--border, var(--border));
    border-radius: 4px;
    cursor: pointer;
    color: var(--muted, var(--ink-tertiary));
    transition: all 0.15s;
  }

  .btn-icon-sm:hover {
    border-color: var(--accent-1, var(--brand));
    color: var(--accent-1, var(--brand));
  }

  .btn-icon-sm.danger:hover {
    border-color: var(--danger, var(--error));
    color: var(--danger, var(--error));
    background: color-mix(in oklab, var(--danger, var(--error)) 8%, var(--bg-1, white));
  }

  .btn-icon-sm:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .preview-section {
    display: flex;
    flex-direction: column;
    background: var(--bg-2, var(--bg-2));
    border: 1px solid var(--border, var(--border));
    border-radius: 8px;
    overflow: hidden;
  }

  .preview-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    background: var(--bg-1, white);
    border-bottom: 1px solid var(--border, var(--border));
    flex-wrap: wrap;
    gap: 8px;
  }

  .preview-filename {
    font-weight: 500;
    font-size: 13px;
    color: var(--text, var(--ink-primary));
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
    color: var(--muted, var(--ink-tertiary));
    min-width: 50px;
    text-align: center;
  }

  .divider {
    color: var(--border, var(--border));
    margin: 0 4px;
  }

  .zoom-level {
    font-size: 12px;
    color: var(--muted, var(--ink-tertiary));
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
    background: var(--bg-2, var(--bg-2));
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
    box-shadow: 0 2px 8px color-mix(in oklab, var(--bg-0) 10%, transparent);
  }

  .no-preview,
  .pdf-preview-placeholder,
  .preview-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: var(--muted, var(--muted));
    text-align: center;
    padding: 40px;
  }

  .no-preview span,
  .pdf-preview-placeholder span,
  .preview-placeholder span {
    font-size: 14px;
  }

  .profile-card-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--border, var(--border));
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

  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: color-mix(in oklab, var(--bg-0) 55%, transparent);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--z-modal);
    padding: 20px;
  }

  .modal {
    background: var(--bg-1, white);
    border-radius: 12px;
    box-shadow: 0 20px 60px color-mix(in oklab, var(--bg-0) 45%, transparent);
    max-width: 600px;
    width: 100%;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 24px;
    border-bottom: 1px solid var(--border, var(--border));
  }

  .modal-header h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--text-primary, var(--ink-primary));
  }

  .modal-body {
    padding: 24px;
    overflow-y: auto;
    flex: 1;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    padding: 16px 24px;
    border-top: 1px solid var(--border, var(--border));
  }

  .preset-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .preset-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px;
    background: var(--bg-2, var(--bg-2));
    border: 1px solid var(--border, var(--border));
    border-radius: 8px;
    transition: all 0.2s;
  }

  .preset-item:hover {
    border-color: var(--accent-1, var(--brand));
    background: var(--bg-1, white);
  }

  .preset-item-content {
    flex: 1;
    min-width: 0;
  }

  .preset-item-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }

  .preset-item-header strong {
    font-weight: 600;
    font-size: 14px;
    color: var(--text-primary, var(--ink-primary));
  }

  .public-badge {
    font-size: 10px;
    font-weight: 600;
    padding: 2px 6px;
    background: var(--brand-soft);
    color: var(--brand);
    border-radius: 4px;
    text-transform: uppercase;
  }

  .preset-description {
    font-size: 13px;
    color: var(--text-muted, var(--muted));
    margin: 0;
  }

  .preset-item-actions {
    display: flex;
    gap: 8px;
  }

  .empty-state {
    text-align: center;
    color: var(--text-muted, var(--muted));
    padding: 40px 20px;
    font-size: 14px;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
    font-size: 14px;
    color: var(--text-secondary, var(--ink-secondary));
  }

  .checkbox-label input[type="checkbox"] {
    width: auto;
    cursor: pointer;
  }
</style>
