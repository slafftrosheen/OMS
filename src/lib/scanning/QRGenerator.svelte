<script lang="ts">
  import Download from 'lucide-svelte/icons/download';
  import Printer from 'lucide-svelte/icons/printer';
  import RefreshCw from 'lucide-svelte/icons/refresh-cw';
/**
 * QR Generator Component
 * Generates and displays QR codes for orders
 */

import Icon from '$lib/ui/Icon.svelte';

  interface Props {
    orderId: string;
    poNumber: string;
  }

  let { orderId, poNumber }: Props = $props();

let loading = $state(false);
let qrCode: any = $state(null);
let error: string | null = $state(null);
let format: 'QR' | 'CODE128' = $state('QR');
let size = $state(300);

async function generateQRCode() {
  loading = true;
  error = null;

  try {
    const response = await fetch('/api/qr-codes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId,
        format,
        size
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to generate QR code');
    }

    const result = await response.json();
    qrCode = result.data;

  } catch (err) {
    console.error('QR generation error:', err);
    error = err instanceof Error ? err.message : 'Failed to generate QR code';
  } finally {
    loading = false;
  }
}

function downloadQRCode() {
  if (!qrCode?.imageUrl) return;

  const link = document.createElement('a');
  link.download = `qr-${poNumber}.png`;
  link.href = qrCode.imageUrl;
  link.click();
}

function printQRCode() {
  if (!qrCode?.imageUrl) return;

  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>QR Code - ${poNumber}</title>
        <style>
          body {
            margin: 0;
            padding: 20px;
            display: flex;
            flex-direction: column;
            align-items: center;
            font-family: sans-serif;
          }
          img {
            max-width: 400px;
            border: 2px solid var(--ink-primary);
            padding: 10px;
          }
          .info {
            margin-top: 20px;
            text-align: center;
          }
          .code {
            font-family: monospace;
            font-size: 14px;
            margin-top: 10px;
          }
        </style>
      </head>
      <body>
        <div class="info">
          <h2>Order QR Code</h2>
          <p><strong>PO Number:</strong> ${poNumber}</p>
        </div>
        <img src="${qrCode.imageUrl}" alt="QR Code for ${poNumber}" />
        <div class="code">${qrCode.qr_code}</div>
      </body>
    </html>
  `);

  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
    printWindow.close();
  }, 250);
}
</script>

<div class="qr-generator">
  <div class="generator-controls">
    <div class="control-group">
      <label for="format">Format:</label>
      <select id="format" bind:value={format} disabled={loading}>
        <option value="QR">QR Code</option>
        <option value="CODE128">Barcode (CODE128)</option>
      </select>
    </div>

    <div class="control-group">
      <label for="size">Size:</label>
      <select id="size" bind:value={size} disabled={loading}>
        <option value="200">Small (200px)</option>
        <option value="300">Medium (300px)</option>
        <option value="400">Large (400px)</option>
      </select>
    </div>

    <button 
      class="btn-primary"
      onclick={generateQRCode}
      disabled={loading}
    >
      {#if loading}
        <RefreshCw size={16} class="spinner" />
        Generating...
      {:else}
        Generate QR Code
      {/if}
    </button>
  </div>

  {#if error}
    <div class="error-message" role="alert">
      {error}
    </div>
  {/if}

  {#if qrCode}
    <div class="qr-display">
      <div class="qr-image-container">
        <img src={qrCode.imageUrl} alt="QR Code for {poNumber}" />
      </div>

      <div class="qr-info">
        <p class="qr-code-text">{qrCode.qr_code}</p>
        <p class="qr-meta">Generated: {new Date(qrCode.generated_at).toLocaleString()}</p>
      </div>

      <div class="qr-actions">
        <button class="btn-secondary" onclick={downloadQRCode}>
          <Download size={16} />
          Download
        </button>
        <button class="btn-secondary" onclick={printQRCode}>
          <Printer size={16} />
          Print
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  .qr-generator {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .generator-controls {
    display: flex;
    gap: 1rem;
    align-items: flex-end;
    flex-wrap: wrap;
  }

  .control-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .control-group label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text);
  }

  .control-group select {
    padding: 0.5rem;
    background: var(--bg-0);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text);
    font-size: 0.875rem;
  }

  .control-group select:focus {
    outline: 2px solid var(--focus);
    outline-offset: 1px;
  }

  .error-message {
    padding: 0.75rem 1rem;
    background: var(--danger);
    color: var(--bg-0);
    border-radius: 6px;
    font-size: 0.875rem;
  }

  .qr-display {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1.5rem;
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: 8px;
  }

  .qr-image-container {
    display: flex;
    justify-content: center;
    padding: 1rem;
    background: white;
    border-radius: 6px;
  }

  .qr-image-container img {
    max-width: 100%;
    height: auto;
  }

  .qr-info {
    text-align: center;
  }

  .qr-code-text {
    font-family: monospace;
    font-size: 0.75rem;
    color: var(--muted);
    word-break: break-all;
    margin: 0 0 0.5rem 0;
  }

  .qr-meta {
    font-size: 0.75rem;
    color: var(--muted);
    margin: 0;
  }

  .qr-actions {
    display: flex;
    gap: 0.75rem;
    justify-content: center;
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

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-primary {
    background: var(--accent-1);
    color: var(--bg-0);
  }

  .btn-primary:hover:not(:disabled) {
    opacity: 0.9;
  }

  .btn-secondary {
    background: var(--bg-2);
    color: var(--text);
    border: 1px solid var(--border);
  }

  .btn-secondary:hover {
    background: var(--bg-0);
  }

  button:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }

  :global(.spinner) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>