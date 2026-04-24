<script lang="ts">
  import { onDestroy } from 'svelte';
  import { updateMaterial, findMaterialBySku } from './store';
  import Quagga from '@ericblade/quagga2';

  let scannerContainer: HTMLDivElement = $state();
  let code = $state('');
  let scanning = $state(false);
  let lastScanned = '';
  let status = $state('Ready to scan');

  async function startScanner() {
    if (scanning) return;

    try {
      status = 'Initializing camera...';

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
      status = 'Scanning... Point at barcode';

      Quagga.onDetected(handleDetected);
    } catch (err) {
      console.error('Scanner init failed:', err);
      status = 'Camera access denied or not available';
    }
  }

  function stopScanner() {
    if (!scanning) return;
    Quagga.stop();
    Quagga.offDetected(handleDetected);
    scanning = false;
    status = 'Scanner stopped';
  }

  function handleDetected(result: any) {
    const detected = result.codeResult.code;

    // Debounce: ignore same code within 2 seconds
    if (detected === lastScanned) return;
    lastScanned = detected;
    setTimeout(() => { lastScanned = ''; }, 2000);

    code = detected;
    status = `Detected: ${detected}`;

    // Auto-apply if item found
    const material = findMaterialBySku(detected);
    if (material) {
      applyCode();
    }
  }

  async function applyCode() {
    if (!code.trim()) return;

    const material = findMaterialBySku(code);
    if (material) {
      await updateMaterial(material.id, { stock: material.stock + 1 });
      status = `✓ Added +1 to ${material.name_en || material.code} (${material.sku}) - Stock: ${material.stock + 1}`;
    } else {
      status = `✗ Material not found: ${code}`;
    }
    code = '';
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') applyCode();
  }

  onDestroy(() => {
    if (scanning) stopScanner();
  });
</script>

<section class="card">
  <h3>Scan barcode</h3>
  
  <div class="scanner-container" bind:this={scannerContainer}></div>
  
  <p class="status" class:success={status.startsWith('✓')} class:error={status.startsWith('✗')}>
    {status}
  </p>
  
  <div class="row" style="gap:6px;margin-top:8px">
    {#if !scanning}
      <button class="tag" onclick={startScanner}>Start scanner</button>
    {:else}
      <button class="tag" onclick={stopScanner}>Stop scanner</button>
    {/if}
    <input 
      placeholder="Type SKU…" 
      bind:value={code} 
      onkeydown={handleKeydown}
    >
    <button class="tag" onclick={applyCode}>Apply</button>
  </div>
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
