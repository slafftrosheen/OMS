<script lang="ts">
  import { tick, onDestroy, untrack } from 'svelte';
  import { t } from 'svelte-i18n';
  import { Bot, X, MessageSquare } from 'lucide-svelte';
  import AssistantChat from './AssistantChat.svelte';
  import { GENERAL_ASSISTANT_TOOL, type AssistantController } from './context';
  import { screenFromPath } from './screen-context';

  let { controller, path, accountId }: { controller: AssistantController; path: string; accountId: string } = $props();
  const assistantState = untrack(() => controller.state);
  let everOpened = $state(false);
  let focusedOpen = false;
  let previousFocus: HTMLElement | null = null;
  let previousScope = untrack(() => `${accountId}:${path}`);
  let panel = $state<HTMLElement>();
  let launcher: HTMLButtonElement;
  let closeButton = $state<HTMLButtonElement>();
  let nativeTool = $state('');
  let tools = $derived($assistantState.registration?.tools() ?? []);
  let title = $derived($assistantState.registration?.title() ?? $t(`assistant.screen.${screenFromPath(path)}`));
  let generic = $derived($assistantState.activeTool === GENERAL_ASSISTANT_TOOL || !$assistantState.registration?.content);
  let registrationId = $derived($assistantState.registration?.id ?? path);

  $effect(() => {
    const scope = `${accountId}:${path}`;
    if (scope !== previousScope) {
      previousScope = scope; everOpened = false; focusedOpen = false; previousFocus = null;
      controller.close();
    }
  });
  $effect(() => {
    if ($assistantState.activeTool !== GENERAL_ASSISTANT_TOOL) nativeTool = $assistantState.activeTool;
    if ($assistantState.isOpen) {
      everOpened = true;
      if (!focusedOpen) {
        focusedOpen = true;
        previousFocus = document.activeElement instanceof HTMLElement && document.activeElement !== document.body
          ? document.activeElement : launcher;
        void tick().then(() => { if ($assistantState.isOpen) closeButton?.focus(); });
      }
    } else if (focusedOpen) {
      focusedOpen = false;
      if (panel?.contains(document.activeElement) || document.activeElement === document.body) {
        const target = previousFocus?.isConnected ? previousFocus : launcher;
        // Mobile hides the expanded launcher. Wait for both Svelte's update and
        // the browser frame before returning focus to that newly visible control.
        void tick().then(() => requestAnimationFrame(() => {
          if (!$assistantState.isOpen && target?.isConnected) target.focus({ preventScroll: true });
        }));
      }
    }
  });
  function keyboard(event: KeyboardEvent) {
    if (event.defaultPrevented) return;
    if (event.key === 'Escape' && $assistantState.isOpen && panel?.contains(document.activeElement)) {
      event.preventDefault(); controller.close();
    }
  }
  onDestroy(() => controller.close());
</script>

<svelte:window onkeydown={keyboard} />

<button bind:this={launcher} type="button" class="assistant-launcher" class:expanded={$assistantState.isOpen}
  aria-label={$t('assistant.open')} aria-expanded={$assistantState.isOpen} aria-controls="oms-assistant"
  onclick={() => $assistantState.isOpen ? controller.close() : controller.open()}>
  <Bot size={21} strokeWidth={1.8} /><span>{$t('assistant.title')}</span>
</button>

{#if everOpened}
  <div bind:this={panel} id="oms-assistant" class="assistant-panel" hidden={!$assistantState.isOpen} role="dialog" tabindex="-1" aria-modal="false" aria-labelledby="oms-assistant-title">
    <header>
      <div><h2 id="oms-assistant-title">{$t('assistant.title')}</h2><p class="screen-title" title={title}>{title}</p></div>
      <button bind:this={closeButton} class="close" type="button" aria-label={$t('assistant.close')} onclick={() => controller.close()}><X size={20} /></button>
    </header>
    {#if tools.length}
      <nav class="assistant-tools" aria-label={$t('assistant.screenTools')}>
        {#each tools as tool (tool.id)}
          <button type="button" class:active={!generic && $assistantState.activeTool === tool.id} aria-pressed={!generic && $assistantState.activeTool === tool.id} onclick={() => controller.open(tool.id)}>{tool.label}</button>
        {/each}
        <button type="button" class:active={generic} aria-pressed={generic} onclick={() => controller.open(GENERAL_ASSISTANT_TOOL)}><MessageSquare size={14} />{$t('assistant.screenHelp')}</button>
      </nav>
    {/if}
    <div class="assistant-body">
      {#key `${accountId}:${registrationId}`}
        {#if $assistantState.registration?.content}
          <div class="native-content" hidden={generic}>
            {@render $assistantState.registration.content(nativeTool || tools[0]?.id || '')}
          </div>
        {/if}
        <div hidden={!generic}>
          <AssistantChat {path} {title} registration={$assistantState.registration} active={$assistantState.isOpen && generic} />
        </div>
      {/key}
    </div>
  </div>
{/if}

<style>
  .assistant-launcher { position:fixed;right:max(20px,env(safe-area-inset-right));bottom:calc(var(--bottombar-h,52px) + 18px + env(safe-area-inset-bottom,0px));z-index:calc(var(--z-overlay,500) + 1);display:flex;align-items:center;justify-content:center;gap:9px;min-height:50px;padding:12px 18px;border:1px solid var(--border-strong,var(--border));border-radius:var(--radius-full,999px);background:var(--bg-1);color:var(--ink-primary);box-shadow:0 6px 24px rgb(var(--shadow-rgb,0 0 0) / .16);font:inherit;font-size:13px;font-weight:650;cursor:pointer; }
  /* Global reduced-motion rules set a tiny duration on every element. Keeping
     visibility out of the transition prevents focus landing on a hidden launcher. */
  .assistant-launcher { transition-property:background-color,border-color,box-shadow; }
  .assistant-launcher :global(svg) { color:var(--brand); }
  .assistant-launcher:hover,.assistant-launcher.expanded { background:var(--bg-2);border-color:var(--brand); }
  .assistant-launcher:focus-visible,.assistant-panel button:focus-visible { outline:2px solid var(--focus);outline-offset:3px; }
  .assistant-panel { position:fixed;right:max(20px,env(safe-area-inset-right));top:calc(var(--topbar-h,60px) + 16px);bottom:calc(var(--bottombar-h,52px) + 82px + env(safe-area-inset-bottom,0px));width:min(480px,calc(100vw - 40px));z-index:calc(var(--z-modal,1000) - 1);display:flex;flex-direction:column;min-width:0;border:1px solid var(--border-strong,var(--border));border-radius:var(--radius-lg);color:var(--ink-primary);background:var(--bg-0);box-shadow:0 14px 48px rgb(var(--shadow-rgb,0 0 0) / .2);isolation:isolate; }
  .assistant-panel[hidden],.assistant-panel [hidden] { display:none !important; }
  header { display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:18px 18px 14px;flex-shrink:0;border-bottom:1px solid var(--border); }
  header>div { min-width:0; }
  h2 { font-size:17px;line-height:1.3;font-weight:650;margin:0;letter-spacing:-.015em; }
  .screen-title { font-size:12px;color:var(--ink-secondary);line-height:1.5;margin:4px 0 0;overflow-wrap:anywhere; }
  .close { display:grid;place-items:center;min-width:40px;min-height:40px;margin:-6px -6px 0 0;border:0;border-radius:var(--radius-sm);background:transparent;color:var(--ink-secondary);cursor:pointer; }
  .close:hover { color:var(--ink-primary);background:var(--bg-2); }
  .assistant-tools { display:flex;gap:6px;flex-wrap:wrap;padding:12px 16px;border-bottom:1px solid var(--border);flex-shrink:0; }
  .assistant-tools button { display:inline-flex;align-items:center;gap:5px;min-height:36px;max-width:100%;padding:7px 10px;font:inherit;font-size:12px;line-height:1.4;background:transparent;border:1px solid transparent;border-radius:var(--radius-sm);color:var(--ink-secondary);cursor:pointer; }
  .assistant-tools button:hover { color:var(--ink-primary);background:var(--bg-1); }
  .assistant-tools button.active { border-color:var(--border-strong,var(--border));color:var(--ink-primary);background:var(--bg-2); }
  .assistant-body { padding:16px 18px;overflow:auto;min-height:0;min-width:0;flex:1;overscroll-behavior:contain;scrollbar-color:var(--border-strong,var(--border)) transparent; }
  .native-content { min-width:0; }
  .native-content :global(.assistant) { min-width:0;max-width:100%; }
  .native-content :global(button),.native-content :global(input),.native-content :global(select),.native-content :global(textarea) { font-family:inherit; }
  @media(max-width:1024px) {
    .assistant-launcher { right:14px;bottom:calc(var(--mobile-nav-h,72px) + 14px + env(safe-area-inset-bottom,0px));min-height:46px;padding:10px 14px; }
    .assistant-panel { right:14px;width:min(480px,calc(100vw - 28px));bottom:calc(var(--mobile-nav-h,72px) + 76px + env(safe-area-inset-bottom,0px)); }
  }
  @media(max-width:600px) {
    .assistant-panel { top:max(8px,env(safe-area-inset-top));bottom:calc(var(--mobile-nav-h,72px) + 8px + env(safe-area-inset-bottom,0px));right:8px;width:calc(100vw - 16px); }
    .assistant-launcher.expanded { visibility:hidden; }
    header { padding:15px 16px 12px; }
    .assistant-body { padding:14px 16px; }
  }
  @media(max-height:540px) { .assistant-panel { top:8px;bottom:8px; } .assistant-launcher.expanded { visibility:hidden; } }
</style>
