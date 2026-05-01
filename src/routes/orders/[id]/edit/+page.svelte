<script lang="ts">
  /**
   * Phase 7: Corel-style canvas layout for Order editing.
   * Left panel = toolbox, top bar = context bar, right docker = management,
   * top-right = primary action buttons (Save Draft / Confirm / Rework).
   * The tldraw canvas fills the centre.
   */
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { t } from 'svelte-i18n';
  import Icon from '$lib/ui/Icon.svelte';
  import { currentUser } from '$lib/auth/authState.svelte';
  import { notifySuccess, notifyError } from '$lib/notify/toast';
  import ChangeRequestList from '$lib/order/ChangeRequestList.svelte';

  let { data } = $props();

  // ── Order state ─────────────────────────────────────────────────────────────
  let orderId: number | null = $state(null);
  let poNumber = $state('');
  let clientName = $state('');
  let title = $state('');
  let deadline = $state('');
  let loadingDate = $state('');
  let notes = $state('');
  let priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT' = $state('NORMAL');
  let status = $state('draft');
  let deliveryAddress = $state('');
  let deliveryContact = $state('');
  let deliveryPhone = $state('');
  let deliveryEmail = $state('');
  let profiles: any[] = $state([]);

  // ── Canvas state ─────────────────────────────────────────────────────────────
  let canvasLoaded = $state(false);
  let canvasSnapshot: any = $state(null);
  let canvasDirty = $state(false);
  let editorRef: any = $state(null);
  let selectedShapeTypes: string[] = $state([]);

  // ── UI state ─────────────────────────────────────────────────────────────────
  let loading = $state(true);
  let saving = $state(false);
  let confirming = $state(false);
  let error = $state('');
  let rightTab: 'layers' | 'changes' | 'chat' = $state('layers');
  let activeTool = $state('select');
  let aiPrompt = $state('');
  let useSelectionCtx = $state(false);
  let aiRunning = $state(false);
  let aiResponse = $state('');

  // ── Permissions ───────────────────────────────────────────────────────────────
  let isAdmin = $derived(
    ($currentUser as any)?.roles?.Admin === 'SuperAdmin' ||
    ($currentUser as any)?.primarySection === 'Admin'
  );
  let canEdit = $derived(isAdmin || status === 'draft');
  let canApprove = $derived(isAdmin && status === 'draft');

  // ── Canvas seed (reactive, passed into TldrawWrapper) ────────────────────────
  let orderSeed = $derived(orderId
    ? {
        orderId: String(orderId),
        title,
        clientName,
        poNumber,
        deadline,
        loadingDate,
        priority,
        notes,
        status,
        deliveryAddress,
        deliveryContact,
        deliveryPhone,
        deliveryEmail: deliveryEmail,
        profiles: profiles.map(p => ({
          name: p.configuration?.profileName,
          quantity: p.quantity,
          configuration: p.configuration,
        })),
      }
    : null
  );

  // ── Load order ────────────────────────────────────────────────────────────────
  onMount(async () => {
    await loadOrder();
    canvasLoaded = true;
  });

  async function loadOrder() {
    loading = true;
    error = '';
    try {
      const response = await fetch(`/api/draft-orders/${data.id}`);
      if (!response.ok) throw new Error('Order not found');
      const order = await response.json();

      orderId = order.id;
      clientName = order.clientName || '';
      poNumber = order.poNumber || '';
      title = order.title || order.clientName || '';
      deadline = order.deadline ? order.deadline.split('T')[0] : '';
      loadingDate = order.loadingDate ? order.loadingDate.split('T')[0] : '';
      notes = order.notes || '';
      priority = order.priority || 'NORMAL';
      status = order.status || 'draft';
      deliveryAddress = order.deliveryAddress || '';
      deliveryContact = order.deliveryContact || '';
      deliveryPhone = order.deliveryPhone || '';
      profiles = order.profiles || [];

      // Load canvas snapshot if exists
      const csRes = await fetch(`/api/draft-orders/${data.id}/canvas-state`);
      if (csRes.ok) {
        const cs = await csRes.json();
        canvasSnapshot = cs.snapshot ?? null;
      }
    } catch (err: any) {
      error = err.message || 'Failed to load order';
    } finally {
      loading = false;
    }
  }

  // ── Canvas callbacks ──────────────────────────────────────────────────────────
  function handleEditorReady(editor: any) {
    editorRef = editor;
    editor.store.listen(() => {
      canvasDirty = true;
    }, { scope: 'document' });
  }

  function handleCanvasSave(snapshot: any) {
    canvasSnapshot = snapshot;
    canvasDirty = true;
  }

  /** Called when a form shape field changes on the canvas — syncs back to Svelte state */
  function handleOrderChange(oid: string, patch: any) {
    if (patch.title !== undefined) title = patch.title;
    if (patch.clientName !== undefined) clientName = patch.clientName;
    if (patch.deadline !== undefined) deadline = patch.deadline;
    if (patch.loadingDate !== undefined) loadingDate = patch.loadingDate;
    if (patch.priority !== undefined) priority = patch.priority;
    if (patch.notes !== undefined) notes = patch.notes;
    if (patch.deliveryAddress !== undefined) deliveryAddress = patch.deliveryAddress;
    if (patch.deliveryContact !== undefined) deliveryContact = patch.deliveryContact;
    if (patch.deliveryPhone !== undefined) deliveryPhone = patch.deliveryPhone;
    canvasDirty = true;
  }

  function handleProfileChange(oid: string, profileIndex: number, profileData: any) {
    profiles = profiles.map((p, i) => i === profileIndex ? { ...p, configuration: profileData } : p);
    canvasDirty = true;
  }

  // ── Save draft ────────────────────────────────────────────────────────────────
  async function saveDraft() {
    if (!clientName.trim()) { notifyError('Client name is required'); return; }
    saving = true;
    try {
      const res = await fetch(`/api/draft-orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName, title, deadline, loadingDate: loadingDate || null,
          notes, priority, status,
          deliveryAddress, deliveryContact, deliveryPhone,
          profiles: profiles.map(p => ({
            id: p.dbId, quantity: p.quantity || 1, configuration: p.configuration || {}
          })),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).message || 'Save failed');

      // Persist canvas state
      if (canvasSnapshot) {
        await fetch(`/api/draft-orders/${data.id}/canvas-state`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ snapshot: canvasSnapshot }),
        });
      }

      canvasDirty = false;
      notifySuccess('Draft saved');
    } catch (err: any) {
      notifyError(err.message || 'Failed to save');
    } finally {
      saving = false;
    }
  }

  // ── Confirm order ─────────────────────────────────────────────────────────────
  async function confirmOrder() {
    if (!confirm('Approve this order and send it to production?')) return;
    confirming = true;
    try {
      // Save first
      await saveDraft();
      const res = await fetch(`/api/draft-orders/${orderId}/approve`, { method: 'POST' });
      if (!res.ok) throw new Error((await res.json()).message || 'Approval failed');
      status = 'approved';
      notifySuccess('Order approved and sent to production');
      goto(`${base}/orders/${data.id}`);
    } catch (err: any) {
      notifyError(err.message || 'Failed to confirm order');
    } finally {
      confirming = false;
    }
  }

  // ── Request rework ────────────────────────────────────────────────────────────
  async function requestRework() {
    const reason = prompt('Reason for rework request:');
    if (!reason) return;
    try {
      const res = await fetch(`/api/draft-orders/${orderId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) throw new Error((await res.json()).message || 'Rework request failed');
      status = 'rejected';
      notifySuccess('Rework requested');
    } catch (err: any) {
      notifyError(err.message || 'Failed to request rework');
    }
  }

  // ── Toolbar tool selection ────────────────────────────────────────────────────
  function selectTool(tool: string) {
    activeTool = tool;
    if (!editorRef) return;
    try {
      editorRef.setCurrentTool(tool);
    } catch { /* tool may not exist in this tldraw version */ }
  }

  function addShapeToCanvas(type: string) {
    if (!editorRef) return;
    const center = editorRef.getViewportPageCenter();
    editorRef.createShape({ type, x: center.x - 150, y: center.y - 150 });
  }

  // ── AI prompt ─────────────────────────────────────────────────────────────────
  async function runAiPrompt() {
    if (!aiPrompt.trim()) return;
    aiRunning = true;
    aiResponse = '';
    try {
      let context = '';
      if (useSelectionCtx && editorRef) {
        const sel = editorRef.getSelectedShapes?.() ?? [];
        context = JSON.stringify(sel.map((s: any) => ({ type: s.type, props: s.props })));
      }

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: 'You are a manufacturing assistant for a signage production company. Help with design, materials, and CAD decisions.' },
            ...(context ? [{ role: 'user', content: `Canvas context: ${context}` }] : []),
            { role: 'user', content: aiPrompt },
          ],
        }),
      });
      if (res.ok) {
        const d = await res.json();
        aiResponse = d.message?.content || d.reply || d.content || JSON.stringify(d);
      } else {
        aiResponse = 'AI service unavailable.';
      }
    } catch {
      aiResponse = 'Failed to reach AI service.';
    } finally {
      aiRunning = false;
    }
  }

  // ── Tool definitions ──────────────────────────────────────────────────────────
  const tools = [
    { id: 'select', icon: 'mouse-pointer-2', label: 'Select' },
    { id: 'draw', icon: 'pen-line', label: 'Draw' },
    { id: 'text', icon: 'type', label: 'Text' },
    { id: 'eraser', icon: 'eraser', label: 'Erase' },
  ];

  const nodeSpawners = [
    { id: 'maker', icon: 'code', label: 'Maker.js' },
    { id: 'order-details', icon: 'clipboard-list', label: 'Order Details' },
    { id: 'order-address', icon: 'map-pin', label: 'Address' },
    { id: 'profile-7st', icon: 'layers', label: 'Profile 7st' },
  ];

  const STATUS_COLOR: Record<string, string> = {
    draft: 'var(--warn, #ff9500)',
    approved: 'var(--ok, #34c759)',
    rejected: 'var(--error, #ff453a)',
    in_production: 'var(--brand, #e63329)',
    completed: 'var(--ok, #34c759)',
  };
</script>

<svelte:head>
  <title>Canvas — {poNumber || 'Order'} | OMS</title>
</svelte:head>

<div class="canvas-editor">
  <!-- ── Top Bar ─────────────────────────────────────────────────────────── -->
  <header class="top-bar">
    <div class="top-bar-left">
      <a href="{base}/orders/{data.id}" class="back-btn" title="Back to order">
        <Icon name="arrow-left" size="sm" />
      </a>
      <div class="order-identity">
        <span class="po-tag">{poNumber || '…'}</span>
        <span class="status-dot" style="background: {STATUS_COLOR[status] ?? '#888'}"></span>
        <span class="status-label">{status.toUpperCase().replace('_', ' ')}</span>
        {#if canvasDirty}
          <span class="unsaved-dot" title="Unsaved changes"></span>
        {/if}
      </div>
    </div>

    <!-- Context bar: shows selection-aware controls -->
    <div class="context-bar">
      {#if selectedShapeTypes.length === 0}
        <span class="ctx-hint">Select a shape to see properties</span>
      {:else}
        <span class="ctx-hint">{selectedShapeTypes.join(', ')} selected</span>
      {/if}
    </div>

    <!-- Primary actions — always visible -->
    <div class="top-bar-actions">
      <button class="action-btn ghost" onclick={() => goto(`${base}/orders/${data.id}`)}>
        <Icon name="eye" size="sm" /> View
      </button>
      {#if isAdmin}
        <button class="action-btn warn" onclick={requestRework}>
          <Icon name="rotate-ccw" size="sm" /> Rework
        </button>
      {/if}
      <button class="action-btn primary" onclick={saveDraft} disabled={saving}>
        <Icon name="save" size="sm" /> {saving ? 'Saving…' : 'Save Draft'}
      </button>
      {#if canApprove}
        <button class="action-btn success" onclick={confirmOrder} disabled={confirming}>
          <Icon name="check-circle" size="sm" /> {confirming ? 'Confirming…' : 'Confirm Order'}
        </button>
      {/if}
    </div>
  </header>

  <div class="canvas-body">
    <!-- ── Left Toolbox ────────────────────────────────────────────────── -->
    <aside class="toolbox">
      <div class="tool-section">
        <span class="tool-section-label">Tools</span>
        {#each tools as tool}
          <button
            class="tool-btn"
            class:active={activeTool === tool.id}
            onclick={() => selectTool(tool.id)}
            title={tool.label}
          >
            <Icon name={tool.icon} size="sm" />
          </button>
        {/each}
      </div>

      <div class="tool-divider"></div>

      <div class="tool-section">
        <span class="tool-section-label">Nodes</span>
        {#each nodeSpawners as node}
          <button
            class="tool-btn"
            onclick={() => addShapeToCanvas(node.id)}
            title={node.label}
          >
            <Icon name={node.icon} size="sm" />
          </button>
        {/each}
      </div>
    </aside>

    <!-- ── Canvas ─────────────────────────────────────────────────────── -->
    <main class="canvas-area">
      {#if loading}
        <div class="canvas-loading">
          <div class="spinner"></div>
          <p>Loading order canvas…</p>
        </div>
      {:else if error}
        <div class="canvas-error">
          <Icon name="alert-circle" size="md" />
          <p>{error}</p>
          <a href="{base}/orders" class="action-btn primary">Back to Orders</a>
        </div>
      {:else if canvasLoaded}
        {#await import('$lib/components/canvas/TldrawWrapper.svelte') then { default: TldrawWrapper }}
          <TldrawWrapper
            snapshot={canvasSnapshot}
            orderSeed={orderSeed}
            onReady={handleEditorReady}
            onSave={handleCanvasSave}
            onOrderChange={handleOrderChange}
            onProfileChange={handleProfileChange}
            hideUI={false}
          />
        {/await}
      {/if}
    </main>

    <!-- ── Right Docker ────────────────────────────────────────────────── -->
    <aside class="right-docker">
      <!-- Tab bar -->
      <div class="docker-tabs">
        <button class="dtab" class:active={rightTab === 'layers'} onclick={() => rightTab = 'layers'}>
          <Icon name="layers" size="sm" /> Zones
        </button>
        <button class="dtab" class:active={rightTab === 'changes'} onclick={() => rightTab = 'changes'}>
          <Icon name="git-pull-request" size="sm" /> Changes
        </button>
        <button class="dtab" class:active={rightTab === 'chat'} onclick={() => rightTab = 'chat'}>
          <Icon name="message-square" size="sm" /> AI
        </button>
      </div>

      <!-- Tab content -->
      <div class="docker-content">
        {#if rightTab === 'layers'}
          <div class="zone-list">
            <p class="zone-intro">Production zones auto-spawned with this order.</p>
            {#each ['Laser (DXF)', 'CNC Routing', 'Bender', 'Visuals (PDF/Rasters)'] as zone}
              <div class="zone-row">
                <span class="zone-icon">⬛</span>
                <span class="zone-name">{zone}</span>
              </div>
            {/each}
            <div class="zone-divider"></div>
            <p class="zone-intro" style="margin-top: 8px;">Form nodes</p>
            {#each ['Order Details', 'Delivery Address', ...profiles.map((_, i) => `Profile ${i + 1}`)] as node}
              <div class="zone-row">
                <span class="zone-icon">📋</span>
                <span class="zone-name">{node}</span>
              </div>
            {/each}
          </div>

        {:else if rightTab === 'changes'}
          <div class="changes-panel">
            {#if orderId}
              <ChangeRequestList orderId={String(orderId)} />
            {:else}
              <p class="zone-intro">Loading…</p>
            {/if}
          </div>

        {:else if rightTab === 'chat'}
          <!-- Phase 8: AI Chat panel -->
          <div class="ai-panel">
            <label class="ai-ctx-toggle">
              <input type="checkbox" bind:checked={useSelectionCtx} />
              <span>Use selected shapes as context</span>
            </label>

            <div class="ai-chat-history">
              {#if aiResponse}
                <div class="ai-message">
                  <div class="ai-label">Assistant</div>
                  <p>{aiResponse}</p>
                </div>
              {:else}
                <div class="ai-empty">
                  <Icon name="bot" size="sm" />
                  <p>Ask about materials, dimensions, or let the AI clean up your sketches.</p>
                </div>
              {/if}
            </div>

            <div class="ai-input-row">
              <textarea
                bind:value={aiPrompt}
                placeholder="Ask the AI assistant…"
                rows={3}
                onkeydown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    runAiPrompt();
                  }
                }}
              ></textarea>
              <button class="ai-send-btn" onclick={runAiPrompt} disabled={aiRunning || !aiPrompt.trim()}>
                {#if aiRunning}
                  <div class="spinner sm"></div>
                {:else}
                  <Icon name="send" size="sm" />
                {/if}
              </button>
            </div>
          </div>
        {/if}
      </div>
    </aside>
  </div>
</div>

<style>
  /* ── Layout ──────────────────────────────────────────────────────────────── */
  .canvas-editor {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    background: var(--bg-0);
    z-index: 1;
    overflow: hidden;
  }

  /* ── Top bar ─────────────────────────────────────────────────────────────── */
  .top-bar {
    height: 52px;
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: 0 var(--space-md);
    background: var(--glass-bg);
    backdrop-filter: var(--glass-blur);
    border-bottom: 1px solid var(--glass-border);
    z-index: 20;
    flex-shrink: 0;
  }

  .top-bar-left {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    min-width: 0;
  }

  .back-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text-muted);
    text-decoration: none;
    transition: background var(--transition-fast);
  }
  .back-btn:hover { background: var(--bg-2); color: var(--text); }

  .order-identity {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
  }

  .po-tag {
    font-weight: 700;
    color: var(--brand);
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .status-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .unsaved-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--warn, #ff9500);
    flex-shrink: 0;
  }

  .context-bar {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .ctx-hint {
    font-size: 12px;
    color: var(--text-muted);
  }

  .top-bar-actions {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    flex-shrink: 0;
  }

  /* ── Body: toolbox + canvas + docker ────────────────────────────────────── */
  .canvas-body {
    flex: 1;
    display: grid;
    grid-template-columns: 52px 1fr 280px;
    overflow: hidden;
  }

  /* ── Left toolbox ────────────────────────────────────────────────────────── */
  .toolbox {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 8px 0;
    background: var(--bg-1);
    border-right: 1px solid var(--border);
    overflow-y: auto;
    z-index: 10;
  }

  .tool-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    width: 100%;
  }

  .tool-section-label {
    font-size: 8px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
    margin-bottom: 2px;
    padding: 0 4px;
  }

  .tool-btn {
    width: 38px;
    height: 38px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    border-radius: 8px;
    color: var(--text-muted);
    cursor: pointer;
    transition: background var(--transition-fast), color var(--transition-fast);
  }
  .tool-btn:hover { background: var(--bg-2); color: var(--text); }
  .tool-btn.active { background: color-mix(in oklab, var(--brand) 12%, transparent); color: var(--brand); }

  .tool-divider {
    width: 28px;
    height: 1px;
    background: var(--border);
    margin: 6px 0;
  }

  /* ── Canvas area ────────────────────────────────────────────────────────── */
  .canvas-area {
    position: relative;
    overflow: hidden;
  }

  .canvas-loading,
  .canvas-error {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-md);
    color: var(--text-muted);
  }

  /* ── Right docker ────────────────────────────────────────────────────────── */
  .right-docker {
    display: flex;
    flex-direction: column;
    background: var(--bg-1);
    border-left: 1px solid var(--border);
    overflow: hidden;
    z-index: 10;
  }

  .docker-tabs {
    display: flex;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .dtab {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 10px 4px;
    font-size: 11px;
    font-weight: 600;
    border: none;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    border-bottom: 2px solid transparent;
    transition: color var(--transition-fast), border-color var(--transition-fast);
  }
  .dtab:hover { color: var(--text); }
  .dtab.active { color: var(--brand); border-bottom-color: var(--brand); }

  .docker-content {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-md);
  }

  /* Zone list */
  .zone-intro {
    font-size: 11px;
    color: var(--text-muted);
    margin: 0 0 var(--space-sm);
  }

  .zone-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 6px;
    font-size: 12px;
    color: var(--text);
  }
  .zone-row:hover { background: var(--bg-2); }
  .zone-icon { font-size: 14px; }
  .zone-name { flex: 1; }
  .zone-divider { height: 1px; background: var(--border); margin: 8px 0; }

  /* Changes panel */
  .changes-panel { min-height: 100px; }

  /* AI panel */
  .ai-panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    height: 100%;
  }

  .ai-ctx-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--text-muted);
    cursor: pointer;
  }

  .ai-chat-history {
    flex: 1;
    min-height: 120px;
    max-height: 340px;
    overflow-y: auto;
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: var(--space-sm);
    background: var(--bg-0);
  }

  .ai-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: var(--space-lg) 0;
    color: var(--text-muted);
    font-size: 12px;
    text-align: center;
  }

  .ai-message .ai-label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--brand);
    margin-bottom: 4px;
  }

  .ai-message p {
    font-size: 12px;
    line-height: 1.5;
    white-space: pre-wrap;
    margin: 0;
  }

  .ai-input-row {
    display: flex;
    gap: 6px;
    align-items: flex-end;
  }

  .ai-input-row textarea {
    flex: 1;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg-0);
    color: var(--text);
    font-size: 12px;
    font-family: inherit;
    resize: none;
    line-height: 1.4;
  }
  .ai-input-row textarea:focus { outline: none; border-color: var(--brand); }

  .ai-send-btn {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 8px;
    background: var(--brand);
    color: var(--bg-0);
    cursor: pointer;
    flex-shrink: 0;
    transition: opacity var(--transition-fast);
  }
  .ai-send-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  /* ── Action buttons ──────────────────────────────────────────────────────── */
  .action-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 7px 14px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid transparent;
    transition: background var(--transition-fast), opacity var(--transition-fast);
    text-decoration: none;
  }
  .action-btn.ghost {
    background: transparent;
    border-color: var(--border);
    color: var(--text-muted);
  }
  .action-btn.ghost:hover { background: var(--bg-2); color: var(--text); }
  .action-btn.primary {
    background: var(--brand);
    color: var(--bg-0);
  }
  .action-btn.primary:hover:not(:disabled) {
    background: color-mix(in oklab, var(--brand) 80%, black);
  }
  .action-btn.success {
    background: var(--ok, #34c759);
    color: var(--bg-0);
  }
  .action-btn.success:hover:not(:disabled) {
    background: color-mix(in oklab, var(--ok, #34c759) 80%, black);
  }
  .action-btn.warn {
    background: transparent;
    border-color: var(--warn, #ff9500);
    color: var(--warn, #ff9500);
  }
  .action-btn.warn:hover { background: color-mix(in oklab, var(--warn, #ff9500) 10%, transparent); }
  .action-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  /* ── Spinner ─────────────────────────────────────────────────────────────── */
  .spinner {
    width: 28px;
    height: 28px;
    border: 3px solid var(--border);
    border-top-color: var(--brand);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  .spinner.sm { width: 16px; height: 16px; border-width: 2px; }

  @keyframes spin { to { transform: rotate(360deg); } }
</style>
