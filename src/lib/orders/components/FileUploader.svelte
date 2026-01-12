<!-- src/lib/orders/components/FileUploader.svelte -->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { Upload, X, File, Image as ImageIcon, CheckCircle, AlertCircle } from 'lucide-svelte';

  export let disabled: boolean = false;
  export let maxFileSize: number = 50 * 1024 * 1024; // 50MB
  export let acceptedTypes: string[] = [
    'application/coreldraw',
    'application/vnd.corel-draw',
    'application/x-vnd.corel.draw',
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp'
  ];

  const dispatch = createEventDispatcher();

  let isDragging = false;
  let uploading = false;
  let uploadProgress: Map<string, number> = new Map();
  let uploadedFiles: Array<{
    id: string;
    name: string;
    size: string;
    type: string;
    url?: string;
    status: 'uploading' | 'success' | 'error';
    error?: string;
  }> = [];

  let fileInput: HTMLInputElement;

  const acceptedExtensions = ['.cdr', '.pdf', '.jpg', '.jpeg', '.png', '.webp'];

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    if (!disabled) {
      isDragging = true;
    }
  }

  function handleDragLeave() {
    isDragging = false;
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    isDragging = false;

    if (disabled) return;

    const files = Array.from(event.dataTransfer?.files || []);
    processFiles(files);
  }

  function handleFileSelect(event: Event) {
    const target = event.target as HTMLInputElement;
    const files = Array.from(target.files || []);
    processFiles(files);
    target.value = ''; // Reset input
  }

  function processFiles(files: File[]) {
    files.forEach(file => {
      // Validate file type
      const extension = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!acceptedExtensions.includes(extension)) {
        addFailedUpload(file, `File type not supported: ${extension}`);
        return;
      }

      // Validate file size
      if (file.size > maxFileSize) {
        addFailedUpload(file, `File too large: ${formatFileSize(file.size)} (max ${formatFileSize(maxFileSize)})`);
        return;
      }

      uploadFile(file);
    });
  }

  async function uploadFile(file: File) {
    const fileId = `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const uploadedFile = {
      id: fileId,
      name: file.name,
      size: formatFileSize(file.size),
      type: file.type,
      status: 'uploading' as const
    };

    uploadedFiles = [...uploadedFiles, uploadedFile];
    uploadProgress.set(fileId, 0);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percentage = (e.loaded / e.total) * 100;
          uploadProgress.set(fileId, percentage);
          uploadProgress = uploadProgress;
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          const response = JSON.parse(xhr.responseText);
          updateFileStatus(fileId, 'success', response.url);
          dispatch('uploaded', [{
            id: response.id,
            name: file.name,
            size: formatFileSize(file.size),
            type: file.type,
            url: response.url
          }]);
        } else {
          updateFileStatus(fileId, 'error', undefined, 'Upload failed');
        }
      });

      xhr.addEventListener('error', () => {
        updateFileStatus(fileId, 'error', undefined, 'Network error');
      });

      xhr.open('POST', '/api/upload');
      xhr.send(formData);

    } catch (err) {
      console.error('Upload error:', err);
      updateFileStatus(fileId, 'error', undefined, 'Upload failed');
    }
  }

  function updateFileStatus(
    fileId: string, 
    status: 'success' | 'error', 
    url?: string, 
    error?: string
  ) {
    uploadedFiles = uploadedFiles.map(f => 
      f.id === fileId 
        ? { ...f, status, url, error } 
        : f
    );
    uploadProgress.delete(fileId);
    uploadProgress = uploadProgress;
  }

  function addFailedUpload(file: File, error: string) {
    const fileId = `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    uploadedFiles = [...uploadedFiles, {
      id: fileId,
      name: file.name,
      size: formatFileSize(file.size),
      type: file.type,
      status: 'error',
      error
    }];
  }

  function removeFile(fileId: string) {
    uploadedFiles = uploadedFiles.filter(f => f.id !== fileId);
    uploadProgress.delete(fileId);
    uploadProgress = uploadProgress;
  }

  function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  function getFileIcon(type: string) {
    if (type.includes('image')) return ImageIcon;
    if (type.includes('pdf')) return File;
    return File;
  }

  function triggerFileInput() {
    if (!disabled) {
      fileInput.click();
    }
  }
</script>

<div class="file-uploader" class:disabled>
  <div 
    class="drop-zone"
    class:dragging={isDragging}
    on:dragover={handleDragOver}
    on:dragleave={handleDragLeave}
    on:drop={handleDrop}
    on:click={triggerFileInput}
    role="button"
    tabindex="0"
    on:keydown={(e) => e.key === 'Enter' && triggerFileInput()}
  >
    <input
      bind:this={fileInput}
      type="file"
      multiple
      accept={acceptedExtensions.join(',')}
      on:change={handleFileSelect}
      style="display: none;"
      {disabled}
    />

    <Upload size={48} class="upload-icon" />
    <p class="drop-text">
      <strong>Click to upload</strong> or drag and drop
    </p>
    <p class="drop-hint">
      CDR, PDF, JPG, PNG (max {formatFileSize(maxFileSize)})
    </p>
  </div>

  {#if uploadedFiles.length > 0}
    <div class="files-list">
      {#each uploadedFiles as file (file.id)}
        <div class="file-item" class:error={file.status === 'error'}>
          <div class="file-icon">
            <svelte:component this={getFileIcon(file.type)} size={20} />
          </div>

          <div class="file-details">
            <div class="file-name">{file.name}</div>
            <div class="file-meta">
              <span class="file-size">{file.size}</span>
              {#if file.status === 'uploading'}
                <span class="upload-status">Uploading... {Math.round(uploadProgress.get(file.id) || 0)}%</span>
              {:else if file.status === 'success'}
                <span class="upload-status success">
                  <CheckCircle size={12} />
                  Uploaded
                </span>
              {:else if file.status === 'error'}
                <span class="upload-status error">
                  <AlertCircle size={12} />
                  {file.error || 'Failed'}
                </span>
              {/if}
            </div>

            {#if file.status === 'uploading'}
              <div class="progress-bar">
                <div 
                  class="progress-fill" 
                  style="width: {uploadProgress.get(file.id) || 0}%"
                ></div>
              </div>
            {/if}
          </div>

          {#if file.status !== 'uploading'}
            <button
              class="remove-btn"
              on:click|stopPropagation={() => removeFile(file.id)}
              title="Remove file"
              type="button"
            >
              <X size={16} />
            </button>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .file-uploader {
    display: flex;
    flex-direction: column;
    gap: var(--space-md, 12px);
  }

  .file-uploader.disabled {
    opacity: 0.5;
    pointer-events: none;
  }

  .drop-zone {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-2xl, 48px);
    border: 2px dashed var(--border, #e5e7eb);
    border-radius: var(--radius-lg, 8px);
    background: var(--bg-2, #f9fafb);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .drop-zone:hover {
    border-color: var(--primary, #3b82f6);
    background: var(--bg-3, #f3f4f6);
  }

  .drop-zone.dragging {
    border-color: var(--primary, #3b82f6);
    background: var(--primary-bg, #dbeafe);
    border-style: solid;
  }

  .drop-zone :global(.upload-icon) {
    color: var(--primary, #3b82f6);
    margin-bottom: var(--space-md, 12px);
  }

  .drop-text {
    margin: 0 0 var(--space-xs, 4px) 0;
    font-size: var(--text-md, 1rem);
    color: var(--text-primary, #1a1a1a);
  }

  .drop-text strong {
    color: var(--primary, #3b82f6);
  }

  .drop-hint {
    margin: 0;
    font-size: var(--text-sm, 0.875rem);
    color: var(--text-muted, #6b7280);
  }

  .files-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm, 8px);
  }

  .file-item {
    display: flex;
    align-items: center;
    gap: var(--space-md, 12px);
    padding: var(--space-md, 12px);
    background: var(--bg-2, #f9fafb);
    border: 1px solid var(--border, #e5e7eb);
    border-radius: var(--radius-md, 6px);
    transition: all 0.15s ease;
  }

  .file-item.error {
    border-color: var(--danger, #dc2626);
    background: var(--danger-bg, #fee2e2);
  }

  .file-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    background: var(--bg-3, #f3f4f6);
    border-radius: var(--radius-md, 6px);
    color: var(--primary, #3b82f6);
    flex-shrink: 0;
  }

  .file-details {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-xs, 4px);
    min-width: 0;
  }

  .file-name {
    font-size: var(--text-sm, 0.875rem);
    font-weight: 600;
    color: var(--text-primary, #1a1a1a);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .file-meta {
    display: flex;
    align-items: center;
    gap: var(--space-sm, 8px);
    font-size: var(--text-xs, 0.75rem);
  }

  .file-size {
    color: var(--text-muted, #6b7280);
  }

  .upload-status {
    display: flex;
    align-items: center;
    gap: 4px;
    color: var(--text-muted, #6b7280);
  }

  .upload-status.success {
    color: var(--success, #10b981);
    font-weight: 600;
  }

  .upload-status.error {
    color: var(--danger, #dc2626);
    font-weight: 600;
  }

  .progress-bar {
    width: 100%;
    height: 4px;
    background: var(--bg-3, #f3f4f6);
    border-radius: var(--radius-full, 9999px);
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--primary, #3b82f6);
    transition: width 0.3s ease;
  }

  .remove-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    background: var(--bg-3, #f3f4f6);
    border: 1px solid var(--border, #e5e7eb);
    border-radius: var(--radius-full, 9999px);
    color: var(--text-muted, #6b7280);
    cursor: pointer;
    transition: all 0.15s ease;
    flex-shrink: 0;
  }

  .remove-btn:hover {
    background: var(--danger-bg, #fee2e2);
    border-color: var(--danger, #dc2626);
    color: var(--danger, #dc2626);
  }
</style>
