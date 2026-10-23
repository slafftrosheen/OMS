<script lang="ts">
  import { locale } from 'svelte-i18n';
  import { TELEGRAM_CATEGORIES } from './telegram-options';
  import { defaultTelegramPreferences, type TelegramPersonalPreferences } from './telegram-account';
  import { telegramAccountCopy } from './telegram-account-copy';
  let { accountId, preferences, aiAvailable, disabled = false, onSave }: {
    accountId: string; preferences: TelegramPersonalPreferences; aiAvailable: boolean;
    disabled?: boolean; onSave: (value: TelegramPersonalPreferences) => Promise<void>;
  } = $props();
  let copy = $derived(telegramAccountCopy($locale));
  let draft = $state<TelegramPersonalPreferences>(defaultTelegramPreferences());
  let baseline = $state('');
  let owner = $state('');
  let dirty = $derived(JSON.stringify(draft) !== baseline);
  const clone = (p: TelegramPersonalPreferences): TelegramPersonalPreferences => ({
    notificationCategories:[...p.notificationCategories],previewMode:p.previewMode,aiEnabled:p.aiEnabled
  });
  $effect(() => {
    const incoming = JSON.stringify(preferences);
    if (owner !== accountId || !dirty || JSON.stringify(draft) === incoming) {
      owner=accountId; baseline=incoming;
      if (JSON.stringify(draft) !== incoming) draft=clone(preferences);
    }
  });
  function toggle(category: typeof TELEGRAM_CATEGORIES[number], enabled: boolean) {
    draft.notificationCategories=TELEGRAM_CATEGORIES.filter(item => item===category ? enabled : draft.notificationCategories.includes(item));
  }
</script>
<form class="personal-preferences" onsubmit={(event) => { event.preventDefault(); if (!disabled && dirty) void onSave(clone(draft)); }}>
  <fieldset disabled={disabled}>
    <legend>{copy.preferences}</legend>
    <p>{copy.preferencesHint}</p>
    <div class="categories">{#each TELEGRAM_CATEGORIES as category}
      <label><input type="checkbox" checked={draft.notificationCategories.includes(category)} onchange={(event)=>toggle(category,event.currentTarget.checked)} /><span>{copy.categories[category]}</span></label>
    {/each}</div>
    <label class="preview" for="telegram-personal-preview"><span>{copy.preview}</span>
      <select id="telegram-personal-preview" bind:value={draft.previewMode}><option value="full">{copy.full}</option><option value="private">{copy.private}</option></select>
    </label>
    <p>{copy.privacyHint}</p>
    <label><input type="checkbox" bind:checked={draft.aiEnabled} disabled={disabled || (!aiAvailable && !draft.aiEnabled)} /><span>{copy.ai}</span></label>
    <p>{copy.aiHint}</p>
    {#if !aiAvailable}<p role="status">{copy.aiUnavailable}</p>{/if}
    <div class="save"><button type="submit" disabled={disabled || !dirty}>{copy.save}</button>{#if dirty}<span>{copy.unsaved}</span>{/if}</div>
  </fieldset>
</form>
<style>
  .personal-preferences { margin-top:1.25rem; min-width:0; }
  fieldset { margin:0; padding:1rem; border:1px solid var(--border); border-radius:var(--radius-sm,6px); display:grid; gap:.9rem; min-width:0; }
  legend { font-weight:650; padding-inline:.35rem; } p { margin:0; font-size:.85rem; color:var(--ink-secondary); line-height:1.5; }
  .categories { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:.8rem; }
  label { display:flex; align-items:flex-start; gap:.6rem; line-height:1.45; font-size:.875rem; cursor:pointer; }
  input[type=checkbox] { flex-shrink:0; width:18px; height:18px; margin-top:.15rem; accent-color:var(--brand); }
  .preview { display:grid; gap:.45rem; } select { width:100%; min-width:0; min-height:44px; padding:.6rem; background:var(--bg-1); color:var(--text); border:1px solid var(--border); border-radius:6px; font:inherit; }
  .save { display:flex; align-items:center; flex-wrap:wrap; gap:.75rem; } .save span { font-size:.8rem; color:var(--ink-secondary); }
  button { min-height:44px; padding:.6rem .9rem; border:1px solid var(--border); border-radius:6px; font:inherit; background:var(--bg-2); color:var(--text); cursor:pointer; }
  button:disabled { opacity:.55; cursor:default; } :is(input,select,button):focus-visible { outline:2px solid var(--brand); outline-offset:3px; }
  @media(max-width:540px) { .categories { grid-template-columns:minmax(0,1fr); } fieldset { padding:.8rem; } }
</style>
