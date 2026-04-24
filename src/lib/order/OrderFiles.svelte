<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { base } from '$app/paths';
  import Icon from '$lib/ui/Icon.svelte';

  let {
    orderId,
    compact = false
  }: {
    orderId: string;
    compact?: boolean;
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
  let loading = $state(false);
  let uploading = $state(false);
  let dragOver = $state(false);
  let fileInput: HTMLInputElement;

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
    if (mimeType.startsWith('image/')) return Image;
    if (mimeType === 'application/pdf') return FileText;
    return File;
  };

  async function loadFiles() {
    loading = true;
    try {
      const res = await fetch(`${base}/api/files?orderId=${orderId}`);
      if (res.ok) {
        files = await res.json();
      }
    } catch (err) {
      console.error('Failed to load files:', err);
    } finally {
      loading = false;
    }
  }

  async function uploadFile(file: globalThis.File) {
    uploading = true;
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('orderId', orderId);

      const res = await fetch(`${base}/api/files`, {
        method: 'POST',
        body: formData
      });

      if (res.ok) {
        const uploaded = await res.json();
        files = [uploaded, ...files];
      } else {
        console.error('Upload failed:', await res.text());
      }
    } catch (err) {
      console.error('Failed to upload file:', err);
    } finally {
      uploading = false;
    }
  }

  async function deleteFile(fileId: string, fileName?: string) {
    const name = fileName || files.find(f => f.id === fileId)?.originalName || 'file';
    if (!confirm(`Are you sure you want to delete "${name}"?`)) return;
    try {
      const res = await fetch(`${base}/api/files/${fileId}`, { method: 'DELETE' });
      if (res.ok) {
        files = files.filter(f => f.id !== fileId);
      }
    } catch (err) {
      console.error('Failed to delete file:', err);
    }
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    dragOver = false;
    const droppedFiles = event.dataTransfer?.files;
    if (droppedFiles && droppedFiles.length > 0) {
      Array.from(droppedFiles).forEach(uploadFile);
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
      Array.from(input.files).forEach(uploadFile);
      input.value = '';
    }
  }

  function downloadFile(file: OrderFile) {
    // Use the API endpoint with download flag for proper file retrieval
    window.open(`${base}/api/files/${file.id}?download=true`, '_blank');
  }

  onMount(loadFiles);
</script>

<div class="order-files">
  <header class="files-header">
    <div class="header-left">
      <FolderOpen size={18} />
      <h3>{$t('files.order_files', { default: 'Order Files' })}</h3>
      <span class="file-count">{files.length} files</span>
    </div>
    <button class="btn-icon" onclick={loadFiles} disabled={loading} title="Refresh">
      <span class:spinning={loading}><RefreshCw size={16} /></span>
    </button>
  </header>

  <div 
    class="drop-zone" 
    class:drag-over={dragOver}
    class:uploading
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
        <span>Uploading...</span>
      </div>
    {:else}
      <Upload size={24} />
      <span>{$t('files.drop_or_click', { default: 'Drop files here or click to upload' })}</span>
    {/if}
  </div>

  <div class="files-list">
    {#if loading && files.length === 0}
      <div class="loading-state">
        <span class="spinning"><RefreshCw size={20} /></span>
        <span>Loading files...</span>
      </div>
    {:else if files.length === 0}
      <div class="empty-state">
        <File size={32} />
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
            <button class="btn-icon" onclick={() => downloadFile(file)} title="Download">
              <Download size={16} />
            </button>
            <button class="btn-icon danger" onclick={() => deleteFile(file.id, file.originalName)} title="Delete">
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
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
