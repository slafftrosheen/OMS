<!-- src/lib/components/qr/QRScanner.svelte -->
<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { createEventDispatcher } from 'svelte';
    import Button from '$lib/components/ui/Button.svelte';
    import Modal from '$lib/components/ui/Modal.svelte';

    export let open = false;
    export let continuous = false;

    const dispatch = createEventDispatcher();

    let videoElement: HTMLVideoElement;
    let canvasElement: HTMLCanvasElement;
    let stream: MediaStream | null = null;
    let scanning = false;
    let error: string | null = null;
    let scanInterval: number;

    async function startScanning() {
        error = null;
        
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' }
            });

            if (videoElement) {
                videoElement.srcObject = stream;
                videoElement.play();
                scanning = true;

                // Start scan loop
                scanInterval = setInterval(() => {
                    scanQRCode();
                }, 500) as unknown as number;
            }
        } catch (err) {
            error = 'Camera access denied or not available';
            console.error('Camera error:', err);
        }
    }

    function scanQRCode() {
        if (!videoElement || !canvasElement || !scanning) return;

        const canvas = canvasElement;
        const video = videoElement;
        const context = canvas.getContext('2d');

        if (!context) return;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        
        // Use jsQR library for QR detection
        // @ts-ignore
        const code = jsQR(imageData.data, imageData.width, imageData.height);

        if (code) {
            handleQRCodeDetected(code.data);
        }
    }

    async function handleQRCodeDetected(data: string) {
        if (!continuous) {
            stopScanning();
        }

        // Validate QR code with backend
        try {
            const response = await fetch('/api/qr-codes/scan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: data })
            });

            const result = await response.json();

            if (result.success) {
                dispatch('scan', result.data);
                
                if (!continuous) {
                    open = false;
                }
            } else {
                error = 'Invalid QR code';
            }
        } catch (err) {
            error = 'Failed to validate QR code';
        }
    }

    function stopScanning() {
        scanning = false;
        clearInterval(scanInterval);

        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            stream = null;
        }

        if (videoElement) {
            videoElement.srcObject = null;
        }
    }

    function handleClose() {
        stopScanning();
        open = false;
        dispatch('close');
    }

    onMount(() => {
        if (open) {
            startScanning();
        }
    });

    onDestroy(() => {
        stopScanning();
    });

    $: if (open && !scanning) {
        startScanning();
    } else if (!open && scanning) {
        stopScanning();
    }
</script>

<svelte:head>
    <script src="https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js"></script>
</svelte:head>

<Modal bind:open title="Scan QR Code" size="md" on:close={handleClose}>
    <div class="qr-scanner">
        {#if error}
            <div class="error-state">
                <p class="error-message">⚠️ {error}</p>
                <Button variant="primary" on:click={startScanning}>
                    Try Again
                </Button>
            </div>
        {:else}
            <div class="scanner-container">
                <video
                    bind:this={videoElement}
                    class="scanner-video"
                    autoplay
                    playsinline
                    muted
                />
                <canvas bind:this={canvasElement} style="display: none;"></canvas>
                
                <div class="scanner-overlay">
                    <div class="scan-frame"></div>
                </div>

                {#if scanning}
                    <div class="scan-indicator">
                        <div class="scan-line"></div>
                    </div>
                {/if}
            </div>

            <div class="scanner-instructions">
                <p>Position the QR code within the frame</p>
                {#if continuous}
                    <p class="continuous-note">Continuous scanning enabled</p>
                {/if}
            </div>
        {/if}
    </div>

    <svelte:fragment slot="footer">
        <Button variant="ghost" on:click={handleClose}>
            Cancel
        </Button>
    </svelte:fragment>
</Modal>

<style>
    .qr-scanner {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    .error-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1rem;
        padding: 2rem;
    }

    .error-message {
        font-size: 1rem;
        color: var(--color-danger, #dc3545);
        margin: 0;
    }

    .scanner-container {
        position: relative;
        width: 100%;
        aspect-ratio: 1;
        background: black;
        border-radius: 0.5rem;
        overflow: hidden;
    }

    .scanner-video {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }

    .scanner-overlay {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: none;
    }

    .scan-frame {
        width: 250px;
        height: 250px;
        border: 3px solid white;
        border-radius: 1rem;
        box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.5);
        position: relative;
    }

    .scan-frame::before,
    .scan-frame::after {
        content: '';
        position: absolute;
        width: 30px;
        height: 30px;
        border: 4px solid #0066cc;
    }

    .scan-frame::before {
        top: -4px;
        left: -4px;
        border-right: none;
        border-bottom: none;
    }

    .scan-frame::after {
        top: -4px;
        right: -4px;
        border-left: none;
        border-bottom: none;
    }

    .scan-indicator {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: none;
    }

    .scan-line {
        width: 250px;
        height: 2px;
        background: linear-gradient(90deg, transparent, #0066cc, transparent);
        animation: scan 2s ease-in-out infinite;
    }

    @keyframes scan {
        0%, 100% {
            transform: translateY(-125px);
        }
        50% {
            transform: translateY(125px);
        }
    }

    .scanner-instructions {
        text-align: center;
        padding: 1rem;
    }

    .scanner-instructions p {
        margin: 0.25rem 0;
        font-size: 0.875rem;
        color: var(--color-gray-600, #6b7280);
    }

    .continuous-note {
        font-weight: 600;
        color: var(--color-primary, #0066cc);
    }

    @media (max-width: 640px) {
        .scan-frame {
            width: 200px;
            height: 200px;
        }

        .scan-line {
            width: 200px;
        }

        @keyframes scan {
            0%, 100% {
                transform: translateY(-100px);
            }
            50% {
                transform: translateY(100px);
            }
        }
    }
</style>