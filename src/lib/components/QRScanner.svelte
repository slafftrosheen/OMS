<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';

  let {
    onscan
  }: {
    onscan?: (data: string) => void;
  } = $props();

  let videoElement: HTMLVideoElement;
  let canvasElement: HTMLCanvasElement;
  let stream: MediaStream | null = null;
  let scanning = $state(false);
  let error = $state('');
  let detectedCode = $state('');

  // Simple QR detection using canvas and pattern matching
  // In production, use a library like jsQR
  async function startScanning() {
    if (!browser) return;

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });

      if (videoElement) {
        videoElement.srcObject = stream;
        await videoElement.play();
        scanning = true;
        scanFrame();
      }
    } catch (err: any) {
      error = 'Camera access denied or not available';
      console.error('Camera error:', err);
    }
  }

  function scanFrame() {
    if (!scanning || !videoElement || !canvasElement) return;

    const canvas = canvasElement;
    const context = canvas.getContext('2d');

    if (context && videoElement.readyState === videoElement.HAVE_ENOUGH_DATA) {
      canvas.width = videoElement.videoWidth;
      canvas.height = videoElement.videoHeight;
      context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

      // Here you would use a QR library like jsQR
      // For demo purposes, we'll simulate detection
      // const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      // const code = jsQR(imageData.data, imageData.width, imageData.height);

      // Simulated detection - in real implementation use jsQR or similar
      // if (code) {
      //   detectedCode = code.data;
      //   dispatch('scan', code.data);
      //   stopScanning();
      // }
    }

    if (scanning) {
      requestAnimationFrame(scanFrame);
    }
  }

  function stopScanning() {
    scanning = false;
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      stream = null;
    }
  }

  // Manual input fallback
  function handleManualInput(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.value) {
      onscan?.(input.value);
    }
  }

  onMount(() => {
    startScanning();
  });

  onDestroy(() => {
    stopScanning();
  });
</script>

<div class="qr-scanner">
  {#if error}
    <div class="error-message">
      <p>{error}</p>
      <p>Please enter QR code manually:</p>
      <input
        type="text"
        placeholder="ORDER:xxxxx-xxx"
        onchange={handleManualInput}
        class="manual-input"
      />
    </div>
  {:else}
    <div class="scanner-container">
      <!-- Video preview -->
      <video
        bind:this={videoElement}
        class="scanner-video"
        playsinline
        autoplay
        muted
></video>

      <!-- Hidden canvas for processing -->
      <canvas bind:this={canvasElement} class="hidden-canvas"></canvas>

      <!-- Scanning overlay -->
      <div class="scanning-overlay">
        <div class="scan-area">
          <div class="corner corner-tl"></div>
          <div class="corner corner-tr"></div>
          <div class="corner corner-bl"></div>
          <div class="corner corner-br"></div>
        </div>
        <p class="scan-instruction">Position QR code within frame</p>
      </div>

      {#if detectedCode}
        <div class="detected-code">
          ✓ Detected: {detectedCode}
        </div>
      {/if}
    </div>

    <!-- Manual input option -->
    <div class="manual-input-section">
      <p class="manual-label">Or enter code manually:</p>
      <input
        type="text"
        placeholder="ORDER:xxxxx-xxx"
        onchange={handleManualInput}
        class="manual-input"
      />
    </div>
  {/if}
</div>

<style>
  .qr-scanner {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem;
  }

  .scanner-container {
    position: relative;
    width: 100%;
    max-width: 500px;
    margin: 0 auto;
    background: black;
    border-radius: 8px;
    overflow: hidden;
  }

  .scanner-video {
    width: 100%;
    height: auto;
    display: block;
  }

  .hidden-canvas {
    display: none;
  }

  .scanning-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: color-mix(in oklab, var(--bg-0) 45%, transparent);
  }

  .scan-area {
    position: relative;
    width: 250px;
    height: 250px;
    border: 2px solid color-mix(in oklab, var(--bg-0) 5%, transparent);
  }

  .corner {
    position: absolute;
    width: 30px;
    height: 30px;
    border: 3px solid var(--ok);
  }

  .corner-tl {
    top: -2px;
    left: -2px;
    border-right: none;
    border-bottom: none;
  }

  .corner-tr {
    top: -2px;
    right: -2px;
    border-left: none;
    border-bottom: none;
  }

  .corner-bl {
    bottom: -2px;
    left: -2px;
    border-right: none;
    border-top: none;
  }

  .corner-br {
    bottom: -2px;
    right: -2px;
    border-left: none;
    border-top: none;
  }

  .scan-instruction {
    margin-top: 2rem;
    color: var(--bg-0);
    font-size: 0.875rem;
    text-align: center;
    text-shadow: 0 1px 3px oklch(0% 0 0 / 80%);
  }

  .detected-code {
    position: absolute;
    bottom: 1rem;
    left: 50%;
    transform: translateX(-50%);
    background: var(--ok);
    color: var(--bg-0);
    padding: 0.5rem 1rem;
    border-radius: 4px;
    font-weight: 600;
  }

  .manual-input-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    align-items: center;
  }

  .manual-label {
    font-size: 0.875rem;
    color: var(--muted);
  }

  .manual-input {
    width: 100%;
    max-width: 300px;
    padding: 0.75rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    font-size: 1rem;
    text-align: center;
    font-family: 'Courier New', monospace;
  }

  .error-message {
    text-align: center;
    padding: 2rem;
    color: var(--danger);
  }

  .error-message p {
    margin: 0.5rem 0;
  }
</style>