<!-- src/lib/components/files/FileList.svelte -->
<script lang="ts">
    import Badge from '$lib/components/ui/Badge.svelte';
    import Button from '$lib/components/ui/Button.svelte';

    type FileItem = {
        id: string;
        file_name: string;
        file_type: string;
        file_size: number;
        mime_type: string;
        uploaded_by: string;
        created_at: string;
        url: string;
    };

    let { 
        files = [],
        ondownload,
        ondelete,
        onpreview
    }: {
        files?: FileItem[];
        ondownload?: (file: FileItem) => void;
        ondelete?: (file: FileItem) => void;
        onpreview?: (file: FileItem) => void;
    } = $props();

    function formatBytes(bytes: number): string {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }

    function getFileIcon(mimeType: string): string {
        if (mimeType.startsWith('image/')) return '🖼️';
        if (mimeType === 'application/pdf') return '📄';
        if (mimeType.includes('word')) return '📝';
        if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '📊';
        if (mimeType.includes('zip')) return '📦';
        if (mimeType.includes('dxf')) return '📐';
        return '📁';
    }

    function getFileTypeBadge(fileType: string): 'info' | 'success' | 'warning' {
        if (fileType === 'cad_file') return 'info';
        if (fileType === 'production_file') return 'success';
        return 'warning';
    }

    function handleDownload(file: FileItem) {
        ondownload?.(file);
        // Or directly download:
        window.open(`/api/files/${file.id}/download?redirect=true`, '_blank');
    }

    function handleDelete(file: FileItem) {
        ondelete?.(file);
    }

    function handlePreview(file: FileItem) {
        if (file.mime_type.startsWith('image/') || file.mime_type === 'application/pdf') {
            onpreview?.(file);
        }
    }

    function canPreview(mimeType: string): boolean {
        return mimeType.startsWith('image/') || mimeType === 'application/pdf';
    }
</script>

<div class="file-list">
    {#if files.length === 0}
        <div class="empty-state">
            <p class="empty-message">No files uploaded yet</p>
        </div>
    {:else}
        <div class="files-grid">
            {#each files as file (file.id)}
                <div class="file-item">
                    <div class="file-icon">
                        {getFileIcon(file.mime_type)}
                    </div>

                    <div class="file-info">
                        <div class="file-header">
                            <h4 class="file-name" title={file.file_name}>
                                {file.file_name}
                            </h4>
                            <Badge variant={getFileTypeBadge(file.file_type)} size="sm">
                                {file.file_type.replace('_', ' ')}
                            </Badge>
                        </div>

                        <div class="file-meta">
                            <span class="meta-item">
                                {formatBytes(file.file_size)}
                            </span>
                            <span class="meta-separator">•</span>
                            <span class="meta-item">
                                {new Date(file.created_at).toLocaleDateString()}
                            </span>
                            <span class="meta-separator">•</span>
                            <span class="meta-item">
                                by {file.uploaded_by}
                            </span>
                        </div>
                    </div>

                    <div class="file-actions">
                        {#if canPreview(file.mime_type)}
                            <button
                                class="action-btn"
                                on:click={() => handlePreview(file)}
                                title="Preview"
                            >
                                👁️
                            </button>
                        {/if}
                        
                        <button
                            class="action-btn"
                            on:click={() => handleDownload(file)}
                            title="Download"
                        >
                            ⬇️
                        </button>
                        
                        <button
                            class="action-btn danger"
                            on:click={() => handleDelete(file)}
                            title="Delete"
                        >
                            🗑️
                        </button>
                    </div>
                </div>
            {/each}
        </div>
    {/if}
</div>

<style>
    .file-list {
        width: 100%;
    }

    .empty-state {
        padding: 3rem 2rem;
        text-align: center;
    }

    .empty-message {
        font-size: 1rem;
        color: var(--color-gray-600, #6b7280);
        margin: 0;
    }

    .files-grid {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
    }

    .file-item {
        display: flex;
        align-items: center;
        gap: 1rem;
        padding: 1rem;
        background: white;
        border: 1px solid var(--color-border, #e5e7eb);
        border-radius: 0.5rem;
        transition: all 0.15s ease;
    }

    .file-item:hover {
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        border-color: var(--color-gray-300, #d1d5db);
    }

    .file-icon {
        font-size: 2rem;
        flex-shrink: 0;
    }

    .file-info {
        flex: 1;
        min-width: 0;
    }

    .file-header {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 0.375rem;
    }

    .file-name {
        font-size: 1rem;
        font-weight: 600;
        margin: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: var(--color-text, #111827);
    }

    .file-meta {
        display: flex;
        align-items: center;
        gap: 0.375rem;
        font-size: 0.875rem;
        color: var(--color-gray-600, #6b7280);
    }

    .meta-separator {
        color: var(--color-gray-400, #9ca3af);
    }

    .file-actions {
        display: flex;
        gap: 0.5rem;
        flex-shrink: 0;
    }

    .action-btn {
        background: none;
        border: 1px solid var(--color-border, #e5e7eb);
        padding: 0.5rem;
        border-radius: 0.375rem;
        cursor: pointer;
        font-size: 1.125rem;
        transition: all 0.15s ease;
        width: 2.5rem;
        height: 2.5rem;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .action-btn:hover {
        background-color: var(--color-gray-5, #f9fafb);
        border-color: var(--color-gray-300, #d1d5db);
    }

    .action-btn.danger:hover {
        background-color: #fee2e2;
        border-color: #fecaca;
    }

    @media (max-width: 640px) {
        .file-item {
            flex-wrap: wrap;
        }

        .file-actions {
            width: 100%;
            justify-content: flex-end;
        }

        .file-meta {
            flex-wrap: wrap;
        }
    }
</style>