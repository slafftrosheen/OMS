<!-- src/lib/components/files/FileUpload.svelte -->
<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import Button from '$lib/components/ui/Button.svelte';

    export let orderId: string;
    export let accept = '*/*';
    export let maxSize = 50 * 1024 * 1024; // 50MB
    export let multiple = true;

    const dispatch = createEventDispatcher();

    let isDragging = false;
    let uploading = false;
    let uploadProgress = 0;
    let fileInputElement: HTMLInputElement;

    const ALLOWED_TYPES = [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/zip',
        'text/plain',
        'application/x-dxf',
        'application/dxf'
    ];

    function handleDragOver(event: DragEvent) {
        event.preventDefault();
        isDragging = true;
    }

    function handleDragLeave() {
        isDragging = false;
    }

    function handleDrop(event: DragEvent) {
        event.preventDefault();
        isDragging = false;

        const files = event.dataTransfer?.files;
        if (files) {
            handleFiles(Array.from(files));
        }
    }

    function handleFileSelect(event: Event) {
        const input = event.target as HTMLInputElement;
        if (input.files) {
            handleFiles(Array.from(input.files));
        }
    }

    async function handleFiles(files: File[]) {
        // Validate files
        const validFiles = files.filter(file => {
            if (file.size > maxSize) {
                dispatch('error', {
                    message: `${file.name} is too large. Maximum size is ${formatBytes(maxSize)}`
                });
                return false;
            }

            if (!ALLOWED_TYPES.includes(file.type)) {
                dispatch('error', {
                    message: `${file.name} has an unsupported file type`
                });
                return false;
            }

            return true;
        });

        if (validFiles.length === 0) return;

        uploading = true;
        uploadProgress = 0;

        try {
            for (let i = 0; i < validFiles.length; i++) {
                const file = validFiles[i];
                await uploadFile(file);
                uploadProgress = ((i + 1) / validFiles.length) * 100;
            }

            dispatch('complete', { count: validFiles.length });
        } catch (error) {
            dispatch('error', { message: 'Upload failed. Please try again.' });
        } finally {
            uploading = false;
            uploadProgress = 0;
            if (fileInputElement) {
                fileInputElement.value = '';
            }
        }
    }

    async function uploadFile(file: File) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('order_id', orderId);
        formData.append('file_type', 'attachment');

        const response = await fetch('/api/files/upload', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error('Upload failed');
        }

        const data = await response.json();
        dispatch('uploaded', data.file);
    }

    function formatBytes(bytes: number): string {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }

    function triggerFileInput() {
        fileInputElement?.click();
    }
</script>

<div class="file-upload">
    <div
        class="drop-zone"
        class:dragging={isDragging}
        class:uploading={uploading}
        on:dragover={handleDragOver}
        on:dragleave={handleDragLeave}
        on:drop={handleDrop}
        role="button"
        tabindex="0"
        on:click={triggerFileInput}
        on:keypress={(e) => e.key === 'Enter' && triggerFileInput()}
    >
        {#if uploading}
            <div class="upload-progress">
                <div class="spinner"></div>
                <p class="progress-text">Uploading... {Math.round(uploadProgress)}%</p>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: {uploadProgress}%"></div>
                </div>
            </div>
        {:else}
            <div class="drop-zone-content">
                <div class="upload-icon">📁</div>
                <p class="upload-title">Drop files here or click to browse</p>
                <p class="upload-hint">
                    Supported: PDF, Images, Documents, CAD files
                    <br />
                    Maximum size: {formatBytes(maxSize)}
                </p>
            </div>
        {/if}

        <input
            bind:this={fileInputElement}
            type="file"
            {accept}
            {multiple}
            on:change={handleFileSelect}
            style="display: none;"
            disabled={uploading}
        />
    </div>

    <div class="upload-actions">
        <Button
            variant="primary"
            on:click={triggerFileInput}
            disabled={uploading}
            loading={uploading}
        >
            Select Files
        </Button>
    </div>
</div>

<style>
    .file-upload {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    .drop-zone {
        border: 2px dashed var(--color-border, #d1d5db);
        border-radius: 0.5rem;
        padding: 3rem 2rem;
        text-align: center;
        cursor: pointer;
        transition: all 0.2s ease;
        background: var(--color-gray-50, #f9fafb);
    }

    .drop-zone:hover {
        border-color: var(--color-primary, #0066cc);
        background: white;
    }

    .drop-zone.dragging {
        border-color: var(--color-primary, #0066cc);
        background: #dbeafe;
        border-style: solid;
    }

    .drop-zone.uploading {
        cursor: not-allowed;
        opacity: 0.7;
    }

    .drop-zone:focus-visible {
        outline: 2px solid var(--color-primary, #0066cc);
        outline-offset: 2px;
    }

    .drop-zone-content {
        pointer-events: none;
    }

    .upload-icon {
        font-size: 4rem;
        margin-bottom: 1rem;
    }

    .upload-title {
        font-size: 1.125rem;
        font-weight: 600;
        color: var(--color-text, #111827);
        margin: 0 0 0.5rem 0;
    }

    .upload-hint {
        font-size: 0.875rem;
        color: var(--color-gray-600, #6b7280);
        margin: 0;
        line-height: 1.6;
    }

    .upload-progress {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1rem;
    }

    .spinner {
        width: 3rem;
        height: 3rem;
        border: 4px solid var(--color-gray-200, #e5e7eb);
        border-top-color: var(--color-primary, #0066cc);
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
        to { transform: rotate(360deg); }
    }

    .progress-text {
        font-size: 1rem;
        font-weight: 600;
        color: var(--color-text, #111827);
        margin: 0;
    }

    .progress-bar {
        width: 100%;
        max-width: 300px;
        height: 0.5rem;
        background-color: var(--color-gray-200, #e5e7eb);
        border-radius: 9999px;
        overflow: hidden;
    }

    .progress-fill {
        height: 100%;
        background: linear-gradient(90deg, #0066cc, #0052a3);
        transition: width 0.3s ease;
    }

    .upload-actions {
        display: flex;
        justify-content: center;
    }
</style>