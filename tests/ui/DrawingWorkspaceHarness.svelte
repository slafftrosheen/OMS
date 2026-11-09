<script lang="ts">
  import { onMount } from 'svelte';
  import { locale } from 'svelte-i18n';
  import TldrawWrapper from '../../src/lib/components/canvas/TldrawWrapper.svelte';
  import type { OrderSeed } from '../../src/lib/components/canvas/templates/DraftOrderTemplate';
  const order = new URLSearchParams(location.search).get('mode') === 'order';
  const seed: OrderSeed = { orderId: 'drawing-order', title: 'Production form', clientName: 'Test client', profiles: [] };
  let editor: any;
  let readonly = $state(false);
  let theme = $state('LightVim');
  let saves = $state(0);
  $effect(() => { document.documentElement.dataset.theme = theme; });
  onMount(() => {
    (window as any).__drawingFixture = {
      inspect: () => ({ shapes: editor?.getCurrentPageShapes(), selected: editor?.getSelectedShapeIds(), readonly, saves }),
      emptyArea: () => { editor.setCamera({ x: -2400, y: 0, z: 1 }); },
    };
    return () => { delete (window as any).__drawingFixture; };
  });
</script>
<header>
  <button onclick={() => readonly = !readonly}>Toggle read only</button>
  <label>Theme <select aria-label="Theme" bind:value={theme}><option>LightVim</option><option>DarkVim</option><option>HighContrastVim</option></select></label>
  <label>Language <select aria-label="Language" value={$locale} onchange={event => locale.set(event.currentTarget.value)}><option value="en">English</option><option value="ru">Русский</option><option value="lv">Latviešu</option></select></label>
</header>
<main><TldrawWrapper orderSeed={order ? seed : null} toolkitBoardId={order ? null : 'fixture-board'}
  onReady={value => editor = value} toolkitReadOnly={readonly} onDocumentChange={() => saves++} /></main>
<style>
  header { display:flex;align-items:center;gap:12px;padding:8px;height:48px;box-sizing:border-box;background:var(--bg-1);color:var(--text); }
  header label { display:flex;align-items:center;gap:4px;font-size:12px; }
  header select { min-width:0;width:auto; }
  main { height:calc(100dvh - 48px); }
</style>
