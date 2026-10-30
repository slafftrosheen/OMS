<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import { base } from '$app/paths';
  import { t, locale } from 'svelte-i18n';
  import { ArrowUp, Square, RotateCcw, Search } from 'lucide-svelte';
  import { safeScreenData, screenFromPath } from './screen-context';
  import type { AssistantRegistration } from './context';

  let { path, title, registration, active = false }: {
    path: string; title: string; registration: AssistantRegistration | null; active?: boolean;
  } = $props();
  let question = $state('');
  let consent = $state(false);
  let sending = $state(false);
  let problem = $state('');
  let toolsProblem = $state(false);
  let toolsLoading = $state(false);
  let tools = $state<Array<{ id: string; label: string }>>([]);
  let turns = $state<Array<{ role: 'user' | 'assistant'; content: string; tools?: string[]; toolsUnavailable?: boolean }>>([]);
  let messagesElement: HTMLDivElement;
  let input: HTMLTextAreaElement;
  let request: AbortController | null = null;
  let toolsRequest: AbortController | null = null;
  let loadedPath = '';
  let requestNumber = 0;
  let screen = $derived(screenFromPath(path));

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
    question = text;
    void tick().then(() => input?.focus());
  }
  function stop() {
    requestNumber++;
    request?.abort(); request = null; sending = false;
  }
  function clear() { stop(); turns = []; question = ''; problem = ''; }
  async function send() {
    if (sending || !consent || !question.trim()) return;
    const text = question.trim();
    if (text.length > 2500) return;
    const data = safeScreenData(registration?.context() ?? {});
    if (JSON.stringify(data).length > 14000) { problem = $t('assistant.contextTooLarge'); return; }
    const controller = new AbortController();
    const serial = ++requestNumber;
    request = controller; sending = true; problem = '';
    const history = turns.slice(-10).map(turn => ({ role: turn.role, content: turn.content.slice(0, 2500) }));
    try {
      const response = await fetch(`${base}/api/ai/assistant`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ question: text, consent: true, language: ['en','ru','lv'].includes($locale ?? '') ? $locale : 'en',
          screen: { path, title: title.slice(0,160), data }, history })
      });
      const result = await response.json().catch(() => ({}));
      if (serial !== requestNumber || controller.signal.aborted) return;
      if (!response.ok || typeof result.reply !== 'string' || !result.reply.trim()) {
        throw new Error(response.status === 429 ? $t('assistant.rateLimited') : $t('assistant.unavailable'));
      }
      turns = [...turns, { role: 'user' as const, content: text }, { role: 'assistant' as const, content: result.reply,
        tools: Array.isArray(result.toolsUsed) ? result.toolsUsed : [], toolsUnavailable: result.toolsUnavailable === true }].slice(-20);
      question = '';
      await tick();
      messagesElement?.scrollTo({ top: messagesElement.scrollHeight, behavior: 'instant' });
    } catch (err) {
      if (serial === requestNumber && !controller.signal.aborted) problem = err instanceof Error ? err.message : $t('assistant.unavailable');
    } finally {
      if (serial === requestNumber) { sending = false; request = null; }
    }
  }
  onDestroy(() => { stop(); toolsRequest?.abort(); });
</script>

<div class="assistant-chat">
  <div class="context-line">
    <p>{$t('assistant.contextHint')}</p>
    <button type="button" class="quiet" onclick={clear} disabled={!turns.length && !question && !sending} aria-label={$t('assistant.clear')} title={$t('assistant.clear')}><RotateCcw size={16} /></button>
  </div>
  <details class="available-tools">
    <summary>{$t('assistant.availableTools')} {#if tools.length}<span>({tools.length})</span>{/if}</summary>
    {#if toolsLoading}<p role="status">{$t('assistant.loadingTools')}</p>
    {:else if toolsProblem}<p>{$t('assistant.toolsUnavailable')} <button type="button" onclick={loadTools}>{$t('assistant.retry')}</button></p>
    {:else if tools.length}
      <ul>{#each tools as tool (tool.id)}<li><Search size={13} /><span>{toolLabel(tool.id, tool.label)}</span></li>{/each}</ul>
    {:else}<p>{$t('assistant.guidanceOnly')}</p>{/if}
  </details>

  <div class="messages" bind:this={messagesElement} role="log" aria-label={$t('assistant.conversation')} aria-live="polite" aria-relevant="additions" aria-busy={sending}>
    {#if !turns.length}
      <div class="empty-chat">
        <h3>{$t('assistant.howCanHelp')}</h3>
        <p>{$t(`assistant.intro.${screen}`)}</p>
        <div class="suggestions">
          <button type="button" onclick={() => prepare($t(`assistant.prompt.${screen}`))}>{$t(`assistant.prompt.${screen}`)}</button>
          <button type="button" onclick={() => prepare($t('assistant.prompt.next'))}>{$t('assistant.prompt.next')}</button>
        </div>
      </div>
    {/if}
    {#each turns as turn, index (index)}
      <article class:user={turn.role === 'user'} class="turn">
        <strong>{$t(turn.role === 'user' ? 'assistant.you' : 'assistant.title')}</strong>
        <p>{turn.content}</p>
        {#if turn.tools?.length}<small>{$t('assistant.usedTools')}: {turn.tools.map(id => toolLabel(id)).join(', ')}</small>{/if}
        {#if turn.toolsUnavailable}<small>{$t('assistant.modelWithoutTools')}</small>{/if}
      </article>
    {/each}
    {#if sending}<p class="thinking" role="status">{$t('assistant.thinking')}</p>{/if}
  </div>
  <form class="composer" onsubmit={event => { event.preventDefault(); void send(); }}>
    {#if problem}<p class="problem" role="alert">{problem}</p>{/if}
    <label class="consent"><input type="checkbox" bind:checked={consent} disabled={sending} /><span>{$t('assistant.consent')}</span></label>
    <label for="oms-assistant-question" class="sr-only">{$t('assistant.question')}</label>
    <textarea id="oms-assistant-question" bind:this={input} bind:value={question} rows="3" maxlength="2500" placeholder={$t('assistant.placeholder')}
      disabled={sending} onkeydown={event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void send(); } }}></textarea>
    <div class="send-row"><small>{$t('assistant.sendShortcut')}</small>
      {#if sending}<button type="button" class="send" onclick={stop}><Square size={14} />{$t('assistant.stop')}</button>
      {:else}<button type="submit" class="send" disabled={!consent || !question.trim()}><ArrowUp size={16} />{$t('assistant.send')}</button>{/if}
    </div>
  </form>
</div>

<style>
  .assistant-chat { display:flex;flex-direction:column;gap:14px;min-height:0;min-width:0; }
  .context-line { display:flex;align-items:flex-start;gap:12px; }
  .context-line p { flex:1; margin:0;color:var(--ink-secondary);font-size:12px;line-height:1.5; }
  button { font:inherit;cursor:pointer; }
  button:disabled { opacity:.55;cursor:default; }
  button:focus-visible,textarea:focus-visible,input:focus-visible,summary:focus-visible { outline:2px solid var(--focus);outline-offset:3px; }
  .quiet { display:grid;place-items:center;min-width:36px;min-height:36px;background:transparent;border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--ink-secondary); }
  .available-tools { font-size:12px;color:var(--ink-secondary);border-bottom:1px solid var(--border);padding-bottom:12px; }
  summary { cursor:pointer;min-height:28px;align-content:center;color:var(--ink-primary); }
  .available-tools ul { list-style:none;display:flex;gap:8px 16px;flex-wrap:wrap;padding:8px 0 0;margin:0; }
  .available-tools li { display:flex;align-items:center;gap:5px; }
  .available-tools p { line-height:1.5;margin:6px 0; }
  .available-tools button { background:transparent;color:var(--ink-primary);border:0;text-decoration:underline;min-height:32px; }
  .messages { min-height:120px;max-height:42dvh;overflow-y:auto;overflow-wrap:anywhere;scrollbar-color:var(--border-strong,var(--border)) transparent; }
  .empty-chat { padding:14px 0; }
  h3 { font-size:18px;margin:0 0 8px;font-weight:650; }
  .empty-chat p { font-size:13px;line-height:1.6;color:var(--ink-secondary);margin:0 0 18px; }
  .suggestions { display:flex;flex-direction:column;gap:8px;align-items:flex-start; }
  .suggestions button { text-align:left;background:var(--bg-1);color:var(--ink-primary);border:1px solid var(--border);border-radius:var(--radius-sm);min-height:40px;padding:9px 12px;font-size:13px;line-height:1.45; }
  .suggestions button:hover,.quiet:hover { background:var(--bg-2);border-color:var(--border-strong,var(--border)); }
  .turn { padding:14px 0;border-bottom:1px solid var(--border); }
  .turn.user { color:var(--ink-secondary); }
  .turn strong { font-size:11px; }
  .turn p { font-size:14px;line-height:1.65;white-space:pre-wrap;margin:5px 0; }
  .turn small { display:block;color:var(--ink-secondary);font-size:11px;line-height:1.5; }
  .thinking { color:var(--ink-secondary);font-size:13px; }
  .composer { display:flex;flex-direction:column;gap:10px;min-width:0; }
  .consent { display:flex;align-items:flex-start;gap:8px;font-size:12px;line-height:1.5;color:var(--ink-secondary); }
  .consent input { margin-top:3px;flex-shrink:0;accent-color:var(--brand); }
  textarea { width:100%;box-sizing:border-box;resize:vertical;min-height:86px;max-height:220px;font:inherit;font-size:14px;line-height:1.5;padding:11px 12px;color:var(--ink-primary);background:var(--bg-0);border:1px solid var(--border);border-radius:var(--radius-sm);caret-color:var(--brand); }
  textarea::placeholder { color:var(--ink-secondary); }
  .send-row { display:flex;justify-content:space-between;align-items:center;gap:10px; }
  .send-row small { font-size:11px;color:var(--ink-secondary); }
  .send { display:flex;align-items:center;justify-content:center;gap:6px;min-height:40px;padding:8px 16px;border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--ink-primary);background:var(--bg-2);font-weight:600; }
  .send:hover:enabled { border-color:var(--brand); }
  .problem { font-size:13px;line-height:1.5;color:var(--error);margin:0; }
  .sr-only { position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0; }
  @media(max-width:600px) { .messages { max-height:34dvh; } textarea { font-size:16px; } }
</style>
