<script lang="ts">
  import ClientDeliveryAddresses from '$lib/order/ClientDeliveryAddresses.svelte';
  import { onMount, onDestroy, tick } from 'svelte';
  import { modalDialog } from '$lib/ui/modal-dialog';
  import { goto } from '$app/navigation';
  import { t } from 'svelte-i18n';
  import OrderWorkflowCoach from '$lib/order/OrderWorkflowCoach.svelte';
  import type {GuideStepId} from '$lib/order/order-flow-guidance';
  import type {WorkspaceSection} from '$lib/order/workspace-navigation';
  import Icon from '$lib/ui/Icon.svelte';
  import Profile7stVisual from '$lib/profiles/components/Profile7stVisual.svelte';
  import { createId } from '$lib/utils/id';
  import { currentUser } from '$lib/auth/authState.svelte';
  import { can } from '$lib/auth/permission-utils';
  import { base } from '$app/paths';
  import { validateOrderForm } from '$lib/validation/orderSchema';
  import { getAssistantContext } from '$lib/assistant/context';
  import { orderScreenContext } from '$lib/assistant/visible-context';
  import { nextActionHalo } from '$lib/ui/next-action-halo';

  const assistant = getAssistantContext();


  // SVELTE 5: Convert all reactive state to $state()
  let saving = $state(false);
  let error = $state('');
  // Field-level validation errors keyed by input name (the "ali points").
  let fieldErrors = $state<Record<string, string>>({});
  let successMessage = $state('');
  let presetNotice = $state('');
  let presetProblem = $state('');
  let presetsLoading = $state(false);
  let presetsProblem = $state('');
  // Keep a newly created order available for safe attachment retry after partial failure.
  let savedOrderId: string | null = $state(null);
  let savedOrderUpdatedAt: string | null = $state(null);
  let uploadedFileKeys = $state<Set<string>>(new Set());
  
  // Order Details
  let clientName = $state('');
  let poNumber = $state('');
  let deadline = $state('');
  let loadingDate = $state('');
  let notes = $state('');
  let priority = $state<'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'>('NORMAL');
  let isRd = $state(false);
  let rdNotes = $state('');
  
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
  let deliveryEmail = $state('');
  let useManualAddress = $state(false);
  let showPresetDropdown = $state(false);
  
  // Files with preview
  interface FileWithPreview {
    uploadId: string;
    file: File;
    preview?: string;
    pdfDataUrl?: string;
    type: 'pdf' | 'cdr' | 'image' | 'other';
  }
  let uploadedFiles = $state<FileWithPreview[]>([]);
  let preparingFiles = $state(false);
  let fileUploadInput: HTMLInputElement | undefined = $state();
  let newGuideStep=$state<GuideStepId>('brief');
  let newGuideSection=$state<WorkspaceSection>('details');
  function jumpToNewStep(_target:WorkspaceSection,step:GuideStepId){
    assistant.close();
    newGuideStep=step;
    newGuideSection=step==='files'?'files':step==='review'?'readiness':'details';
    const anchor=step==='brief'?'new-order-details':
      step==='profiles'?'new-order-profiles':
      step==='files'?'new-order-files':'new-order-save';
    document.getElementById(anchor)?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      block: 'start'
    });
  }
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
  
  function selectFile(index: number) {
    if (!uploadedFiles[index]) return;
    pdfRenderSerial++;
    pdfRenderTask?.cancel();
    previewProblem = '';
    selectedFileIndex = index;
    previewZoom = 1;
    pdfCurrentPage = 1;
    pdfTotalPages = 1;
    
    const file = uploadedFiles[index];
    if (file?.type === 'pdf' && file.pdfDataUrl) {
      void renderPdfPage(file.pdfDataUrl, 1);
    } else pdfRendering = false;
  }
  
  let pdfRendering = $state(false);
  let previewProblem = $state('');
  let pdfRenderSerial = 0;
  let previewDisposed = false;
  let pdfRenderTask = $state<any>(null);
  let pdfPageCache = $state(new Map<string, any>());
  let pdfjsLib: any = null;
  
  // Initialize pdfjs on client-side
  onMount(() => {
    if (typeof window !== 'undefined') {
      Promise.all([
        import('pdfjs-dist'),
        import('pdfjs-dist/build/pdf.worker.min.mjs?url')
      ]).then(([module, {default: workerSrc}]) => {
        if (previewDisposed) return;
        pdfjsLib = module;
        if (module.GlobalWorkerOptions) {
          module.GlobalWorkerOptions.workerSrc = workerSrc;
        }
        const selected = selectedFileIndex === null ? null : uploadedFiles[selectedFileIndex];
        if (selected?.type === 'pdf' && selected.pdfDataUrl) {
          void renderPdfPage(selected.pdfDataUrl, 1);
        }
      }).catch((err) => {
        if (!previewDisposed) previewProblem = $t('orders.new.files.previewError');
        console.error('Failed to load pdfjs-dist:', err);
      });
    }
  });
  
  async function renderPdfPage(dataUrl: string, pageNum: number) {
    if (previewDisposed) return;
    const serial = ++pdfRenderSerial;
    const current = () => !previewDisposed && serial === pdfRenderSerial && selectedFileIndex !== null &&
      uploadedFiles[selectedFileIndex]?.pdfDataUrl === dataUrl;
    pdfRendering = true;
    previewProblem = '';
    if (!pdfjsLib) return;
    try {
      const previous = pdfRenderTask;
      pdfRenderTask = null;
      previous?.cancel();
      if (previous) await previous.promise.catch(() => {});
      if (!current()) return;
      // Different drawings commonly share the same PDF header. Cache the
      // complete source and its loading promise, never a truncated prefix.
      let document = pdfPageCache.get(dataUrl);
      if (!document) {
        document = pdfjsLib.getDocument({ data: atob(dataUrl.split(',')[1]) }).promise;
        pdfPageCache.set(dataUrl, document);
      }
      const loaded = await document;
      if (!current()) return;
      pdfTotalPages = loaded.numPages;
      const page = await loaded.getPage(pageNum);
      await tick();
      if (!current() || !pdfCanvas) return;
      const viewport = page.getViewport({ scale: previewZoom });
      const context = pdfCanvas.getContext('2d');
      if (!context) throw new Error('Canvas unavailable');
      pdfCanvas.height = viewport.height;
      pdfCanvas.width = viewport.width;
      const task = page.render({ canvasContext: context, viewport });
      pdfRenderTask = task;
      await task.promise;
    } catch (err: any) {
      if (current() && err?.name !== 'RenderingCancelledException') {
        pdfPageCache.delete(dataUrl);
        previewProblem = $t('orders.new.files.previewError');
        console.error('Error rendering PDF:', err);
      }
    } finally {
      if (current()) { pdfRendering = false; pdfRenderTask = null; }
    }
  }
  onDestroy(() => {
    previewDisposed = true;
    pdfRenderSerial++;
    pdfRenderTask?.cancel();
    for (const document of pdfPageCache.values())
      void document.then((loaded: any) => loaded.destroy()).catch(() => {});
  });
  
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
    const selected = selectedFileIndex === null ? null : uploadedFiles[selectedFileIndex];
    clearTimeout(zoomTimeout);
    if (selected?.type === 'pdf' && selected.pdfDataUrl && previewZoom) {
      const dataUrl = selected.pdfDataUrl;
      const page = pdfCurrentPage;
      zoomTimeout = setTimeout(() => {
        void renderPdfPage(dataUrl, page);
      }, 200);
    }
    return () => clearTimeout(zoomTimeout);
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
    presetsLoading = true; presetsProblem = '';
    try {
      const response = await fetch('/api/order-profile-presets');
      if (!response.ok) throw new Error('Preset lookup unavailable');
      const rows = await response.json();
      if (!Array.isArray(rows)) throw new Error('Invalid preset lookup response');
      profilePresets = rows;
    } catch (err) {
      presetsProblem = $t('orders.new.presets.loadError');
      console.error('Failed to load profile presets:', err);
    } finally { presetsLoading = false; }
  }

  async function saveAsPreset(profileIndex: number) {
    presetProblem = ''; presetNotice = '';
    const profile = profiles[profileIndex];
    savePresetName = profile.configuration.profileName || '';
    savePresetDescription = '';
    savePresetPublic = false;
    selectedPresetForLoad = profileIndex;
    showSavePresetModal = true;
  }

  async function confirmSavePreset() {
    if (savingPreset || !savePresetName.trim() || selectedPresetForLoad === null) return;

    savingPreset = true;
    presetProblem = ''; presetNotice = '';
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
        presetNotice = $t('orders.new.presets.saved');
        await loadProfilePresets();
        closeSavePresetModal();
      } else {
        presetProblem = $t('orders.new.presets.saveError');
      }
    } catch (err) {
      console.error('Error saving preset:', err);
      presetProblem = $t('orders.new.presets.saveError');
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
    presetNotice = $t('orders.new.presets.loaded',{name:preset.name});
  }

  async function deletePreset(presetId: number | string) {
    if (!confirm($t('orders.new.presets.deleteConfirm'))) return;

    try {
      const response = await fetch(`/api/order-profile-presets/${presetId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        presetNotice = $t('orders.new.presets.deleted');
        await loadProfilePresets();
      } else {
        presetsProblem = $t('orders.new.presets.deleteError');
      }
    } catch (err) {
      console.error('Error deleting preset:', err);
      presetsProblem = $t('orders.new.presets.deleteError');
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
    notes?: string;
  };

  const defaultConfiguration = {
    profileName: $t('orders.new.defaultProfileName'),
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

  // Guidance and the explicit save action share exactly the same form checks.
  // The halo is a next-action cue, never a production-readiness approval.
  function validateCurrentOrderForm() {
    return validateOrderForm({
      clientName,
      deadline,
      loadingDate,
      priority,
      deliveryAddress,
      deliveryContact,
      deliveryPhone,
      deliveryEmail,
      notes,
      hasFiles: uploadedFiles.length > 0,
      selectedPresetId,
      profiles: profiles.map((p) => ({
        profileTemplateId: p.profileTemplateId ?? null,
        quantity: p.quantity,
        configuration: p.configuration
      }))
    });
  }
  let canContinueToReview = $derived(
    !saving && !preparingFiles && !successMessage && can($currentUser, 'createDraftOrder') &&
    (uploadedFiles.length > 0 || uploadedFileKeys.size > 0) && validateCurrentOrderForm().ok
  );

  let newGuideContext=$derived({
    phase:'new' as const,status:'DRAFT',
    clientName,deadline,title:'',
    profileCount:profiles.length,
    unassignedProfiles:profiles.filter(p=>!p.profileTemplateId).length,
    fileCount:uploadedFiles.length,
    dirty:true,
    canEdit:can($currentUser,'createDraftOrder')
  });

  onMount(() => assistant.register({
    id: 'order:new',
    title: () => $t('orders.new.title'),
    tools: () => [{ id: 'prepare', label: $t('orderGuide.title') }],
    context: () => orderScreenContext({
      screen: 'order-draft', orderId: savedOrderId, status: 'DRAFT',
      unsaved: true, clientName, deadline, loadingDate, priority,
      notes: notes.slice(0, 3000), isRd,
      attachments: uploadedFiles.slice(0, 20).map(entry => ({
        name: entry.file.name, type: entry.file.type, size: entry.file.size
      })),
      fileContentsProvided: false
    }, profiles),
    content: draftAssistantContent
  }));

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
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) return 'image';
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
    if (saving || preparingFiles || successMessage) return;
    preparingFiles = true;
    try {
      for (const file of newFiles) {
        const type = getFileType(file);
        const fileWithPreview: FileWithPreview = { file, type, uploadId: createId('upload') };
        if (type === 'image') {
          fileWithPreview.preview = await createImagePreview(file);
        } else if (type === 'pdf') {
          fileWithPreview.pdfDataUrl = await createDataUrl(file);
        }
        uploadedFiles = [...uploadedFiles, fileWithPreview];
        if (uploadedFiles.length === 1) selectFile(0);
      }
    } catch { error = $t('orders.new.files.readError'); }
    finally { preparingFiles = false; }
  }

  function createImagePreview(file: File): Promise<string> {
    return createDataUrl(file);
  }

  function createDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = () => reject(reader.error);
      reader.onabort = () => reject(new Error('File read cancelled'));
      reader.readAsDataURL(file);
    });
  }

  function removeFile(index: number) {
    if (saving || preparingFiles || successMessage) return;
    const removed = uploadedFiles[index];
    uploadedFiles = uploadedFiles.filter((_, i) => i !== index);
    if (selectedFileIndex === index) {
      if (uploadedFiles.length) selectFile(0);
      else { selectedFileIndex = null; pdfRenderSerial++; pdfRenderTask?.cancel(); pdfRendering = false; }
    } else if (selectedFileIndex !== null && selectedFileIndex > index) {
      selectedFileIndex--;
    }
    if (removed?.pdfDataUrl && !uploadedFiles.some(item => item.pdfDataUrl === removed.pdfDataUrl)) {
      const document = pdfPageCache.get(removed.pdfDataUrl);
      pdfPageCache.delete(removed.pdfDataUrl);
      void document?.then((loaded: any) => loaded.destroy()).catch(() => {});
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

  async function saveOrder(destination:'review'|'assistant'|'intake'='review') {
    if (saving || preparingFiles || successMessage) return;
    if (!can($currentUser, 'createDraftOrder')) { error = 'Manager role required to create orders'; return; }
    error = '';
    fieldErrors = {};

    // Missing attachments block submission for review, not saving a working
    // draft to discuss with the OpenRouter assistant. The backend still
    // validates attachments at the explicit review submission endpoint.
    // Uploaded entries remain linked to the draft during safe upload retries.
    if (destination === 'review' && uploadedFiles.length === 0 && uploadedFileKeys.size === 0) {
      fieldErrors = { ...fieldErrors, files: $t('orders.new.messages.validation.files') };
    }

    // Validate the rest of the form with the shared schema ("ali points").
    const { ok, errors } = validateCurrentOrderForm();

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
      let orderId = savedOrderId;
      const orderData = {
        clientName, deadline, loadingDate: loadingDate || null,
        notes, priority, deliveryPresetId: typeof selectedPresetId === 'string' ? selectedPresetId : null,
        deliveryAddress, deliveryContact, deliveryPhone,
        deliveryEmail: deliveryEmail || null, isRd, rdNotes,
        profiles: profiles.map(p => ({
          profileTemplateId: p.profileTemplateId ?? null,
          quantity: p.quantity, configuration: p.configuration ?? {},
          notes: p.notes ?? ''
        }))
      };
      if (!orderId) {
        const createData = { ...orderData, status: 'DRAFT' as const };

        const orderResponse = await fetch('/api/draft-orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(createData)
        });

        if (!orderResponse.ok) {
          const res = await orderResponse.json().catch(() => ({}));
          error = res.error || res.message || $t('admin.users.messages.save_error');
          return;
        }

        const orderResult = await orderResponse.json();
        orderId = orderResult.order?.id || orderResult.id;
        if (!orderId) {
          error = 'Order was created but the server did not return its ID. Contact support before retrying.';
          return;
        }
        savedOrderId = String(orderId);
        savedOrderUpdatedAt = orderResult.order?.updated_at ?? orderResult.order?.updatedAt ?? null;
      } else {
        const updated = await fetch(`/api/draft-orders/${orderId}`, {
          method:'PUT',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({...orderData,expectedUpdatedAt:savedOrderUpdatedAt})
        });
        if (!updated.ok) {
          const detail = await updated.json().catch(() => ({}));
          error = (updated.status === 409 || updated.status === 428) ? $t('orderWorkspace.staleSave') :
            (detail.error || 'Draft changes were not saved before retrying file uploads');
          return;
        }
        savedOrderUpdatedAt = (await updated.json()).updatedAt ?? null;
      }

      const failedUploads: string[] = [];
      for (const fileItem of uploadedFiles) {
        const fileKey = fileItem.uploadId;
        if (uploadedFileKeys.has(fileKey)) continue;
        const formData = new FormData();
        formData.append('file', fileItem.file);
        formData.append('order_id', String(orderId));
        formData.append('file_type', 'sketch');

        try {
          const uploadResponse = await fetch(`${base}/api/files/upload`, { method: 'POST', body: formData });
          if (!uploadResponse.ok) {
            // SvelteKit HttpError responses expose the reason as "message", not
            // "error". Previously the UI discarded it and showed only the name.
            const payload: Record<string, unknown> = await uploadResponse.json().catch(() => ({}));
            const serverReason = typeof payload.message === 'string' ? payload.message
              : typeof payload.error === 'string' ? payload.error : '';
            const reason = serverReason.trim().slice(0, 320) ||
              $t('orders.new.files.uploadHttpError', { values: { status: uploadResponse.status } });
            failedUploads.push(`${fileItem.file.name}: ${reason}`);
          } else {
            // Successfully linked files are excluded from subsequent manual retries.
            uploadedFileKeys = new Set(uploadedFileKeys).add(fileKey);
          }
        } catch {
          failedUploads.push(`${fileItem.file.name}: ${$t('orders.new.files.uploadNetworkError')}`);
        }
      }

      if (failedUploads.length > 0) {
        error = $t('orders.new.files.partialUpload', { values: {
          count: failedUploads.length, details: failedUploads.join('; ')
        } });
        return;
      }

      // Both AI actions keep the form and linked attachments saved as a DRAFT.
      // Review submission remains a separate, explicit action below.
      if(destination==='intake'){
        successMessage=$t('orderAssistant.draftSaved');
        await goto(`${base}/orders/${encodeURIComponent(String(orderId))}/edit?section=intake`);
        return;
      }
      if(destination==='assistant'){
        successMessage=$t('orderAssistant.draftSaved');
        await goto(`${base}/orders/${encodeURIComponent(String(orderId))}/edit?section=chat&assist=profiles`);
        return;
      }

      // Review publication occurs only after all uploaded files are linked
      // to this draft. On failure retain savedOrderId for safe retry.
      const submitResponse = await fetch(`/api/draft-orders/${orderId}/submit`, {
        method: 'POST'
      });
      if (!submitResponse.ok) {
        const detail = await submitResponse.json().catch(() => ({}));
        error = detail.message || detail.error || 'Draft saved but could not be submitted for review. Retry Save.';
        return;
      }
      savedOrderId = null;
      savedOrderUpdatedAt = null;
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


{#snippet draftAssistantContent(toolId: string)}
  <div class="draft-assistant-tools" hidden={toolId !== 'prepare'}>
    <OrderWorkflowCoach context={newGuideContext} section={newGuideSection}
      focusStep={newGuideStep} onNavigate={jumpToNewStep}/>
    <p>{$t('orderAssistant.saveAndAskHint')}</p>
    <button class="btn-secondary" type="button"
      onclick={()=>void saveOrder('assistant')}
      disabled={saving || preparingFiles || !!successMessage || !can($currentUser, 'createDraftOrder')}>
      <Icon name="save" size="sm" /> {$t('orderAssistant.saveAndAsk')}
    </button>
    {#if error}<p class="assistant-form-error" role="alert">{error}</p>{/if}
  </div>
{/snippet}

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
      <button type="button" class="btn-secondary" onclick={()=>void saveOrder('intake')}
        disabled={saving||preparingFiles||!!successMessage||!can($currentUser,'createDraftOrder')}>
        <Icon name="file-text" size="sm" /> {$t('orderIntake.saveAndAnalyze')}
      </button>
      <button id="new-order-save" type="button" class="btn-primary" use:nextActionHalo={canContinueToReview}
        aria-busy={saving} onclick={()=>void saveOrder('review')} disabled={saving || preparingFiles || !!successMessage || !can($currentUser, 'createDraftOrder')}>
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
    <div class="error-banner" role="alert">
      <Icon name="alert-circle" size="sm" />
      {error}
      <button type="button" class="close-btn" aria-label={$t('common.close')} onclick={() => error = ''}>
        <Icon name="x" size="sm" />
      </button>
    </div>
  {/if}

  {#if successMessage}
    <div class="success-banner" role="status">
      <Icon name="save" size="sm" />
      {successMessage}
    </div>
  {/if}
  {#if presetNotice}<div class="success-banner" role="status">{presetNotice}</div>{/if}

  <!-- 1. PROFILES SECTION (TOP) -->
  <section id="new-order-profiles" class="profiles-section full-width">
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
          {$t('orders.new.addProfile')}
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
            title={$t(profile.collapsed ? 'orders.new.expandProfile' : 'orders.new.collapseProfile')}
            aria-label={$t(profile.collapsed ? 'orders.new.expandProfile' : 'orders.new.collapseProfile')}
            aria-expanded={!profile.collapsed}
          >
            <Icon name="chevron-down" size="md" />
          </button>
          <div class="profile-title">
            <span class="profile-number">#{i + 1}</span>
            <h3>{profile.configuration.profileName || $t('productionPacket.profileNumber',{number:i+1})}</h3>
          </div>
          <div class="profile-actions">
            <div class="quantity-control">
              <label for="qty-{profile.id}">{$t('orderSheet.quantity')}:</label>
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
  <section id="new-order-files" class="card files-card full-width">
    <h2>
      <Icon name="upload" size="md" />
      {$t('orders.new.sections.files')} <span class="required">*</span>
    </h2>
    <p class="help-text">{$t('orders.new.files.hint')}</p>
    <p class="help-text">{$t('orderIntake.newOrderHint')}</p>
    
    <div class="files-layout">
      <div class="upload-section">
        <div 
          class="file-upload-area"
          class:drag-active={dragActive}
          ondragenter={handleDragEnter}
          ondragleave={handleDragLeave}
          ondragover={handleDragOver}
          ondrop={handleDrop}
          role="presentation"
        >
          <input 
            type="file" 
            id="file-upload" 
            bind:this={fileUploadInput}
            multiple 
            accept=".pdf,.cdr,.dxf,.jpg,.jpeg,.png,.gif,.webp"
            onchange={handleFileSelect}
            hidden
            disabled={saving||preparingFiles||!!successMessage}
          />
          <button type="button" class="upload-label" aria-label={$t('orders.new.files.upload')}
            disabled={saving||preparingFiles||!!successMessage} onclick={()=>fileUploadInput?.click()}>
            <Icon name="upload" size="lg" />
            <span class="upload-text">{$t('orders.new.files.drag_drop')}</span>
            <span class="upload-hint">{$t('orders.new.files.formats')}</span>
          </button>
        </div>
        {#if preparingFiles}<p class="help-text" role="status">{$t('orders.new.files.preparing')}</p>{/if}
        
        {#if uploadedFiles.length > 0}
          <div class="file-list">
            <h3>{$t('files.title')} ({uploadedFiles.length})</h3>
            <div class="file-list-items">
              {#each uploadedFiles as fileItem, i}
                <div 
                  class="file-list-item" 
                  class:selected={selectedFileIndex === i}
                  onclick={() => selectFile(i)}
                  onkeydown={(e) => {if(e.target===e.currentTarget&&(e.key==='Enter'||e.key===' ')){e.preventDefault();selectFile(i);}}}
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
                    <button class="btn-icon-sm danger" disabled={saving||preparingFiles||!!successMessage} onclick={(e) => { e.stopPropagation(); removeFile(i); }} title={$t('common.remove')} aria-label={$t('common.remove')}>
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
              {#if previewProblem}<p role="alert">{previewProblem}</p>
              {:else if pdfRendering}<p role="status">{$t('orders.new.files.loading_pdf')}</p>{/if}
              <canvas bind:this={pdfCanvas} class="pdf-canvas" class:pdf-pending={pdfRendering||!!previewProblem}></canvas>
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
    <section id="new-order-details" class="card details-card">
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
        <input type="text" id="clientName" bind:value={clientName} placeholder={$t('orders.new.details.client_placeholder')} class:invalid={fieldErrors.clientName} aria-invalid={!!fieldErrors.clientName} />
        {#if fieldErrors.clientName}<p class="field-error">{fieldErrors.clientName}</p>{/if}
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="deadline">
            <Icon name="calendar" size="xs" />
            {$t('orders.new.details.deadline')}
          </label>
          <input type="date" id="deadline" bind:value={deadline} class:invalid={fieldErrors.deadline} aria-invalid={!!fieldErrors.deadline} />
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
        <label for="order-is-rd">
          <input type="checkbox" id="order-is-rd" bind:checked={isRd} />
          {$t('orderForm.isRd')}
        </label>
        {#if isRd}
          <label for="order-rd-notes">{$t('orderForm.rdNotes')}</label>
          <textarea id="order-rd-notes" bind:value={rdNotes} rows="2" maxlength="8000"></textarea>
        {/if}
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

        <ClientDeliveryAddresses {clientName} current={{deliveryAddress,deliveryContact,deliveryPhone,deliveryEmail}}
          onSelect={patch=>{deliveryAddress=patch.deliveryAddress;deliveryContact=patch.deliveryContact;
            deliveryPhone=patch.deliveryPhone;deliveryEmail=patch.deliveryEmail;selectedPresetId=null;useManualAddress=true;}}/>
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
        <div class="form-group">
          <label for="order-delivery-email">{$t('orderForm.deliveryEmail')}</label>
          <input id="order-delivery-email" type="email" bind:value={deliveryEmail}
            maxlength="200" placeholder="contact@example.com" />
          {#if fieldErrors.deliveryEmail}<p class="field-error">{fieldErrors.deliveryEmail}</p>{/if}
        </div>
      </section>
    </div>

  <!-- Load Preset Modal -->
  {#if showPresetModal}
    <dialog
      class="modal-overlay"
      aria-labelledby="load-preset-title"
      use:modalDialog={{onClose:()=>showPresetModal=false,initialFocus:'#load-preset-title'}}
    >
      <div class="modal">
        <div class="modal-header">
          <h3 id="load-preset-title" tabindex="-1">
            <Icon name="book-open" size="md" />
            {$t('orders.new.presets.loadTitle')}
          </h3>
          <button type="button" class="btn-icon" aria-label={$t('common.close')} onclick={() => showPresetModal = false}>
            <Icon name="x" size="md" />
          </button>
        </div>
        <div class="modal-body">
          {#if presetsLoading}<p role="status">{$t('actions.loading')}</p>{/if}
          {#if presetsProblem}<p role="alert">{presetsProblem}</p>
            <button type="button" class="btn-secondary" onclick={loadProfilePresets} disabled={presetsLoading}>{$t('clientAddresses.retry')}</button>{/if}
          {#if !presetsLoading&&!presetsProblem&&profilePresets.length === 0}
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
    </dialog>
  {/if}

  <!-- Save Preset Modal -->
  {#if showSavePresetModal}
    <dialog
      class="modal-overlay"
      aria-labelledby="save-preset-title"
      use:modalDialog={{onClose:closeSavePresetModal,closeOnEscape:!savingPreset,closeOnBackdrop:!savingPreset,initialFocus:'#preset-name'}}
    >
      <div class="modal">
        <div class="modal-header">
          <h3 id="save-preset-title">
            <Icon name="bookmark-plus" size="md" />
            {$t('orders.new.presets.saveTitle')}
          </h3>
          <button type="button" class="btn-icon" disabled={savingPreset} aria-label={$t('common.close')} onclick={closeSavePresetModal}>
            <Icon name="x" size="md" />
          </button>
        </div>
        <div class="modal-body">
          {#if presetProblem}<p role="alert">{presetProblem}</p>{/if}
          <div class="form-group">
            <label for="preset-name">{$t('orders.new.presets.nameLabel')} <span class="required">*</span></label>
            <input
              type="text"
              id="preset-name"
              bind:value={savePresetName}
              placeholder={$t('orders.new.presets.namePlaceholder')}
              disabled={savingPreset}
            />
          </div>
          <div class="form-group">
            <label for="preset-description">{$t('orders.new.presets.descriptionLabel')}</label>
            <textarea
              id="preset-description"
              bind:value={savePresetDescription}
              rows="3"
              placeholder={$t('orders.new.presets.descriptionPlaceholder')}
              disabled={savingPreset}
            ></textarea>
          </div>
          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" bind:checked={savePresetPublic} disabled={savingPreset} />
              <span>{$t('orders.new.presets.publicLabel')}</span>
            </label>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" disabled={savingPreset} onclick={closeSavePresetModal}>{$t('common.cancel')}</button>
          <button
            class="btn-primary"
            onclick={confirmSavePreset}
            disabled={!savePresetName.trim() || savingPreset}
          >
            {#if savingPreset}
              <span class="spinner"></span>
              {$t('actions.saving')}
            {:else}
              <Icon name="bookmark-plus" size="sm" />
              {$t('orders.new.presets.saveAction')}
            {/if}
          </button>
        </div>
      </div>
    </dialog>
  {/if}
</div>

<style>
  .draft-assistant-tools { display: grid; gap: 12px; min-width: 0; }
  .draft-assistant-tools[hidden] { display: none; }
  .draft-assistant-tools p { margin: 0; font-size: var(--text-sm); line-height: 1.5; color: var(--ink-secondary); }
  .draft-assistant-tools .assistant-form-error { color: var(--danger); }

  /* Native order form contracts remain unchanged; visual/keyboard refinements below. */
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
    background: var(--bg-1);
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

  input.invalid {
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
    background: var(--bg-1);
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
    background: var(--bg-1);
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

  /* LUMIGRID surface polish, keeping predefined order/profile form controls. */
  .page-container { padding:0 0 var(--space-xl); max-width:100%; }
  .page-header { position:relative;align-items:flex-start;padding:var(--space-lg) 0;
    border-bottom:1px solid var(--divider);margin-bottom:var(--space-xl); }
  .page-header::before { content:'';position:absolute;top:0;left:0;width:80px;height:2px;
    background:linear-gradient(90deg,var(--brand),var(--brand-2),transparent); }
  h1 { font-size:clamp(1.5rem,2.6vw,2rem);letter-spacing:var(--tracking-tight); }
  .header-actions { flex-wrap:wrap;align-items:center;gap:var(--space-sm); }
  .btn-primary,.btn-secondary { min-height:42px;border-radius:var(--radius-md);
    font:inherit;font-weight:650;padding:10px 16px; }
  .btn-primary,.role-badge.superadmin,.role-badge.admin { color:var(--on-brand); }
  .btn-primary { background:var(--brand);box-shadow:var(--elevation-1); }
  .btn-primary:hover:not(:disabled) { background:var(--brand-2);box-shadow:var(--elevation-2); }
  .btn-secondary { background:var(--bg-1);color:var(--ink-secondary);
    border-color:var(--border); }
  .btn-secondary:hover { background:var(--bg-2);color:var(--ink-primary); }
  .profile-card,.files-card,.details-card,.delivery-card {
    background:var(--glass-bg-strong);
    border:1px solid var(--glass-border);
    box-shadow:var(--glass-shadow-sm);
    border-radius:var(--radius-lg);
  }
  .profile-card { margin-top:var(--space-sm); }
  .profiles-header { padding:var(--space-sm) 0; }
  .profile-card-header { min-width:0; }
  .profile-title { min-width:0; }
  .profile-title h3 { min-width:0;overflow-wrap:anywhere; }
  .profile-actions { flex-wrap:wrap;justify-content:flex-end; }
  .profile-number { background:var(--brand-soft);color:var(--brand); }
  .btn-icon,.btn-icon-sm,.collapse-toggle { min-width:36px;min-height:36px;
    border-radius:var(--radius-sm); }
  .file-upload-area { position:relative; }
  .file-upload-area:focus-within .upload-label { outline:2px solid var(--focus);outline-offset:3px; }
  .upload-label { width:100%;font:inherit;background:var(--bg-2);min-height:170px;border:1px dashed var(--border-strong);
    border-radius:var(--radius-md);justify-content:center; }
  .upload-label:disabled {opacity:.55;cursor:not-allowed}
  .pdf-pending {visibility:hidden}
  dialog.modal-overlay {width:100%;height:100%;max-width:none;max-height:none;margin:0;border:0;padding:var(--space-md);color:var(--ink-primary)}
  .upload-label:hover,.file-upload-area.drag-active .upload-label {
    border-color:var(--brand);background:var(--brand-soft);color:var(--ink-primary);
  }
  .files-layout { grid-template-columns:minmax(220px, 340px) minmax(0,1fr);min-height:380px; }
  .upload-section,.preview-section { min-width:0; }
  .file-list-item { background:var(--bg-1);border-radius:var(--radius-md); }
  .file-list-item:focus-visible { outline:2px solid var(--focus);outline-offset:2px; }
  /* Delete/preview cannot be hover-only on touch or keyboard. */
  .file-list-actions { opacity:1; }
  .file-list-item:focus-within .file-list-actions { opacity:1; }
  .preview-section { background:var(--bg-2);border-radius:var(--radius-md); }
  .preview-container { padding:var(--space-lg);min-height:260px; }
  .form-row,.client-delivery-row { min-width:0; }
  .form-group input,.form-group select,.form-group textarea { color:var(--ink-primary);background:var(--bg-1);
    border:1px solid var(--border);min-height:42px;max-width:100%;border-radius:var(--radius-sm); }
  .form-group input:focus-visible,.form-group select:focus-visible,.form-group textarea:focus-visible {
    outline:2px solid var(--focus);outline-offset:1px;border-color:var(--focus); }
  .modal { background:var(--bg-1);border:1px solid var(--border);border-radius:var(--radius-lg); }
  @media(max-width:1200px) {
    .files-layout { grid-template-columns:1fr; }
    .preview-section { min-height:280px; }
  }
  @media(max-width:640px) {
    .page-header { align-items:stretch; }
    .header-actions { width:100%; }
    .header-actions > button { flex:1 1 auto; }
    .profile-actions { gap:var(--space-xs); }
    .profile-card-header { flex-wrap:wrap; }
    .profile-title { flex:1 1 150px; }
    .profile-actions { width:100%; }
    .preview-controls { flex-wrap:wrap; }
  }
</style>
