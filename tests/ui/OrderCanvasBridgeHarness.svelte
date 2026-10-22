<script lang="ts">
  import { onMount } from 'svelte';
  import TldrawWrapper from '../../src/lib/components/canvas/TldrawWrapper.svelte';
  import type { OrderSeed } from '../../src/lib/components/canvas/templates/DraftOrderTemplate';
  import { getOrderBridge } from '../../src/lib/components/canvas/state-bridge';

  let seed = $state<OrderSeed>({
    orderId: 'fixture-order', title: 'Initial order', clientName: 'Initial client',
    poNumber: 'PO-100', notes: 'Keep these notes', deliveryAddress: 'First address',
    deliveryEmail: 'initial@example.com', profiles: [{ name: 'Existing profile', quantity: 2 }]
  });
  let snapshot = $state<unknown>();
  let generation = $state(0);
  let mounts = $state(0);
  let saves = $state(0);
  let callbackVersion = $state('original');
  let callbackEvents = $state<string[]>([]);
  let editor: any;
  let firstEditor: any;
  let initialIds: string[] = [];
  let onOrderChange = $state((id: string) => { callbackEvents = [...callbackEvents, `original:order:${id}`]; });
  let onProfileChange = $state((id: string) => { callbackEvents = [...callbackEvents, `original:profile:${id}`]; });
  let onAssetUploaded = $state((id: string) => { callbackEvents = [...callbackEvents, `original:asset:${id}`]; });

  function ready(value: any) {
    editor = value;
    firstEditor ??= value;
    mounts++;
  }
  function saved(value: unknown) { snapshot = value; saves++; }
  function updateSeed() {
    seed = { ...seed, title: generation ? 'Updated restored order' : 'Updated live order',
      clientName: 'Updated client', poNumber: 'PO-200', deliveryEmail: 'updated@example.com' };
  }
  function replaceCallbacks() {
    callbackVersion = 'current';
    onOrderChange = id => { callbackEvents = [...callbackEvents, `current:order:${id}`]; };
    onProfileChange = id => { callbackEvents = [...callbackEvents, `current:profile:${id}`]; };
    onAssetUploaded = id => { callbackEvents = [...callbackEvents, `current:asset:${id}`]; };
  }
  function useCallbacks() {
    const bridge = getOrderBridge(editor);
    bridge?.onOrderChange?.(seed.orderId, { title: 'Callback probe' });
    bridge?.onProfileChange?.(seed.orderId, 0, { quantity: 3 });
    bridge?.onAssetUploaded?.(seed.orderId, { url: '/fixture.pdf', fileName: 'fixture.pdf', kind: 'pdf' });
  }
  function restore() { snapshot = editor.getSnapshot(); generation++; }
  onMount(() => {
    (window as any).__orderCanvasBridge = {
      inspect: () => ({
        sameEditor: editor === firstEditor,
        selected: editor?.getSelectedShapeIds(),
        shapes: editor?.getCurrentPageShapes(), initialIds,
        bridgePresent: !!getOrderBridge(editor), firstBridgePresent: !!getOrderBridge(firstEditor)
      }),
      annotate: () => {
        initialIds = editor.getCurrentPageShapes().map((shape: any) => shape.id);
        editor.createShape({ id: 'shape:fixture-note', type: 'geo', x: 900, y: 40, props: { text: 'Keep annotation' } });
        editor.select('shape:fixture-note');
      }
    };
    return () => { delete (window as any).__orderCanvasBridge; };
  });
</script>

<header>
  <button onclick={updateSeed}>Update seed</button>
  <button onclick={replaceCallbacks}>Replace callbacks</button>
  <button onclick={useCallbacks}>Use callbacks</button>
  <button onclick={restore}>Restore saved canvas</button>
  <output data-testid="editor-mounts">{mounts}</output>
  <output data-testid="snapshot-saves">{saves}</output>
  <output data-testid="callback-version">{callbackVersion}</output>
  <output data-testid="callback-events">{callbackEvents.join('|')}</output>
</header>
<main>
  {#key generation}
    <TldrawWrapper {snapshot} orderSeed={seed} onReady={ready} onSave={saved}
      {onOrderChange} {onProfileChange} {onAssetUploaded} />
  {/key}
</main>

<style>
  header { display:flex;gap:8px;flex-wrap:wrap;padding:12px; }
  main { height:calc(100dvh - 100px); }
  output { font-size:12px; }
</style>
