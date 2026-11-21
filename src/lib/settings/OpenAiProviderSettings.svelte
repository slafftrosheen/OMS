<script lang="ts">
  import { base } from '$app/paths';
  import { locale } from 'svelte-i18n';
  import { aiProviderCopy } from './ai-provider-copy';

  type Provider = 'openrouter' | 'openai';
  type OpenAiSettings = { configured: boolean; masked: string; source: string; textModel: string; visionModel: string };
  let { activeProvider, openAI, managed, disabled, onSaved }: {
    activeProvider: Provider; openAI: OpenAiSettings; managed: boolean; disabled: boolean; onSaved: () => Promise<void>;
  } = $props();

  const copy = $derived(aiProviderCopy($locale));
  let provider = $state<Provider>('openrouter');
  let textModel = $state('');
  let visionModel = $state('');
  let key = $state('');
  let removeKey = $state(false);
  let busy = $state(false);
  let result = $state<'saved' | 'invalid' | 'failed'>();
  $effect(() => {
    provider = activeProvider;
    textModel = openAI.textModel;
    visionModel = openAI.visionModel;
  });

  async function save() {
    if (!managed || disabled || busy) return;
    busy = true;
    result = undefined;
    try {
      const response = await fetch(`${base}/api/settings/ai-provider`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, textModel, visionModel, removeKey,
          ...(key.trim() && !removeKey ? { apiKey: key.trim() } : {}) }),
      });
      if (!response.ok) {
        result = response.status === 400 ? 'invalid' : 'failed';
        return;
      }
      key = '';
      removeKey = false;
      await onSaved();
      result = 'saved';
    } catch { result = 'failed'; }
    finally { busy = false; }
  }
</script>

<div class="provider-card">
  <h3>{copy.routing}</h3>
  <p>{copy.explanation}</p>
  {#if !managed}<p role="status">{copy.migration}</p>{/if}
  <form onsubmit={event => { event.preventDefault(); void save(); }}>
    <fieldset disabled={!managed || disabled || busy}>
      <label>{copy.provider}
        <select bind:value={provider} data-testid="ai-provider-choice">
          <option value="openrouter">OpenRouter</option>
          <option value="openai">OpenAI API</option>
        </select>
      </label>
      <p>{copy.keyStatus} {openAI.configured ? copy.configured : copy.missing}
        {#if openAI.masked}<code>{openAI.masked}</code>{/if}
        {#if openAI.source === 'environment'} <span>· {copy.environment}</span>{/if}
      </p>
      <label>{copy.key}
        <input type="password" bind:value={key} disabled={removeKey} maxlength="512" autocomplete="new-password" spellcheck="false" />
      </label>
      {#if openAI.source === 'vault'}
        <label class="key-removal"><input type="checkbox" bind:checked={removeKey} disabled={!!key.trim()} /> {copy.removeKey}</label>
      {/if}
      <div class="model-fields">
        <label>{copy.textModel}<input bind:value={textModel} maxlength="150" spellcheck="false" required /></label>
        <label>{copy.visionModel}<input bind:value={visionModel} maxlength="150" spellcheck="false" required /></label>
      </div>
      <button class="rf-btn" type="submit">{busy ? copy.saving : copy.save}</button>
    </fieldset>
  </form>
  {#if result}<p role={result === 'saved' ? 'status' : 'alert'}>{copy[result]}</p>{/if}
</div>
<div class="provider-card">
  <h3>{copy.subscription}</h3>
  <p>{copy.subscriptionStatus}</p>
  <a href="https://openai.com/form/sign-in-with-chatgpt-interest/" target="_blank" rel="noreferrer">{copy.partnerLink}</a>
</div>

<style>
  .provider-card { border: 1px solid var(--border); border-radius: 8px; padding: 14px; margin: 12px 0; }
  h3, p { margin: 0 0 8px; }
  p { color: var(--ink-secondary); }
  fieldset { display: grid; gap: 10px; padding: 0; border: 0; margin: 0; min-inline-size: 0; }
  label { display: grid; gap: 4px; font-size: .875rem; }
  select, input:not([type='checkbox']) { min-width: 0; width: 100%; padding: 7px; border: 1px solid var(--border); background: var(--bg-1); color: var(--ink-primary); border-radius: 4px; }
  .key-removal { display: flex; align-items: center; }
  .model-fields { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 170px), 1fr)); }
  button { justify-self: start; }
</style>
