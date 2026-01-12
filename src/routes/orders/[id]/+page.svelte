<script lang="ts">
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import { t } from 'svelte-i18n';
  import { replaceState } from '$app/navigation';
  import { goto } from '$app/navigation';
  
  // Icons
  import { 
    Save, FileText, MapPin, Calendar, Activity, Boxes, MessageSquare, 
    FolderOpen, ChevronDown, ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut,
    Plus, Trash2, Upload, Eye, AlertCircle, ArrowLeft, FlaskConical, Check, XCircle, Download
  } from 'lucide-svelte';
  
  // Components
  import Tabs from '$lib/ui/Tabs.svelte';
  import PdfFrame from '$lib/pdf/PdfFrame.svelte';
  import StationLogTimeline from '$lib/order/StationLogTimeline.svelte';
  import ChangeRequestList from '$lib/order/ChangeRequestList.svelte';
  import ChangeRequestForm from '$lib/order/ChangeRequestForm.svelte';
  import RevisionsList from '$lib/order/RevisionsList.svelte';
  import BranchesTable from '$lib/order/BranchesTable.svelte';
  import { role } from '$lib/ui/RoleSwitch.svelte';
  import { currentUser } from '$lib/auth/user-store';
  import BadgesManager from '$lib/order/BadgesManager.svelte';
  import { announce as announceToast } from '$lib/stores/toast';
  import { announce } from '$lib/a11y/live';
  import LoadingPicker from '$lib/calendar/LoadingPicker.svelte';
  import ReworkQuick from '$lib/order/ReworkQuick.svelte';
  import OrderChat from '$lib/order/OrderChat.svelte';
  import OrderFiles from '$lib/order/OrderFiles.svelte';
  import Profile7stVisual from '$lib/profiles/components/Profile7stVisual.svelte';
  
  // Store and types
  import type { Order, Badge } from '$lib/order/types.signage';
  import {
    getOrder, updateOrder, setBadges as setOrderBadges, setLoadingDate,
    addRedoFlag, openChangeRequest, approveChangeRequest, declineChangeRequest
  } from '$lib/order/signage-store';
  import { blankStages, STATIONS, type StageState, type StationTag } from '$lib/order/stages';
  import { getOrderSeed } from '$lib/order/order-seeds';

  // Accept params prop to silence SvelteKit warning
  export let params = {};

  // Get ID from SvelteKit page params
  $: id = $page.params.id;

  let o: Order | null = null;
  let isLoading = true;
  let saving = false;
  let error = '';
  let approving = false;
  let rejecting = false;
  let showRejectModal = false;
  let rejectReason = '';

  // Tabs
  let tab = 'overview';
  const tabs = [
    { id: 'overview', label: 'Overview', icon: FileText },
    { id: 'production', label: 'Production', icon: Activity },
    { id: 'files', label: 'Files', icon: FolderOpen },
    { id: 'chat', label: 'Chat', icon: MessageSquare },
    { id: 'logs', label: 'Logs', icon: Boxes }
  ];

  // PDF Preview state
  let pdfCanvas: HTMLCanvasElement;
  let pdfCurrentPage = 1;
  let pdfTotalPages = 1;
  let pdfDoc: any = null;
  let previewZoom = 1;
  let pdfRendering = false;
  
  // Loading picker
  let showPicker = false;

  // Delivery presets
  interface DeliveryPreset {
    id: number;
    clientName: string;
    presetName: string;
    addressLine1: string;
    city: string;
    country: string;
    isDefault: boolean;
  }
  let deliveryPresets: DeliveryPreset[] = [];
  let showPresetDropdown = false;

  // Profile configuration (matching new order form)
  interface ProfileConfig {
    id: string;
    quantity: number;
    configuration: any;
    collapsed: boolean;
  }
  let profiles: ProfileConfig[] = [];

  onMount(async () => {
    o = await getOrder(id);
    
    if (!o) {
      // Fallback to seed data for demo
      const seed = getOrderSeed(id);
      if (seed) {
        const stages = seed.stages ? { ...blankStages(), ...seed.stages } : blankStages();
        o = {
          id: seed.id,
          title: seed.title,
          client: seed.client,
          due: seed.due,
          loadingDate: seed.loadingDate || '',
          badges: seed.badges || ['OPEN'],
          fields: seed.fields || [],
          materials: seed.materials || [],
          stages,
          cycles: [],
          isRD: seed.isRD || false,
          rdNotes: seed.rdNotes || '',
          isDraft: false,
          profiles: [],
          redo: [],
          redoReasons: {},
          redoStage: '',
          revisions: [],
          branches: [],
          prs: [],
          defaultBranch: 'main',
          defaultRevisionId: ''
        };
      } else {
        o = createFallbackOrder();
      }
    }

    // Initialize profiles from order
    if (o.profiles && o.profiles.length > 0) {
      profiles = o.profiles.map((p: any, idx: number) => ({
        id: p.id || `profile-${idx}`,
        quantity: p.quantity || 1,
        configuration: p.configuration || getDefaultProfileConfig(),
        collapsed: idx > 0
      }));
    } else {
      profiles = [{
        id: 'profile-1',
        quantity: 1,
        configuration: getDefaultProfileConfig(),
        collapsed: false
      }];
    }

    // Load delivery presets
    try {
      const res = await fetch(`${base}/api/delivery-presets`);
      if (res.ok) deliveryPresets = await res.json();
    } catch {}

    isLoading = false;
    
    // Render PDF if available
    if (o?.file?.path) {
      setTimeout(() => renderPdfPreview(o!.file!.path), 100);
    }
  });

  function createFallbackOrder(): Order {
    const stages = blankStages();
    stages.CAD = 'COMPLETED';
    stages.CNC = 'IN_PROGRESS';
    return {
      id,
      title: 'New Order',
      client: 'Client Name',
      due: new Date().toISOString().slice(0, 10),
      loadingDate: '',
      badges: ['OPEN', 'IN_PROGRESS'],
      fields: [],
      materials: [],
      stages,
      cycles: [],
      isDraft: false,
      profiles: [],
      isRD: false,
      rdNotes: '',
      redo: [],
      redoReasons: {},
      redoStage: '',
      revisions: [],
      branches: [],
      prs: [],
      defaultBranch: 'main',
      defaultRevisionId: ''
    };
  }

  function getDefaultProfileConfig() {
    // Configuration structure matching Profile7stVisual component
    return {
      profileName: 'New Profile',
      signType: 'EXTERIOR' as const,
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
        psu: true, psuModel: '', psuType: 'regular' as const, psuMounting: '',
        cables: true, cableType: '', cablesLength: '2m', cablesWago: false,
        frame: true, frameMaterial: '', frameDimensions: '40x40x2', frameCustom: '',
        frameWaterholes: true, frameMountingHoles: false,
        shablon: false, notes: ''
      }
    };
  }

  // PDF rendering
  declare global {
    interface Window { pdfjsLib: any; }
  }

  async function renderPdfPreview(path: string) {
    if (typeof window === 'undefined' || !window.pdfjsLib || !pdfCanvas) return;
    if (pdfRendering) return;
    pdfRendering = true;

    try {
      const loadingTask = window.pdfjsLib.getDocument(path);
      pdfDoc = await loadingTask.promise;
      pdfTotalPages = pdfDoc.numPages;
      await renderPage(pdfCurrentPage);
    } catch (err) {
      console.error('PDF render error:', err);
    } finally {
      pdfRendering = false;
    }
  }

  async function renderPage(pageNum: number) {
    if (!pdfDoc || !pdfCanvas) return;
    
    const page = await pdfDoc.getPage(pageNum);
    const scale = 1.5 * previewZoom;
    const viewport = page.getViewport({ scale });
    
    const context = pdfCanvas.getContext('2d');
    pdfCanvas.height = viewport.height;
    pdfCanvas.width = viewport.width;
    
    await page.render({ canvasContext: context, viewport }).promise;
  }

  function prevPage() {
    if (pdfCurrentPage > 1) {
      pdfCurrentPage--;
      renderPage(pdfCurrentPage);
    }
  }

  function nextPage() {
    if (pdfCurrentPage < pdfTotalPages) {
      pdfCurrentPage++;
      renderPage(pdfCurrentPage);
    }
  }

  function zoomIn() {
    previewZoom = Math.min(previewZoom + 0.25, 3);
    renderPage(pdfCurrentPage);
  }

  function zoomOut() {
    previewZoom = Math.max(previewZoom - 0.25, 0.5);
    renderPage(pdfCurrentPage);
  }

  // Save order
  async function saveOrder() {
    if (!o) return;
    saving = true;
    error = '';

    try {
      await updateOrder(o.id, {
        title: o.title,
        client: o.client,
        due: o.due,
        loadingDate: o.loadingDate,
        isRD: o.isRD,
        rdNotes: o.rdNotes,
        profiles: profiles.map(p => ({
          id: p.id,
          quantity: p.quantity,
          configuration: p.configuration
        }))
      });
      announceToast({ message: 'Order saved', type: 'success' });
    } catch (err: any) {
      error = err.message || 'Failed to save';
      announceToast({ message: error, type: 'error' });
    } finally {
      saving = false;
    }
  }

  // Badge management
  async function updateBadges(badges: Badge[]) {
    if (!o) return;
    await setOrderBadges(o.id, badges);
    o.badges = badges;
  }

  // Loading date
  async function setLoading(date: string) {
    if (!o) return;
    await setLoadingDate(o.id, date);
    o.loadingDate = date;
    showPicker = false;
    announceToast({ message: 'Loading date updated', type: 'success' });
  }

  // Profile management
  function addProfile() {
    const newId = `profile-${Date.now()}`;
    profiles = [...profiles, {
      id: newId,
      quantity: 1,
      configuration: getDefaultProfileConfig(),
      collapsed: false
    }];
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

  // Stage helpers
  $: activeStages = o ? Object.entries(o.stages)
    .filter(([_, state]) => state === 'IN_PROGRESS')
    .map(([station]) => station) : [];

  $: completedStages = o ? Object.entries(o.stages)
    .filter(([_, state]) => state === 'COMPLETED')
    .map(([station]) => station) : [];

  // Admin access check
  $: isSuperAdmin = $currentUser?.roles?.Admin === 'SuperAdmin';
  $: isAdmin = $currentUser?.primarySection === 'Admin' || isSuperAdmin;

  // Draft order approval
  async function approveDraftOrder() {
    if (!o || !o.isDraft) return;
    approving = true;
    error = '';
    
    try {
      const res = await fetch(`${base}/api/draft-orders/${o.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (res.ok) {
        o.isDraft = false;
        o.badges = o.badges.filter(b => b !== 'DRAFT');
        o.badges.push('OPEN');
        announceToast({ message: 'Order approved and moved to production', type: 'success' });
      } else {
        const data = await res.json();
        error = data.message || 'Failed to approve order';
        announceToast({ message: error, type: 'error' });
      }
    } catch (err: any) {
      error = err.message || 'Failed to approve order';
      announceToast({ message: error, type: 'error' });
    } finally {
      approving = false;
    }
  }

  async function rejectDraftOrder() {
    if (!o || !o.isDraft || !rejectReason.trim()) return;
    rejecting = true;
    error = '';
    
    try {
      const res = await fetch(`${base}/api/draft-orders/${o.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectReason })
      });
      
      if (res.ok) {
        announceToast({ message: 'Order rejected', type: 'success' });
        showRejectModal = false;
        goto(`${base}/orders`);
      } else {
        const data = await res.json();
        error = data.message || 'Failed to reject order';
        announceToast({ message: error, type: 'error' });
      }
    } catch (err: any) {
      error = err.message || 'Failed to reject order';
      announceToast({ message: error, type: 'error' });
    } finally {
      rejecting = false;
    }
  }
</script>

<svelte:head>
  <script src="https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js"></script>
  <title>{o?.title || 'Order'} - OMS</title>
</svelte:head>

<div class="page-container">
{#if isLoading}
  <div class="loading-container">
    <div class="spinner-large"></div>
    <p>{$t('pdf.loading', { default: 'Loading...' })}</p>
  </div>
{:else if !o}
  <div class="error-container">
    <AlertCircle size={48} />
    <h2>Order not found</h2>
    <a href="{base}/orders" class="btn-secondary">
      <ArrowLeft size={18} />
      Back to Orders
    </a>
  </div>
{:else}
  <!-- Header -->
  <header class="order-header">
    <div class="header-left">
      <button class="btn-ghost" on:click={() => goto(`${base}/orders`)}>
        <ArrowLeft size={18} />
      </button>
      <div class="header-info">
        <h1>{o.id}</h1>
        <span class="client-name">{o.client}</span>
      </div>
      <div class="badges">
        {#each o.badges as badge}
          <span class="badge badge-{badge.toLowerCase()}">{badge}</span>
        {/each}
        {#if o.isRD}
          <span class="badge badge-rd">
            <FlaskConical size={14} />
            R&D
          </span>
        {/if}
      </div>
    </div>
    <div class="header-actions">
      {#if o.isDraft && isAdmin}
        <button class="btn-success" on:click={approveDraftOrder} disabled={approving}>
          {#if approving}
            <span class="spinner"></span>
            Approving...
          {:else}
            <Check size={18} />
            Approve Order
          {/if}
        </button>
        <button class="btn-danger" on:click={() => showRejectModal = true} disabled={rejecting}>
          <XCircle size={18} />
          Reject
        </button>
      {/if}
      <button class="btn-secondary" on:click={() => goto(`${base}/orders`)}>
        {$t('actions.cancel', { default: 'Cancel' })}
      </button>
      <button class="btn-primary" on:click={saveOrder} disabled={saving}>
        {#if saving}
          <span class="spinner"></span>
          {$t('actions.saving', { default: 'Saving...' })}
        {:else}
          <Save size={18} />
          {$t('ui.save', { default: 'Save' })}
        {/if}
      </button>
    </div>
  </header>

  {#if o.isDraft}
    <div class="draft-banner">
      <AlertCircle size={18} />
      <span><strong>Draft Order</strong> - This order is pending approval and not yet in production.</span>
    </div>
  {/if}

  {#if error}
    <div class="error-banner">
      <AlertCircle size={18} />
      {error}
      <button class="close-btn" on:click={() => error = ''}>
        <X size={16} />
      </button>
    </div>
  {/if}

  {#if $role === 'Admin'}
    <div class="badges-manager">
      <BadgesManager value={o.badges} onChange={updateBadges} />
    </div>
  {/if}

  <!-- Tabs -->
  <div class="tabs-container">
    <Tabs {tabs} bind:active={tab} />
  </div>

  <!-- Overview Tab -->
  <section id="overview" class="tab-content" class:hidden={tab !== 'overview'}>
    <!-- Top Row: Order Details + Delivery Address -->
    <div class="top-row">
      <!-- Order Details Card -->
      <section class="card details-card">
        <h2>
          <FileText size={20} />
          {$t('orderform.order_details', { default: 'Order Details' })}
        </h2>
        <div class="form-row">
          <div class="form-group">
            <label for="poNumber">PO Number</label>
            <input type="text" id="poNumber" value={o.id} readonly class="readonly" />
          </div>
          <div class="form-group">
            <label for="priority">Priority</label>
            <select id="priority" bind:value={o.priority}>
              <option value="LOW">Low</option>
              <option value="NORMAL">Normal</option>
              <option value="HIGH">High</option>
              <option value="URGENT">Urgent</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label for="clientName">Client Name</label>
          <input type="text" id="clientName" bind:value={o.client} />
        </div>
        <div class="form-group">
          <label for="title">Project Title</label>
          <input type="text" id="title" bind:value={o.title} />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="deadline">
              <Calendar size={14} />
              Due Date
            </label>
            <input type="date" id="deadline" bind:value={o.due} />
          </div>
          <div class="form-group">
            <label for="loadingDate">
              <Calendar size={14} />
              Loading Date
            </label>
            <div class="loading-date-row">
              <input type="text" value={o.loadingDate || 'Not assigned'} readonly class="readonly" />
              <button class="btn-ghost" on:click={() => showPicker = true}>
                Change
              </button>
            </div>
          </div>
        </div>
        <div class="form-group">
          <label class="checkbox-label">
            <input type="checkbox" bind:checked={o.isRD} />
            <FlaskConical size={16} />
            R&D Project (may repeat stages)
          </label>
        </div>
        {#if o.isRD}
          <div class="form-group">
            <label for="rdNotes">R&D Notes</label>
            <textarea id="rdNotes" bind:value={o.rdNotes} rows="2"></textarea>
          </div>
        {/if}
      </section>

      <!-- Delivery Address Card -->
      <section class="card delivery-card">
        <h2>
          <MapPin size={20} />
          Delivery Address
        </h2>
        {#if deliveryPresets.length > 0}
          <div class="preset-selector">
            <button 
              class="preset-dropdown-trigger"
              class:active={showPresetDropdown}
              on:click={() => showPresetDropdown = !showPresetDropdown}
            >
              Select from saved addresses...
              <ChevronDown size={16} />
            </button>
          </div>
        {/if}
        <div class="form-group">
          <label for="deliveryAddress">Address</label>
          <textarea id="deliveryAddress" bind:value={o.deliveryAddress} rows="3" placeholder="Delivery address..."></textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="deliveryContact">Contact Person</label>
            <input type="text" id="deliveryContact" bind:value={o.deliveryContact} />
          </div>
          <div class="form-group">
            <label for="deliveryPhone">Phone</label>
            <input type="tel" id="deliveryPhone" bind:value={o.deliveryPhone} />
          </div>
        </div>
      </section>
    </div>

    <!-- File Upload & Preview Card -->
    <section class="card files-card full-width">
      <h2>
        <FolderOpen size={20} />
        Files & Preview
      </h2>
      <div class="files-layout">
        <!-- File List -->
        <div class="file-list">
          <OrderFiles orderId={o.id} compact={true} />
        </div>
        
        <!-- PDF Preview -->
        <div class="pdf-preview">
          {#if o.file?.path}
            <div class="pdf-toolbar">
              <div class="page-nav">
                <button on:click={prevPage} disabled={pdfCurrentPage <= 1}>
                  <ChevronLeft size={18} />
                </button>
                <span>{pdfCurrentPage} / {pdfTotalPages}</span>
                <button on:click={nextPage} disabled={pdfCurrentPage >= pdfTotalPages}>
                  <ChevronRight size={18} />
                </button>
              </div>
              <div class="zoom-controls">
                <button on:click={zoomOut}><ZoomOut size={18} /></button>
                <span>{Math.round(previewZoom * 100)}%</span>
                <button on:click={zoomIn}><ZoomIn size={18} /></button>
              </div>
            </div>
            <div class="canvas-container">
              <canvas bind:this={pdfCanvas}></canvas>
            </div>
          {:else}
            <div class="no-preview">
              <Eye size={48} />
              <p>No PDF preview available</p>
            </div>
          {/if}
        </div>
      </div>
    </section>

    <!-- Profile Configuration -->
    <section class="card profiles-card full-width">
      <div class="profiles-header">
        <h2>
          <Boxes size={20} />
          Profile Configuration
        </h2>
        <button class="btn-secondary" on:click={addProfile}>
          <Plus size={18} />
          Add Profile
        </button>
      </div>
      
      {#each profiles as profile, idx (profile.id)}
        <div class="profile-item" class:collapsed={profile.collapsed}>
          <div 
            class="profile-header" 
            on:click={() => toggleProfileCollapse(profile.id)}
            on:keydown={(e) => e.key === 'Enter' && toggleProfileCollapse(profile.id)}
            role="button"
            tabindex="0"
          >
            <div class="profile-title">
              <span class="chevron" class:rotated={profile.collapsed}><ChevronDown size={18} /></span>
              <span>Profile {idx + 1}: {profile.configuration?.profileName || 'Unnamed'}</span>
              <span class="quantity-badge">×{profile.quantity}</span>
            </div>
            <div class="profile-actions">
              {#if profiles.length > 1}
                <button class="btn-ghost danger" on:click|stopPropagation={() => removeProfile(profile.id)}>
                  <Trash2 size={16} />
                </button>
              {/if}
            </div>
          </div>
          
          {#if !profile.collapsed}
            <div class="profile-content">
              {#if profile.configuration}
                <Profile7stVisual bind:configuration={profile.configuration} />
              {:else}
                <p class="text-muted">No profile configuration available</p>
              {/if}
              <div class="quantity-row">
                <label>
                  Quantity:
                  <input type="number" bind:value={profile.quantity} min="1" />
                </label>
              </div>
            </div>
          {/if}
        </div>
      {/each}
    </section>
  </section>

  <!-- Production Tab -->
  <section id="production" class="tab-content" class:hidden={tab !== 'production'}>
    <div class="production-grid">
      <!-- Station Status -->
      <section class="card">
        <h3>
          <Activity size={18} />
          Station Status
        </h3>
        <div class="stages-grid">
          {#each STATIONS as station}
            {@const state = o.stages[station]}
            <div class="stage-item" data-state={state}>
              <span class="stage-name">{station}</span>
              <span class="stage-state">{state || 'NOT_STARTED'}</span>
            </div>
          {/each}
        </div>
      </section>

      <!-- Rework Section (Admin only) -->
      {#if $role === 'Admin'}
        <section class="card">
          <ReworkQuick onSend={() => {}} />
        </section>
      {/if}
    </div>
  </section>

  <!-- Files Tab -->
  <section id="files" class="tab-content" class:hidden={tab !== 'files'}>
    <OrderFiles orderId={o.id} />
  </section>

  <!-- Chat Tab -->
  <section id="chat" class="tab-content" class:hidden={tab !== 'chat'}>
    <OrderChat orderId={o.id} />
  </section>

  <!-- Logs Tab -->
  <section id="logs" class="tab-content" class:hidden={tab !== 'logs'}>
    <StationLogTimeline logs={o.branches?.find(b => b.name === o.defaultBranch)?.commits || []} />
  </section>

  <!-- Loading Date Picker Modal -->
  {#if showPicker}
    <div 
      class="modal-backdrop" 
      on:click={() => showPicker = false}
      on:keydown={(e) => e.key === 'Escape' && (showPicker = false)}
      role="button"
      tabindex="-1"
    >
      <div class="modal" on:click|stopPropagation on:keydown|stopPropagation role="dialog" aria-modal="true">
        <header>
          <h3>Select Loading Date</h3>
          <button on:click={() => showPicker = false}><X size={20} /></button>
        </header>
        <LoadingPicker
          po={o.id}
          onPick={(d) => setLoading(d)}
        />
      </div>
    </div>
  {/if}

  <!-- Reject Order Modal -->
  {#if showRejectModal}
    <div 
      class="modal-backdrop" 
      on:click={() => showRejectModal = false}
      on:keydown={(e) => e.key === 'Escape' && (showRejectModal = false)}
      role="button"
      tabindex="-1"
    >
      <div class="modal reject-modal" on:click|stopPropagation on:keydown|stopPropagation role="dialog" aria-modal="true">
        <header>
          <h3>Reject Draft Order</h3>
          <button on:click={() => showRejectModal = false}><X size={20} /></button>
        </header>
        <div class="modal-body">
          <p>Please provide a reason for rejecting order <strong>{o.id}</strong>:</p>
          <textarea
            bind:value={rejectReason}
            placeholder="Enter rejection reason..."
            rows="4"
          ></textarea>
        </div>
        <div class="modal-actions">
          <button class="btn-secondary" on:click={() => showRejectModal = false}>Cancel</button>
          <button 
            class="btn-danger" 
            on:click={rejectDraftOrder} 
            disabled={rejecting || !rejectReason.trim()}
          >
            {#if rejecting}
              <span class="spinner"></span>
              Rejecting...
            {:else}
              <XCircle size={18} />
              Reject Order
            {/if}
          </button>
        </div>
      </div>
    </div>
  {/if}
{/if}
</div>

<style>
  /* Page Container */
  .page-container {
    max-width: 1400px;
    margin: 0 auto;
    padding: 20px;
  }
  
  /* Loading & Error States */
  .loading-container, .error-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 400px;
    gap: 16px;
    color: var(--text-muted);
  }
  .spinner-large {
    width: 48px;
    height: 48px;
    border: 3px solid var(--border);
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* Header */
  .order-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 0;
    border-bottom: 1px solid var(--border);
    margin-bottom: 16px;
  }
  .header-left {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .header-info h1 {
    margin: 0;
    font-size: 1.5rem;
  }
  .client-name {
    color: var(--text-muted);
    font-size: 0.9rem;
  }
  .badges {
    display: flex;
    gap: 8px;
  }
  .badge {
    padding: 4px 10px;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .badge-open { background: var(--info-bg); color: var(--info); }
  .badge-in_progress { background: var(--warning-bg); color: var(--warning); }
  .badge-completed { background: var(--success-bg); color: var(--success); }
  .badge-rd { background: var(--accent-bg); color: var(--accent); }
  
  .header-actions {
    display: flex;
    gap: 12px;
  }

  /* Error banner */
  .error-banner {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    background: var(--danger-bg);
    color: var(--danger);
    border-radius: 8px;
    margin-bottom: 16px;
  }
  .close-btn {
    margin-left: auto;
    background: none;
    border: none;
    cursor: pointer;
    color: inherit;
  }

  .badges-manager {
    margin-bottom: 16px;
  }

  .tabs-container {
    margin-bottom: 16px;
  }

  .tab-content {
    animation: fadeIn 0.2s ease;
  }
  .tab-content.hidden {
    display: none;
  }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

  /* Top Row Layout */
  .top-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-bottom: 16px;
  }
  @media (max-width: 900px) {
    .top-row { grid-template-columns: 1fr; }
  }

  /* Cards */
  .card {
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 20px;
  }
  .card.full-width {
    grid-column: 1 / -1;
    margin-bottom: 16px;
  }
  .card h2 {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0 0 16px 0;
    font-size: 1.1rem;
    color: var(--text);
  }
  .card h3 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 12px 0;
    font-size: 1rem;
  }

  /* Form Elements */
  .form-group {
    margin-bottom: 12px;
  }
  .form-group label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.85rem;
    color: var(--text-muted);
    margin-bottom: 6px;
  }
  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  input, select, textarea {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg-2);
    color: var(--text);
    font-size: 0.95rem;
  }
  input:focus, select:focus, textarea:focus {
    outline: none;
    border-color: var(--primary);
  }
  input.readonly {
    background: var(--bg-3);
    color: var(--text-muted);
  }
  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font-size: 0.95rem !important;
    color: var(--text) !important;
  }
  .checkbox-label input {
    width: auto;
  }
  .loading-date-row {
    display: flex;
    gap: 8px;
  }
  .loading-date-row input {
    flex: 1;
  }

  /* Files Card */
  .files-card {
    margin-bottom: 16px;
  }
  .files-layout {
    display: grid;
    grid-template-columns: 300px 1fr;
    gap: 16px;
    min-height: 400px;
  }
  @media (max-width: 900px) {
    .files-layout { grid-template-columns: 1fr; }
  }
  .file-list {
    border-right: 1px solid var(--border);
    padding-right: 16px;
  }
  .pdf-preview {
    display: flex;
    flex-direction: column;
  }
  .pdf-toolbar {
    display: flex;
    justify-content: space-between;
    padding: 8px;
    background: var(--bg-2);
    border-radius: 8px;
    margin-bottom: 12px;
  }
  .page-nav, .zoom-controls {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .page-nav button, .zoom-controls button {
    padding: 6px;
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: 6px;
    cursor: pointer;
    display: flex;
    align-items: center;
  }
  .page-nav button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .canvas-container {
    flex: 1;
    overflow: auto;
    background: var(--bg-2);
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }
  .canvas-container canvas {
    max-width: 100%;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  }
  .no-preview {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--text-muted);
    gap: 12px;
  }

  /* Profiles Card */
  .profiles-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }
  .profiles-header h2 {
    margin: 0;
  }
  .profile-item {
    border: 1px solid var(--border);
    border-radius: 10px;
    margin-bottom: 12px;
    overflow: hidden;
  }
  .profile-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    background: var(--bg-2);
    cursor: pointer;
  }
  .profile-header:hover {
    background: var(--bg-3);
  }
  .profile-title {
    display: flex;
    align-items: center;
    gap: 10px;
    font-weight: 500;
  }
  .chevron {
    display: flex;
    transition: transform 0.2s ease;
  }
  .chevron.rotated {
    transform: rotate(-90deg);
  }
  .quantity-badge {
    background: var(--primary);
    color: white;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 0.8rem;
  }
  .profile-content {
    padding: 16px;
    border-top: 1px solid var(--border);
  }
  .quantity-row {
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--border);
  }
  .quantity-row label {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .quantity-row input {
    width: 80px;
  }

  /* Production Tab */
  .production-grid {
    display: grid;
    gap: 16px;
  }
  .stages-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 10px;
  }
  .stage-item {
    padding: 12px;
    border-radius: 8px;
    background: var(--bg-2);
    text-align: center;
  }
  .stage-item[data-state="COMPLETED"] {
    background: var(--success-bg);
    border: 1px solid var(--success);
  }
  .stage-item[data-state="IN_PROGRESS"] {
    background: var(--warning-bg);
    border: 1px solid var(--warning);
  }
  .stage-name {
    display: block;
    font-weight: 600;
    font-size: 0.85rem;
  }
  .stage-state {
    display: block;
    font-size: 0.75rem;
    color: var(--text-muted);
    margin-top: 4px;
  }

  /* Modal */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }
  .modal {
    background: var(--bg-1);
    border-radius: 12px;
    padding: 20px;
    min-width: 400px;
    max-width: 90vw;
    max-height: 90vh;
    overflow: auto;
  }
  .modal header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }
  .modal header h3 {
    margin: 0;
  }
  .modal header button {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-muted);
  }

  /* Buttons */
  .btn-primary {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    background: var(--primary);
    color: white;
    border: none;
    border-radius: 8px;
    font-weight: 500;
    cursor: pointer;
  }
  .btn-primary:hover { filter: brightness(1.1); }
  .btn-primary:disabled { opacity: 0.7; cursor: not-allowed; }
  
  .btn-secondary {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    background: var(--bg-2);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 8px;
    font-weight: 500;
    cursor: pointer;
  }
  .btn-secondary:hover { background: var(--bg-3); }
  
  .btn-ghost {
    background: none;
    border: none;
    padding: 8px;
    cursor: pointer;
    color: var(--text-muted);
    border-radius: 6px;
  }
  .btn-ghost:hover { background: var(--bg-2); }
  .btn-ghost.danger:hover { color: var(--danger); }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  /* Preset dropdown */
  .preset-selector {
    margin-bottom: 12px;
  }
  .preset-dropdown-trigger {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 12px;
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 8px;
    cursor: pointer;
    color: var(--text-muted);
  }

  /* Draft Order Styles */
  .draft-banner {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    background: var(--warning-bg, #fef3c7);
    color: var(--warning, #d97706);
    border: 1px solid var(--warning, #f59e0b);
    border-radius: 8px;
    margin-bottom: 16px;
    font-size: 0.9rem;
  }

  .btn-success {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    background: var(--success, #22c55e);
    color: white;
    border: none;
    border-radius: 8px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }
  .btn-success:hover { filter: brightness(1.1); }
  .btn-success:disabled { opacity: 0.7; cursor: not-allowed; }

  .btn-danger {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    background: var(--danger, #ef4444);
    color: white;
    border: none;
    border-radius: 8px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }
  .btn-danger:hover { filter: brightness(1.1); }
  .btn-danger:disabled { opacity: 0.7; cursor: not-allowed; }

  /* Reject Modal */
  .reject-modal {
    max-width: 500px;
  }
  .modal-body {
    padding: 20px;
  }
  .modal-body p {
    margin: 0 0 12px 0;
    color: var(--text);
  }
  .modal-body textarea {
    width: 100%;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    font-size: 0.95rem;
    resize: vertical;
    min-height: 100px;
  }
  .modal-body textarea:focus {
    outline: none;
    border-color: var(--primary);
  }
  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    padding: 16px 20px;
    border-top: 1px solid var(--border);
    background: var(--bg-2);
  }
</style>
