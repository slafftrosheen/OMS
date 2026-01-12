<script lang="ts">
  export let params = {};
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { t } from 'svelte-i18n';
  import { Save, ArrowLeft, AlertCircle, Plus, Trash2, Upload, FileText, Eye, Calendar, User, CheckCircle, XCircle, Clock } from 'lucide-svelte';
  import Profile7stVisual from '$lib/profiles/components/Profile7stVisual.svelte';
  import { createId } from '$lib/utils/id';
  import { currentUser } from '$lib/auth/user-store';

  export let data;

  let loading = true;
  let saving = false;
  let error = '';
  let successMessage = '';
  
  // Order Details
  let orderId: number;
  let clientName = '';
  let poNumber = '';
  let deadline = '';
  let loadingDate = '';
  let notes = '';
  let priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT' = 'NORMAL';
  let status: string = 'draft';
  
  // Delivery Address
  let deliveryAddress = '';
  let deliveryContact = '';
  let deliveryPhone = '';
  
  // Files
  interface OrderFile {
    id: number;
    filename: string;
    originalName: string;
    fileType: string;
    uploadedAt: string;
  }
  let existingFiles: OrderFile[] = [];
  let newFiles: File[] = [];
  
  // Profiles
  type ProfileItem = {
    id: string;
    dbId?: number;
    quantity: number;
    configuration: any;
    collapsed: boolean;
  };

  let profiles: ProfileItem[] = [];

  // Check permissions
  $: isAdmin = $currentUser?.roles?.Admin === 'SuperAdmin' || $currentUser?.primarySection === 'Admin';
  $: canEdit = isAdmin;
  $: canApprove = isAdmin && status === 'draft';
  $: canReject = isAdmin && status === 'draft';

  onMount(async () => {
    await loadOrder();
  });

  async function loadOrder() {
    loading = true;
    error = '';
    
    try {
      const response = await fetch(`/api/draft-orders/${data.id}`);
      if (!response.ok) {
        throw new Error('Order not found');
      }
      
      const order = await response.json();
      
      orderId = order.id;
      clientName = order.clientName || order.client || '';
      poNumber = order.poNumber || order.po_number || '';
      deadline = order.deadline ? order.deadline.split('T')[0] : '';
      loadingDate = order.loadingDate ? order.loadingDate.split('T')[0] : '';
      notes = order.notes || '';
      priority = order.priority || 'NORMAL';
      status = order.status || 'draft';
      deliveryAddress = order.deliveryAddress || '';
      deliveryContact = order.deliveryContact || '';
      deliveryPhone = order.deliveryPhone || '';
      
      // Load profiles
      if (order.profiles && Array.isArray(order.profiles)) {
        profiles = order.profiles.map((p: any) => ({
          id: createId(),
          dbId: p.id,
          quantity: p.quantity || 1,
          configuration: p.configuration || {},
          collapsed: true
        }));
      }
      
      if (profiles.length === 0) {
        profiles = [{
          id: createId(),
          quantity: 1,
          configuration: getDefaultConfiguration(),
          collapsed: false
        }];
      }
      
      // Load files
      if (order.files && Array.isArray(order.files)) {
        existingFiles = order.files;
      }
      
    } catch (err: any) {
      error = err.message || 'Failed to load order';
    } finally {
      loading = false;
    }
  }

  function getDefaultConfiguration() {
    return {
      profileName: 'Profile',
      signType: 'EXTERIOR' as 'INTERIOR' | 'EXTERIOR',
      CNC_FREZER: { face: 'OPAL', back: 'ALU 1.5' },
      BENDER: { sides: 'ALU 1.2', depth: 140 },
      FRONT: { opal: true, oracalCodes: [] },
      PAINTING: { 
        sides: false, sidesColor: { system: '', code: '', hex: '' },
        back: false, backColor: { system: '', code: '', hex: '' },
        frame: false, frameColor: { system: '', code: '', hex: '' }
      },
      ASSEMBLING: { 
        led: false, ledType: '', ledTemp: '',
        trafo: false, trafoType: 'REGULAR', trafoMounting: 'SEPARATE',
        cables: false, cablesLength: '',
        frame: false, frameWaterholes: false, frameMountingHoles: false
      },
      DELIVERY: { date: deadline, carrier: '', address: '' }
    };
  }

  function addProfile() {
    profiles = [...profiles, {
      id: createId(),
      quantity: 1,
      configuration: getDefaultConfiguration(),
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

  async function handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      newFiles = [...newFiles, ...Array.from(input.files)];
    }
    input.value = '';
  }

  function removeNewFile(index: number) {
    newFiles = newFiles.filter((_, i) => i !== index);
  }

  async function saveOrder() {
    if (!clientName.trim()) {
      error = 'Client Name is required';
      return;
    }

    saving = true;
    error = '';
    successMessage = '';

    try {
      // Upload new files first
      const fileIds: number[] = [];
      for (const file of newFiles) {
        const formData = new FormData();
        formData.append('file', file);
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

      // Update order
      const orderData = {
        clientName,
        poNumber,
        deadline,
        loadingDate: loadingDate || null,
        notes,
        priority,
        status,
        deliveryAddress,
        deliveryContact,
        deliveryPhone,
        profiles: profiles.map(p => ({
          id: p.dbId,
          quantity: p.quantity,
          configuration: p.configuration
        })),
        newFileIds: fileIds
      };

      const response = await fetch(`/api/draft-orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData)
      });

      if (response.ok) {
        successMessage = 'Order updated successfully!';
        newFiles = [];
        await loadOrder(); // Reload to get updated data
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

  async function approveOrder() {
    if (!confirm('Approve this order and move it to production queue?')) return;
    
    saving = true;
    try {
      const response = await fetch(`/api/draft-orders/${orderId}/approve`, {
        method: 'POST'
      });
      
      if (response.ok) {
        successMessage = 'Order approved and sent to production!';
        status = 'approved';
        await loadOrder();
      } else {
        const res = await response.json();
        error = res.message || 'Failed to approve order';
      }
    } catch (err) {
      error = 'Failed to approve order';
    } finally {
      saving = false;
    }
  }

  async function rejectOrder() {
    const reason = prompt('Reason for rejection:');
    if (!reason) return;
    
    saving = true;
    try {
      const response = await fetch(`/api/draft-orders/${orderId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      });
      
      if (response.ok) {
        successMessage = 'Order rejected and returned to SuperAdmin';
        status = 'rejected';
        await loadOrder();
      } else {
        const res = await response.json();
        error = res.message || 'Failed to reject order';
      }
    } catch (err) {
      error = 'Failed to reject order';
    } finally {
      saving = false;
    }
  }

  function getStatusColor(s: string): string {
    switch (s) {
      case 'draft': return 'status-draft';
      case 'pending': return 'status-pending';
      case 'approved': return 'status-approved';
      case 'rejected': return 'status-rejected';
      case 'in_production': return 'status-production';
      case 'completed': return 'status-completed';
      default: return '';
    }
  }

  function getStatusIcon(s: string) {
    switch (s) {
      case 'draft': return FileText;
      case 'approved': return CheckCircle;
      case 'rejected': return XCircle;
      case 'in_production': return Clock;
      default: return FileText;
    }
  }
</script>

<svelte:head>
  <title>Edit Order {poNumber} | OMS</title>
</svelte:head>

<div class="edit-order-page">
  <!-- Header -->
  <header class="page-header">
    <div class="header-left">
      <a href="{base}/orders" class="back-link">
        <ArrowLeft size={20} />
        Back to Orders
      </a>
      <div class="title-row">
        <h1>Edit Order</h1>
        <span class="po-number">{poNumber}</span>
        <span class="status-badge {getStatusColor(status)}">
          <svelte:component this={getStatusIcon(status)} size={14} />
          {status.toUpperCase().replace('_', ' ')}
        </span>
      </div>
    </div>
    <div class="header-actions">
      {#if canReject}
        <button class="btn btn-danger" on:click={rejectOrder} disabled={saving}>
          <XCircle size={18} />
          Reject
        </button>
      {/if}
      {#if canApprove}
        <button class="btn btn-success" on:click={approveOrder} disabled={saving}>
          <CheckCircle size={18} />
          Approve
        </button>
      {/if}
      {#if canEdit}
        <button class="btn btn-primary" on:click={saveOrder} disabled={saving}>
          <Save size={18} />
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      {/if}
    </div>
  </header>

  {#if loading}
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Loading order...</p>
    </div>
  {:else if error && !clientName}
    <div class="error-state">
      <AlertCircle size={48} />
      <h2>Error Loading Order</h2>
      <p>{error}</p>
      <a href="{base}/orders" class="btn btn-secondary">Back to Orders</a>
    </div>
  {:else}
    {#if error}
      <div class="alert alert-error">
        <AlertCircle size={18} />
        {error}
      </div>
    {/if}
    
    {#if successMessage}
      <div class="alert alert-success">
        <CheckCircle size={18} />
        {successMessage}
      </div>
    {/if}

    <div class="edit-form">
      <!-- Order Details Section -->
      <section class="form-section">
        <h2>Order Details</h2>
        <div class="form-grid">
          <div class="form-group">
            <label for="clientName">Client Name *</label>
            <input 
              type="text" 
              id="clientName" 
              bind:value={clientName} 
              placeholder="Enter client name"
              disabled={!canEdit}
            />
          </div>
          
          <div class="form-group">
            <label for="poNumber">PO Number</label>
            <input 
              type="text" 
              id="poNumber" 
              bind:value={poNumber} 
              placeholder="PO-YYYY-XXX"
              disabled
            />
          </div>
          
          <div class="form-group">
            <label for="priority">Priority</label>
            <select id="priority" bind:value={priority} disabled={!canEdit}>
              <option value="LOW">Low</option>
              <option value="NORMAL">Normal</option>
              <option value="HIGH">High</option>
              <option value="URGENT">Urgent</option>
            </select>
          </div>
          
          <div class="form-group">
            <label for="deadline">Deadline</label>
            <input 
              type="date" 
              id="deadline" 
              bind:value={deadline}
              disabled={!canEdit}
            />
          </div>
          
          <div class="form-group">
            <label for="loadingDate">Loading Date</label>
            <input 
              type="date" 
              id="loadingDate" 
              bind:value={loadingDate}
              disabled={!canEdit}
            />
          </div>
          
          <div class="form-group full-width">
            <label for="notes">Notes</label>
            <textarea 
              id="notes" 
              bind:value={notes} 
              rows="3"
              placeholder="Additional notes for this order..."
              disabled={!canEdit}
            ></textarea>
          </div>
        </div>
      </section>

      <!-- Delivery Section -->
      <section class="form-section">
        <h2>Delivery Information</h2>
        <div class="form-grid">
          <div class="form-group full-width">
            <label for="deliveryAddress">Delivery Address</label>
            <textarea 
              id="deliveryAddress" 
              bind:value={deliveryAddress} 
              rows="3"
              placeholder="Full delivery address..."
              disabled={!canEdit}
            ></textarea>
          </div>
          
          <div class="form-group">
            <label for="deliveryContact">Contact Person</label>
            <input 
              type="text" 
              id="deliveryContact" 
              bind:value={deliveryContact}
              placeholder="Contact name"
              disabled={!canEdit}
            />
          </div>
          
          <div class="form-group">
            <label for="deliveryPhone">Contact Phone</label>
            <input 
              type="tel" 
              id="deliveryPhone" 
              bind:value={deliveryPhone}
              placeholder="+371 XXXXXXXX"
              disabled={!canEdit}
            />
          </div>
        </div>
      </section>

      <!-- Files Section -->
      <section class="form-section">
        <h2>Files & Sketches</h2>
        
        {#if existingFiles.length > 0}
          <div class="existing-files">
            <h3>Existing Files</h3>
            <ul class="file-list">
              {#each existingFiles as file}
                <li class="file-item">
                  <FileText size={18} />
                  <span class="file-name">{file.originalName || file.filename}</span>
                  <a href="/uploads/{file.filename}" target="_blank" class="file-view">
                    <Eye size={16} />
                    View
                  </a>
                </li>
              {/each}
            </ul>
          </div>
        {/if}
        
        {#if canEdit}
          <div class="upload-section">
            <h3>Upload New Files</h3>
            <label class="file-upload-zone">
              <input 
                type="file" 
                accept=".pdf,.cdr,.ai,.eps,.jpg,.jpeg,.png,.svg"
                multiple
                on:change={handleFileSelect}
              />
              <Upload size={24} />
              <span>Click or drag files here</span>
              <span class="file-types">PDF, CDR, AI, EPS, JPG, PNG, SVG</span>
            </label>
            
            {#if newFiles.length > 0}
              <ul class="new-files-list">
                {#each newFiles as file, i}
                  <li class="file-item">
                    <FileText size={18} />
                    <span class="file-name">{file.name}</span>
                    <button class="remove-file" on:click={() => removeNewFile(i)}>
                      <Trash2 size={16} />
                    </button>
                  </li>
                {/each}
              </ul>
            {/if}
          </div>
        {/if}
      </section>

      <!-- Profiles Section -->
      <section class="form-section profiles-section">
        <div class="section-header">
          <h2>Order Profiles ({profiles.length})</h2>
          {#if canEdit}
            <button class="btn btn-secondary" on:click={addProfile}>
              <Plus size={18} />
              Add Profile
            </button>
          {/if}
        </div>
        
        <div class="profiles-list">
          {#each profiles as profile, index (profile.id)}
            <div class="profile-card" class:collapsed={profile.collapsed}>
              <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
              <div class="profile-header" on:click={() => toggleProfileCollapse(profile.id)}>
                <div class="profile-title">
                  <span class="profile-index">#{index + 1}</span>
                  <span class="profile-name">{profile.configuration?.profileName || 'Untitled Profile'}</span>
                  <span class="profile-qty">Qty: {profile.quantity}</span>
                </div>
                <div class="profile-actions">
                  {#if canEdit && profiles.length > 1}
                    <button 
                      class="action-btn danger" 
                      on:click|stopPropagation={() => removeProfile(profile.id)}
                      title="Remove profile"
                    >
                      <Trash2 size={16} />
                    </button>
                  {/if}
                  <span class="collapse-icon">{profile.collapsed ? '▶' : '▼'}</span>
                </div>
              </div>
              
              {#if !profile.collapsed}
                <div class="profile-content">
                  <div class="quantity-row">
                    <label>
                      Quantity:
                      <input 
                        type="number" 
                        min="1" 
                        bind:value={profile.quantity}
                        disabled={!canEdit}
                      />
                    </label>
                  </div>
                  
                  <Profile7stVisual 
                    bind:config={profile.configuration}
                    readonly={!canEdit}
                  />
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </section>
    </div>
  {/if}
</div>

<style>
  .edit-order-page {
    max-width: 1200px;
    margin: 0 auto;
    padding: var(--space-lg);
  }

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: var(--space-xl);
    gap: var(--space-lg);
    flex-wrap: wrap;
  }

  .header-left {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .back-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--text-muted);
    text-decoration: none;
    font-size: 0.9rem;
  }

  .back-link:hover {
    color: var(--text);
  }

  .title-row {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    flex-wrap: wrap;
  }

  .title-row h1 {
    margin: 0;
    font-size: 1.5rem;
  }

  .po-number {
    font-size: 1rem;
    color: var(--primary);
    font-weight: 600;
  }

  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
  }

  .status-draft { background: #fef3c7; color: #92400e; }
  .status-pending { background: #dbeafe; color: #1e40af; }
  .status-approved { background: #d1fae5; color: #065f46; }
  .status-rejected { background: #fee2e2; color: #991b1b; }
  .status-production { background: #e0e7ff; color: #3730a3; }
  .status-completed { background: #d1fae5; color: #065f46; }

  .header-actions {
    display: flex;
    gap: var(--space-sm);
  }

  .btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 10px 16px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    border: 1px solid transparent;
  }

  .btn-primary {
    background: linear-gradient(135deg, #3b82f6, #2563eb);
    color: white;
  }

  .btn-secondary {
    background: var(--bg-2);
    color: var(--text);
    border-color: var(--border);
  }

  .btn-success {
    background: linear-gradient(135deg, #10b981, #059669);
    color: white;
  }

  .btn-danger {
    background: linear-gradient(135deg, #ef4444, #dc2626);
    color: white;
  }

  .btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* Loading & Error States */
  .loading-state, .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 400px;
    gap: var(--space-md);
    color: var(--text-muted);
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid var(--border);
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Alerts */
  .alert {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-md);
    border-radius: 8px;
    margin-bottom: var(--space-lg);
    font-weight: 500;
  }

  .alert-error {
    background: #fee2e2;
    color: #991b1b;
    border: 1px solid #fecaca;
  }

  .alert-success {
    background: #d1fae5;
    color: #065f46;
    border: 1px solid #a7f3d0;
  }

  /* Form Sections */
  .form-section {
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: var(--space-lg);
    margin-bottom: var(--space-lg);
  }

  .form-section h2 {
    margin: 0 0 var(--space-lg) 0;
    font-size: 1.1rem;
    color: var(--text);
    padding-bottom: var(--space-sm);
    border-bottom: 1px solid var(--border);
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-lg);
    padding-bottom: var(--space-sm);
    border-bottom: 1px solid var(--border);
  }

  .section-header h2 {
    margin: 0;
    border-bottom: none;
    padding-bottom: 0;
  }

  .form-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: var(--space-md);
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .form-group.full-width {
    grid-column: 1 / -1;
  }

  .form-group label {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-muted);
  }

  .form-group input,
  .form-group select,
  .form-group textarea {
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg-0);
    font-size: 0.9rem;
    color: var(--text);
  }

  .form-group input:focus,
  .form-group select:focus,
  .form-group textarea:focus {
    outline: none;
    border-color: var(--primary);
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  .form-group input:disabled,
  .form-group select:disabled,
  .form-group textarea:disabled {
    background: var(--bg-2);
    cursor: not-allowed;
  }

  /* Files */
  .existing-files, .upload-section {
    margin-bottom: var(--space-lg);
  }

  .existing-files h3, .upload-section h3 {
    font-size: 0.9rem;
    margin: 0 0 var(--space-sm) 0;
    color: var(--text-muted);
  }

  .file-list, .new-files-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .file-item {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm);
    background: var(--bg-2);
    border-radius: 6px;
  }

  .file-name {
    flex: 1;
    font-size: 0.9rem;
  }

  .file-view {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--primary);
    font-size: 0.85rem;
  }

  .remove-file {
    background: none;
    border: none;
    color: var(--danger, #dc2626);
    cursor: pointer;
    padding: 4px;
  }

  .file-upload-zone {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-sm);
    padding: var(--space-xl);
    border: 2px dashed var(--border);
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .file-upload-zone:hover {
    border-color: var(--primary);
    background: var(--bg-2);
  }

  .file-upload-zone input {
    display: none;
  }

  .file-types {
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  /* Profiles */
  .profiles-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .profile-card {
    border: 1px solid var(--border);
    border-radius: 10px;
    overflow: hidden;
    background: var(--bg-0);
  }

  .profile-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-md);
    background: var(--bg-2);
    cursor: pointer;
    user-select: none;
  }

  .profile-header:hover {
    background: var(--bg-3, var(--bg-2));
  }

  .profile-title {
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }

  .profile-index {
    font-weight: 700;
    color: var(--primary);
  }

  .profile-name {
    font-weight: 600;
  }

  .profile-qty {
    font-size: 0.85rem;
    color: var(--text-muted);
    padding: 2px 8px;
    background: var(--bg-1);
    border-radius: 4px;
  }

  .profile-actions {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .action-btn {
    background: none;
    border: none;
    padding: 6px;
    border-radius: 6px;
    cursor: pointer;
    color: var(--text-muted);
    transition: all 0.15s ease;
  }

  .action-btn:hover {
    background: var(--bg-1);
  }

  .action-btn.danger:hover {
    color: var(--danger, #dc2626);
    background: #fee2e2;
  }

  .collapse-icon {
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .profile-content {
    padding: var(--space-lg);
    border-top: 1px solid var(--border);
  }

  .quantity-row {
    margin-bottom: var(--space-lg);
  }

  .quantity-row label {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    font-weight: 600;
  }

  .quantity-row input {
    width: 80px;
    padding: 6px 10px;
    border: 1px solid var(--border);
    border-radius: 6px;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .edit-order-page {
      padding: var(--space-md);
    }

    .page-header {
      flex-direction: column;
    }

    .header-actions {
      width: 100%;
      justify-content: flex-end;
    }

    .title-row {
      flex-direction: column;
      align-items: flex-start;
    }
  }
</style>
