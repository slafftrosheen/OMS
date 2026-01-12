<script lang="ts">
  import { locale, getLocaleFromNavigator, t } from 'svelte-i18n';
  import { setLocale } from '$lib/i18n';
  import { savePrefs } from '$lib/settings/service';
  let lang = 'en';
  $: locale.subscribe(v => lang = v || 'en');

  function change(e: Event) {
    const v = (e.target as HTMLSelectElement).value as 'en'|'ru'|'lv';
    setLocale(v);
    savePrefs();
  }
</script>

<div class="card">
  <h3 style="margin:0 0 8px 0">{$t('language.title')}</h3>
  <select class="rf-input" on:change={change} bind:value={lang} aria-label={$t('header.language.label')}>
    <option value="en">{$t('header.language.options.en')}</option>
    <option value="ru">{$t('header.language.options.ru')}</option>
    <option value="lv">{$t('header.language.options.lv')}</option>
  </select>
</div>
