<script lang="ts">
  import ImageIcon from 'lucide-svelte/icons/image';
  import Download from 'lucide-svelte/icons/download';
  import FileIcon from 'lucide-svelte/icons/file';
  import FileText from 'lucide-svelte/icons/file-text';
  import FolderOpen from 'lucide-svelte/icons/folder-open';
  import RefreshCw from 'lucide-svelte/icons/refresh-cw';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import Upload from 'lucide-svelte/icons/upload';
  import { onMount, untrack } from 'svelte';
  import { t } from 'svelte-i18n';
  import { base } from '$app/paths';
  import {fetchOrderFilePage,announceOrderFilesChanged,ORDER_FILE_PAGE_SIZE} from './order-files-client';

  let {
    orderId,
    compact = false,
    canUpload = true,
    onChanged,
    onAnalyze
  }: {
    orderId: string;
    compact?: boolean;
    canUpload?: boolean;
    onChanged?: () => void;
    onAnalyze?: (fileId:string)=>void;
  } = $props();

  type OrderFile = {
    id: string;
    originalName: string;
    storedName: string;
    mimeType: string;
    size: number;
    path: string;
    category: string;
    uploadedBy: string | null;
    uploadedAt: string;
  };

  let files = $state<OrderFile[]>([]);
  let totalCount = $state<number|null>(null);
  let deletingId = $state('');
  let requestVersion = 0;
  // This is the previous-order marker; the effect below handles later changes.
  let lastOrderId = $state(untrack(() => orderId));
  let loading = $state(false);
  let uploading = $state(false);
  let fileError = $state('');
  let dragOver = $state(false);
  let fileInput = $state<HTMLInputElement>();

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (ts: string) => {
    return new Date(ts).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return ImageIcon;
    if (mimeType === 'application/pdf') return FileText;
    return FileIcon;
  };

  async function loadFiles(reset = true) {
    if (!reset && (loading || uploading || deletingId)) return;
    const id = orderId, version = ++requestVersion;
    loading = true;
    if (reset) fileError = '';
    try {
      const result = await fetchOrderFilePage<OrderFile>(id, reset ? 0 : files.length,
        ORDER_FILE_PAGE_SIZE);
      if (version !== requestVersion || id !== orderId) return;
      if (!reset && files.length < result.total && !result.files.length)
        throw new Error('The attachment list changed; refresh before loading more');
      if (!reset && result.files.some(f => files.some(existing => existing.id === f.id)))
        throw new Error('The attachment order changed; refresh before loading more');
      files = reset ? result.files : [...files, ...result.files];
      totalCount = result.total;
      fileError = '';
    } catch (err) {
      if (version === requestVersion && id === orderId)
        fileError = err instanceof Error ? err.message : $t('orderFiles.loadError');
    } finally {
      if (version === requestVersion) loading = false;
    }
  }

  async function uploadQueue(filesToUpload: globalThis.File[]) {
    if (uploading || deletingId || !canUpload) return;
    const id = orderId, failed: string[] = [];
    let completed = 0;
    uploading = true;
    fileError = '';
    try {
      for (const file of filesToUpload) {
        try {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('order_id', id);
          const res = await fetch(`${base}/api/files`, {method:'POST',body:formData});
          if (!res.ok) {
            const detail = await res.json().catch(() => ({}));
            throw new Error(String(detail.message || detail.error || `HTTP ${res.status}`));
          }
          completed++;
        } catch(err) {
          failed.push(`${file.name}: ${err instanceof Error ? err.message : $t('orderFiles.uploadError')}`);
        }
      }
    } finally {
      uploading = false;
      if (completed && id === orderId) {
        announceOrderFilesChanged(id);
        onChanged?.();
      }
      if (id === orderId) {
        await loadFiles();
        if (failed.length) fileError = failed.join(' | ').slice(0,1200);
      }
    }
  }

  async function deleteFile(fileId: string, fileName?: string) {
    if (!canUpload || uploading || deletingId) return;
    const id = orderId;
    const name = fileName || files.find(f=>f.id===fileId)?.originalName || 'file';
    if (!confirm($t('orderFiles.deleteConfirm',{values:{name}}))) return;
    deletingId = fileId;
    fileError = '';
    let deletionError = '';
    try {
      const res = await fetch(`${base}/api/files/${encodeURIComponent(fileId)}`,{method:'DELETE'});
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(String(detail.message || detail.error || $t('orderFiles.deleteError')));
      }
      if (id === orderId) {
        announceOrderFilesChanged(id);
        onChanged?.();
      }
    } catch (err) {
      deletionError = err instanceof Error ? err.message : $t('orderFiles.deleteError');
    } finally {
      deletingId = '';
      if (id === orderId) {
        await loadFiles();
        if (deletionError) fileError = deletionError;
      }
    }
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    dragOver = false;
    const droppedFiles = event.dataTransfer?.files;
    if (droppedFiles && droppedFiles.length > 0) {
      void uploadQueue(Array.from(droppedFiles));
    }
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    dragOver = true;
  }

  function handleDragLeave() {
    dragOver = false;
  }

  function handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      void uploadQueue(Array.from(input.files));
      input.value = '';
    }
  }

  function downloadFile(file: OrderFile) {
    // Use the API endpoint with download flag for proper file retrieval
    window.open(`${base}/api/files/${file.id}?download=true`, '_blank');
  }

  onMount(() => {
    void loadFiles();
    return () => { requestVersion++; };
  });
  $effect(() => {
    if (orderId !== lastOrderId) {
      lastOrderId = orderId;
      requestVersion++;
      files = [];
      totalCount = null;
      void loadFiles();
    }
  });
</script>

<div class="order-files">
  <header class="files-header">
    <div class="header-left">
      <FolderOpen size={18} />
      <h3>{$t('files.order_files', { default: 'Order Files' })}</h3>
      <span class="file-count">{$t('orderFiles.count',{values:{count:totalCount ?? files.length}})}</span>
    </div>
    <button class="btn-icon" onclick={() => loadFiles()} disabled={loading || uploading || !!deletingId} title={$t('orderFiles.refresh')}>
      <span class:spinning={loading}><RefreshCw size={16} /></span>
    </button>
  </header>

  {#if fileError}<p class="file-error" role="alert">{fileError}</p>{/if}
  {#if canUpload}
  <div 
    class="drop-zone" 
    class:drag-over={dragOver}
    class:uploading={uploading || !!deletingId}
    ondrop={handleDrop}
    ondragover={handleDragOver}
    ondragleave={handleDragLeave}
    role="button"
    tabindex="0"
    onclick={() => fileInput?.click()}
    onkeydown={(e) => e.key === 'Enter' && fileInput?.click()}
  >
    <input
      type="file"
      multiple
      bind:this={fileInput}
      onchange={handleFileSelect}
      style="display: none"
    />
    {#if uploading}
      <div class="upload-status">
        <span class="spinning"><RefreshCw size={24} /></span>
        <span>{$t('orderFiles.uploading')}</span>
      </div>
    {:else}
      <Upload size={24} />
      <span>{$t('files.drop_or_click', { default: 'Drop files here or click to upload' })}</span>
    {/if}
  </div>

  {/if}
  <div class="files-list">
    {#if loading && files.length === 0}
      <div class="loading-state">
        <span class="spinning"><RefreshCw size={20} /></span>
        <span>{$t('orderFiles.loading')}</span>
      </div>
    {:else if files.length === 0}
      <div class="empty-state">
        <FileIcon size={32} />
        <p>{$t('files.no_files', { default: 'No files uploaded yet' })}</p>
      </div>
    {:else}
      {#each files as file (file.id)}
        {@const IconComponent = getFileIcon(file.mimeType)}
        <div class="file-item">
          <div class="file-icon">
            <IconComponent size={20} />
          </div>
          <div class="file-info">
            <span class="file-name" title={file.originalName}>{file.originalName}</span>
            <span class="file-meta">
              {formatSize(file.size)} • {file.uploadedBy || 'Unknown'} • {formatDate(file.uploadedAt)}
            </span>
          </div>
          <div class="file-actions">
            {#if onAnalyze && ['application/pdf','image/jpeg','image/png','image/webp'].includes(file.mimeType)}
              <button type="button" class="btn-icon"
                onclick={()=>onAnalyze?.(file.id)}
                title={$t('orderAssistant.openFileAnalysis')}
                aria-label={$t('orderAssistant.openFileAnalysis')}>✦</button>
            {/if}
            <button class="btn-icon" onclick={() => downloadFile(file)} title={$t("orderFiles.download")}>
              <Download size={16} />
            </button>
            {#if canUpload}<button class="btn-icon danger" disabled={uploading || !!deletingId} onclick={() => deleteFile(file.id, file.originalName)} title={$t("orderFiles.delete")}>
              <Trash2 size={16} />
            </button>{/if}
          </div>
        </div>
      {/each}
    {/if}
  </div>
  {#if totalCount !== null && files.length < totalCount}
    <button class="load-more" type="button" disabled={loading || uploading || !!deletingId}
      onclick={() => loadFiles(false)}>
      {loading ? $t('orderFiles.loading') : $t('orderFiles.loadMore')}
    </button>
  {/if}
</div>

<style>
  .load-more {margin: 0 16px 12px;padding:9px;border:1px solid var(--border);border-radius:8px;background:var(--bg-2);color:var(--text);cursor:pointer}
  .load-more:disabled {opacity:.5;cursor:wait}
  .file-error{color:var(--error,#dc2626);padding:9px 16px;font-size:12px;overflow-wrap:anywhere}
  .order-files {
    display: flex;
    flex-direction: column;
    background: var(--bg-1);
    border-radius: var(--radius-md, 8px);
    border: 1px solid var(--border);
    overflow: hidden;
  }

  .files-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    background: var(--bg-2);
    border-bottom: 1px solid var(--border);
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .files-header h3 {
    margin: 0;
    font-size: 1rem;
  }

  .file-count {
    font-size: 0.8rem;
    color: var(--muted);
  }

  .drop-zone {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 24px;
    margin: 16px;
    border: 2px dashed var(--border);
    border-radius: var(--radius-md, 8px);
    background: var(--bg-2);
    color: var(--muted);
    cursor: pointer;
    transition: background var(--motion-sm) var(--ease-standard), color var(--motion-sm) var(--ease-standard);
  }

  .drop-zone:hover,
  .drop-zone.drag-over {
    border-color: var(--accent-1);
    background: color-mix(in oklab, var(--accent-1) 5%, var(--bg-2));
    color: var(--accent-1);
  }

  .drop-zone.uploading {
    pointer-events: none;
    opacity: 0.7;
  }

  .upload-status {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .files-list {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 400px;
    overflow-y: auto;
  }

  .loading-state,
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 32px;
    color: var(--muted);
    gap: 8px;
  }

  .file-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    background: var(--bg-2);
    border-radius: var(--radius-sm, 6px);
    border: 1px solid var(--border);
  }

  .file-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    background: var(--bg-1);
    border-radius: var(--radius-sm, 6px);
    color: var(--muted);
  }

  .file-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .file-name {
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .file-meta {
    font-size: 0.75rem;
    color: var(--muted);
  }

  .file-actions {
    display: flex;
    gap: 4px;
  }

  .btn-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm, 4px);
    color: var(--muted);
    cursor: pointer;
    transition: background var(--motion-sm) var(--ease-standard), color var(--motion-sm) var(--ease-standard);
  }

  .btn-icon:hover {
    background: var(--bg-1);
    color: var(--text);
  }

  .btn-icon.danger:hover {
    background: color-mix(in oklab, var(--error, red) 15%, var(--bg-1));
    color: var(--error, red);
  }

  .spinning {
    display: inline-flex;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
</style>
