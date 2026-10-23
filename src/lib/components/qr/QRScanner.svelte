<!-- src/lib/components/qr/QRScanner.svelte -->
<script lang="ts">
    import { tick, untrack } from 'svelte';
    import { base } from '$app/paths';
    import Button from '$lib/components/ui/Button.svelte';
    import Modal from '$lib/components/ui/Modal.svelte';

    let {
        open = $bindable(false),
        continuous = false,
        onscan,
        onclose
    }: {
        open?: boolean;
        continuous?: boolean;
        onscan?: (data: any) => void;
        onclose?: () => void;
    } = $props();

    let videoElement = $state<HTMLVideoElement>();
    let canvasElement = $state<HTMLCanvasElement>();
    let stream: MediaStream | null = null;
    let scanning = $state(false);
    let error = $state<string | null>(null);
    let scanInterval: ReturnType<typeof setInterval> | undefined;
    let generation = 0;
    let validation: AbortController | undefined;
    let lastDetected = '';

    function stopScanning() {
        generation++;
        scanning = false;
        clearInterval(scanInterval);
        validation?.abort();
        validation = undefined;
        stream?.getTracks().forEach(track => track.stop());
        stream = null;
        if (videoElement) { videoElement.pause(); videoElement.srcObject = null; }
    }

    async function startScanning() {
        stopScanning();
        const token = generation;
        error = null;
        lastDetected = '';
        await tick();
        if (!open || token !== generation || !videoElement || !canvasElement) return;
        try {
            const acquired = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            if (!open || token !== generation || !videoElement) {
                acquired.getTracks().forEach(track => track.stop());
                return;
            }
            stream = acquired;
            videoElement.srcObject = acquired;
            await videoElement.play();
            if (!open || token !== generation) return;
            scanning = true;
            scanInterval = setInterval(() => scanQRCode(token), 500);
        } catch (err) {
            if (!open || token !== generation) return;
            stopScanning();
            error = 'Camera access denied or not available';
        }
    }

    function scanQRCode(token: number) {
        if (!videoElement || !canvasElement || !scanning || validation || token !== generation) return;
        const video = videoElement;
        if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
        const decode = (window as any).jsQR;
        if (typeof decode !== 'function') {
            stopScanning();
            error = 'QR decoder is unavailable. Check your connection and try again.';
            return;
        }
        const context = canvasElement.getContext('2d');
        if (!context) return;
        canvasElement.width = video.videoWidth;
        canvasElement.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvasElement.width, canvasElement.height);
        const image = context.getImageData(0, 0, canvasElement.width, canvasElement.height);
        const code = decode(image.data, image.width, image.height);
        if (!code) { lastDetected = ''; return; }
        if (code.data === lastDetected) return;
        lastDetected = code.data;
        void validateCode(code.data, token);
    }

    async function validateCode(content: string, token: number) {
        const controller = new AbortController();
        validation = controller;
        let timedOut = false;
        const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 12000);
        try {
            const response = await fetch(`${base}/api/qr-codes/scan`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content }), signal: controller.signal
            });
            const result = await response.json();
            if (!open || token !== generation || controller.signal.aborted) return;
            if (!response.ok || !result.success) throw new Error('Invalid QR code');
            onscan?.(result.data);
            if (!continuous) { stopScanning(); open = false; }
        } catch (err) {
            if (!open || token !== generation || (controller.signal.aborted && !timedOut)) return;
            stopScanning();
            error = timedOut ? 'QR validation timed out. Please try again.' : err instanceof Error && err.message === 'Invalid QR code' ? 'Invalid QR code' : 'Failed to validate QR code';
        } finally { clearTimeout(timeout); if (validation === controller) validation = undefined; }
    }

    function handleClose() { stopScanning(); open = false; onclose?.(); }

    $effect(() => {
        if (open) untrack(() => { void startScanning(); });
        return stopScanning;
    });
</script>

<svelte:head>
    <script src="https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js"></script>
</svelte:head>

<Modal bind:open title="Scan QR Code" size="md" onclose={handleClose}>
    <div class="qr-scanner">
        {#if error}
            <div class="error-state">
                <p class="error-message">⚠️ {error}</p>
                <Button variant="primary" onclick={startScanning}>
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
></video>
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

    {#snippet footer()}
    
            <Button variant="ghost" onclick={handleClose}>
                Cancel
            </Button>
        
    {/snippet}
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
        color: var(--color-danger, var(--error));
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
        box-shadow: 0 0 0 9999px color-mix(in oklab, var(--bg-0) 55%, transparent);
        position: relative;
    }

    .scan-frame::before,
    .scan-frame::after {
        content: '';
        position: absolute;
        width: 30px;
        height: 30px;
        border: 4px solid var(--brand);
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
        background: linear-gradient(90deg, transparent, var(--brand), transparent);
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
        color: var(--color-gray-600, var(--ink-tertiary));
    }

    .continuous-note {
        font-weight: 600;
        color: var(--color-primary, var(--brand));
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