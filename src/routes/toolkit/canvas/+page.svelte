<script lang="ts">
  import { onMount } from 'svelte';
  import { t, locale } from 'svelte-i18n';
  import { get } from 'svelte/store';
  import TldrawWrapper from '$lib/components/canvas/TldrawWrapper.svelte';
  import { ideaDefaults, type IdeaKind } from '$lib/components/canvas/idea-model';
  import { starterCards } from '$lib/components/canvas/toolkit-templates';
  import { markdownProjectBrief, briefFileName } from '$lib/components/canvas/toolkit-brief';
  import { extractBoardCards, extractBoardLinks, normalizeProposals, type ProposedCard } from '$lib/components/canvas/toolkit-context';
  import { runShape } from '$lib/components/canvas/node-runner';
  import { importToolkitFiles, placeToolkitAsset, type ToolkitStoredAsset, type ToolkitPosition } from '$lib/components/canvas/toolkit-media-import';
  import { TOOLKIT_SKILLS, boardInsights, normalizeCanvasActions, type CanvasAction, type ToolkitSkill } from '$lib/components/canvas/toolkit-skills';
  import { applyToolkitAction } from '$lib/components/canvas/toolkit-action-executor';

  const tr = (key: string, vars: Record<string, string | number> = {}) => get(t)(`toolkit.${key}`, vars);

  type Board = { id: string; title: string; revision: number; updated_at: string; created_at: string };
  type ChatMessage = { role: 'user' | 'assistant'; content: string };
  type Template = 'blank' | 'project' | 'options' | 'workshop';
  let boards = $state<Board[]>([]);
  let boardId = $state<string | null>(null);
  let boardTitle = $state('Untitled project');
  let initialSnapshot = $state<unknown>(null);
  let messages = $state<ChatMessage[]>([]);
  let suggestions = $state<ProposedCard[]>([]);
  let actionProposals = $state<CanvasAction[]>([]);
  let skill = $state<ToolkitSkill>('explore');
  let researchSources = $state<Array<{title:string;url:string;snippet?:string;provider?:'searxng'|'openrouter'}>>([]);
  let webSearchRequests = $state<number | null>(null);
  let searchNote = $state('');
  let modelChoices = $state<Array<{id:string;label:string;isDefault:boolean}>>([]);
  let selectedModel = $state('');
  let webMode = $state<'searxng' | 'openrouter'>('searxng');
  let paidWebAvailable = $state(false);
  let paidPdfOcrAvailable = $state(false);
  let usePaidPdfOcr = $state(false);
  let mediaVisionModel = $state('');
  let mediaPdfModel = $state('');
  let analyzingFile = $state(false);
  // Short-lived per-project reference notes; never part of shared snapshot.
  let analyzedAssets = $state<Record<string, {kind:string; filename:string; evidence:string; answer:string}>>({});
  let lastAnalyzedAsset = $state<string | null>(null);
  let lastUsedModel = $state('');
  let insecureClipboard = $state(false);
  let legacyThreads = $state<Record<string, Array<{role: string; content: string}>>>({});
  let prompt = $state('');
  let loading = $state(true);
  let saving = $state(false);
  let dirty = $state(false);
  let lastSaved = $state('');
  let error = $state('');
  let notice = $state('');
  let projectListOpen = $state(true);
  let assistantOpen = $state(true);
  let running = $state(false);
  let importing = $state(false);
  let importStatus = $state('');
  let savedFiles = $state<ToolkitStoredAsset[]>([]);
  let savedFilesLoading = $state(false);
  let savedFilesError = $state('');
  let fileInput: HTMLInputElement;
  let selectedTool = $state('select');
  let requesting = $state(false);
  let selectedLabel = $state('');
  let selectedCount = $state(0);
  let editor: any = null;
  let lastSnapshot: unknown = null;
  let ready = false;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let pendingTemplate: Template | null = null;
  let destroyed = false;
  let documentRevision = 0;
  let boardRevision = 0;
  let conflict = $state(false);
  let remoteUpdated = $state(false);
  let discussionDirty = $state(false);
  let discussionSaving = $state(false);
  let discussionError = $state('');
  let discussionRevision = 0;
  let chatTimer: ReturnType<typeof setTimeout> | undefined;
  let saveInFlight: Promise<void> | null = null;
  let chatInFlight: Promise<void> | null = null;
  let refreshTimer: ReturnType<typeof setInterval> | undefined;
  let activeLoadToken = 0;

  const kinds: { kind: IdeaKind; label: string; emoji: string }[] = [
    { kind: 'idea', label: 'Idea', emoji: '✦' },
    { kind: 'research', label: 'Research', emoji: '◈' },
    { kind: 'decision', label: 'Decision', emoji: '◇' },
    { kind: 'task', label: 'Task', emoji: '✓' },
    { kind: 'note', label: 'Note', emoji: '▤' }
  ];
  const prompts: Array<{id: 'expand'|'challenge'|'compare'|'plan'|'research'|'brief'; skill: ToolkitSkill}> = [
    { id: 'expand', skill: 'explore' }, { id: 'challenge', skill: 'critique' },
    { id: 'compare', skill: 'compare' }, { id: 'plan', skill: 'plan' },
    { id: 'research', skill: 'research' }, { id: 'brief', skill: 'summarize' }
  ];
  async function loadModelChoices() {
    try {
      const response = await fetch('/api/toolkit/models', { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      modelChoices = Array.isArray(data.models) ? data.models.filter((v: any) =>
        typeof v?.id === 'string' && typeof v?.label === 'string').slice(0, 9) : [];
      selectedModel = modelChoices.some(m => m.id === selectedModel)
        ? selectedModel : (modelChoices[0]?.id ?? '');
      paidWebAvailable = data.web?.openrouter === true;
      if (!paidWebAvailable) webMode = 'searxng';
      paidPdfOcrAvailable = data.media?.paidOcr === true;
      if (!paidPdfOcrAvailable) usePaidPdfOcr = false;
      mediaVisionModel = typeof data.media?.visionModel === 'string' ? data.media.visionModel : '';
      mediaPdfModel = typeof data.media?.pdfModel === 'string' ? data.media.pdfModel : '';
    } catch { /* Default model and SearXNG remain available on the server. */ }
  }

  function markDirty() {
    if (!boardId) return;
    dirty = true;
    documentRevision++;
    lastSaved = '';
    if (saveTimer) clearTimeout(saveTimer);
    if (!conflict) saveTimer = setTimeout(() => { void saveBoard(); }, 1200);
  }
  function onCanvasChange(value: unknown) {
    lastSnapshot = value;
  }
  function onDocumentChange() {
    if (ready) markDirty();
  }
  function markDiscussionDirty() {
    if (!boardId) return;
    discussionDirty = true;
    discussionRevision++;
    if (chatTimer) clearTimeout(chatTimer);
    chatTimer = setTimeout(() => { void saveDiscussion(); }, 1400);
  }
  async function saveDiscussion(): Promise<void> {
    if (chatInFlight) { await chatInFlight; if (!discussionDirty) return; }
    if (chatTimer) clearTimeout(chatTimer);
    chatTimer = undefined;
    if (!boardId || !discussionDirty) return;
    const id = boardId, rev = discussionRevision;
    const messagesToSave = messages.slice(-60);
    const proposalsToSave = [...suggestions.slice(0, 5), ...actionProposals.slice(0, 3)].slice(0, 8);
    discussionSaving = true;
    chatInFlight = (async () => {
      try {
        const response = await fetch(`/api/toolkit/conversations/${encodeURIComponent(id)}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: messagesToSave, proposals: proposalsToSave })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.message || result.error || tr('errors.privateSave'));
        if (boardId === id) {
          discussionDirty = rev !== discussionRevision;
          discussionError = '';
        }
      } catch (e) {
        if (boardId === id) discussionError = e instanceof Error ? e.message : 'Conversation save failed';
      } finally {
        discussionSaving = false;
      }
    })();
    try { await chatInFlight; } finally { chatInFlight = null; }
  }
  async function saveBoard(): Promise<void> {
    if (saveInFlight) { await saveInFlight; if (!dirty || conflict) return; }
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = undefined;
    if (!boardId || !dirty || conflict) return;
    const id = boardId;
    const rev = documentRevision;
    const expectedRevision = boardRevision;
    const title = boardTitle.trim().slice(0, 120) || 'Untitled project';
    // Private conversations are NEVER written into the shared document.
    // Acquire the in-flight lock BEFORE the asynchronous module import.
    // Otherwise rapid Save clicks can send duplicate PATCH requests.
    saving = true;
    saveInFlight = (async () => {
      try {
        // Always capture the latest document at the moment we save; session
        // camera/selection never belongs in the shared team snapshot.
        if (editor) {
          const { getSnapshot } = await import('@tldraw/tldraw');
          lastSnapshot = { document: getSnapshot(editor.store).document };
        }
        const payload = { version: 1, snapshot: lastSnapshot };
        const response = await fetch(`/api/ai/canvas/${encodeURIComponent(id)}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, payload, revision: expectedRevision })
        });
        const data = await response.json().catch(() => ({}));
        if (response.status === 409) {
          conflict = true;
          remoteUpdated = true;
          throw new Error(tr('errors.newerVersion'));
        }
        if (!response.ok) throw new Error(data.error || tr('errors.save'));
        if (id === boardId) {
          boardRevision = data.canvas.revision;
          dirty = documentRevision !== rev;
          error = '';
          lastSaved = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          boards = boards.map(board => board.id === id
            ? { ...board, title, revision: boardRevision, updated_at: data.canvas.updated_at } : board);
        }
      } catch (e) {
        if (id === boardId) error = e instanceof Error ? e.message : tr('errors.saveFailed');
      } finally {
        saving = false;
      }
    })();
    try { await saveInFlight; } finally { saveInFlight = null; }
    if (dirty && boardId === id && !conflict && !destroyed && !saveTimer) {
      saveTimer = setTimeout(() => { void saveBoard(); }, 3000);
    }
  }
  async function flushCurrentChanges() {
    await saveBoard();
    await saveDiscussion();
    return !dirty && !discussionDirty;
  }
  async function checkBoardRevision() {
    if (!boardId || loading || conflict || dirty || saving || document.hidden) return;
    const id = boardId;
    try {
      const response = await fetch(`/api/ai/canvas/${encodeURIComponent(id)}?meta=1`, { cache: 'no-store' });
      if (!response.ok || boardId !== id) return;
      const data = await response.json();
      if (data.canvas?.revision > boardRevision) remoteUpdated = true;
    } catch { /* Connectivity failure must not discard the editing surface */ }
  }
  async function reloadLatest() {
    await saveDiscussion();
    if (discussionDirty) { discussionError = tr('errors.privateBeforeReload'); return; }
    if (dirty && !confirm(tr('canvas.confirmDiscard'))) return;
    // Reload must not try to re-save the known stale revision.
    if (saveTimer) clearTimeout(saveTimer);
    dirty = false; conflict = false; remoteUpdated = false;
    const id = boardId;
    if (id) { boardId = null; await openBoard(id); }
  }
  async function saveRecoveryCopy() {
    if (!boardId) return;
    if (chatTimer) clearTimeout(chatTimer);
    await saveDiscussion();
    if (discussionDirty) return;
    try {
      const title = `${boardTitle.trim() || 'Untitled'} — recovered copy`.slice(0, 120);
      const response = await fetch('/api/ai/canvas', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, payload: { version: 1, snapshot: lastSnapshot } })
      });
      const data = await response.json();
      if (!response.ok || !data.canvas?.id) throw new Error(tr('errors.recoverySave'));
      boards = [data.canvas, ...boards];
      const privateCopy = await fetch(`/api/toolkit/conversations/${encodeURIComponent(data.canvas.id)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: messages.slice(-60),
          proposals: [...suggestions.slice(0, 5), ...actionProposals.slice(0, 3)] })
      });
      if (!privateCopy.ok) {
        discussionError = tr('errors.privateCopy');
      }
      if (saveTimer) clearTimeout(saveTimer);
      dirty = false; conflict = false; remoteUpdated = false;
      boardId = null;
      await openBoard(data.canvas.id);
      notice = tr('errors.recoveryDone');
    } catch (e) { error = e instanceof Error ? e.message : tr('errors.recoveryFailed'); }
  }
  async function loadBoards() {
    loading = true;
    try {
      const response = await fetch('/api/ai/canvas', { cache: 'no-store' });
      if (!response.ok) throw new Error(tr('errors.load'));
      const data = await response.json();
      boards = Array.isArray(data.items) ? data.items : [];
      if (boards.length) await openBoard(boards[0].id);
    } catch (e) {
      error = e instanceof Error ? e.message : tr('errors.listUnavailable');
    } finally { loading = false; }
  }
  async function openBoard(id: string) {
    if (importing) { notice = tr('canvas.loadingNotice'); return; }
    if (id === boardId && ready) return;
    if ((dirty || discussionDirty) && !(await flushCurrentChanges())) {
      error = tr('errors.beforeSwitch');
      return;
    }
    const token = ++activeLoadToken;
    loading = true;
    ready = false;
    editor = null;
    messages = [];
    suggestions = [];
    actionProposals = [];
    researchSources = [];
    webSearchRequests = null;
    searchNote = '';
    lastUsedModel = '';
    analyzedAssets = {};
    lastAnalyzedAsset = null;
    analyzingFile = false;
    legacyThreads = {};
    savedFiles = [];
    savedFilesError = '';
    prompt = '';
    selectedLabel = '';
    selectedCount = 0;
    try {
      const [response, privateResponse] = await Promise.all([
        fetch(`/api/ai/canvas/${encodeURIComponent(id)}`, { cache: 'no-store' }),
        fetch(`/api/toolkit/conversations/${encodeURIComponent(id)}`, { cache: 'no-store' })
      ]);
      if (!response.ok) throw new Error(tr('errors.open'));
      if (!privateResponse.ok) throw new Error(tr('errors.loadPrivate'));
      const data = await response.json();
      const privateData = await privateResponse.json();
      if (token !== activeLoadToken) return;
      const doc = data.canvas;
      if (!doc) throw new Error(tr('errors.notFound'));
      boardTitle = doc.title || 'Untitled project';
      const payload = doc.payload && typeof doc.payload === 'object' ? doc.payload : {};
      initialSnapshot = payload.snapshot ?? (payload.store ? payload : null);
      lastSnapshot = initialSnapshot;
      boardRevision = Number.isSafeInteger(doc.revision) ? doc.revision : 0;
      suggestions = normalizeProposals(privateData.proposals);
      actionProposals = normalizeCanvasActions(privateData.proposals);
      legacyThreads = privateData.legacyThreads && typeof privateData.legacyThreads === 'object' && !Array.isArray(privateData.legacyThreads)
        ? Object.fromEntries(Object.entries(privateData.legacyThreads).slice(0, 30)
          .filter(([,v]) => Array.isArray(v)).map(([k,v]) => [k, (v as any[])
            .slice(-30).filter(m => m && ['user','assistant'].includes(m.role) && typeof m.content === 'string')
            .map(m => ({ role: m.role, content: m.content.slice(0, 5000) }))])) : {};
      messages = Array.isArray(privateData.messages)
        ? privateData.messages.slice(-60).filter((m: any) => m && ['user','assistant'].includes(m.role) &&
            typeof m.content === 'string').map((m: any) => ({ role: m.role, content: m.content.slice(0, 5000) }))
        : [];
      boardId = id;
      void loadSavedFiles(id);
      dirty = false;
      discussionDirty = false;
      conflict = false;
      remoteUpdated = false;
      discussionError = '';
      lastSaved = '';
      error = '';
      documentRevision = 0;
      discussionRevision = 0;
    } catch (e) {
      if (token === activeLoadToken) {
        boardId = null;
        initialSnapshot = null;
        lastSnapshot = null;
        error = e instanceof Error ? e.message : tr('errors.openFailed');
      }
    } finally {
      if (token === activeLoadToken) loading = false;
    }
  }
  async function createBoard(template: Template = 'blank') {
    if (importing) { notice = tr('canvas.newProjectNotice'); return; }
    if ((dirty || discussionDirty) && !(await flushCurrentChanges())) {
      error = tr('errors.beforeCreate');
      return;
    }
    const labels: Record<Template, string> = {
      blank: tr('canvas.templateBlank'), project: tr('canvas.templateProject'),
      options: tr('canvas.templateOptions'), workshop: tr('canvas.templateWorkshop')
    };
    error = '';
    try {
      const response = await fetch('/api/ai/canvas', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: labels[template], payload: { version: 1, snapshot: null } })
      });
      const data = await response.json();
      if (!response.ok || !data.canvas?.id) throw new Error(data.error || tr('errors.create'));
      boards = [data.canvas, ...boards];
      pendingTemplate = template;
      await openBoard(data.canvas.id);
      projectListOpen = false;
    } catch (e) {
      error = e instanceof Error ? e.message : tr('errors.createFailed');
    }
  }
  function addCard(kind: IdeaKind, title?: string, body?: string, x?: number, y?: number) {
    if (!editor) return;
    const center = editor.getViewportPageBounds().center;
    editor.createShape({
      type: 'idea-card',
      x: x ?? center.x - 145,
      y: y ?? center.y - 112,
      props: { ...ideaDefaults(kind), ...(title ? { title } : {}), ...(body ? { body } : {}) }
    });
  }
  function seed(template: Template) {
    if (!editor || template === 'blank') return;
    const c = editor.getViewportPageBounds().center;
    const x = c.x - 470, y = c.y - 240;
    const items = starterCards(template, $locale);
    for (const [kind, title, body, dx, dy] of items) addCard(kind, title, body, x + dx, y + dy);
    editor.zoomToFit?.();
  }
  function onEditorReady(value: any) {
    editor = value;
    ready = true;
    updateSelectionSummary();
    if (pendingTemplate) {
      const template = pendingTemplate;
      pendingTemplate = null;
      if (template !== 'blank') {
        seed(template);
        // CanvasApp listens for document changes and captures a debounced,
        // non-deprecated document snapshot. Do not serialize inside every edit.
        markDirty();
      }
    }
  }
  function setArrowTool() { editor?.setCurrentTool('arrow'); }
  function undo() { editor?.undo(); }
  function redo() { editor?.redo(); }
  function zoomToContent() { editor?.zoomToFit?.(); }
  function updateSelectionSummary() {
    const selected = editor?.getSelectedShapeIds?.() ?? [];
    selectedCount = selected.length;
    selectedLabel = selected.length ? tr('canvas.selected', { count: selected.length }) : tr('canvas.wholeBoard');
  }
  function deleteSelection() {
    const selected = editor?.getSelectedShapeIds?.() ?? [];
    if (selected.length) editor?.deleteShapes?.(selected);
    updateSelectionSummary();
  }
  function getContext() {
    if (!editor) return { cards: [], focusId: '' };
    const all = editor.getCurrentPageShapes?.() ?? [];
    const selected = editor.getSelectedShapeIds?.() ?? [];
    const cards = extractBoardCards(all);
    const links = extractBoardLinks(all, (arrowId) => editor.getBindingsFromShape?.(arrowId, 'arrow') ?? []);
    const relevantTypes = new Set([
      'document', 'material-swatch', 'web-search', 'crawl',
      'lumigrid', 'led-strip', 'led-matrix', 'boxletter', 'maker'
    ]);
    const visualAssets = all.filter((shape: any) => relevantTypes.has(shape.type))
      .sort((a: any, b: any) => Number(selected.includes(b.id)) - Number(selected.includes(a.id)))
      .slice(0, 16).map((shape: any) => {
        const props = shape.props ?? {};
        let context = '';
        if (shape.type === 'document') {
          const analyzed = typeof props.fileId === 'string' ? analyzedAssets[props.fileId] : undefined;
          context = props.kind === 'note'
            ? String(props.content ?? '').slice(0, 1400)
            : analyzed
              ? (analyzed.evidence
                ? 'EXTRACTED PDF TEXT (provider-reported; untrusted source material):\n' + analyzed.evidence
                : 'MODEL IMAGE/DOCUMENT INTERPRETATION (not independently verified):\n' + analyzed.answer).slice(0, 1400)
              : props.kind === 'pdf' ? 'PDF preview only. Text has not been extracted.'
              : props.kind === 'image' ? 'Image preview only. Image pixels were not sent to AI.' : '';
        } else if (shape.type === 'web-search') {
          context = (props.output?.hits ?? []).slice(0, 3)
            .map((hit: any) => [hit.title, hit.url, hit.snippet].join(' — ')).join('\n').slice(0, 1400);
        } else if (shape.type === 'crawl') {
          context = [props.output?.final_url, props.output?.title, props.output?.text]
            .filter(Boolean).join('\n').slice(0, 1400);
        } else if (props.output) {
          context = JSON.stringify(props.output).slice(0, 1400);
        }
        return {
          id: String(shape.id).slice(0, 100),
          title: String(props.title ?? shape.type).slice(0, 120),
          kind: String(props.kind ?? shape.type).slice(0, 32),
          context
        };
      });
    selectedCount = selected.length;
    selectedLabel = selected.length ? tr('canvas.selected', { count: selected.length }) : tr('canvas.wholeBoard');
    return { cards, links, visualAssets, focusId: String(selected[0] ?? '') };
  }
  async function brainstorm(question = prompt, requestedSkill: ToolkitSkill = skill) {
    const text = question.trim();
    if (!text || requesting || !editor) return;
    requesting = true;
    skill = requestedSkill;
    notice = '';
    searchNote = '';
    const activeBoardId = boardId;
    const context = getContext();
    const history = messages.slice(-10);
    messages = [...messages, { role: 'user' as const, content: text }].slice(-60);
    prompt = '';
    suggestions = [];
    actionProposals = [];
    researchSources = [];
    webSearchRequests = null;
    markDiscussionDirty();
    try {
      const response = await fetch('/api/toolkit/brainstorm', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
           prompt: text, ...context, history, skill: requestedSkill, language: $locale,
           model: selectedModel || undefined,
           webMode: requestedSkill === 'research' ? webMode : 'searxng'
         })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || tr('canvas.noSuggestions'));
      // A switch or deletion while the provider was working must never write its
      // response into a different project's personal discussion.
      if (boardId !== activeBoardId || destroyed) return;
      lastUsedModel = typeof data.model === 'string' ? data.model : '';
      webSearchRequests = Number.isSafeInteger(data.webSearchRequests) && data.webSearchRequests >= 0 ? data.webSearchRequests : null;
      searchNote = typeof data.searchNote === 'string' ? data.searchNote.slice(0, 500) : '';
      messages = [...messages, { role: 'assistant' as const, content: String(data.reply ?? '').slice(0, 5000) }].slice(-60);
      suggestions = normalizeProposals(data.cards).slice(0, 5);
      actionProposals = normalizeCanvasActions(data.actions,
        new Set(context.cards.map(c => c.id)));
      researchSources = Array.isArray(data.sources)
        ? data.sources.filter((v: any) => typeof v?.url === 'string' &&
          /^https?:\/\//.test(v.url)).slice(0, 5).map((v: any) => ({
            title: String(v.title ?? '').slice(0, 180), url: v.url,
            snippet: String(v.snippet ?? '').slice(0, 320),
            provider: v.provider === 'openrouter' ? 'openrouter' : 'searxng'
          })) : [];
      markDiscussionDirty();
    } catch (e) {
      if (boardId !== activeBoardId || destroyed) return;
      notice = e instanceof Error ? e.message : tr('canvas.noBrainstorm');
      // Retain the prompt in the conversation so the user can retry or copy it.
    } finally { requesting = false; }
  }
  async function analyzeSelectedAsset() {
    if (!editor || !boardId || analyzingFile || requesting) return;
    const selection = editor.getSelectedShapes?.() ?? [];
    const document = selection.find((shape: any) => shape?.type === 'document'
      && ['image', 'pdf'].includes(shape.props?.kind) && typeof shape.props?.fileId === 'string');
    if (!document) { notice = tr('canvas.selectFileForAi'); return; }
    const fileId = String(document.props.fileId);
    const paidOcr = document.props.kind === 'pdf' && usePaidPdfOcr;
    if (paidOcr && !confirm(tr('canvas.confirmPaidOcr'))) return;
    // One consent must never silently authorize a later paid OCR request.
    usePaidPdfOcr = false;
    const originalBoard = boardId, token = activeLoadToken;
    const filename = String(document.props.title ?? '').slice(0, 120);
    const customQuestion = prompt.trim();
    const question = customQuestion || tr('canvas.defaultFileQuestion');
    analyzingFile = true;
    notice = '';
    const content = tr('canvas.fileAnalysisQuestion', { name: filename, question });
    messages = [...messages, { role: 'user' as const, content }].slice(-60);
    prompt = '';
    markDiscussionDirty();
    try {
      const response = await fetch('/api/toolkit/analyze-asset', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boardId: originalBoard, assetId: fileId, question,
          language: $locale, ocr: paidOcr
        })
      });
      const result = await response.json().catch(() => ({}));
      if (boardId !== originalBoard || token !== activeLoadToken || destroyed) return;
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : (result.error?.message || result.message || tr('canvas.fileAnalysisFailed')));
      const reply = typeof result.reply === 'string' ? result.reply.slice(0, 5000) : '';
      if (!reply) throw new Error(tr('canvas.fileAnalysisFailed'));
      // This is a private user-session cache only. Sharing an insight onto
      // the team board requires the explicit "save answer" action.
      analyzedAssets = {
        ...analyzedAssets,
        [fileId]: {
          kind: result.kind === 'pdf' ? 'pdf' : 'image',
          filename, evidence: String(result.evidence ?? '').slice(0, 6000),
          answer: reply
        }
      };
      lastAnalyzedAsset = fileId;
      lastUsedModel = String(result.model ?? '').slice(0, 160);
      messages = [...messages, { role: 'assistant' as const, content: reply }].slice(-60);
      markDiscussionDirty();
      notice = tr(result.evidence ? 'canvas.pdfTextReady' : 'canvas.fileReasoningReady');
    } catch (e) {
      if (boardId !== originalBoard || token !== activeLoadToken || destroyed) return;
      notice = e instanceof Error ? e.message : tr('canvas.fileAnalysisFailed');
    } finally {
      if (boardId === originalBoard && token === activeLoadToken) analyzingFile = false;
    }
  }

  function pinFileAnalysis() {
    if (!editor || !boardId || conflict || remoteUpdated || !lastAnalyzedAsset) return;
    const record = analyzedAssets[lastAnalyzedAsset];
    if (!record) return;
    // Deliberate publishing step: the source file stays private in Supabase;
    // only an explicitly chosen bounded summary goes into the shared Canvas.
    const summary = [
      tr('canvas.modelInterpretationLabel'),
      record.answer,
      ...(record.evidence ? [tr('canvas.parsedEvidenceLabel'), record.evidence] : [])
    ].join('\n\n').slice(0, 1200);
    addCard('research', tr('canvas.fileAnalysisCardTitle', { name: record.filename }), summary);
    notice = tr('canvas.savedToCanvas');
  }

  function captureAnswer() {
    if (!editor || !boardId || conflict || remoteUpdated) return;
    const reply = [...messages].reverse().find(message => message.role === 'assistant')?.content;
    if (!reply) return;
    addCard('note', tr('canvas.answerCard'), reply.slice(0, 1200));
    notice = tr('canvas.savedToCanvas');
  }

  function pinResearchSource(source: {title:string;url:string;snippet?:string}) {
    if (!editor || !boardId || conflict || remoteUpdated) return;
    let target: URL;
    try {
      target = new URL(source.url);
      if (!['https:', 'http:'].includes(target.protocol) || target.username || target.password) return;
    } catch { return; }
    addCard('research', source.title.slice(0, 100) || target.hostname,
      [source.url, source.snippet ?? ''].filter(Boolean).join('\n\n').slice(0, 1200));
    notice = tr('canvas.savedToCanvas');
  }

  function inspectResearchSource(source: {title:string;url:string}) {
    if (!editor || !boardId || conflict || remoteUpdated) return;
    let url: URL;
    try {
      url = new URL(source.url);
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return;
    } catch { return; }
    // This only places a URL into a node; the user must explicitly run
    // the crawler. The server revalidates DNS/IP and blocks private targets.
    const center = editor.getViewportPageBounds().center;
    editor.createShape({
      type: 'crawl', x: center.x - 170, y: center.y - 170,
      props: { url: source.url, selector: '', includeLinks: false, maxChars: 12000 }
    });
    notice = tr('canvas.inspectAdded');
  }

  function arrangeIdeas() {
    if (!editor || !boardId || conflict || remoteUpdated) return;
    if (!confirm(tr('canvas.confirmArrange'))) return;
    const result = applyToolkitAction(editor,
      { kind: 'layout', layout: 'columns', reason: 'Explicit user command' });
    notice = result.detail;
  }

  function exportBrief() {
    if (!editor || !boardId) return;
    const { cards, links } = getContext();
    const markdown = markdownProjectBrief(boardTitle, cards, links ?? [], researchSources);
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = briefFileName(boardTitle);
    anchor.click();
    // Delay revoke until after the browser starts the download.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function auditBoard() {
    if (!editor || !boardId) return;
    const { cards, links } = getContext();
    const report = boardInsights(cards, links);
    const text = [
      tr('canvas.auditLine', { cards: report.totalCards, links: report.connections }),
      tr('canvas.auditTasks', { count: report.unfinishedTasks }),
      tr(report.hasDecision ? 'canvas.auditDecision' : 'canvas.auditMissingDecision'),
      report.disconnected.length
        ? tr('canvas.auditUnconnected', { names: report.disconnected.map(card => card.title).join(', ') })
        : tr('canvas.auditAllConnected'),
      report.cardsMissingDetails.length
        ? tr('canvas.auditMissingDetails', { names: report.cardsMissingDetails.join(', ') })
        : tr('canvas.auditAllDetailed')
    ].join('\n');
    messages = [...messages, { role: 'assistant' as const, content: text.slice(0, 5000) }].slice(-60);
    markDiscussionDirty();
    notice = tr('canvas.auditDone');
  }
  function applySuggestion(card: ProposedCard, index: number) {
    if (!editor) return;
    const c = editor.getViewportPageBounds().center;
    addCard(card.kind, card.title, card.body, c.x + (index % 2) * 320 - 300, c.y + Math.floor(index / 2) * 245 - 110);
    suggestions = suggestions.filter(s => s !== card);
    markDiscussionDirty();
    notice = tr('canvas.savedToCanvas');
  }
  function applyAll() {
    const batch = [...suggestions];
    batch.forEach((card, index) => applySuggestion(card, index));
    suggestions = [];
  }
  function actionTargetName(id: string) {
    const shape = editor?.getShape?.(id);
    return String(shape?.props?.title ?? id).slice(0, 70);
  }
  function approveAction(action: CanvasAction) {
    if (!editor || !boardId) return;
    if (conflict || remoteUpdated) {
      notice = tr('errors.reloadBeforeApply');
      return;
    }
    if (action.kind === 'layout' &&
        !confirm(tr('canvas.confirmArrange'))) return;
    try {
      const result = applyToolkitAction(editor, action);
      notice = result.detail;
      if (result.ok) {
        actionProposals = actionProposals.filter(candidate => candidate !== action);
        markDiscussionDirty();
      }
    } catch (e) {
      notice = e instanceof Error ? e.message : tr('errors.applyFailed');
    }
  }
  async function runSelectedTechnical() {
    if (!editor || running) return;
    const selected = editor.getSelectedShapeIds?.() ?? [];
    if (!selected.length) { notice = tr('canvas.selectedToolFirst'); return; }
    running = true;
    try {
      let done = 0;
      for (const id of selected) { await runShape(editor, id); done++; }
      notice = tr('canvas.technicalCount', { count: done });
    } catch (e) { notice = e instanceof Error ? e.message : tr('errors.toolFailed'); }
    finally { running = false; }
  }
  function addTechnical(type: string) {
    if (!editor) return;
    const center = editor.getViewportPageBounds().center;
    editor.createShape({ type, x: center.x - 180, y: center.y - 120 });
  }
  function drawTool(tool: string) {
    if (!editor) return;
    editor.setCurrentTool(tool);
    selectedTool = tool;
  }
  function addMaterial(preset: string = 'brushed-metal', textureUrl?: string) {
    if (!editor) return;
    const center = editor.getViewportPageBounds().center;
    editor.createShape({ type: 'material-swatch', x: center.x - 145, y: center.y - 106,
      props: { w: 290, h: 212, title: preset === 'photo' ? tr('canvas.materialPhoto')
        : preset.replaceAll('-', ' '), preset, tint: '#ffffff', opacity: 100,
        ...(textureUrl ? { textureUrl } : {}) } });
  }
  function createPhotoMaterial() {
    if (!editor) return;
    const selected = (editor.getSelectedShapes?.() ?? []) as Array<{type:string; props:any}>;
    const image = selected.find(shape => shape.type === 'document' &&
      shape.props?.kind === 'image' && typeof shape.props?.url === 'string');
    if (!image) { notice = tr('canvas.selectedImageFirst'); return; }
    addMaterial('photo', image.props.url);
  }
  async function loadSavedFiles(id: string) {
    if (!id || !boardId || boardId !== id) return;
    savedFilesLoading = true;
    savedFilesError = '';
    try {
      const response = await fetch(`/api/toolkit/assets/${encodeURIComponent(id)}/library`,
        { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(
        typeof data.error === 'string' ? data.error : tr('canvas.savedFilesError'));
      if (boardId !== id || destroyed) return;
      savedFiles = Array.isArray(data.files)
        ? data.files.filter((a: any) => a && typeof a.id === 'string' &&
            typeof a.fileName === 'string' && typeof a.mime === 'string' &&
            Number.isSafeInteger(a.bytes)).slice(0, 100)
        : [];
    } catch (e) {
      if (boardId === id && !destroyed) {
        savedFilesError = e instanceof Error ? e.message : tr('canvas.savedFilesError');
      }
    } finally {
      if (boardId === id) savedFilesLoading = false;
    }
  }
  function reattachSavedFile(file: ToolkitStoredAsset) {
    if (!editor || !boardId || conflict || remoteUpdated || importing) return;
    const exists = (editor.getCurrentPageShapes?.() ?? []).some((shape: any) =>
      shape.type === 'document' && shape.props?.fileId === file.id);
    if (exists) { notice = tr('canvas.fileAlreadyOnBoard'); return; }
    try {
      placeToolkitAsset(editor, boardId, file);
      notice = tr('canvas.savedFileAttached');
    } catch (e) {
      notice = e instanceof Error ? e.message : tr('canvas.savedFilesError');
    }
  }

  async function importFiles(files: File[], point?: ToolkitPosition) {
    if (!boardId || !editor || importing || !files.length) return;
    importing = true;
    const activeEditor = editor, id = boardId;
    importStatus = 'Preparing files…';
    try {
      const result = await importToolkitFiles(activeEditor, id, files, point,
        message => { if (boardId === id) importStatus = message; });
      if (boardId === id) await loadSavedFiles(id);
      if (result.errors.length) {
        notice = result.errors.slice(0, 3).join(' | ');
        if (result.imported === 0) error = notice;
      } else {
        notice = tr('canvas.addedCount', { count: result.imported });
      }
    } catch (e) {
      error = e instanceof Error ? e.message : tr('canvas.importError');
    } finally {
      importing = false;
      importStatus = '';
    }
  }
  function onFileSelected() {
    const files = Array.from(fileInput?.files ?? []);
    if (fileInput) fileInput.value = '';
    void importFiles(files);
  }
  async function removeBoard(id: string) {
    if (importing) { notice = tr('canvas.deleteWait'); return; }
    if (!confirm(tr('canvas.confirmDelete'))) return;
    if (id === boardId && (dirty || discussionDirty) && !(await flushCurrentChanges())) {
      error = tr('errors.beforeDelete');
      return;
    }
    try {
      const response = await fetch(`/api/ai/canvas?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(tr('errors.delete'));
      boards = boards.filter(b => b.id !== id);
      if (id === boardId) {
        boardId = null; ready = false; editor = null; initialSnapshot = null;
        lastSnapshot = null; messages = []; suggestions = []; dirty = false; discussionDirty = false;
        conflict = false; remoteUpdated = false;
        if (boards.length) await openBoard(boards[0].id);
      }
    } catch (e) { error = e instanceof Error ? e.message : tr('errors.deleteFailed'); }
  }

  onMount(() => {
    insecureClipboard = !window.isSecureContext || !navigator.clipboard?.writeText;
    void loadModelChoices();
    void loadBoards();
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty || discussionDirty || importing) { e.preventDefault(); e.returnValue = ''; }
    };
    const onFocus = () => { void checkBoardRevision(); };
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('focus', onFocus);
    refreshTimer = setInterval(() => { void checkBoardRevision(); }, 45_000);
    return () => {
      destroyed = true;
      if (saveTimer) clearTimeout(saveTimer);
      if (chatTimer) clearTimeout(chatTimer);
      if (refreshTimer) clearInterval(refreshTimer);
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('focus', onFocus);
    };
  });
</script>

<svelte:head><title>{$t('toolkit.canvasTab')} · {$t('toolkit.title')}</title></svelte:head>

<div class="workspace">
  <header class="command-bar">
    <div class="workspace-title">
      <button class="icon-toggle" type="button" onclick={() => projectListOpen = !projectListOpen}
        aria-label={$t('toolkit.canvas.projects')} aria-expanded={projectListOpen}>☰</button>
      {#if boardId}
        <input class="board-title" aria-label={$t('toolkit.canvas.boardTitle', { default: 'Project title' })} maxlength="120" bind:value={boardTitle} oninput={markDirty} />
      {:else}<h2>{$t('toolkit.canvas.noBoard')}</h2>{/if}
      <span class="save-indicator" role="status" aria-live="polite">
        {#if saving || discussionSaving}{$t('toolkit.canvas.saving')}{:else if conflict}{$t('toolkit.canvas.conflict')}{:else if dirty || discussionDirty}{$t('toolkit.canvas.unsaved')}{:else if lastSaved}{$t('toolkit.canvas.saved')} {lastSaved}{:else if boardId}{$t('toolkit.canvas.upToDate')}{/if}
      </span>
    </div>
    <div class="command-actions">
      <span class="team-label" title={$t('toolkit.canvas.sharedTitle')}>{$t('toolkit.canvas.shared')}</span>
      <button onclick={() => createBoard('blank')}>{$t('toolkit.canvas.newProject')}</button>
      <button onclick={() => void flushCurrentChanges()} disabled={!boardId || saving || ( !dirty && !discussionDirty ) || conflict}>{$t('toolkit.canvas.save')}</button>
      <button onclick={arrangeIdeas} disabled={!boardId || !editor || conflict || remoteUpdated}>{$t('toolkit.canvas.arrangeIdeas')}</button>
      <button onclick={exportBrief} disabled={!boardId || !editor}>{$t('toolkit.canvas.exportBrief')}</button>
      <button class="assistant-toggle" type="button" onclick={() => assistantOpen = !assistantOpen} aria-expanded={assistantOpen}>
        {assistantOpen ? $t('toolkit.canvas.hideAssistant') : $t('toolkit.canvas.brainstorm')}
      </button>
    </div>
  </header>

  {#if error}<div class="workspace-alert" role="alert"><span>{error}</span>
    {#if conflict}<button onclick={saveRecoveryCopy}>{$t('toolkit.canvas.saveCopy')}</button>
      <button onclick={reloadLatest}>{$t('toolkit.canvas.reloadLatest')}</button>
    {:else}<button onclick={() => { error = ''; if (boardId) void flushCurrentChanges(); else void loadBoards(); }}>{$t('toolkit.canvas.retry')}</button>{/if}
  </div>{/if}
  {#if remoteUpdated && !conflict && !dirty}
    <div class="remote-banner" role="status"><span>{$t('toolkit.canvas.remote')}</span>
      <button onclick={reloadLatest}>{$t('toolkit.canvas.viewLatest')}</button>
    </div>
  {/if}
  {#if discussionError}
    <div class="private-banner" role="alert"><span>{$t('toolkit.canvas.privateError')} {discussionError}</span>
      <button onclick={() => void saveDiscussion()}>{$t('toolkit.canvas.retryPrivate')}</button>
    </div>
  {/if}

  <div class="panes">
    {#if projectListOpen}
      <aside class="library">
        <div class="pane-heading"><h3>{$t('toolkit.canvas.projects')}</h3><span>{boards.length}</span></div>
        <button class="new-project" onclick={() => createBoard('blank')}>{$t('toolkit.canvas.blankProject')}</button>
        <div class="templates">
          <span class="small-heading">{$t('toolkit.canvas.quickStart')}</span>
          <button onclick={() => createBoard('project')}>{$t('toolkit.canvas.projectConcept')}</button>
          <button onclick={() => createBoard('options')}>{$t('toolkit.canvas.compareOptions')}</button>
          <button onclick={() => createBoard('workshop')}>{$t('toolkit.canvas.workshopConcept')}</button>
        </div>
        <div class="project-list">
          {#if loading && !boards.length}<p class="muted">{$t('toolkit.canvas.loadingProjects')}</p>{/if}
          {#each boards as b (b.id)}
            <div class="project-entry" class:active={boardId === b.id}>
              <button class="project-open" onclick={() => openBoard(b.id)}
                aria-current={boardId === b.id ? 'true' : undefined}>
                <strong>{b.title}</strong>
                <span>{new Date(b.updated_at).toLocaleDateString($locale === 'ru' ? 'ru-RU' : $locale === 'lv' ? 'lv-LV' : 'en-GB')}</span>
              </button>
              <button class="delete" title={$t('toolkit.canvas.deleteProject', { title: b.title })} aria-label={$t('toolkit.canvas.deleteProject', { title: b.title })} onclick={() => removeBoard(b.id)}>×</button>
            </div>
          {/each}
        </div>
        {#if boardId}
          <details class="saved-file-library">
            <summary>{$t('toolkit.canvas.savedFiles')} ({savedFiles.length})</summary>
            <p>{$t('toolkit.canvas.savedFilesHelp')}</p>
            <button onclick={() => { if (boardId) void loadSavedFiles(boardId); }} disabled={savedFilesLoading || importing}>
              {savedFilesLoading ? $t('toolkit.canvas.loadingProjects') : $t('toolkit.canvas.refreshSavedFiles')}
            </button>
            {#if savedFilesError}<p role="alert">{savedFilesError}</p>{/if}
            <div class="saved-file-list">
              {#each savedFiles as asset (asset.id)}
                <button title={asset.fileName} onclick={() => reattachSavedFile(asset)}
                  disabled={!editor || conflict || remoteUpdated || importing}>
                  <span aria-hidden="true">{asset.mime === 'application/pdf' ? '📄' : '🖼️'}</span>
                  <span>{asset.fileName}</span>
                </button>
              {/each}
              {#if !savedFiles.length && !savedFilesLoading}
                <p>{$t('toolkit.canvas.noSavedFiles')}</p>
              {/if}
            </div>
          </details>
        {/if}
        <p class="library-tip">{$t('toolkit.canvas.sharingHelp')}</p>
      </aside>
    {/if}

    <section class="board-area" aria-label={$t('toolkit.canvas.canvasLabel')}>
      {#if boardId && !loading}
        <div class="node-toolbar">
          <span class="small-heading">{$t('toolkit.canvas.compose')}</span>
          <input class="file-input" bind:this={fileInput} type="file" multiple
            accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,.pdf"
            aria-label={$t('toolkit.canvas.chooseFiles')} onchange={onFileSelected} />
          <button class="import-button" onclick={() => fileInput?.click()} disabled={importing}>
            {importing ? $t('toolkit.canvas.importing') : $t('toolkit.canvas.addFiles')}
          </button>
          <span class="toolbar-separator" aria-hidden="true"></span>
          {#each [
            { tool: 'select', title: $t('toolkit.draw.selectTitle'), label: $t('toolkit.draw.select') },
            { tool: 'draw', title: $t('toolkit.draw.drawTitle'), label: $t('toolkit.draw.draw') },
            { tool: 'highlight', title: $t('toolkit.draw.highlightTitle'), label: $t('toolkit.draw.highlight') },
            { tool: 'geo', title: $t('toolkit.draw.geoTitle'), label: $t('toolkit.draw.geo') },
            { tool: 'text', title: $t('toolkit.draw.textTitle'), label: $t('toolkit.draw.text') },
            { tool: 'eraser', title: $t('toolkit.draw.eraserTitle'), label: $t('toolkit.draw.eraser') }
          ] as drawing}
            <button title={drawing.title} class:chosen={selectedTool === drawing.tool}
              aria-pressed={selectedTool === drawing.tool}
              onclick={() => drawTool(drawing.tool)}>{drawing.label}</button>
          {/each}
          <span class="toolbar-separator" aria-hidden="true"></span>
          <span class="small-heading">{$t('toolkit.canvas.ideas')}</span>
          {#each kinds as item (item.kind)}
            <button title={$t('toolkit.canvas.addKind', { kind: $t(`toolkit.kind.${item.kind}`) })} onclick={() => addCard(item.kind)}>
              <span>{item.emoji}</span> {$t(`toolkit.kind.${item.kind}`)}
            </button>
          {/each}
          <button onclick={() => { setArrowTool(); selectedTool = 'arrow'; }}
            title={$t('toolkit.canvas.connectTitle')}>{$t('toolkit.canvas.connect')}</button>
          <details class="advanced-tools">
            <summary>{$t('toolkit.canvas.materials')}</summary>
            <div class="advanced-menu" role="group" aria-label={$t('toolkit.canvas.materialRefs')}>
              {#each ['brushed-metal','matte','frosted-acrylic','wood-grain','concrete','patina','mesh'] as material}
                <button onclick={() => addMaterial(material)}>{$t(`toolkit.nodes.materialPresets.${material}`)}</button>
              {/each}
              <button onclick={createPhotoMaterial}>{$t('toolkit.canvas.fromImage')}</button>
            </div>
          </details>
          <span class="toolbar-separator" aria-hidden="true"></span>
          <button onclick={undo} title={$t('toolkit.canvas.undo')} aria-label={$t('toolkit.canvas.undoTitle')}>↶</button>
          <button onclick={redo} title={$t('toolkit.canvas.redo')} aria-label={$t('toolkit.canvas.redoTitle')}>↷</button>
          <button onclick={zoomToContent} title={$t('toolkit.canvas.fitTitle')}>{$t('toolkit.canvas.fit')}</button>
          <button onclick={deleteSelection} title={$t('toolkit.canvas.deleteSelected')}>{$t('toolkit.canvas.deleteSelected')}</button>
          <details class="advanced-tools">
            <summary>{$t('toolkit.canvas.technical')}</summary>
            <div class="advanced-menu">
              {#each [{ type: 'web-search', name: $t('toolkit.nodes.techWeb') }, { type: 'crawl', name: $t('toolkit.nodes.techCrawl') },
                { type: 'lumigrid', name: 'LumiGrid' }, { type: 'led-strip', name: $t('toolkit.nodes.techStrip') },
                { type: 'led-matrix', name: $t('toolkit.nodes.techMatrix') }, { type: 'boxletter', name: $t('toolkit.nodes.techLetter') },
                { type: 'maker', name: $t('toolkit.nodes.techSketch') }, { type: 'document', name: $t('toolkit.nodes.techDocument') }] as tool}
                <button onclick={() => addTechnical(tool.type)}>{tool.name}</button>
              {/each}
              <button onclick={runSelectedTechnical} disabled={running}>{running ? $t('toolkit.canvas.working') : $t('toolkit.canvas.runTool')}</button>
            </div>
          </details>
        </div>
        {#if importStatus}<div class="import-progress" role="status">{importStatus}</div>{/if}
        <div class="drawing-surface">
          {#key boardId}
            <TldrawWrapper snapshot={initialSnapshot ?? undefined}
              toolkitBoardId={boardId} onToolkitFilesDrop={(files, position) => { void importFiles(files, position); }}
              onSave={onCanvasChange} onDocumentChange={onDocumentChange} onReady={onEditorReady} onError={(message) => (error = message)} />
          {/key}
        </div>
        <p class="canvas-hint">{$t('toolkit.canvas.hint')}</p>
      {:else if loading}
        <div class="empty-canvas"><p>{$t('toolkit.canvas.opening')}</p></div>
      {:else}
        <div class="empty-canvas">
          <div class="empty-symbol">✧</div>
          <h2>{$t('toolkit.canvas.emptyTitle')}</h2>
          <p>{$t('toolkit.canvas.emptyDetail')}</p>
          <div class="empty-actions">
            <button class="primary" onclick={() => createBoard('project')}>{$t('toolkit.canvas.startProject')}</button>
            <button onclick={() => createBoard('blank')}>{$t('toolkit.canvas.blankCanvas')}</button>
          </div>
        </div>
      {/if}
    </section>

    {#if assistantOpen}
      <aside class="assistant-pane">
        <div class="pane-heading"><div><span class="small-heading">{$t('toolkit.canvas.private')}</span><h3>{$t('toolkit.canvas.brainstorm')}</h3></div>
          <button aria-label={$t('toolkit.canvas.closeAssistant')} class="close-pane" onclick={() => assistantOpen = false}>×</button>
        </div>
        <p class="assistant-intro">{$t('toolkit.canvas.intro')}</p>
        <div class="skill-picker">
          <label for="toolkit-skill">{$t('toolkit.canvas.skill')}</label>
          <select id="toolkit-skill" bind:value={skill} disabled={requesting}>
            {#each TOOLKIT_SKILLS as item (item.id)}
              <option value={item.id}>{$t(`toolkit.skills.${item.id}`)}</option>
            {/each}
          </select>
          <p>{$t(`toolkit.skills.${skill}Purpose`)}</p>
          {#if modelChoices.length}
            <label for="toolkit-model">{$t('toolkit.canvas.model')}</label>
            <select id="toolkit-model" bind:value={selectedModel} disabled={requesting}>
              {#each modelChoices as choice (choice.id)}
                <option value={choice.id}>{choice.label}{choice.isDefault ? ' · ' + $t('toolkit.canvas.defaultModel') : ''}</option>
              {/each}
            </select>
            <p>{$t('toolkit.canvas.modelHint')}</p>
          {/if}
          {#if skill === 'research'}
            <label for="toolkit-web-mode">{$t('toolkit.canvas.webSource')}</label>
            <select id="toolkit-web-mode" bind:value={webMode} disabled={requesting}>
              <option value="searxng">{$t('toolkit.canvas.searxng')}</option>
              {#if paidWebAvailable}<option value="openrouter">{$t('toolkit.canvas.openrouterSearch')}</option>{/if}
            </select>
            {#if webMode === 'openrouter'}
              <p class="web-cost-note">{$t('toolkit.canvas.paidNotice')}</p>
            {/if}
          {/if}
        </div>
        <section class="media-analysis" aria-label={$t('toolkit.canvas.fileUnderstanding')}>
          <div class="media-heading"><strong>◫ {$t('toolkit.canvas.fileUnderstanding')}</strong></div>
          <p>{$t('toolkit.canvas.fileUnderstandingHint')}</p>
          {#if mediaVisionModel || mediaPdfModel}
            <small>{$t('toolkit.canvas.imageModel')}: {mediaVisionModel || '—'} · {$t('toolkit.canvas.pdfModel')}: {mediaPdfModel || '—'}</small>
          {/if}
          {#if paidPdfOcrAvailable}
            <label class="ocr-toggle">
              <input type="checkbox" bind:checked={usePaidPdfOcr} disabled={analyzingFile || requesting} />
              {$t('toolkit.canvas.enableScannedOcr')}
            </label>
            {#if usePaidPdfOcr}<small>{$t('toolkit.canvas.ocrCostWarning')}</small>{/if}
          {/if}
          <button class="analyze-button" onclick={analyzeSelectedAsset}
            disabled={!boardId || !editor || analyzingFile || requesting}>
            {analyzingFile ? $t('toolkit.canvas.analyzingFile') : $t('toolkit.canvas.askSelectedFile')}
          </button>
          {#if lastAnalyzedAsset && analyzedAssets[lastAnalyzedAsset]}
            <small>{$t('toolkit.canvas.analyzedFile')}: {analyzedAssets[lastAnalyzedAsset].filename}</small>
            <button onclick={pinFileAnalysis} disabled={conflict || remoteUpdated}>
              {$t('toolkit.canvas.pinFileAnalysis')}
            </button>
          {/if}
        </section>
        <button class="board-audit" onclick={auditBoard} disabled={!boardId || !editor}
          title={$t('toolkit.canvas.auditTitle')}>{$t('toolkit.canvas.audit')}</button>
        <div class="quick-prompts" aria-label={$t('toolkit.canvas.promptList')}>
          {#each prompts as item (item.id)}
            <button onclick={() => brainstorm(tr(`prompts.${item.id}Question`), item.skill)}
              disabled={!boardId || requesting}>{$t(`toolkit.prompts.${item.id}`)}</button>
          {/each}
        </div>
        {#if Object.keys(legacyThreads).length}
          <details class="legacy-threads">
            <summary>{$t('toolkit.canvas.archived')} ({Object.keys(legacyThreads).length})</summary>
            {#each Object.entries(legacyThreads) as [shapeId, thread] (shapeId)}
              <section class="legacy-thread">
                <strong>{$t('toolkit.canvas.previous')}</strong>
                {#each thread as entry, i (i)}
                  <p><b>{entry.role === 'user' ? $t('toolkit.canvas.you') : $t('toolkit.canvas.assistant')}:</b> {entry.content}</p>
                {/each}
              </section>
            {/each}
          </details>
        {/if}
        <div class="conversation" role="log" aria-label={$t('toolkit.canvas.conversation')} aria-live="polite">
          {#if !messages.length}
            <div class="conversation-empty">{$t('toolkit.canvas.conversationEmpty')}</div>
          {/if}
          {#each messages as m, i (i)}
            <div class="message" class:user={m.role === 'user'}>
              <span class="message-role">{m.role === 'user' ? $t('toolkit.canvas.you') : $t('toolkit.title')}</span>
              <p>{m.content}</p>
            </div>
          {/each}
          {#if requesting}<p class="muted">{$t('toolkit.canvas.exploring')}</p>{/if}
          {#if lastUsedModel}<p class="muted">{$t('toolkit.canvas.updatedModel')}: {lastUsedModel}</p>{/if}
        </div>
        {#if messages.some(message => message.role === 'assistant')}
          <button class="capture-answer" onclick={captureAnswer} disabled={!boardId || conflict || remoteUpdated}>
            {$t('toolkit.canvas.saveAnswer')}
          </button>
        {/if}
        {#if suggestions.length}
          <div class="suggestion-list">
            <div class="proposal-header"><strong>{$t('toolkit.canvas.suggested')} · {suggestions.length}</strong>
              <button onclick={applyAll}>{$t('toolkit.canvas.addAll')}</button></div>
            {#each suggestions as proposal, i (`${proposal.kind}:${proposal.title}:${i}`)}
              <div class="proposal">
                <span class="proposal-kind">{$t(`toolkit.kind.${proposal.kind}`)}</span>
                <strong>{proposal.title}</strong>
                <p>{proposal.body}</p>
                <button onclick={() => applySuggestion(proposal, i)}>{$t('toolkit.canvas.addToBoard')}</button>
              </div>
            {/each}
          </div>
        {/if}
        {#if actionProposals.length}
          <div class="suggestion-list" aria-label={$t('toolkit.canvas.actionTools')}>
            <div class="proposal-header"><strong>{$t('toolkit.canvas.actions')} · {actionProposals.length}</strong></div>
            {#each actionProposals as action, index (`${action.kind}:${index}`)}
              <div class="proposal">
                <span class="proposal-kind">{action.kind}</span>
                <strong>{action.kind === 'connect'
    ? $t('toolkit.canvas.actionConnect', { from: actionTargetName(action.from), to: actionTargetName(action.to) })
    : action.kind === 'revise'
      ? $t('toolkit.canvas.actionRevise', { title: actionTargetName(action.target) })
      : $t('toolkit.canvas.actionLayout', { layout: $t(`toolkit.canvas.layout${action.layout === 'grid' ? 'Grid' : 'Columns'}`) })}</strong>
                {#if action.reason}<p>{action.reason}</p>{/if}
                <button disabled={conflict || remoteUpdated}
                  onclick={() => approveAction(action)}>{$t('toolkit.canvas.reviewApply')}</button>
              </div>
            {/each}
          </div>
        {/if}
        {#if searchNote}
          <p class="research-note" role="status">{$t('toolkit.canvas.researchStatus')}: {$t(`toolkit.canvas.searchNote${searchNote}`)}</p>
        {/if}
        {#if webSearchRequests !== null && skill === 'research' && webMode === 'openrouter'}
          <p class="research-note">{$t('toolkit.canvas.webSearchCalls', { count: webSearchRequests })}</p>
        {/if}
        {#if researchSources.length}
          <div class="research-sources">
            <strong>{$t('toolkit.canvas.references')}</strong>
            {#each researchSources as source (source.url)}
              <div class="source-row">
                <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title || source.url} ↗</a>
                {#if source.provider === 'openrouter'}<small>{$t('toolkit.canvas.reportedCitation')}</small>{/if}
                {#if source.snippet}<small>{source.snippet}</small>{/if}
                <button onclick={() => pinResearchSource(source)} disabled={!boardId || conflict || remoteUpdated}>
                  {$t('toolkit.canvas.pinSource')}
                </button>
                <button onclick={() => inspectResearchSource(source)} disabled={!boardId || conflict || remoteUpdated}>
                  {$t('toolkit.canvas.inspectSource')}
                </button>
              </div>
            {/each}
          </div>
        {/if}
        {#if insecureClipboard}
          <p class="canvas-security-note" role="status">{$t('toolkit.canvas.clipboard')}</p>
        {/if}
        {#if notice}<p role="status" class="note">{notice}</p>{/if}
        <form class="composer" onsubmit={(e) => { e.preventDefault(); void brainstorm(); }}>
          <label for="toolkit-prompt">{$t('toolkit.canvas.question')}</label>
          <textarea id="toolkit-prompt" bind:value={prompt} rows="3" maxlength="2500"
            placeholder={$t('toolkit.canvas.questionPlaceholder')} disabled={!boardId || requesting}
            onkeydown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void brainstorm(); } }}></textarea>
          <div class="composer-footer"><span>{selectedCount ? $t('toolkit.canvas.selected', { count: selectedCount }) : $t('toolkit.canvas.wholeBoard')} · {$t('toolkit.canvas.boardContext')}</span>
            <button class="primary" type="submit" disabled={!boardId || requesting || !prompt.trim()}>{$t('toolkit.canvas.ask')}</button>
          </div>
        </form>
      </aside>
    {/if}
  </div>
</div>

<style>
  .workspace{display:flex;flex-direction:column;width:100%;min-height:0;flex:1;background:var(--bg-0);color:var(--text);border:1px solid var(--border);border-radius:15px;overflow:hidden}
  button{cursor:pointer;border:1px solid var(--border);border-radius:9px;padding:8px 11px;min-height:36px;background:var(--bg-1);color:var(--text);font:inherit;font-size:12px;font-weight:650}
  button:hover{border-color:var(--brand);background:var(--bg-2)}button:disabled{opacity:.5;cursor:not-allowed}
  button:focus-visible,input:focus-visible,textarea:focus-visible,summary:focus-visible{outline:2px solid var(--brand);outline-offset:2px}
  button.primary,.new-project,.assistant-toggle{background:var(--brand);color:white;border-color:var(--brand)}
  .command-bar{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--bg-1);border-bottom:1px solid var(--border);gap:12px;flex-wrap:wrap}
  .workspace-title,.command-actions{display:flex;align-items:center;gap:8px;min-width:0}.workspace-title{flex:1}.workspace-title h2{font-size:16px;margin:0}.command-actions{flex-wrap:wrap;justify-content:flex-end;max-width:100%}
  .board-title{font-family:inherit;font-size:16px;font-weight:750;background:transparent;border:1px solid transparent;padding:6px;border-radius:7px;min-width:100px;max-width:340px;flex:1;color:var(--text)}
  .board-title:hover,.board-title:focus{border-color:var(--border)}
  .team-label{font-size:11px;font-weight:700;color:var(--ink-secondary);white-space:nowrap}
  .remote-banner,.private-banner{display:flex;align-items:center;gap:10px;justify-content:space-between;flex-wrap:wrap;padding:9px 14px;border-bottom:1px solid var(--border);background:var(--bg-1);font-size:12px}
  .remote-banner{border-color:var(--brand)}.private-banner{border-color:var(--error)}
  .toolbar-separator{height:26px;width:1px;background:var(--border);margin:0 4px}
  .save-indicator,.muted{font-size:11px;color:var(--ink-tertiary)}
  .icon-toggle{font-size:16px;min-width:38px}.panes{display:flex;flex:1;min-height:0;position:relative}
  .library{display:flex;flex-direction:column;flex:0 0 230px;min-width:0;background:var(--bg-1);border-right:1px solid var(--border);padding:12px;gap:12px;overflow:auto}
  .pane-heading{display:flex;justify-content:space-between;align-items:center;gap:10px}
  .pane-heading h3{margin:2px 0;font-size:16px}.pane-heading>span{font-size:12px;color:var(--ink-tertiary)}
  .small-heading{display:block;font-size:10px;color:var(--ink-tertiary);text-transform:uppercase;letter-spacing:.09em;font-weight:800}
  .templates{display:grid;gap:6px;border-top:1px solid var(--border);padding-top:12px}.templates button{text-align:left}
  .project-list{display:grid;align-content:start;gap:6px;min-height:80px}
  .project-entry{display:flex;align-items:center;border-radius:9px;border:1px solid transparent;min-width:0}.project-entry.active{background:var(--brand-soft);border-color:var(--brand)}
  .project-open{flex:1;text-align:left;display:grid;gap:4px;border:0;background:transparent;min-width:0}.project-open strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.project-open span{font-size:10px;color:var(--ink-tertiary)}
  .delete{width:31px;min-height:34px;padding:2px;background:transparent;border:0;color:var(--ink-tertiary);font-size:18px}
  .library-tip{margin-top:auto;font-size:11px;color:var(--ink-tertiary);line-height:1.55}
  .saved-file-library{border-top:1px solid var(--border);padding-top:10px;font-size:11px}
  .saved-file-library summary{cursor:pointer;font-weight:750}
  .saved-file-library p{font-size:11px;line-height:1.45;color:var(--ink-tertiary)}
  .saved-file-list{display:grid;gap:4px;max-height:200px;overflow-y:auto;margin-top:6px}
  .saved-file-list button{display:flex;gap:5px;align-items:center;min-width:0;text-align:left}
  .saved-file-list button span:last-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .board-area{flex:1;min-width:0;display:flex;flex-direction:column;position:relative;background:var(--bg-0)}
  .node-toolbar{display:flex;gap:6px;align-items:center;flex-wrap:wrap;z-index:5;background:var(--bg-1);border-bottom:1px solid var(--border);padding:8px}
  .node-toolbar button{white-space:nowrap}.drawing-surface{flex:1;min-height:0;position:relative;isolation:isolate}
  .advanced-tools{position:relative;font-size:12px}.advanced-tools summary{padding:9px;cursor:pointer;border:1px solid var(--border);border-radius:9px;list-style:none;font-weight:650}
  .advanced-menu{position:absolute;z-index:15;top:calc(100% + 6px);right:0;width:190px;padding:8px;background:var(--bg-1);border:1px solid var(--border);border-radius:12px;box-shadow:var(--glass-shadow-lg);display:grid;gap:5px}
  .advanced-menu button{text-align:left}.canvas-hint{margin:0;padding:7px 12px;font-size:11px;color:var(--ink-tertiary);border-top:1px solid var(--border)}
  .empty-canvas{flex:1;display:grid;place-content:center;justify-items:center;text-align:center;gap:12px;padding:24px}.empty-symbol{font-size:66px;color:var(--brand)}.empty-canvas h2{font-size:24px;margin:0}.empty-canvas p{max-width:42ch;color:var(--ink-tertiary)}
  .empty-actions{display:flex;gap:8px}.workspace-alert{background:var(--bg-1);border-bottom:1px solid var(--error);padding:9px 15px;display:flex;justify-content:space-between;gap:8px;font-size:13px}
  .assistant-pane{display:flex;flex-direction:column;flex:0 0 300px;min-width:0;background:var(--bg-1);border-left:1px solid var(--border);gap:12px;padding:13px;overflow:auto}
  .close-pane{font-size:19px;background:transparent;border:0}.assistant-intro{font-size:12px;color:var(--ink-secondary);line-height:1.5;margin:0}
  .quick-prompts{display:flex;flex-wrap:wrap;gap:5px}.quick-prompts button{font-size:11px;padding:6px 8px;min-height:33px}
  .conversation{flex:1;overflow-y:auto;min-height:80px;display:flex;flex-direction:column;gap:11px}
  .conversation-empty{font-size:12px;line-height:1.6;color:var(--ink-tertiary);padding:16px 6px}
  .message{padding:10px;border:1px solid var(--border);border-radius:11px;background:var(--bg-0);font-size:12px}
  .message.user{background:var(--brand-soft)}.message-role{font-size:10px;color:var(--ink-tertiary);text-transform:uppercase;font-weight:800;letter-spacing:.08em}
  .message p{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.55;margin:7px 0 0}
  .suggestion-list{max-height:250px;overflow:auto;display:grid;gap:6px;border-top:1px solid var(--border);padding-top:10px}
  .proposal-header{display:flex;justify-content:space-between;align-items:center;font-size:12px}.proposal{display:grid;gap:4px;background:var(--bg-0);padding:8px;border:1px solid var(--border);border-radius:10px;font-size:12px}.proposal-kind{text-transform:uppercase;color:var(--brand);font-size:10px;font-weight:800}.proposal p{color:var(--ink-secondary);margin:0;line-height:1.4;white-space:pre-wrap}.proposal button{justify-self:end}
  .composer{display:grid;gap:7px;border-top:1px solid var(--border);padding-top:10px}.composer label{font-size:11px;font-weight:800}.composer textarea{border:1px solid var(--border);border-radius:9px;background:var(--bg-0);color:var(--text);font:inherit;font-size:12px;padding:10px;resize:vertical;min-height:68px}
  .composer-footer{display:flex;align-items:center;justify-content:space-between;gap:8px}.composer-footer span{font-size:10px;color:var(--ink-tertiary)}.note{font-size:12px;color:var(--brand)}
  @media(max-width:1100px){.library{flex-basis:190px}.assistant-pane{flex-basis:255px}}
  @media(max-width:780px){.panes{flex-direction:column;overflow-y:auto}.library{flex:0 0 auto;max-height:190px;border-right:0;border-bottom:1px solid var(--border)}.board-area{min-height:480px;flex:1 0 490px}.assistant-pane{flex:0 0 auto;max-height:420px;border-left:0;border-top:1px solid var(--border)}.node-toolbar{overflow-x:auto;flex-wrap:nowrap}.command-bar{padding:8px}}
  @media(prefers-reduced-motion:reduce){*{scroll-behavior:auto}}
  .legacy-threads{border:1px solid var(--border);padding:10px;border-radius:10px;font-size:12px}
  .legacy-threads summary{cursor:pointer;font-weight:750}
  .legacy-thread{border-top:1px solid var(--border);padding:8px 0;max-height:180px;overflow-y:auto}
  .legacy-thread p{font-size:11px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}

  .file-input{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}
  .node-toolbar .chosen{border-color:var(--brand);background:var(--brand-soft);color:var(--brand)}
  .import-button{border-color:var(--brand)}
  .import-progress{font-size:12px;font-weight:700;color:var(--brand);background:var(--bg-1);
    padding:8px 13px;border-bottom:1px solid var(--border)}
  @media(max-width:840px){.node-toolbar{overflow-x:auto;flex-wrap:nowrap}}
  .source-row{display:flex;flex-direction:column;align-items:flex-start;gap:5px;padding:8px 0;border-bottom:1px solid var(--border)}
  .source-row small{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden;font-size:11px;line-height:1.5;color:var(--ink-tertiary)}
  .source-row a{overflow-wrap:anywhere}
  .capture-answer{width:100%;margin:6px 0}
  .research-note,.web-cost-note{font-size:11px;line-height:1.45;color:var(--ink-secondary);margin:0}
  .media-analysis{display:grid;gap:8px;border:1px solid var(--border);border-radius:10px;padding:10px;background:var(--bg-0)}
  .media-analysis .media-heading{font-size:12px}
  .media-analysis p,.media-analysis small{font-size:11px;line-height:1.5;color:var(--ink-secondary);margin:0;overflow-wrap:anywhere}
  .media-analysis .ocr-toggle{display:flex;gap:8px;align-items:center;font-size:11px}
  .media-analysis .analyze-button{border-color:var(--brand);width:100%}
  .skill-picker{display:grid;gap:5px;padding:9px;border:1px solid var(--border);border-radius:10px}
  .skill-picker label{font-size:11px;font-weight:750}
  .skill-picker select{background:var(--bg-0);color:var(--text);border:1px solid var(--border);padding:7px;border-radius:7px;max-width:100%}
  .skill-picker p{font-size:11px;color:var(--ink-tertiary);line-height:1.4;margin:0}
  .research-sources{display:grid;gap:7px;font-size:11px;border-top:1px solid var(--border);padding-top:10px}
  .research-sources a{color:var(--brand);text-decoration:underline;overflow-wrap:anywhere}
  .canvas-security-note{font-size:11px;color:var(--ink-secondary)}

  /* Canvas is a tool: magenta marks the single AI CTA, not every control. */
  .workspace { background:var(--bg-0);border-radius:var(--radius-lg);border-color:var(--glass-border); }
  .command-bar { padding:var(--space-sm) var(--space-md);background:var(--glass-bg-strong);
    border-bottom:1px solid var(--border);min-width:0; }
  .workspace-title { flex:1 1 220px;gap:var(--space-sm); }
  .command-actions { gap:var(--space-xs); }
  .command-actions button { flex-shrink:0; }
  .team-label { color:var(--ink-tertiary);font-size:var(--text-xs); }
  .board-title { min-width:0;max-width:380px;font-size:var(--text-md);
    color:var(--ink-primary);font-weight:700; }
  .board-title:focus-visible { border-color:var(--focus);outline:2px solid var(--focus);outline-offset:1px; }
  .save-indicator { font-variant-numeric:tabular-nums;white-space:nowrap; }
  .workspace button { border-radius:var(--radius-sm);transition:
    background var(--motion-sm) var(--ease-standard),border-color var(--motion-sm) var(--ease-standard); }
  .workspace button:focus-visible { outline:2px solid var(--focus);outline-offset:2px; }
  .workspace button.primary,.workspace .assistant-toggle {
    background:var(--brand);color:var(--on-brand);border-color:var(--brand);font-weight:700;
  }
  .workspace button.primary:hover,.workspace .assistant-toggle:hover {
    background:var(--brand-2);border-color:var(--brand-2);color:var(--on-brand);
  }
  .workspace .new-project { background:var(--brand-soft);color:var(--brand);
    border-color:color-mix(in oklab,var(--brand) 35%,var(--border)); }
  .library,.assistant-pane { background:var(--bg-1); }
  .library { flex-basis:clamp(205px,17vw,250px); }
  .assistant-pane { flex-basis:clamp(280px,24vw,360px); }
  .pane-heading { position:sticky;top:0;background:var(--bg-1);z-index:2;padding-bottom:4px; }
  .project-entry.active { border-color:color-mix(in oklab,var(--brand) 40%,var(--border)); }
  .project-open { min-height:44px; }
  .project-open:hover { background:var(--bg-2); }
  .node-toolbar { background:var(--bg-1);overscroll-behavior-x:contain;
    scrollbar-width:thin; min-height:52px; }
  .node-toolbar button { min-height:38px; }
  .node-toolbar .chosen { border-color:var(--brand);background:var(--brand-soft); }
  .advanced-tools summary { min-height:38px;display:flex;align-items:center; }
  .advanced-menu { background:var(--bg-2); }
  .conversation { overscroll-behavior:contain; }
  .proposal { background:var(--bg-2);padding:var(--space-md); }
  .proposal-kind { color:var(--brand); }
  .assistant-pane .composer { position:sticky;bottom:0;background:var(--bg-1);z-index:2;
    padding-bottom:var(--space-xs); }
  .assistant-pane .composer textarea { min-height:88px; }
  @media(max-width:1100px) and (min-width:781px) {
    .library { flex-basis:190px; }
    .assistant-pane { flex-basis:260px; }
  }
  @media(max-width:780px) {
    .command-bar { flex-direction:column;align-items:stretch;gap:var(--space-xs); }
    .workspace-title { flex:0 0 auto;min-height:40px;flex-wrap:wrap; }
    .command-actions { flex-wrap:nowrap;max-width:100%;overflow-x:auto;
      justify-content:flex-start;padding:2px 0 6px;scrollbar-width:thin; }
    .command-actions .team-label { flex:0 0 auto; }
    .panes { overflow-y:auto;overscroll-behavior:contain; }
    .library { flex:0 0 auto;max-height:180px; }
    .board-area { flex:1 0 auto;min-height:min(500px,65dvh); }
    .assistant-pane { flex:0 0 auto;max-height:min(500px,62dvh); }
    .node-toolbar { flex-wrap:nowrap;overflow-x:auto; }
    .empty-actions { flex-wrap:wrap;justify-content:center; }
  }
  @media(prefers-reduced-transparency:reduce) {
    .command-bar,.workspace { backdrop-filter:none;background:var(--bg-1); }
  }
</style>
