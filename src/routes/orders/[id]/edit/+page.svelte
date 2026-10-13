<script lang="ts">
  /**
   * Phase 7: Corel-style canvas layout for Order editing.
   * Left panel = toolbox, top bar = context bar, right docker = management,
   * top-right = primary action buttons (Save Draft / Confirm / Rework).
   * The tldraw canvas fills the centre.
   */
  import { onMount, untrack } from 'svelte';
  import { goto, pushState, beforeNavigate } from '$app/navigation';
  import { page } from '$app/state';
  import { base } from '$app/paths';
  import { t } from 'svelte-i18n';
  import Icon from '$lib/ui/Icon.svelte';
  import { currentUser } from '$lib/auth/authState.svelte';
  import { notifySuccess, notifyError } from '$lib/notify/toast';
  import ChangeRequestList from '$lib/order/ChangeRequestList.svelte';
  import OrderFiles from '$lib/order/OrderFiles.svelte';
  import OrderIntakeAssistant from '$lib/order/OrderIntakeAssistant.svelte';
  import OrderReadinessAssistant from '$lib/order/OrderReadinessAssistant.svelte';
  import RevisionIntelligence from '$lib/order/RevisionIntelligence.svelte';
  import {
    WORKSPACE_GROUPS,sectionFromQuery,workspaceGroup,sectionsForGroup,
    type WorkspaceSection
  } from '$lib/order/workspace-navigation';
import { notifications } from '$lib/notify/store';
import { can, normaliseStatus, ORDER_STATUS_LABELS } from '$lib/auth/permission-utils';
import type { OrderStatus } from '$lib/auth/permission-utils';

  let { data } = $props();

  // ── Order state ─────────────────────────────────────────────────────────────
  let orderId: string | null = $state(null);
  let createdBy = $state('');
  let orderUpdatedAt: string | null = $state(null);
  let poNumber = $state('');
  let clientName = $state('');
  let title = $state('');
  let deadline = $state('');
  let loadingDate = $state('');
  let notes = $state('');
  let priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT' = $state('NORMAL');
  let status = $state<OrderStatus>('DRAFT');
  let deliveryAddress = $state('');
  let deliveryContact = $state('');
  let deliveryPhone = $state('');
  let deliveryEmail = $state('');
  let isRd = $state(false);
  let rdNotes = $state('');
  let deliveryPresetId: string | null = $state(null);
  let profiles: any[] = $state([]);
  let profileChoices: Array<{id:string;code:string;name:string}> = $state([]);
  let profileChoicesError = $state('');
  let profileChoicesTruncated = $state(false);
  async function loadProfileChoices() {
    profileChoicesError = '';
    try {
      const response = await fetch('/api/order/profile-choices', { cache: 'no-store' });
      if (!response.ok) throw new Error('Profile catalog unavailable');
      const payload = await response.json();
      profileChoices = Array.isArray(payload.templates) ? payload.templates : [];
      profileChoicesTruncated = payload.truncated === true;
    } catch {
      profileChoices = [];
      profileChoicesError = 'Profile template catalog could not be loaded';
    }
  }

  // ── Canvas state ─────────────────────────────────────────────────────────────
  let canvasLoaded = $state(false);
  let canvasSnapshot: any = $state(null);
  let canvasDirty = $state(false);
  let editorRef: any = $state(null);
  let selectedShape: { id: string; type: string; x: number; y: number; w: number | null; h: number | null; thickness: number | null; rotation: number } | null = $state(null);
  let multiSelectCount = $state(0);
  let selectedShapeTypes: string[] = $derived(
    multiSelectCount > 1 ? [`${multiSelectCount} shapes`]
    : selectedShape ? [selectedShape.type]
    : []
  );

  // ── Change-requests (loaded for the right docker) ────────────────────────────
  let changeRequests: any[] = $state([]);
  let changeRequestError = $state('');
  let reviewInProgress = $state(false);
  async function reviewChangeRequest(requestId:string, decision:'approved'|'rejected') {
    if(!isAdmin||reviewInProgress||!orderId)return;
    if(!window.confirm($t('orderWorkspace.reviewDecisionWarning')))return;
    reviewInProgress=true;
    changeRequestError='';
    try{
      const response=await fetch(`/api/change-requests/${encodeURIComponent(requestId)}/review`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({status:decision})
      });
      if(!response.ok){
        const responseBody=await response.json().catch(()=>({}));
        throw new Error(responseBody.message||responseBody.error||
          $t('orderWorkspace.changeReviewError'));
      }
      await loadChangeRequests();
      notifySuccess($t('orderWorkspace.reviewRecorded'));
    }catch(err){
      changeRequestError=err instanceof Error?err.message:
        $t('orderWorkspace.changeReviewError');
    }finally{reviewInProgress=false;}
  }

  async function loadChangeRequests() {
    if(!orderId)return;
    const id=orderId;
    changeRequestError='';
    try{
      const res=await fetch(`/api/draft-orders/${encodeURIComponent(id)}/change-requests`,
        {cache:'no-store'});
      if(!res.ok)throw new Error($t('orderWorkspace.changeListError'));
      const data=await res.json();
      if(id!==orderId)return;
      changeRequests=Array.isArray(data)?data.map((cr:any)=>({
        id:cr.id,title:cr.title||cr.description||'Change request',
        author:cr.proposed_by_user?.display_name ||
          cr.proposed_by_user?.username || $t('orderWorkspace.unknownAuthor'),
        status:cr.status,message:cr.description||'',
        proposed:cr.proposed_diff??cr.changes??{},
        reviewNotes:cr.review_notes??null
      })):[];
    }catch(err){
      if(id===orderId)changeRequestError=err instanceof Error?err.message:
        $t('orderWorkspace.changeListError');
    }
  }

  // ── UI state ─────────────────────────────────────────────────────────────────
  let loading = $state(true);
  let saving = $state(false);
  let confirming = $state(false);
  let error = $state('');
  let savedFormFingerprint: string | null = $state(null);
  let attachedFilesCount = $state<number | null>(null);
  let filesCountError = $state(false);
  let focusPanel = $state(true);
  let unsavedWarningEnabled = $state(false);

  function formFingerprint():string {
    return JSON.stringify({
      clientName,title,deadline,loadingDate,priority,notes,
      deliveryAddress,deliveryContact,deliveryPhone,deliveryEmail,
      deliveryPresetId,isRd,rdNotes,
      profiles:profiles.map(p=>({
        profileTemplateId:p.profileTemplateId??p.profile_template_id??null,
        quantity:p.quantity??1,quantity2:p.quantity2??0,
        quantity3:p.quantity3??0,quantity4:p.quantity4??0,
        configuration:p.configuration??{},notes:p.notes??''
      }))
    });
  }
  let formDirty = $derived(savedFormFingerprint !== null &&
    formFingerprint() !== savedFormFingerprint);
  let hasUnsavedChanges = $derived(formDirty || canvasDirty);
  let activeGroup = $derived(workspaceGroup(rightTab));
  let pendingReviewCount = $derived(changeRequests.filter(
    cr=>cr.status==='pending'||cr.status==='open').length);
  function openWorkspaceSection(section:WorkspaceSection) {
    rightTab=section;
    focusPanel=section!=='layers';
    if(typeof window!=='undefined'){
      const url=new URL(window.location.href);
      if(url.searchParams.get('section')!==section){
        url.searchParams.set('section',section);
        pushState(url.pathname+url.search,{});
      }
    }
  }
  async function refreshFileCount() {
    if(!orderId)return;
    const id=orderId;
    try {
      const response=await fetch(`/api/files?orderId=${encodeURIComponent(id)}&limit=100`,
        {cache:'no-store'});
      if(!response.ok)throw new Error('Order files unavailable');
      const result=await response.json();
      if(orderId===id){
        attachedFilesCount=Array.isArray(result)?result.length:0;
        filesCountError=false;
      }
    }catch{
      if(orderId===id){attachedFilesCount=null;filesCountError=true;}
    }
  }
  beforeNavigate(({cancel}) => {
    if(unsavedWarningEnabled && hasUnsavedChanges &&
      !window.confirm($t('orderWorkspace.leaveWarning'))) cancel();
  });
  let rightTab: WorkspaceSection = $state('details');
  // Restore the workspace section when browser Back/Forward navigates through
  // SvelteKit shallow-history entries. Switching sections does not discard forms.
  $effect(() => {
    const linked=sectionFromQuery(page.url.searchParams.get('section'));
    // Depend only on the URL, not on the local selection being changed.
    untrack(() => {
      if(rightTab!==linked){
        rightTab=linked;
        focusPanel=linked!=='layers';
      }
    });
  });
  let intakeFileId = $state('');
  let intakeCurrent = $derived({
    clientName,title,deadline,loadingDate,priority,notes,
    deliveryAddress,deliveryContact,deliveryPhone,deliveryEmail,isRd,rdNotes
  });
  function applyIntakeFields(patch:Record<string,unknown>) {
    if(!canEdit)return;
    // Only the allowlisted draft fields can be changed by a human-approved
    // proposal. No server write occurs here: normal Save Draft remains required.
    if(typeof patch.clientName==='string') clientName=patch.clientName;
    if(typeof patch.title==='string') title=patch.title;
    if(typeof patch.deadline==='string') deadline=patch.deadline;
    if(typeof patch.loadingDate==='string') loadingDate=patch.loadingDate;
    if(['LOW','NORMAL','HIGH','URGENT'].includes(String(patch.priority)))
      priority=patch.priority as typeof priority;
    if(typeof patch.notes==='string') notes=patch.notes;
    if(typeof patch.deliveryAddress==='string') deliveryAddress=patch.deliveryAddress;
    if(typeof patch.deliveryContact==='string') deliveryContact=patch.deliveryContact;
    if(typeof patch.deliveryPhone==='string') deliveryPhone=patch.deliveryPhone;
    if(typeof patch.deliveryEmail==='string') deliveryEmail=patch.deliveryEmail;
    if(typeof patch.isRd==='boolean') isRd=patch.isRd;
    if(typeof patch.rdNotes==='string') rdNotes=patch.rdNotes;
    canvasDirty=true;
    notifySuccess('Approved fields applied locally. Review them and click Save Draft.');
    openWorkspaceSection('details');
  }
  let activeTool = $state('select');
  let aiPrompt = $state('');
  let useSelectionCtx = $state(false);
  let aiRunning = $state(false);
  let aiResponse = $state('');

  // ── Permissions ───────────────────────────────────────────────────────────────
  let isAdmin = $derived(can($currentUser, 'editOrder'));
  let canEdit = $derived(['DRAFT','PENDING_REVIEW'].includes(status) &&
    (isAdmin || !!$currentUser && $currentUser.id === createdBy));
  let canApprove = $derived(can($currentUser, 'confirmOrder') &&
    ['DRAFT','PENDING_REVIEW'].includes(status));
  let canAssignPo = $derived(can($currentUser, 'assignPoNumber'));

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
    const initial=sectionFromQuery(new URLSearchParams(window.location.search).get('section'));
    rightTab=initial;
    focusPanel=initial!=='layers';
    await loadOrder();
    void loadProfileChoices();
    canvasLoaded=true;
    await Promise.all([loadChangeRequests(),refreshFileCount()]);
    unsavedWarningEnabled=true;
  });

  async function loadOrder() {
    loading = true;
    error = '';
    try {
      const response = await fetch(`/api/draft-orders/${data.id}`);
      if (!response.ok) throw new Error('Order not found');
      const order = await response.json();

      orderId = String(order.id);
      createdBy = String(order.createdBy ?? '');
      orderUpdatedAt = order.updatedAt ?? null;
      clientName = order.clientName || '';
      poNumber = order.poNumber || '';
      title = order.title || order.clientName || '';
      deadline = order.deadline ? order.deadline.split('T')[0] : '';
      loadingDate = order.loadingDate ? order.loadingDate.split('T')[0] : '';
      notes = order.notes || '';
      priority = order.priority || 'NORMAL';
      status = normaliseStatus(order.status);
      deliveryAddress = order.deliveryAddress || '';
      deliveryContact = order.deliveryContact || '';
      deliveryPhone = order.deliveryPhone || '';
      deliveryEmail = order.deliveryEmail || '';
      isRd = order.isRd === true;
      rdNotes = order.rdNotes || '';
      deliveryPresetId = order.deliveryPresetId ?? null;
      profiles = order.profiles || [];
      savedFormFingerprint=formFingerprint();

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
    // Selection listener: update Svelte state whenever the user selects shapes
    editor.store.listen(() => {
      try {
        const sel = editor.getSelectedShapes?.() ?? [];
        multiSelectCount = sel.length;
        if (sel.length === 1) {
          const s = sel[0];
          selectedShape = {
            id: s.id,
            type: s.type,
            x: Math.round(s.x ?? 0),
            y: Math.round(s.y ?? 0),
            w: s.props?.w ?? null,
            h: s.props?.h ?? null,
            thickness: s.meta?.thickness ?? s.props?.thickness ?? null,
            rotation: Math.round((s.rotation ?? 0) * 1000) / 1000,
          };
        } else {
          selectedShape = null;
        }
      } catch (err) {
        // ignore – selection store may be transitioning
      }
    }, { scope: 'session' });
  }

  // ── Context-bar field updaters (write back to canvas on input) ───────────────
  function updateSelectedGeom(patch: Partial<{ x: number; y: number; w: number; h: number; rotation: number }>) {
    if (!editorRef || !selectedShape) return;
    const s = editorRef.getShape(selectedShape.id);
    if (!s) return;
    const next: any = { id: s.id, type: s.type };
    if (patch.x !== undefined) next.x = patch.x;
    if (patch.y !== undefined) next.y = patch.y;
    if (patch.rotation !== undefined) next.rotation = patch.rotation;
    if (patch.w !== undefined || patch.h !== undefined) {
      next.props = { ...s.props };
      if (patch.w !== undefined) next.props.w = patch.w;
      if (patch.h !== undefined) next.props.h = patch.h;
    }
    editorRef.updateShape(next);
  }

  function updateSelectedThickness(thickness: number) {
    if (!editorRef || !selectedShape) return;
    const s = editorRef.getShape(selectedShape.id);
    if (!s) return;
    editorRef.updateShape({
      id: s.id,
      type: s.type,
      meta: { ...(s.meta ?? {}), thickness },
    });
  }

  // ── Boolean Tool: union / subtract / intersect of selected MakerShapes ──────
  async function applyBooleanOp(op: 'union' | 'subtract' | 'intersect') {
    if (!editorRef) return;
    const sel = editorRef.getSelectedShapes?.() ?? [];
    const makers = sel.filter((s: any) => s.type === 'maker');
    if (makers.length < 2) {
      notifyError('Select 2+ Maker.js shapes to combine');
      return;
    }
    try {
      const makerjs = (await import('makerjs')).default;
      // Evaluate each selected maker code and produce a model
      const models: any[] = [];
      for (const m of makers) {
        const code: string = m.props?.code ?? '';
        const params = m.props?.params ?? {};
        const fn = new Function('require', 'module', code + '\nreturn module.exports;');
        const mod = fn((name: string) => {
          if (name === 'makerjs') return makerjs;
          throw new Error('Only makerjs is supported');
        }, { exports: {} });
        const args = mod.metaParameters
          ? mod.metaParameters.map((p: any) => params[p.name] ?? p.value ?? 50)
          : Object.values(params);
        models.push(new mod(...args));
      }
      // Combine pairwise
      let combined = models[0];
      for (let i = 1; i < models.length; i++) {
        combined = makerjs.model.combine(
          combined,
          models[i],
          op === 'subtract' || op === 'intersect',
          op === 'union' || op === 'intersect',
          op === 'subtract' || op === 'union',
          op !== 'intersect',
        );
      }
      // Serialise back to a maker code string
      const code = `module.exports = function() {\n  this.models = ${JSON.stringify(combined.models ?? {})};\n  this.paths = ${JSON.stringify(combined.paths ?? {})};\n};`;
      const center = makers[0];
      // Place the result and remove the originals
      editorRef.batch(() => {
        editorRef.deleteShapes(makers.map((m: any) => m.id));
        editorRef.createShape({
          type: 'maker',
          x: center.x ?? 0,
          y: center.y ?? 0,
          props: { w: 320, h: 320, code, params: {} },
        });
      });
      notifySuccess(`Boolean ${op} applied`);
    } catch (err: any) {
      console.error('Boolean op failed', err);
      notifyError(`Boolean ${op} failed: ${err.message ?? 'unknown'}`);
    }
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

  function handleAssetUploaded(oid: string, asset: { url: string; fileName: string; kind: string }) {
    canvasDirty = true;
    notifySuccess(`Uploaded ${asset.fileName}`);
  }

  // ── Save draft ────────────────────────────────────────────────────────────────
  async function saveDraft(): Promise<boolean> {
    if (!orderId || !canEdit) { notifyError('You cannot edit this draft'); return false; }
    if (saving) return false;
    if (!clientName.trim() || !deadline) { notifyError('Client and deadline are required'); return false; }
    saving = true;
    try {
      const res = await fetch(`/api/draft-orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName, title, deadline, loadingDate: loadingDate || null,
          notes, priority,
          deliveryAddress, deliveryContact, deliveryPhone,
          deliveryEmail: deliveryEmail || null, isRd, rdNotes,
          deliveryPresetId,
          profiles: profiles.map(p => ({
            profileTemplateId: p.profileTemplateId ?? p.profile_template_id ?? null,
            quantity: p.quantity ?? 1,
            quantity2: p.quantity2 ?? 0, quantity3: p.quantity3 ?? 0,
            quantity4: p.quantity4 ?? 0,
            configuration: p.configuration ?? {}, notes: p.notes ?? ''
          })),
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error || payload.message || 'Save failed');
      }
      const persisted = await res.json();
      // A readiness report about the previous draft revision is now stale,
      // including when the separate Canvas save subsequently fails.
      orderUpdatedAt = typeof persisted.updatedAt === 'string'
        ? persisted.updatedAt : null;

      // Persist canvas state
      if (canvasSnapshot) {
        const canvasResponse = await fetch(`/api/draft-orders/${data.id}/canvas-state`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ snapshot: canvasSnapshot }),
        });
        if (!canvasResponse.ok) throw new Error('Order fields saved, but Canvas did not save. Retry before confirming.');
      }

      canvasDirty = false;
      savedFormFingerprint=formFingerprint();
      notifySuccess('Draft saved');
      return true;
    } catch (err: any) {
      notifyError(err.message || 'Failed to save');
      return false;
    } finally {
      saving = false;
    }
  }

  // ── Confirm order ─────────────────────────────────────────────────────────────
  async function confirmOrder() {
    confirming = true;
    try {
      // Save first
      if (!canApprove || !orderId) throw new Error('You cannot confirm this order');
      if (!(await saveDraft())) throw new Error('Save draft before confirming');
      if (!poNumber.trim()) throw new Error('An externally issued PO number is required');
      const res = await fetch(`/api/draft-orders/${orderId}/confirm`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poNumber: poNumber.trim() })
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error || payload.message || 'Confirmation failed');
      }
      status = 'CONFIRMED';
      confirmOrderModal = false;
      notifySuccess('Order approved and sent to production');
      goto(`${base}/orders/${data.id}`);
    } catch (err: any) {
      notifyError(err.message || 'Failed to confirm order');
    } finally {
      confirming = false;
    }
  }

  // ── Request rework ────────────────────────────────────────────────────────────
  async function submitRework() {
    if (!reworkReason.trim()) return;
    try {
      const res = await fetch(`/api/draft-orders/${orderId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reworkReason.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).message || 'Rework request failed');
      status = 'CANCELLED';
      reworkModal = false;
      reworkReason = '';
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
    const center = editorRef.getViewportPageBounds().center;
    editorRef.createShape({ type, x: center.x - 150, y: center.y - 150 });
  }

  // ── AI prompt ─────────────────────────────────────────────────────────────────
  /** Detect whether the prompt should be routed to the shape-replacement endpoint. */
  function isReplaceIntent(text: string): boolean {
    const re = /\b(clean(?:\s*it)?\s*up|replace\s+with|convert\s+to|make\s+(?:this|it)\s+(?:a|an|into)|turn\s+(?:this|it)\s+into|generate\s+(?:a\s+)?maker|to\s+maker)/i;
    return re.test(text);
  }

  async function replaceSelectionWithMaker(prompt: string) {
    const sel = editorRef?.getSelectedShapes?.() ?? [];
    if (sel.length === 0) {
      notifyError('Select a shape first');
      return;
    }
    aiRunning = true;
    aiResponse = '';
    try {
      const selection = sel.map((s: any) => ({
        type: s.type,
        x: Math.round(s.x ?? 0),
        y: Math.round(s.y ?? 0),
        w: s.props?.w,
        h: s.props?.h,
        props: s.props,
      }));
      const res = await fetch('/api/ai/canvas/replace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, selection }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'AI replace failed');
      }
      const { code, params } = await res.json();
      const anchor = sel[0];
      editorRef.batch(() => {
        editorRef.deleteShapes(sel.map((s: any) => s.id));
        editorRef.createShape({
          type: 'maker',
          x: anchor.x ?? 0,
          y: anchor.y ?? 0,
          props: { w: 320, h: 320, code, params: params ?? {} },
        });
      });
      aiResponse = 'Replaced selection with a Maker.js node.';
      notifySuccess('Sketch replaced');
    } catch (err: any) {
      aiResponse = `Replacement failed: ${err.message ?? 'unknown'}`;
      notifyError(aiResponse);
    } finally {
      aiRunning = false;
    }
  }

  async function runAiPrompt() {
    if (!aiPrompt.trim()) return;
    const prompt = aiPrompt;

    // If the user is asking the AI to clean up the selection, route to the
    // shape-replacement endpoint instead of plain chat.
    if (useSelectionCtx && isReplaceIntent(prompt)) {
      await replaceSelectionWithMaker(prompt);
      return;
    }

    aiRunning = true;
    aiResponse = '';
    try {
      let context = '';
      if (useSelectionCtx && editorRef) {
        const sel = editorRef.getSelectedShapes?.() ?? [];
        context = JSON.stringify(sel.map((s: any) => ({ type: s.type, props: s.props })));
      }

      // Use SSE streaming so tokens render progressively instead of waiting
      // for the full reply. Falls back to plain JSON if the stream errors.
      const res = await fetch('/api/ai/chat?stream=1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stream: true,
          messages: [
            { role: 'system', content: 'You are a manufacturing assistant for a signage production company. Help with design, materials, and CAD decisions.' },
            ...(context ? [{ role: 'user', content: `Canvas context: ${context}` }] : []),
            { role: 'user', content: prompt },
          ],
        }),
      });

      if (!res.ok || !res.body) {
        aiResponse = 'AI service unavailable.';
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';
        for (const evt of events) {
          const line = evt.split('\n').find((l) => l.startsWith('data:'));
          if (!line) continue;
          try {
            const data = JSON.parse(line.slice(5).trim());
            if (data.delta) aiResponse += data.delta;
            if (data.error) aiResponse = `AI error: ${data.error}`;
            if (data.done && data.content) aiResponse = data.content;
          } catch {
            // skip
          }
        }
      }
      if (!aiResponse) aiResponse = '(no response)';
    } catch {
      aiResponse = 'Failed to reach AI service.';
    } finally {
      aiRunning = false;
    }
  }

  // ── PDF "Extract to Order Forms" — context menu action ──────────────────────
  let confirmOrderModal = $state(false);
  let reworkModal = $state(false);
  let reworkReason = $state('');

  let pdfMenu: { x: number; y: number; fileId: string; shapeId: string } | null = $state(null);
  let pdfMenuRunning = $state(false);

  function openPdfMenuFromEvent(e: MouseEvent) {
    if (!editorRef) return;
    // Find a selected document shape that has a fileId and is a PDF
    const sel = editorRef.getSelectedShapes?.() ?? [];
    const pdfShape = sel.find((s: any) =>
      s.type === 'document' && s.props?.kind === 'pdf' && s.props?.fileId
    );
    if (!pdfShape) return;
    e.preventDefault();
    pdfMenu = {
      x: e.clientX,
      y: e.clientY,
      fileId: pdfShape.props.fileId,
      shapeId: pdfShape.id,
    };
  }

  function closePdfMenu() {
    pdfMenu = null;
  }

  function extractPdfToForms() {
    if (!canEdit || !pdfMenu) return;
    // Never auto-overwrite fields from a PDF model response. The staff member
    // selects proposals in the dedicated review tab.
    intakeFileId=pdfMenu.fileId;
    openWorkspaceSection('intake');
    closePdfMenu();
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

  const STATUS_COLOR: Record<string,string> = {
    DRAFT:'var(--warn,#ff9500)',
    PENDING_REVIEW:'var(--warn,#ff9500)',
    CONFIRMED:'var(--ok,#34c759)',
    IN_PRODUCTION:'var(--brand,#e63329)',
    READY_TO_LOAD:'var(--ok,#34c759)',
    DISPATCHED:'var(--ok,#34c759)',
    ARCHIVED:'var(--ok,#34c759)',
    ON_HOLD:'var(--warn,#ff9500)',
    CANCELLED:'var(--error,#ff453a)',
    VOIDED:'var(--error,#ff453a)'
  };
</script>

<svelte:head>
  <title>Canvas — {poNumber || 'Order'} | OMS</title>
</svelte:head>

<svelte:window onbeforeunload={(event) => {
  if (unsavedWarningEnabled && hasUnsavedChanges) {
    event.preventDefault();
    event.returnValue='';
  }
}} />

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
        {#if hasUnsavedChanges}
          <span class="unsaved-dot" title={$t('orderWorkspace.unsaved')}></span>
        {/if}
      </div>
    </div>

    <!-- Context bar: shows selection-aware controls -->
    <div class="context-bar">
      {#if !selectedShape && multiSelectCount === 0}
        <span class="ctx-hint">Select a shape to see properties</span>
      {:else if multiSelectCount > 1}
        <span class="ctx-hint">{multiSelectCount} shapes selected</span>
        <div class="ctx-divider"></div>
        <button class="ctx-btn" onclick={() => applyBooleanOp('union')} title="Union (Maker.js)">∪ Union</button>
        <button class="ctx-btn" onclick={() => applyBooleanOp('subtract')} title="Subtract (Maker.js)">− Subtract</button>
        <button class="ctx-btn" onclick={() => applyBooleanOp('intersect')} title="Intersect (Maker.js)">∩ Intersect</button>
      {:else if selectedShape}
        <span class="ctx-tag">{selectedShape.type}</span>
        <label class="ctx-field">
          X
          <input type="number" value={selectedShape.x}
            onchange={(e) => updateSelectedGeom({ x: parseFloat(e.currentTarget.value) })}
            step="1" />
        </label>
        <label class="ctx-field">
          Y
          <input type="number" value={selectedShape.y}
            onchange={(e) => updateSelectedGeom({ y: parseFloat(e.currentTarget.value) })}
            step="1" />
        </label>
        {#if selectedShape.w !== null}
          <label class="ctx-field">
            W
            <input type="number" value={selectedShape.w}
              onchange={(e) => updateSelectedGeom({ w: parseFloat(e.currentTarget.value) })}
              step="1" min="1" />
          </label>
        {/if}
        {#if selectedShape.h !== null}
          <label class="ctx-field">
            H
            <input type="number" value={selectedShape.h}
              onchange={(e) => updateSelectedGeom({ h: parseFloat(e.currentTarget.value) })}
              step="1" min="1" />
          </label>
        {/if}
        <label class="ctx-field">
          Thickness
          <select value={selectedShape.thickness ?? ''}
            onchange={(e) => updateSelectedThickness(parseFloat(e.currentTarget.value))}>
            <option value="">—</option>
            <option value="3">3 mm</option>
            <option value="5">5 mm</option>
            <option value="8">8 mm</option>
            <option value="10">10 mm</option>
            <option value="13">13 mm</option>
            <option value="15">15 mm</option>
            <option value="20">20 mm</option>
            <option value="25">25 mm</option>
          </select>
        </label>
      {/if}
    </div>

    <!-- Primary actions — always visible -->
    <div class="top-bar-actions">
      <button class="action-btn ghost" onclick={() => goto(`${base}/orders/${data.id}`)}>
        <Icon name="eye" size="sm" /> View
      </button>
      {#if isAdmin}
        <button class="action-btn warn" onclick={() => { reworkModal = true; reworkReason = ''; }}>
          <Icon name="rotate-ccw" size="sm" /> Rework
        </button>
      {/if}
      <button class="action-btn primary" onclick={saveDraft} disabled={saving || !canEdit}
        title={$t('orderWorkspace.saveHelp')}>
        <Icon name="save" size="sm" /> {saving ? 'Saving…' : 'Save Draft'}
      </button>
      {#if canApprove}
        <button class="action-btn success" onclick={() => confirmOrderModal = true} disabled={confirming}>
          <Icon name="check-circle" size="sm" /> {confirming ? 'Confirming…' : 'Confirm Order'}
        </button>
      {/if}
    </div>
  </header>

  <nav class="workspace-flow" aria-label={$t('orderWorkspace.workflowLabel')}>
    {#each WORKSPACE_GROUPS as group (group.id)}
      <button type="button" class:active={activeGroup===group.id}
        aria-current={activeGroup===group.id?'step':undefined}
        onclick={() => openWorkspaceSection(
          (group.sections as readonly WorkspaceSection[]).includes(rightTab)
            ? rightTab : group.sections[0])}>
        <span class="workspace-phase-icon">
          {#if group.id==='prepare'}<Icon name="clipboard-list" size="sm" />
          {:else if group.id==='plan'}<Icon name="clipboard-check" size="sm" />
          {:else if group.id==='review'}<Icon name="git-pull-request" size="sm" />
          {:else}<Icon name="message-square" size="sm" />{/if}
        </span>
        {$t(group.label)}
        {#if group.id==='review' && pendingReviewCount>0}
          <span class="nav-count">{pendingReviewCount}</span>
        {/if}
      </button>
    {/each}
    <span class="workspace-inline-summary">
      {#if hasUnsavedChanges}<span class="dirty-mark"></span> {$t('orderWorkspace.unsaved')}
      {:else}{$t('orderWorkspace.savedState')}{/if}
    </span>
  </nav>
  <div class="canvas-body" class:workspace-focused={focusPanel}>
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
            <Icon name={tool.icon as any} size="sm" />
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
            <Icon name={node.icon as any} size="sm" />
          </button>
        {/each}
      </div>

      <div class="tool-divider"></div>

      <div class="tool-section">
        <span class="tool-section-label">Boolean</span>
        <button class="tool-btn" title="Union selected Maker.js shapes" onclick={() => applyBooleanOp('union')}>∪</button>
        <button class="tool-btn" title="Subtract selected Maker.js shapes" onclick={() => applyBooleanOp('subtract')}>−</button>
        <button class="tool-btn" title="Intersect selected Maker.js shapes" onclick={() => applyBooleanOp('intersect')}>∩</button>
      </div>
    </aside>

    <!-- ── Canvas ─────────────────────────────────────────────────────── -->
    <main class="canvas-area" oncontextmenu={openPdfMenuFromEvent} role="presentation">
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
            onAssetUploaded={handleAssetUploaded}
            hideUI={false}
          />
        {/await}
      {/if}

      {#if pdfMenu}
        <div
          class="pdf-ctx-overlay"
          onclick={closePdfMenu}
          oncontextmenu={(e) => { e.preventDefault(); closePdfMenu(); }}
          role="presentation"
        ></div>
        <div class="pdf-ctx-menu" style="left: {pdfMenu.x}px; top: {pdfMenu.y}px;">
          <button
            class="pdf-ctx-item"
            onclick={extractPdfToForms}
            disabled={pdfMenuRunning}
          >
            <Icon name="sparkles" size="sm" />
            {$t('orderIntake.reviewFile')}
          </button>
        </div>
      {/if}
    </main>

    <!-- ── Right Docker ────────────────────────────────────────────────── -->
    <aside class="right-docker">
      <div class="workspace-panel-heading">
        <div>
          <span class="workspace-eyebrow">{$t(`orderWorkspace.groups.${activeGroup}`)}</span>
          <h2>{$t(`orderWorkspace.sections.${rightTab}`)}</h2>
        </div>
        <button type="button" class="focus-toggle" onclick={() => focusPanel=!focusPanel}
          aria-pressed={focusPanel}
          title={focusPanel?$t('orderWorkspace.showCanvas'):$t('orderWorkspace.focusPanel')}>
          <Icon name={focusPanel?'eye':'maximize'} size="sm" />
          {focusPanel?$t('orderWorkspace.showCanvas'):$t('orderWorkspace.focusPanel')}
        </button>
      </div>
      <nav class="docker-tabs" aria-label={$t('orderWorkspace.sectionsLabel')}>
        {#each sectionsForGroup(activeGroup) as section (section)}
          <button type="button" class="dtab" class:active={rightTab===section}
            aria-current={rightTab===section?'page':undefined}
            onclick={() => openWorkspaceSection(section)}>
            {$t(`orderWorkspace.sections.${section}`)}
            {#if section==='files' && attachedFilesCount!==null}
              <span class="nav-count">{attachedFilesCount}</span>
            {:else if section==='changes' && pendingReviewCount>0}
              <span class="nav-count">{pendingReviewCount}</span>
            {/if}
          </button>
        {/each}
      </nav>

      <!-- Tab content -->
      <div class="docker-content">
        {#if rightTab === 'details'}
          <div class="order-field-panel">
            <label>Client <input bind:value={clientName} disabled={!canEdit} maxlength="200" required /></label>
            <label>Title <input bind:value={title} disabled={!canEdit} maxlength="200" /></label>
            <label>Deadline <input type="date" bind:value={deadline} disabled={!canEdit} required /></label>
            <label>Loading date <input type="date" bind:value={loadingDate} disabled={!canEdit} /></label>
            <label>Priority
              <select bind:value={priority} disabled={!canEdit}>
                <option value="LOW">Low</option><option value="NORMAL">Normal</option>
                <option value="HIGH">High</option><option value="URGENT">Urgent</option>
              </select>
            </label>
            <label>Order notes <textarea bind:value={notes} rows="3" disabled={!canEdit}></textarea></label>
            <label>Delivery address <textarea bind:value={deliveryAddress} rows="3" disabled={!canEdit}></textarea></label>
            <label>Delivery contact <input bind:value={deliveryContact} disabled={!canEdit} /></label>
            <label>Delivery phone <input bind:value={deliveryPhone} disabled={!canEdit} /></label>
            <label>Delivery email <input type="email" bind:value={deliveryEmail} disabled={!canEdit} /></label>
            <label class="checkbox-field">
              <input type="checkbox" bind:checked={isRd} disabled={!canEdit} /> R&D order
            </label>
            {#if isRd}
              <label>R&D notes <textarea bind:value={rdNotes} rows="3" disabled={!canEdit}></textarea></label>
            {/if}
            <h4>Production profiles ({profiles.length})</h4>
            {#if profileChoicesError}
              <p class="zone-intro" role="alert">{profileChoicesError}</p>
            {/if}
            {#if profileChoicesTruncated}
              <p class="zone-intro">{$t('productionReadiness.profileCatalogTruncated')}</p>
            {/if}
            {#each profiles as profile, idx (profile.dbId ?? idx)}
              <div class="order-profile-edit">
                <strong>Profile {idx+1}</strong>
                <label>{$t('productionReadiness.profileSelect')}
                  <select disabled={!canEdit || !!profileChoicesError}
                    value={profile.profileTemplateId ?? profile.profile_template_id ?? ''}
                    onchange={(e) => profiles = profiles.map((p,i) => i===idx ? {
                      ...p,profileTemplateId:e.currentTarget.value||null
                    } : p)}>
                    <option value="">{$t('productionReadiness.profileUnassigned')}</option>
                    {#each profileChoices as option (option.id)}
                      <option value={option.id}>{option.code} — {option.name}</option>
                    {/each}
                  </select>
                </label>
                <label>Quantity
                  <input type="number" min="1" max="1000" bind:value={profile.quantity} disabled={!canEdit} />
                </label>
                {#each [2,3,4] as qty}
                  <label>Quantity {qty}
                    <input type="number" min="0" max="1000"
                      value={profile[`quantity${qty}`] ?? 0}
                      onchange={(e) => profile[`quantity${qty}`] = Number(e.currentTarget.value)}
                      disabled={!canEdit} />
                  </label>
                {/each}
                <label>Notes
                  <textarea bind:value={profile.notes} rows="2" disabled={!canEdit}></textarea>
                </label>
                {#if canEdit}
                  <button type="button" onclick={() => profiles = profiles.filter((_,i)=>i!==idx)}>Remove profile</button>
                {/if}
              </div>
            {/each}
            {#if canEdit}
              <button type="button" onclick={() => profiles = [...profiles, {
                quantity:1,configuration:{},notes:'',profileTemplateId:null
              }]}>Add profile</button>
              <button class="action-btn primary" onclick={saveDraft} disabled={saving}>
                {saving ? 'Saving…' : 'Save all changes'}
              </button>
            {/if}
          </div>
        {:else if rightTab === 'layers'}
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
              <button class="cr-refresh-btn" onclick={loadChangeRequests} title="Refresh">
                <Icon name="refresh-cw" size="sm" /> Refresh
              </button>
              {#if changeRequestError}
                <p role="alert" class="zone-intro">{changeRequestError}</p>
              {/if}
              {#if changeRequests.length === 0}
                <p class="zone-intro" style="margin-top: 8px;">No change requests yet.</p>
              {:else}
                <ChangeRequestList items={changeRequests} isAdmin={isAdmin && !reviewInProgress}
                  onApprove={id=>void reviewChangeRequest(id,'approved')}
                  onDecline={id=>void reviewChangeRequest(id,'rejected')} />
              {/if}
            {:else}
              <p class="zone-intro">Loading…</p>
            {/if}
          </div>

        {:else if rightTab === 'revisions'}
          {#if orderId}
            <RevisionIntelligence {orderId} canReview={isAdmin}
              canCompare={canEdit ||
                (isAdmin && ['CONFIRMED','IN_PRODUCTION','READY_TO_LOAD','ON_HOLD'].includes(status))}
              onRequestCreated={loadChangeRequests} />
          {/if}
        {:else if rightTab === 'readiness'}
          {#if orderId}
            <OrderReadinessAssistant {orderId}
              orderUpdatedAt={orderUpdatedAt}
              canRun={!!$currentUser && can($currentUser, 'editOrder') ||
                (canEdit && !!$currentUser && $currentUser.id === createdBy)} />
          {/if}
        {:else if rightTab === 'intake'}
          {#if orderId}
            <OrderIntakeAssistant {orderId} editable={canEdit} current={intakeCurrent}
              selectedFileId={intakeFileId} onApply={applyIntakeFields} />
          {/if}
        {:else if rightTab === 'files'}
          {#if orderId}
            <OrderFiles {orderId} compact={true} onChanged={refreshFileCount} canUpload={canEdit ||
              (isAdmin && ['CONFIRMED','IN_PRODUCTION','READY_TO_LOAD','ON_HOLD'].includes(status))} />
          {:else}<p class="zone-intro">Loading attachments…</p>{/if}
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

{#if confirmOrderModal}
  <div class="edit-modal-backdrop" onclick={() => confirmOrderModal = false} role="dialog" aria-modal="true" tabindex="-1">
    <div class="edit-modal" onclick={(e) => e.stopPropagation()} role="document">
      <h3>Approve order?</h3>
      <p>This will send the order to production. Verify the client, profiles, files and deadline first.</p>
      <label for="confirm-po">Externally issued PO number (required)</label>
      <input id="confirm-po" bind:value={poNumber} maxlength="16"
        readonly={!canAssignPo && !!poNumber} disabled={!canAssignPo}
        placeholder={canAssignPo ? 'Enter PO from external system' : 'Boss must assign a PO'} />
      {#if !canAssignPo && !poNumber}<p>Ask Boss to assign a PO before confirmation.</p>{/if}
      <div class="edit-modal-actions">
        <button class="action-btn ghost" onclick={() => confirmOrderModal = false}>Cancel</button>
        <button class="action-btn success" onclick={confirmOrder} disabled={confirming || !poNumber.trim()}>
          {confirming ? 'Confirming…' : 'Confirm Order'}
        </button>
      </div>
    </div>
  </div>
{/if}

{#if reworkModal}
  <div class="edit-modal-backdrop" onclick={() => reworkModal = false} role="dialog" aria-modal="true" tabindex="-1">
    <div class="edit-modal" onclick={(e) => e.stopPropagation()} role="document">
      <h3>Request rework</h3>
      <label for="rework-reason-input">Reason for rework request</label>
      <textarea
        id="rework-reason-input"
        bind:value={reworkReason}
        rows="4"
        placeholder="Describe what needs to be changed…"
      ></textarea>
      <div class="edit-modal-actions">
        <button class="action-btn ghost" onclick={() => reworkModal = false}>Cancel</button>
        <button class="action-btn warn" onclick={submitRework} disabled={!reworkReason.trim()}>
          Request Rework
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .order-field-panel{display:grid;gap:12px;padding:13px;overflow-y:auto}
  .order-field-panel>label,.order-profile-edit label{display:grid;gap:5px;font-size:12px}
  .order-field-panel input:not([type="checkbox"]),.order-field-panel textarea,
  .order-field-panel select{width:100%;box-sizing:border-box;background:var(--bg-1);
    color:var(--text);border:1px solid var(--border);border-radius:6px;padding:7px;min-width:0}
  .order-field-panel .checkbox-field{display:flex;gap:8px;align-items:center}
  .order-field-panel h4{margin:8px 0 0}
  .order-profile-edit{display:grid;gap:9px;padding:10px;border:1px solid var(--border);border-radius:8px}

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

  .ctx-tag {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 2px 8px;
    border-radius: 4px;
    background: color-mix(in oklab, var(--brand) 12%, transparent);
    color: var(--brand);
  }

  .ctx-divider {
    width: 1px;
    height: 22px;
    background: var(--border);
    margin: 0 4px;
  }

  .ctx-field {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-muted);
  }

  .ctx-field input,
  .ctx-field select {
    width: 56px;
    height: 26px;
    padding: 2px 6px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg-0);
    color: var(--text);
    font-size: 12px;
    font-family: inherit;
  }
  .ctx-field select { width: 88px; }
  .ctx-field input:focus,
  .ctx-field select:focus { outline: none; border-color: var(--brand); }

  .ctx-btn {
    height: 26px;
    padding: 0 10px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--bg-0);
    color: var(--text);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: background var(--transition-fast), border-color var(--transition-fast);
  }
  .ctx-btn:hover { background: var(--bg-2); border-color: var(--brand); color: var(--brand); }

  .cr-refresh-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--bg-0);
    color: var(--text-muted);
    font-size: 11px;
    cursor: pointer;
    margin-bottom: var(--space-sm);
  }
  .cr-refresh-btn:hover { background: var(--bg-2); color: var(--text); }

  /* ── PDF context menu ────────────────────────────────────────────────────── */
  .pdf-ctx-overlay {
    position: fixed;
    inset: 0;
    z-index: 90;
    background: transparent;
  }
  .pdf-ctx-menu {
    position: fixed;
    z-index: 91;
    min-width: 200px;
    padding: 4px;
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: var(--glass-shadow, 0 8px 24px rgba(0,0,0,0.18));
  }
  .pdf-ctx-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 10px;
    border: none;
    background: transparent;
    color: var(--text);
    font-size: 13px;
    border-radius: 6px;
    cursor: pointer;
    text-align: left;
  }
  .pdf-ctx-item:hover:not(:disabled) {
    background: color-mix(in oklab, var(--brand) 12%, transparent);
    color: var(--brand);
  }
  .pdf-ctx-item:disabled { opacity: 0.6; cursor: not-allowed; }

  .top-bar-actions {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    flex-shrink: 0;
  }


  /* ── R16: guided, responsive order workspace ───────────────────────────── */
  .workspace-flow{
    display:flex;align-items:center;gap:5px;padding:8px 12px;
    border-bottom:1px solid var(--border);background:var(--bg-1);
    flex-shrink:0;overflow-x:auto;scrollbar-width:thin
  }
  .workspace-flow>button{
    display:inline-flex;align-items:center;gap:7px;white-space:nowrap;
    border:1px solid transparent;background:transparent;color:var(--text-muted);
    border-radius:9px;padding:8px 12px;min-height:36px;font-size:12px;
    font-weight:600;cursor:pointer
  }
  .workspace-flow>button:hover{background:var(--bg-2);color:var(--text)}
  .workspace-flow>button.active{background:color-mix(in oklab,var(--brand) 12%,transparent);
    color:var(--brand);border-color:color-mix(in oklab,var(--brand) 27%,transparent)}
  .workspace-phase-icon{display:inline-flex}
  .workspace-inline-summary{display:inline-flex;align-items:center;gap:7px;
    white-space:nowrap;margin-left:auto;color:var(--text-muted);font-size:11px;padding:0 8px}
  .dirty-mark{width:7px;height:7px;border-radius:50%;background:var(--warn,#e89c2d)}
  .workspace-panel-heading{display:flex;justify-content:space-between;align-items:center;
    gap:10px;padding:12px 16px;border-bottom:1px solid var(--border)}
  .workspace-eyebrow{display:block;font-size:10px;letter-spacing:.05em;
    text-transform:uppercase;color:var(--text-muted)}
  .workspace-panel-heading h2{font-size:18px;margin:4px 0 0;line-height:1.3}
  .focus-toggle{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--border);
    border-radius:8px;padding:7px 10px;color:var(--text);background:var(--bg-2);
    cursor:pointer;white-space:nowrap;font-size:12px}
  .nav-count{display:inline-flex;align-items:center;justify-content:center;
    min-width:20px;height:19px;padding:0 5px;border-radius:10px;
    background:var(--bg-2);font-size:10px;font-weight:700}
  .canvas-body.workspace-focused{grid-template-columns:minmax(0,1fr)}
  .workspace-focused .toolbox,.workspace-focused .canvas-area{display:none}
  .workspace-focused .right-docker{grid-column:1/-1;border-left:0}
  .workspace-focused .docker-content{width:100%;max-width:1080px;margin:0 auto;box-sizing:border-box}
  .workspace-focused .order-field-panel{grid-template-columns:repeat(2,minmax(0,1fr));
    gap:16px;padding:18px}
  .workspace-focused .order-field-panel>h4{grid-column:1/-1}
  .workspace-focused .order-profile-edit{min-width:0}
  @media(max-width:980px){
    .top-bar{gap:8px;padding:0 9px}
    .context-bar{display:none}
    .canvas-body:not(.workspace-focused){grid-template-columns:46px minmax(175px,1fr) minmax(285px,42vw)}
    .top-bar-actions .action-btn{padding:7px 9px}
  }
  @media(max-width:720px){
    .top-bar{height:auto;min-height:52px;flex-wrap:wrap;padding:7px 10px;justify-content:space-between}
    .top-bar-actions{flex-wrap:wrap;gap:5px}
    .workspace-flow{padding:6px 8px}
    .workspace-flow>button{padding:7px 9px}
    .workspace-inline-summary{display:none}
    .workspace-focused .order-field-panel{grid-template-columns:minmax(0,1fr)}
    .canvas-body:not(.workspace-focused){grid-template-columns:40px minmax(0,1fr);position:relative}
    .canvas-body:not(.workspace-focused) .right-docker{
      position:absolute;right:0;bottom:0;width:min(90%,360px);
      height:42%;box-shadow:0 -6px 24px rgba(0,0,0,.18)
    }
    .workspace-panel-heading h2{font-size:15px}
    .focus-toggle{font-size:11px}
  }

  /* ── Body: toolbox + canvas + docker ────────────────────────────────────── */
  .canvas-body {
    flex: 1;
    display: grid;
    grid-template-columns: 52px minmax(220px,1fr) minmax(320px,36vw);
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
    display:flex;gap:4px;padding:6px 12px;
    overflow-x:auto;scrollbar-width:thin;flex-shrink:0;
    border-bottom:1px solid var(--border);
  }

  .dtab {
    display:inline-flex;
    align-items:center;justify-content:center;gap:6px;white-space:nowrap;
    padding:9px 12px;border-radius:8px 8px 0 0;min-height:36px;
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
    overflow-y:auto;
    min-height:0;
    padding:var(--space-md);
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

  /* ── Edit page modals ────────────────────────────────────────────────────── */
  .edit-modal-backdrop {
    position: fixed;
    inset: 0;
    background: color-mix(in oklab, black 55%, transparent);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    z-index: 200;
  }
  .edit-modal {
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg, 24px);
    padding: 24px;
    width: 100%;
    max-width: 420px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.36);
  }
  .edit-modal h3 { margin: 0; font-size: 16px; color: var(--text); }
  .edit-modal p, .edit-modal label { margin: 0; font-size: 13px; color: var(--text-muted); }
  .edit-modal textarea {
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg-0);
    color: var(--text);
    font-size: 13px;
    font-family: inherit;
    resize: vertical;
    width: 100%;
    box-sizing: border-box;
  }
  .edit-modal textarea:focus { outline: none; border-color: var(--brand); }
  .edit-modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 4px;
  }
</style>
