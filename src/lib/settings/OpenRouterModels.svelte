<script lang="ts">
  import {onMount} from 'svelte';
  import {locale} from 'svelte-i18n';
  import {base} from '$app/paths';
  import {openRouterModelCopy} from './openrouter-model-copy';
  import type {ModelChoice, ModelSelection} from './openrouter-models';
  const copy = $derived(openRouterModelCopy($locale));
  let saved = $state<ModelSelection | null>(null);
  let choices = $state<ModelChoice[]>([]);
  let textModel = $state('');
  let visionModel = $state('');
  let loading = $state(true);
  let saving = $state(false);
  let failure = $state('');
  let success = $state(false);
  const textChoices = $derived(choices.filter(m => m.text && m.tools));
  const visionChoices = $derived(choices.filter(m => m.image && m.structured));
  const validText = $derived(textChoices.some(m => m.id === textModel));
  const validVision = $derived(visionChoices.some(m => m.id === visionModel));
  const changed = $derived(!!saved && (textModel !== saved.textModel || visionModel !== saved.visionModel));
  async function load() {
    loading = true; failure = ''; success = false;
    try {
      const response = await fetch(`${base}/api/settings/openrouter/models`, {cache: 'no-store'});
      const payload = await response.json();
      if (!response.ok || !Array.isArray(payload.choices)) throw new Error(payload.error || copy.unavailable);
      choices = payload.choices; saved = {textModel: payload.textModel, visionModel: payload.visionModel};
      textModel = payload.textModel; visionModel = payload.visionModel;
    } catch (err) {failure = err instanceof Error ? err.message : copy.unavailable;}
    finally {loading = false;}
  }
  async function save() {
    if (saving || !validText || !validVision || !changed) return;
    saving = true; failure = ''; success = false;
    try {
      const response = await fetch(`${base}/api/settings/openrouter/models`, {method: 'PATCH',
        headers: {'Content-Type': 'application/json'}, body: JSON.stringify({textModel, visionModel})});
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || copy.unavailable);
      saved = {textModel: payload.textModel, visionModel: payload.visionModel}; success = true;
    } catch (err) {failure = err instanceof Error ? err.message : copy.unavailable;}
    finally {saving = false;}
  }
  onMount(() => {void load();});
</script>

<section class="provider-models" aria-labelledby="provider-models-heading">
  <h3 id="provider-models-heading">{copy.title}</h3>
  {#if loading}<p role="status">{copy.loading}</p>{/if}
  {#if saved}
    <form onsubmit={event => {event.preventDefault(); void save();}}>
      <label for="openrouter-text-model">{copy.text}</label>
      <select id="openrouter-text-model" class="rf-select" bind:value={textModel} disabled={loading || saving} aria-describedby="text-model-hint">
        {#if !validText}<option value={textModel} disabled>{copy.current}: {textModel}</option>{/if}
        {#each textChoices as model (model.id)}<option value={model.id}>{model.name} · {model.id} · {model.free ? copy.free : copy.paid}</option>{/each}
      </select>
      <p id="text-model-hint" class="muted">{copy.textHint}</p>
      <label for="openrouter-vision-model">{copy.vision}</label>
      <select id="openrouter-vision-model" class="rf-select" bind:value={visionModel} disabled={loading || saving} aria-describedby="vision-model-hint">
        {#if !validVision}<option value={visionModel} disabled>{copy.current}: {visionModel}</option>{/if}
        {#each visionChoices as model (model.id)}<option value={model.id}>{model.name} · {model.id} · {model.free ? copy.free : copy.paid}</option>{/each}
      </select>
      <p id="vision-model-hint" class="muted">{copy.visionHint}</p>
      {#if !validVision}<p class="model-warning" role="status">{copy.incompatible}</p>{/if}
      <p class="muted">{copy.cost}</p>
      <button class="rf-btn" type="submit" disabled={loading || saving || !changed || !validText || !validVision}>{saving ? copy.saving : copy.save}</button>
    </form>
  {/if}
  <button type="button" class="rf-btn rf-btn--ghost" disabled={loading || saving} onclick={() => void load()}>{copy.reload}</button>
  {#if failure}<p class="model-error" role="alert">{failure}</p>{/if}
  {#if success}<p class="model-success" role="status">{copy.saved}</p>{/if}
</section>

<style>
  .provider-models {border-top:1px solid var(--border);margin-top:var(--space-lg);padding-top:var(--space-lg);min-width:0;}
  h3 {margin:0 0 var(--space-md);font-size:1rem;}
  form {display:grid;gap:var(--space-sm);margin-bottom:var(--space-sm);}
  label {font-weight:600;}
  select {min-width:0;width:100%;max-width:100%;}
  p {margin:0;font-size:0.875rem;overflow-wrap:anywhere;}
  .model-warning,.model-error {color:var(--status-error, #c43c3c);}
  .model-success {color:var(--status-success, #278348);}
  .model-error,.model-success {margin-top:var(--space-sm);}
  button {min-height:44px;justify-self:start;}
</style>
