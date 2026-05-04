<!-- src/lib/components/qr/QRCodeDisplay.svelte -->
<script lang="ts">
    import { onMount } from 'svelte';
    import Button from '$lib/components/ui/Button.svelte';

    interface Props {
        orderId: string;
        station?: string | null;
        size?: number;
    }

    let { orderId, station = null, size = 300 }: Props = $props();

    let qrCodeImage: string | null = $state(null);
    let loading = $state(false);
    let error: string | null = $state(null);

    async function generateQRCode() {
        loading = true;
        error = null;

        try {
            const response = await fetch('/api/qr-codes/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orderId,
                    type: station ? 'station' : 'order',
                    station
                })
            });

            const data = await response.json();

            if (data.success) {
                qrCodeImage = data.data.imageUrl;
            } else {
                error = 'Failed to generate QR code';
            }
        } catch (err) {
            error = 'Network error';
        } finally {
            loading = false;
        }
    }

    function downloadQRCode() {
        if (!qrCodeImage) return;

        const link = document.createElement('a');
        link.href = qrCodeImage;
        link.download = `qr-code-${orderId}${station ? `-${station}` : ''}.png`;
        link.click();
    }

    function printQRCode() {
        if (!qrCodeImage) return;

        const printWindow = window.open('', '_blank');
        if (printWindow) {
            printWindow.document.write(`
                <html>
                    <head>
                        <title>QR Code - ${orderId}</title>
                        <style>
                            body { 
                                display: flex; 
                                flex-direction: column;
                                align-items: center; 
                                justify-content: center; 
                                min-height: 100vh;
                                margin: 0;
                                font-family: Arial, sans-serif;
                            }
                            img { 
                                max-width: 100%; 
                                height: auto; 
                            }
                            .info {
                                margin-top: 1rem;
                                text-align: center;
                            }
                            @media print {
                                body { padding: 2rem; }
                            }
                        </style>
                    </head>
                    <body>
                        <img src="${qrCodeImage}" alt="QR Code" />
                        <div class="info">
                            <h2>Order: ${orderId}</h2>
                            ${station ? `<p>Station: ${station}</p>` : ''}
                        </div>
                    </body>
                </html>
            `);
            printWindow.document.close();
            printWindow.print();
        }
    }

    onMount(() => {
        generateQRCode();
    });
</script>

<div class="qr-code-display">
    {#if loading}
        <div class="loading-state">
            <div class="spinner"></div>
            <p>Generating QR code...</p>
        </div>
    {:else if error}
        <div class="error-state">
            <p class="error-message">⚠️ {error}</p>
            <Button variant="primary" onclick={generateQRCode}>
                Retry
            </Button>
        </div>
    {:else if qrCodeImage}
        <div class="qr-container">
            <img
                src={qrCodeImage}
                alt="QR Code for order {orderId}"
                style="width: {size}px; height: {size}px;"
                class="qr-image"
            />
            
            <div class="qr-info">
                <p class="qr-label">Order: {orderId}</p>
                {#if station}
                    <p class="qr-station">Station: {station}</p>
                {/if}
            </div>

            <div class="qr-actions">
                <Button variant="outline" size="sm" onclick={downloadQRCode}>
                    📥 Download
                </Button>
                <Button variant="outline" size="sm" onclick={printQRCode}>
                    🖨️ Print
                </Button>
            </div>
        </div>
    {/if}
</div>

<style>
    .qr-code-display {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1rem;
        padding: 1rem;
    }

    .loading-state,
    .error-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1rem;
        padding: 2rem;
    }

    .spinner {
        width: 3rem;
        height: 3rem;
        border: 4px solid var(--color-gray-200, var(--border));
        border-top-color: var(--color-primary, var(--brand));
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
        to { transform: rotate(360deg); }
    }

    .error-message {
        color: var(--color-danger, var(--error));
        margin: 0;
    }

    .qr-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1rem;
        padding: 1.5rem;
        background: var(--bg-1);
        border: 1px solid var(--color-border, var(--border));
        border-radius: 0.5rem;
        box-shadow: 0 2px 4px color-mix(in oklab, var(--bg-0) 5%, transparent);
    }

    .qr-image {
        border-radius: 0.5rem;
        border: 2px solid var(--color-border, var(--border));
    }

    .qr-info {
        text-align: center;
    }

    .qr-label,
    .qr-station {
        margin: 0.25rem 0;
        font-size: 0.875rem;
        color: var(--color-gray-700, var(--ink-secondary));
    }

    .qr-label {
        font-weight: 600;
    }

    .qr-actions {
        display: flex;
        gap: 0.75rem;
    }
</style>