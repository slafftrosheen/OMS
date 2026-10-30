<script lang="ts">
  import { locale } from 'svelte-i18n';
  import TelegramAdminSettings from '$lib/notifications/TelegramAdminSettings.svelte';
  let theme = $state('LightVim');
  $effect(() => { document.documentElement.dataset.theme = theme; });
</script>
<div class="fixture-controls">
  <label>Theme <select aria-label="Theme" bind:value={theme}><option>LightVim</option><option>DarkVim</option><option>HighContrastVim</option></select></label>
  <label>Language <select aria-label="Language" value={$locale} onchange={event => locale.set(event.currentTarget.value)}><option value="en">English</option><option value="ru">Русский</option><option value="lv">Latviešu</option></select></label>
</div>
<main><TelegramAdminSettings /></main>
<style>
  .fixture-controls {display:flex;flex-wrap:wrap;gap:16px;padding:12px;background:var(--bg-1);border-bottom:1px solid var(--border);color:var(--text);}
  .fixture-controls label {display:flex;align-items:center;gap:8px;min-width:0;font-size:12px;}
  .fixture-controls select {width:auto;min-width:0;background:var(--bg-2);color:var(--text);}
  main {max-width:920px;margin:24px auto;padding:24px;background:var(--bg-1);border:1px solid var(--border);border-radius:12px;color:var(--ink-primary);}
  @media(max-width:600px) {main {margin:12px 8px;padding:12px;}}
</style>
