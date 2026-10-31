<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import { base } from '$app/paths';
  import { t, locale } from 'svelte-i18n';
  import { ArrowUp, ArrowRight, Square, RotateCcw, Search } from 'lucide-svelte';
  import { safeScreenData, screenFromPath } from './screen-context';
  import { summarizeScreenContext } from './context-summary';
  import { screenWorkflows } from './workflows';
  import { screenContextSignature, screenGuidance } from './guidance';
  import { nextActionHalo } from '$lib/ui/next-action-halo';
  import type { AssistantRegistration } from './context';
  import AssistantResponse from './AssistantResponse.svelte';

  let { path, title, registration, active = false, onOpenWorkflow }: {
    path: string; title: string; registration: AssistantRegistration | null; active?: boolean;
    onOpenWorkflow?: (id: string) => void;
  } = $props();
  let question = $state('');
  let consent = $state(false);
  let sending = $state(false);
  let problem = $state('');
  let toolsProblem = $state(false);
  let toolsLoading = $state(false);
  let contextExpanded = $state(false);
  let tools = $state<Array<{ id: string; label: string }>>([]);
  let turns = $state<Array<{ role: 'user' | 'assistant'; content: string; tools?: string[]; toolsUnavailable?: boolean; workflows?: string[]; contextSignature?: string }>>([]);
  let pendingContextSignature = $state<string | null>(null);
  let messagesElement: HTMLDivElement;
  let input: HTMLTextAreaElement;
  let request: AbortController | null = null;
  let toolsRequest: AbortController | null = null;
  let loadedPath = '';
  let requestNumber = 0;
  let screen = $derived(screenFromPath(path));
  let workflows = $derived(screenWorkflows(path, registration?.tools() ?? []));
  let snapshot = $derived.by(() => {
    try {
      const data = safeScreenData(registration?.context() ?? {});
      return { data, signature: screenContextSignature(path, data, workflows.map(tool => tool.id)), failed: false };
    } catch { return { data: { contextUnavailable: true }, signature: '', failed: true }; }
  });
  let preview = $derived(summarizeScreenContext(snapshot.data));
  let guidance = $derived(screenGuidance(path, snapshot.data));
  let alternativePromptKey = $derived(guidance.promptKey === `assistant.prompt.${screen}` ? 'assistant.prompt.next' : `assistant.prompt.${screen}`);

  function toolLabel(id: string, fallback?: string) {
    return $t(`assistant.tool.${id.replaceAll('.', '_')}`, { default: fallback ?? id });
  }
  async function loadTools() {
    toolsRequest?.abort();
    const controller = new AbortController();
    toolsRequest = controller;
    toolsLoading = true; toolsProblem = false;
    try {
      const response = await fetch(`${base}/api/ai/assistant?path=${encodeURIComponent(path)}`, { cache: 'no-store', signal: controller.signal });
      const result = await response.json();
      if (!response.ok || !Array.isArray(result.tools)) throw new Error('Unavailable');
      if (controller.signal.aborted) return;
      tools = result.tools.filter((tool: any) => typeof tool?.id === 'string' && typeof tool?.label === 'string');
      loadedPath = path;
    } catch {
      if (!controller.signal.aborted) toolsProblem = true;
    } finally {
      if (toolsRequest === controller) { toolsLoading = false; toolsRequest = null; }
    }
  }
  $effect(() => { if (active && path !== loadedPath && !toolsLoading && !toolsProblem) void loadTools(); });

  function prepare(text: string) {
    if (sending) return;
    question = text;
    void tick().then(() => input?.focus());
  }
  function stop() {
    requestNumber++;
    request?.abort(); request = null; sending = false; pendingContextSignature = null;
  }
  function clear() { stop(); turns = []; question = ''; problem = ''; }
  function openWorkflow(id: string) {
    // A stale response cannot resurrect a tool removed from the current screen.
    if (screenWorkflows(path, registration?.tools() ?? []).some(tool => tool.id === id)) onOpenWorkflow?.(id);
  }
  async function send() {
    if (sending || !consent || !question.trim()) return;
    const text = question.trim();
    if (text.length > 2500) return;
    if (snapshot.failed) { problem = $t('assistant.contextUnavailable'); return; }
    const data = snapshot.data, contextSignature = snapshot.signature;
    if (JSON.stringify(data).length > 14000) { problem = $t('assistant.contextTooLarge'); return; }
    const controller = new AbortController();
    const serial = ++requestNumber;
    request = controller; sending = true; problem = ''; pendingContextSignature = contextSignature;
    const history = turns.slice(-10).map(turn => ({ role: turn.role, content: turn.content.slice(0, 2500) }));
    try {
      const response = await fetch(`${base}/api/ai/assistant`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ question: text, consent: true, language: ['en','ru','lv'].includes($locale ?? '') ? $locale : 'en',
          screen: { path, title: title.slice(0,160), data, workflows }, history })
      });
      const result = await response.json().catch(() => ({}));
      if (serial !== requestNumber || controller.signal.aborted) return;
      if (!response.ok || typeof result.reply !== 'string' || !result.reply.trim()) {
        throw new Error(response.status === 429 ? $t('assistant.rateLimited') : $t('assistant.unavailable'));
      }
      turns = [...turns, { role: 'user' as const, content: text }, { role: 'assistant' as const, content: result.reply,
        contextSignature,
        tools: Array.isArray(result.toolsUsed) ? result.toolsUsed.filter((id: unknown) => typeof id === 'string').slice(0, 12) : [],
        workflows: Array.isArray(result.suggestedWorkflows) ? [...new Set<string>(result.suggestedWorkflows.filter((id: unknown) =>
          typeof id === 'string' && workflows.some(tool => tool.id === id)))] : [],
        toolsUnavailable: result.toolsUnavailable === true }].slice(-20);
      question = '';
      contextExpanded = false;
      await tick();
      messagesElement?.scrollTo({ top: messagesElement.scrollHeight, behavior: 'instant' });
    } catch (err) {
      if (serial === requestNumber && !controller.signal.aborted) problem = err instanceof Error ? err.message : $t('assistant.unavailable');
    } finally {
      if (serial === requestNumber) { sending = false; request = null; pendingContextSignature = null; }
    }
  }
  onDestroy(() => { stop(); toolsRequest?.abort(); });
</script>

<div class="assistant-chat">
  <div class="context-bar">
    <details class="available-tools" bind:open={contextExpanded}>
      <summary>{$t('assistant.contextAndTools')}{#if preview.unsaved}<span class="context-status">{$t('assistant.unsavedContext')}</span>{/if}</summary>
      <div class="context-details">
        <p>{$t('assistant.contextHint')}</p>
        {#if screen === 'chat'}<p>{$t('assistant.chatPrivacy')}</p>{/if}
        {#if preview.loading}<p role="status">{$t('assistant.contextLoading')}</p>{/if}
        {#if preview.unavailable && !preview.loading}<p class="context-warning">{$t('assistant.contextUnavailable')}</p>{/if}
        {#if preview.truncated}<p>{$t('assistant.contextTrimmed')}</p>{/if}
        {#if preview.rows.length}
          <dl>{#each preview.rows as row (row.key)}<div><dt>{$t(`assistant.contextField.${row.key}`)}</dt><dd>{row.value}</dd></div>{/each}</dl>
        {:else}<p>{$t('assistant.contextRouteOnly')}</p>{/if}
        <strong class="tools-heading">{$t('assistant.availableTools')}</strong>
        {#if toolsLoading}<p role="status">{$t('assistant.loadingTools')}</p>
        {:else if toolsProblem}<p>{$t('assistant.toolsUnavailable')} <button type="button" onclick={loadTools}>{$t('assistant.retry')}</button></p>
        {:else if tools.length}
          <ul>{#each tools as tool (tool.id)}<li><Search size={13} /><span>{toolLabel(tool.id, tool.label)}</span></li>{/each}</ul>
        {:else}<p>{$t('assistant.guidanceOnly')}</p>{/if}
      </div>
    </details>
    <button type="button" class="quiet" onclick={clear} disabled={!turns.length && !question && !sending} aria-label={$t('assistant.clear')} title={$t('assistant.clear')}><RotateCcw size={16} /></button>
  </div>

  <div class="messages" bind:this={messagesElement} role="log" aria-label={$t('assistant.conversation')} aria-live="polite" aria-relevant="additions" aria-busy={sending}>
    {#if !turns.length}
      <div class="empty-chat">
        <h3>{$t('assistant.howCanHelp')}</h3>
        <p>{$t(guidance.hintKey)}</p>
        <div class="suggestions">
          <button type="button" disabled={sending} onclick={() => prepare($t(guidance.promptKey))}>{$t(guidance.promptKey)}</button>
          <button type="button" disabled={sending} onclick={() => prepare($t(alternativePromptKey))}>{$t(alternativePromptKey)}</button>
        </div>
      </div>
    {/if}
    {#each turns as turn, index (index)}
      <article class:user={turn.role === 'user'} class="turn">
        <strong>{$t(turn.role === 'user' ? 'assistant.you' : 'assistant.title')}</strong>
        {#if turn.role === 'assistant'}<AssistantResponse content={turn.content} />{:else}<p>{turn.content}</p>{/if}
        {#if turn.workflows?.length && onOpenWorkflow}
          <div class="workflow-suggestions">
            {#each workflows.filter(tool => turn.workflows?.includes(tool.id)) as tool (tool.id)}
              <button type="button" onclick={() => openWorkflow(tool.id)}><ArrowRight size={15} />{$t('assistant.openWorkflow', { name: tool.label })}</button>
            {/each}
          </div>
        {/if}
        {#if turn.tools?.length}<small>{$t('assistant.usedTools')}: {turn.tools.map(id => toolLabel(id)).join(', ')}</small>{/if}
        {#if turn.toolsUnavailable}<small>{$t('assistant.modelWithoutTools')}</small>{/if}
        {#if turn.role === 'assistant' && index === turns.length - 1 && turn.contextSignature !== snapshot.signature}
          <div class="context-change" role="status">
            <p>{$t('assistant.contextChanged')}</p>
            <button type="button" disabled={sending} onclick={() => prepare($t('assistant.reviewCurrentPrompt'))}>
              <RotateCcw size={14} />{$t('assistant.reviewCurrent')}
            </button>
          </div>
        {/if}
      </article>
    {/each}
    {#if sending}
      <p class="thinking" role="status">{$t('assistant.thinking')}</p>
      {#if pendingContextSignature !== snapshot.signature}<p class="thinking" role="status">{$t('assistant.contextChangedWhileWaiting')}</p>{/if}
    {/if}
  </div>
  <form class="composer" onsubmit={event => { event.preventDefault(); void send(); }}>
    {#if problem}<p class="problem" role="alert">{problem}</p>{/if}
    <label class="consent"><input type="checkbox" bind:checked={consent} disabled={sending} /><span>{$t('assistant.consent')}</span></label>
    <label for="oms-assistant-question" class="sr-only">{$t('assistant.question')}</label>
    <textarea id="oms-assistant-question" bind:this={input} bind:value={question} rows="2" maxlength="2500" placeholder={$t('assistant.placeholder')}
      disabled={sending} onkeydown={event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void send(); } }}></textarea>
    <div class="send-row"><small>{$t('assistant.sendShortcut')}</small>
      {#if sending}<button type="button" class="send" onclick={stop}><Square size={14} />{$t('assistant.stop')}</button>
      {:else}<button type="submit" class="send" use:nextActionHalo={consent && !!question.trim()} disabled={!consent || !question.trim()}><ArrowUp size={16} />{$t('assistant.send')}</button>{/if}
    </div>
  </form>
</div>

<style>
  .assistant-chat { display:flex;flex:1;flex-direction:column;gap:12px;min-height:0;min-width:0; }
  .context-bar { display:flex;align-items:flex-start;gap:10px;flex-shrink:0;min-width:0; }
  button { font:inherit;cursor:pointer; }
  button:disabled { opacity:1;cursor:not-allowed;color:var(--ink-secondary);background:var(--bg-1); }
  button:focus-visible,textarea:focus-visible,input:focus-visible,summary:focus-visible { outline:2px solid var(--focus);outline-offset:3px; }
  .quiet { display:grid;place-items:center;min-width:36px;min-height:36px;background:transparent;border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--ink-secondary); }
  .available-tools { flex:1;min-width:0;font-size:12px;color:var(--ink-secondary); }
  summary { cursor:pointer;min-height:36px;align-content:center;color:var(--ink-primary);line-height:1.5; }
  .context-status { display:inline-block;margin-left:8px;color:var(--ink-secondary);font-size:10px; }
  .context-details { max-height:min(190px,24dvh);overflow:auto;padding:0 4px 10px 0;overscroll-behavior:contain; }
  .context-details p { margin:7px 0;line-height:1.5; }
  .context-details dl { display:grid;gap:6px;margin:10px 0 14px; }
  .context-details dl>div { display:flex;gap:12px;justify-content:space-between; }
  .context-details dt { flex-shrink:0; }
  .context-details dd { margin:0;text-align:right;overflow-wrap:anywhere;color:var(--ink-primary); }
  .context-warning { color:var(--warn); }
  .tools-heading { display:block;font-size:11px;color:var(--ink-primary); }
  .available-tools ul { list-style:none;display:flex;gap:8px 16px;flex-wrap:wrap;padding:8px 0 0;margin:0; }
  .available-tools li { display:flex;align-items:center;gap:5px; }
  .available-tools p { line-height:1.5;margin:6px 0; }
  .available-tools button { background:transparent;color:var(--ink-primary);border:0;text-decoration:underline;min-height:32px; }
  .messages { flex:1;min-height:0;overflow-y:auto;overflow-wrap:anywhere;overscroll-behavior:contain;scrollbar-color:var(--border-strong,var(--border)) transparent; }
  .empty-chat { padding:8px 2px 12px; }
  h3 { font-size:18px;margin:0 0 8px;font-weight:650; }
  .empty-chat p { font-size:var(--text-sm);line-height:var(--leading-normal);color:var(--ink-secondary);margin:0 0 var(--space-lg); }
  .suggestions { display:flex;flex-direction:column;gap:8px;align-items:flex-start; }
  .suggestions button { text-align:left;background:var(--bg-1);color:var(--ink-primary);border:1px solid var(--border);border-radius:var(--radius-sm);min-height:40px;padding:9px 12px;font-size:13px;line-height:1.45; }
  .suggestions button:hover,.quiet:hover { background:var(--bg-2);border-color:var(--border-strong,var(--border)); }
  .turn { padding:14px 0;border-bottom:1px solid var(--border); }
  .turn.user { color:var(--ink-secondary); }
  .turn strong { font-size:11px; }
  .turn p { font-size:14px;line-height:1.65;white-space:pre-wrap;margin:5px 0; }
  .turn small { display:block;color:var(--ink-secondary);font-size:11px;line-height:1.5; }
  .workflow-suggestions { display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 8px; }
  .workflow-suggestions button { display:inline-flex;align-items:center;gap:6px;min-height:38px;max-width:100%;padding:8px 10px;text-align:left;overflow-wrap:anywhere;background:var(--bg-1);color:var(--ink-primary);border:1px solid var(--border);border-radius:var(--radius-sm);font-size:12px; }
  .workflow-suggestions button:hover { border-color:var(--brand);background:var(--bg-2); }
  .workflow-suggestions :global(svg) { flex-shrink:0; }
  .context-change { margin-top:var(--space-md);padding:var(--space-md);border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-1);color:var(--ink-primary); }
  .context-change p { margin:0 0 var(--space-sm);font-size:var(--text-xs);line-height:var(--leading-normal);white-space:normal; }
  .context-change button { display:inline-flex;align-items:center;gap:var(--space-xs);min-height:var(--control-sm);max-width:100%;padding:var(--space-xs) var(--space-sm);border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-0);color:var(--ink-primary);font-size:var(--text-xs);text-align:left; }
  .context-change button:hover:enabled { border-color:var(--brand); }
  .context-change :global(svg) { flex-shrink:0; }
  .thinking { color:var(--ink-secondary);font-size:13px; }
  .composer { display:flex;flex-shrink:0;flex-direction:column;gap:9px;min-width:0;padding-top:12px;border-top:1px solid var(--border);background:var(--bg-0); }
  .consent { display:flex;align-items:flex-start;gap:8px;font-size:12px;line-height:1.5;color:var(--ink-secondary); }
  .consent input { margin-top:3px;flex-shrink:0;accent-color:var(--brand); }
  textarea { width:100%;box-sizing:border-box;resize:none;min-height:68px;max-height:120px;font:inherit;font-size:14px;line-height:1.5;padding:9px 12px;color:var(--ink-primary);background:var(--bg-0);border:1px solid var(--border);border-radius:var(--radius-sm);caret-color:var(--brand); }
  textarea::placeholder { color:var(--ink-secondary); }
  .send-row { display:flex;justify-content:space-between;align-items:center;gap:10px; }
  .send-row small { font-size:11px;color:var(--ink-secondary); }
  .send { display:flex;align-items:center;justify-content:center;gap:6px;min-height:40px;padding:8px 16px;border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--ink-primary);background:var(--bg-2);font-weight:600; }
  .send:hover:enabled { border-color:var(--brand); }
  .problem { font-size:12px;line-height:1.5;color:var(--error);margin:0;max-height:70px;overflow:auto; }
  .sr-only { position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0; }
  @media(max-width:600px) { textarea { font-size:16px; } }
  @media(max-height:650px) {
    .assistant-chat { gap:8px; }
    .context-details { max-height:90px; }
    .composer { gap:6px;padding-top:8px; }
    .consent { font-size:11px;line-height:1.35; }
    textarea { min-height:58px;line-height:1.3;padding:7px 10px; }
    .send { min-height:34px;padding:6px 12px; }
  }
</style>
