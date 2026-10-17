<script lang="ts">
  import { onDestroy } from 'svelte';
  import { findMaterialBySku } from './store';
  import {base} from '$app/paths';
  import {t} from 'svelte-i18n';
  import type {Material} from './types';
  import Quagga from '@ericblade/quagga2';

  let scannerContainer: HTMLDivElement = $state();
  let code = $state('');
  let scanning = $state(false);
  let lastScanned = '';
  let status = $state('');
  let match=$state<Material|null>(null);

  async function startScanner() {
    if (scanning) return;

    try {
      status = $t('inventoryConsolidation.scannerStarting');

      await Quagga.init({
        inputStream: {
          type: 'LiveStream',
          target: scannerContainer,
          constraints: {
            facingMode: 'environment',
            width: { min: 640 },
            height: { min: 480 }
          }
        },
        decoder: {
          readers: [
            'code_128_reader',
            'ean_reader',
            'ean_8_reader',
            'code_39_reader',
            'upc_reader',
            'upc_e_reader'
          ]
        },
        locate: true,
        frequency: 10
      });

      Quagga.start();
      scanning = true;
      status = $t('inventoryConsolidation.scannerActive');

      Quagga.onDetected(handleDetected);
    } catch (err) {
      console.error('Scanner init failed:', err);
      status = $t('inventoryConsolidation.scannerUnavailable');
    }
  }

  function stopScanner() {
    if (!scanning) return;
    Quagga.stop();
    Quagga.offDetected(handleDetected);
    scanning = false;
    status = $t('inventoryConsolidation.scannerStopped');
  }

  function handleDetected(result: any) {
    const detected=result?.codeResult?.code;
    if(typeof detected!=='string'||!detected.trim())return;

    // Debounce: ignore same code within 2 seconds
    if (detected === lastScanned) return;
    lastScanned = detected;
    setTimeout(() => { lastScanned = ''; }, 2000);

    code = detected;
    status=$t('inventoryConsolidation.barcodeDetected',{values:{sku:detected}});

    // Detection is LOOKUP ONLY: scanners must never mutate stock.
    // An operator must explicitly open the material and confirm an audited
    // manual movement; repeated camera detections cannot add units.
    match=findMaterialBySku(detected);
  }

  function applyCode() {
    if(!code.trim())return;
    match=findMaterialBySku(code);
    status=match
      ?$t('inventoryConsolidation.barcodeFound',{values:{sku:match.sku}})
      :$t('inventoryConsolidation.barcodeNotFound');
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') applyCode();
  }

  onDestroy(() => {
    if (scanning) stopScanner();
  });
</script>

<section class="card">
  <h3>{$t('inventoryConsolidation.scanTitle')}</h3>
  <p class="status">{$t('inventoryConsolidation.barcodeLookupOnly')}</p>
  
  <div class="scanner-container" bind:this={scannerContainer}></div>
  
  <p class="status" class:success={status.startsWith('✓')} class:error={status.startsWith('✗')}>
    {status}
  </p>
  
  <div class="row" style="gap:6px;margin-top:8px">
    {#if !scanning}
      <button class="tag" onclick={startScanner}>{$t('inventoryConsolidation.startScanner')}</button>
    {:else}
      <button class="tag" onclick={stopScanner}>{$t('inventoryConsolidation.stopScanner')}</button>
    {/if}
    <input 
      placeholder={$t('inventoryConsolidation.skuPlaceholder')} 
      bind:value={code} 
      onkeydown={handleKeydown}
    >
    <button class="tag" onclick={applyCode}>{$t('inventoryConsolidation.lookup')}</button>
  </div>
  {#if match}
    <p class="status">
      <strong>{match.sku}</strong> · {match.name_en??match.code}
      · {match.stock} {match.unit}
    </p>
    <a class="tag" href={`${base}/inventory/${encodeURIComponent(match.id)}`}>
      {$t('inventoryConsolidation.openMaterial')}
    </a>
  {/if}
</section>

<style>
.scanner-container {
  width: 100%;
  max-height: 40vh;
  border-radius: 12px;
  border: 1px solid var(--border);
  overflow: hidden;
  background: var(--bg-0);
}

.scanner-container :global(video) {
  width: 100%;
  height: auto;
}

.scanner-container :global(canvas) {
  display: none;
}

.status {
  margin: 8px 0;
  padding: 8px;
  border-radius: 6px;
  background: var(--bg-1);
  font-size: 0.9em;
}

.status.success {
  background: color-mix(in oklab, var(--ok) 20%, transparent);
  color: var(--ok);
}

.status.error {
  background: color-mix(in oklab, var(--error) 20%, transparent);
  color: var(--error);
}

input {
  flex: 1;
  background: var(--bg-0);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px;
  color: var(--text);
}
</style>
