<!-- src/lib/components/files/FileList.svelte -->
<script lang="ts">
    import Badge from '$lib/components/ui/Badge.svelte';
    import Icon from '$lib/ui/Icon.svelte';
    import type { IconName } from '$lib/ui/icons';

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

    function getFileIcon(mimeType: string): IconName {
        if (mimeType.startsWith('image/'))                                  return 'image';
        if (mimeType === 'application/pdf')                                 return 'file-text';
        if (mimeType.includes('word'))                                      return 'file-text';
        if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'bar-chart';
        if (mimeType.includes('zip'))                                       return 'package';
        if (mimeType.includes('dxf') || mimeType.includes('dwg'))           return 'ruler';
        return 'file';
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
                    <div class="file-icon" aria-hidden="true">
                        <Icon name={getFileIcon(file.mime_type)} size="lg" />
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
                                onclick={() => handlePreview(file)}
                                aria-label="Preview"
                                title="Preview"
                            >
                                <Icon name="eye" size="sm" />
                            </button>
                        {/if}

                        <button
                            class="action-btn"
                            onclick={() => handleDownload(file)}
                            aria-label="Download"
                            title="Download"
                        >
                            <Icon name="download" size="sm" />
                        </button>

                        <button
                            class="action-btn danger"
                            onclick={() => handleDelete(file)}
                            aria-label="Delete"
                            title="Delete"
                        >
                            <Icon name="trash-2" size="sm" />
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
        padding: var(--space-3xl) var(--space-xl);
        text-align: center;
    }

    .empty-message {
        font-size: var(--text-md);
        color: var(--ink-tertiary);
        margin: 0;
    }

    .files-grid {
        display: flex;
        flex-direction: column;
        gap: var(--space-sm);
    }

    .file-item {
        display: flex;
        align-items: center;
        gap: var(--space-md);
        padding: var(--space-md);
        background: var(--glass-bg);
        backdrop-filter: var(--glass-material-thin);
        -webkit-backdrop-filter: var(--glass-material-thin);
        border: 1px solid var(--glass-border);
        border-radius: var(--radius-md);
        transition: transform var(--motion-sm) var(--ease-spring-soft),
                    box-shadow var(--motion-sm) var(--ease-standard),
                    border-color var(--motion-sm) var(--ease-standard);
    }

    .file-item:hover {
        transform: translateY(-1px);
        box-shadow: var(--elevation-2);
        border-color: color-mix(in oklab, var(--brand) 25%, var(--glass-border));
    }

    .file-icon {
        flex-shrink: 0;
        color: var(--brand);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border-radius: var(--radius-sm);
        background: color-mix(in oklab, var(--brand) 10%, transparent);
    }

    .file-info {
        flex: 1;
        min-width: 0;
    }

    .file-header {
        display: flex;
        align-items: center;
        gap: var(--space-sm);
        margin-bottom: var(--space-xs);
    }

    .file-name {
        font-size: var(--text-md);
        font-weight: 600;
        margin: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: var(--ink-primary);
    }

    .file-meta {
        display: flex;
        align-items: center;
        gap: var(--space-xs);
        font-size: var(--text-sm);
        color: var(--ink-tertiary);
    }

    .meta-separator {
        color: var(--ink-quaternary);
    }

    .file-actions {
        display: flex;
        gap: var(--space-xs);
        flex-shrink: 0;
    }

    .action-btn {
        background: transparent;
        border: 1px solid var(--border);
        padding: 0;
        border-radius: var(--radius-sm);
        cursor: pointer;
        color: var(--ink-secondary);
        transition: background var(--motion-sm) var(--ease-standard),
                    border-color var(--motion-sm) var(--ease-standard),
                    color var(--motion-sm) var(--ease-standard),
                    transform var(--motion-xs) var(--ease-spring-soft);
        width: var(--control-sm);
        height: var(--control-sm);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        box-shadow: none;
    }

    .action-btn:hover {
        background: var(--bg-2);
        color: var(--ink-primary);
        transform: translateY(-1px);
    }
    .action-btn:active { transform: scale(0.95); }

    .action-btn.danger:hover {
        background: var(--error-soft);
        border-color: color-mix(in oklab, var(--error) 35%, transparent);
        color: var(--error);
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