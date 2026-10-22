<script lang="ts">
  import { locale } from 'svelte-i18n';
  import CanvasPage from '../../src/routes/toolkit/canvas/+page.svelte';
  let theme = $state('LightVim');
  $effect(() => { document.documentElement.dataset.theme = theme; });
</script>

<header class="fixture-controls">
  <label>Theme <select aria-label="Theme" bind:value={theme}>
    <option>LightVim</option><option>DarkVim</option><option>HighContrastVim</option>
  </select></label>
  <label>Language <select aria-label="Language" value={$locale} onchange={event => locale.set(event.currentTarget.value)}>
    <option value="en">English</option><option value="ru">Русский</option><option value="lv">Latviešu</option>
  </select></label>
</header>
<main class="canvas-fixture"><CanvasPage /></main>

<style>
  .fixture-controls { display:flex;flex-wrap:wrap;gap:12px;padding:8px 12px;background:var(--bg-1);color:var(--text);border-bottom:1px solid var(--border); }
  label { display:flex;align-items:center;gap:6px;font-size:12px; }
  select { width:auto;min-width:0;background:var(--bg-2);color:var(--text); }
  .canvas-fixture { display:flex;min-width:0;height:calc(100dvh - 52px);padding:8px;box-sizing:border-box; }
</style>
