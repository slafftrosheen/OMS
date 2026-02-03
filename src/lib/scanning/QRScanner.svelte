<script lang="ts">
/**
 * QR Scanner Component
 * Mobile-optimized QR code scanner using device camera
 */

import { onMount, onDestroy } from 'svelte';
import { Camera, CameraOff, Loader2, CheckCircle, AlertCircle } from 'lucide-svelte';

let {
  station = null,
  actionType = 'view',
  autoClose = true,
  onscanned,
  onclose,
  onmanualEntry
}: {
  station?: string | null;
  actionType?: 'view' | 'stage_update' | 'photo' | 'comment';
  autoClose?: boolean;
  onscanned?: (data: { scan: any; order: any }) => void;
  onclose?: () => void;
  onmanualEntry?: () => void;
} = $props();

let videoElement: HTMLDivElement;
let scanning = $state(false);
let scanResult: any = $state(null);
let error: string | null = $state(null);
let processing = $state(false);

onMount(() => {
  startScanner();
});

onDestroy(() => {
  stopScanner();
});

async function startScanner() {
  if (scanning) return;

  error = null;
  scanning = true;

  try {
    // Using browser's BarcodeDetector API if available
    if ('BarcodeDetector' in window) {
      // Modern approach using BarcodeDetector
      const barcodeDetector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
      
      // Access camera
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      
      const video = document.createElement('video');
      video.srcObject = stream;
      video.play();
      
      const detectBarcodes = async () => {
        if (!scanning) return;
        
        try {
          const barcodes = await barcodeDetector.detect(video);
          if (barcodes.length > 0) {
            handleDetection(barcodes[0]);
          }
        } catch (err) {
          console.error('Barcode detection error:', err);
        }
        
        requestAnimationFrame(detectBarcodes);
      };
      
      detectBarcodes();
    } else {
      // Fallback to quagga2-like library if BarcodeDetector isn't available
      error = 'Barcode detection not supported in this browser';
      scanning = false;
    }
  } catch (err) {
    console.error('Scanner error:', err);
    error = err instanceof Error ? err.message : 'Failed to start scanner';
    scanning = false;
  }
}

function stopScanner() {
  if (scanning) {
    scanning = false;
  }
}

async function handleDetection(result: any) {
  if (processing || !result.rawValue) return;

  const code = result.rawValue;
  
  // Validate OMS QR code format
  if (!code.startsWith('OMS-')) {
    error = 'Invalid QR code. Please scan an OMS order QR.';
    return;
  }

  processing = true;
  error = null;

  try {
    // Get device info
    const deviceInfo = {
      userAgent: navigator.userAgent,
      screen: `${screen.width}x${screen.height}`,
      platform: navigator.platform
    };

    // Log scan
    const response = await fetch('/api/qr-codes/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        qrCode: code,
        actionType,
        station,
        deviceInfo: JSON.stringify(deviceInfo)
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Scan failed');
    }

    const data = await response.json();
    scanResult = data.data;

    // Stop scanner
    stopScanner();

    // Emit scan event
    onscanned?.({
      scan: scanResult.scan,
      order: scanResult.order
    });

    // Auto-close after success
    if (autoClose) {
      setTimeout(() => {
        onclose?.();
      }, 2000);
    }

  } catch (err) {
    console.error('Scan processing error:', err);
    error = err instanceof Error ? err.message : 'Failed to process scan';
    processing = false;
  }
}

function handleManualInput() {
  onmanualEntry?.();
}

function handleClose() {
  stopScanner();
  onclose?.();
}
</script>

<div class="qr-scanner">
  <div class="scanner-header">
    <h3>Scan QR Code</h3>
    <button class="close-btn" on:click={handleClose} aria-label="Close scanner">
      <CameraOff size={20} />
    </button>
  </div>

  <div class="scanner-viewport" bind:this={videoElement}>
    {#if !scanning && !scanResult}
      <div class="scanner-placeholder">
        <Camera size={48} />
        <p>Initializing camera...</p>
      </div>
    {/if}

    {#if scanning}
      <div class="scanner-overlay">
        <div class="scan-frame"></div>
        <p class="scan-hint">Position QR code within frame</p>
      </div>
    {/if}

    {#if processing}
      <div class="processing-overlay">
        <Loader2 size={48} class="spinner" />
        <p>Processing scan...</p>
      </div>
    {/if}

    {#if scanResult}
      <div class="success-overlay">
        <CheckCircle size={48} style="color: var(--ok)" />
        <h4>Scan Successful!</h4>
        <p class="order-info">
          <strong>Order:</strong> {scanResult.order?.po_number || 'N/A'}
        </p>
        <p class="order-info">
          <strong>Title:</strong> {scanResult.order?.title || 'N/A'}
        </p>
      </div>
    {/if}
  </div>

  {#if error}
    <div class="scanner-error" role="alert">
      <AlertCircle size={20} />
      <span>{error}</span>
    </div>
  {/if}

  <div class="scanner-actions">
    <button class="btn-secondary" on:click={handleManualInput}>
      Manual Entry
    </button>
    
    {#if !scanning && !scanResult}
      <button class="btn-primary" on:click={startScanner}>
        <Camera size={16} />
        Start Camera
      </button>
    {/if}
  </div>
</div>

<style>
  .qr-scanner {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    width: 100%;
    max-width: 600px;
    margin: 0 auto;
  }

  .scanner-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .scanner-header h3 {
    margin: 0;
    font-size: 1.25rem;
    color: var(--text);
  }

  .close-btn {
    padding: 0.5rem;
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text);
    cursor: pointer;
    transition: background 0.2s;
  }

  .close-btn:hover {
    background: var(--bg-2);
  }

  .scanner-viewport {
    position: relative;
    width: 100%;
    aspect-ratio: 4 / 3;
    background: var(--bg-0);
    border: 2px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
  }

  .scanner-placeholder {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    color: var(--muted);
  }

  .scanner-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  }

  .scan-frame {
    width: 250px;
    height: 250px;
    border: 3px solid var(--accent-1);
    border-radius: 12px;
    box-shadow: 
      0 0 0 9999px rgba(0, 0, 0, 0.5),
      0 0 20px var(--accent-1);
    animation: pulse 2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }

  .scan-hint {
    margin-top: 2rem;
    padding: 0.5rem 1rem;
    background: rgba(0, 0, 0, 0.7);
    color: white;
    border-radius: 4px;
    font-size: 0.875rem;
  }

  .processing-overlay,
  .success-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    background: rgba(0, 0, 0, 0.9);
    color: white;
  }

  .processing-overlay p,
  .success-overlay h4 {
    margin: 0;
  }

  .processing-overlay p {
    font-size: 1rem;
  }

  .success-overlay h4 {
    font-size: 1.25rem;
    color: var(--ok);
  }

  .order-info {
    margin: 0;
    font-size: 0.875rem;
  }

  .order-info strong {
    color: var(--muted);
  }

  :global(.spinner) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .scanner-error {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: var(--danger);
    color: white;
    border-radius: 6px;
    font-size: 0.875rem;
  }

  .scanner-actions {
    display: flex;
    gap: 0.75rem;
    justify-content: flex-end;
  }

  button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 4px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-secondary {
    background: var(--bg-2);
    color: var(--text);
    border: 1px solid var(--border);
  }

  .btn-secondary:hover {
    background: var(--bg-1);
  }

  .btn-primary {
    background: var(--accent-1);
    color: white;
  }

  .btn-primary:hover {
    opacity: 0.9;
  }

  button:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }

  /* Mobile optimizations */
  @media (max-width: 768px) {
    .qr-scanner {
      max-width: 100%;
    }

    .scanner-viewport {
      aspect-ratio: 3 / 4;
    }

    .scan-frame {
      width: 200px;
      height: 200px;
    }
  }
</style>