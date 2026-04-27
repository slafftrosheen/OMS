<script lang="ts">
  import FileText from 'lucide-svelte/icons/file-text';
  import Loader2 from 'lucide-svelte/icons/loader-2';
  import Upload from 'lucide-svelte/icons/upload';
  import X from 'lucide-svelte/icons/x';
/**
 * Photo Upload Component
 * Drag-and-drop photo uploader with preview and metadata entry
 */

import Icon from '$lib/ui/Icon.svelte';

let {
  orderId,
  station,
  stationLogId = null,
  maxFiles = 5,
  accept = 'image/jpeg,image/png,image/webp,application/pdf',
  onuploaded
}: {
  orderId: string;
  station: string;
  stationLogId?: string | null;
  maxFiles?: number;
  accept?: string;
  onuploaded?: (data: { attachments: any[] }) => void;
} = $props();

let files: File[] = $state([]);
let previews: string[] = $state([]);
let uploading = $state(false);
let uploadProgress = $state(0);
let dragOver = $state(false);

// Form fields
let attachmentType = $state('photo');
let caption = $state('');
let notes = $state('');
let tags = $state('');

const typeOptions = [
  { value: 'photo', label: 'General Photo' },
  { value: 'damage_report', label: 'Damage Report' },
  { value: 'quality_check', label: 'Quality Check' },
  { value: 'progress', label: 'Progress Update' },
  { value: 'rework_doc', label: 'Rework Documentation' },
  { value: 'other', label: 'Other' }
];

function handleDrop(event: DragEvent) {
  event.preventDefault();
  dragOver = false;

  const droppedFiles = Array.from(event.dataTransfer?.files || []);
  addFiles(droppedFiles);
}

function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement;
  const selectedFiles = Array.from(input.files || []);
  addFiles(selectedFiles);
}

function addFiles(newFiles: File[]) {
  if (files.length + newFiles.length > maxFiles) {
    alert(`Maximum ${maxFiles} files allowed`);
    return;
  }

  for (const file of newFiles) {
    if (!accept.split(',').includes(file.type)) {
      alert(`Invalid file type: ${file.type}`);
      continue;
    }

    if (file.size > 10 * 1024 * 1024) {
      alert(`File too large: ${file.name} (max 10MB)`);
      continue;
    }

    files = [...files, file];

    // Generate preview for images
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        previews = [...previews, e.target?.result as string];
      };
      reader.readAsDataURL(file);
    } else {
      previews = [...previews, ''];
    }
  }
}

function removeFile(index: number) {
  files = files.filter((_, i) => i !== index);
  previews = previews.filter((_, i) => i !== index);
}

async function handleUpload() {
  if (files.length === 0) {
    alert('Please select at least one file');
    return;
  }

  uploading = true;
  uploadProgress = 0;

  try {
    const uploadedAttachments = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const formData = new FormData();
      formData.append('file', file);
      formData.append('orderId', orderId);
      formData.append('station', station);
      formData.append('type', attachmentType);
      formData.append('caption', caption);
      formData.append('notes', notes);
      formData.append('tags', tags);
      if (stationLogId) formData.append('stationLogId', stationLogId);

      const response = await fetch('/api/station-attachments', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Upload failed');
      }

      const result = await response.json();
      uploadedAttachments.push(result.data);

      uploadProgress = Math.round(((i + 1) / files.length) * 100);
    }

    onuploaded?.({ attachments: uploadedAttachments });
    
    // Reset form
    files = [];
    previews = [];
    caption = '';
    notes = '';
    tags = '';
    attachmentType = 'photo';

  } catch (err) {
    console.error('Upload error:', err);
    alert(err instanceof Error ? err.message : 'Upload failed');
  } finally {
    uploading = false;
    uploadProgress = 0;
  }
}

function handleDragOver(event: DragEvent) {
  event.preventDefault();
  dragOver = true;
}

function handleDragLeave() {
  dragOver = false;
}
</script>

<div class="photo-upload">
  <div 
    class="drop-zone" 
    class:drag-over={dragOver}
    ondrop={handleDrop}
    ondragover={handleDragOver}
    ondragleave={handleDragLeave}
    role="button"
    tabindex="0"
    aria-label="Drop files here or click to browse"
  >
    <Upload size={48} />
    <p class="drop-text">Drop photos here or click to browse</p>
    <p class="drop-hint">Max {maxFiles} files, 10MB each (JPEG, PNG, WebP, PDF)</p>
    <input
      type="file"
      multiple
      {accept}
      onchange={handleFileSelect}
      aria-label="Select files"
    />
  </div>

  {#if files.length > 0}
    <div class="file-list" role="list" aria-label="Selected files">
      {#each files as file, i (i)}
        <div class="file-item" role="listitem">
          <div class="file-preview">
            {#if previews[i]}
              <img src={previews[i]} alt={file.name} />
            {:else}
              <FileText size={32} />
            {/if}
          </div>
          <div class="file-info">
            <span class="file-name">{file.name}</span>
            <span class="file-size">{(file.size / 1024).toFixed(1)} KB</span>
          </div>
          <button
            class="remove-btn"
            onclick={() => removeFile(i)}
            aria-label="Remove {file.name}"
            disabled={uploading}
          >
            <X size={20} />
          </button>
        </div>
      {/each}
    </div>

    <div class="metadata-form">
      <div class="form-group">
        <label for="type">Type</label>
        <select id="type" bind:value={attachmentType} disabled={uploading}>
          {#each typeOptions as option}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
      </div>

      <div class="form-group">
        <label for="caption">Caption</label>
        <input
          id="caption"
          type="text"
          bind:value={caption}
          placeholder="Brief description"
          disabled={uploading}
          maxlength="200"
        />
      </div>

      <div class="form-group">
        <label for="notes">Notes</label>
        <textarea
          id="notes"
          bind:value={notes}
          placeholder="Detailed notes or observations"
          rows="3"
          disabled={uploading}
></textarea>
      </div>

      <div class="form-group">
        <label for="tags">Tags (comma-separated)</label>
        <input
          id="tags"
          type="text"
          bind:value={tags}
          placeholder="quality, rework, damage"
          disabled={uploading}
        />
      </div>
    </div>

    <div class="upload-actions">
      {#if uploading}
        <div class="upload-progress">
          <Loader2 size={20} class="spinner" />
          <span>Uploading... {uploadProgress}%</span>
          <div class="progress-bar">
            <div class="progress-fill" style="width: {uploadProgress}%"></div>
          </div>
        </div>
      {:else}
        <button class="btn-secondary" onclick={() => { files = []; previews = []; }}>
          Cancel
        </button>
        <button class="btn-primary" onclick={handleUpload}>
          <Upload size={16} />
          Upload {files.length} {files.length === 1 ? 'File' : 'Files'}
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .photo-upload {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .drop-zone {
    position: relative;
    border: 2px dashed var(--border);
    border-radius: 8px;
    padding: 3rem 2rem;
    text-align: center;
    cursor: pointer;
    transition: all 0.2s;
    background: var(--bg-0);
  }

  .drop-zone:hover,
  .drop-zone.drag-over {
    border-color: var(--accent-1);
    background: var(--bg-1);
  }

  .drop-zone input[type="file"] {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }

  .drop-text {
    margin: 1rem 0 0.5rem 0;
    font-size: 1rem;
    font-weight: 500;
    color: var(--text);
  }

  .drop-hint {
    margin: 0;
    font-size: 0.875rem;
    color: var(--muted);
  }

  .file-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .file-item {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.75rem;
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: 6px;
  }

  .file-preview {
    width: 60px;
    height: 60px;
    border-radius: 4px;
    overflow: hidden;
    background: var(--bg-0);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .file-preview img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .file-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .file-name {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text);
    word-break: break-word;
  }

  .file-size {
    font-size: 0.75rem;
    color: var(--muted);
  }

  .remove-btn {
    padding: 0.5rem;
    background: transparent;
    border: none;
    color: var(--danger);
    cursor: pointer;
    border-radius: 4px;
    transition: background 0.2s;
    flex-shrink: 0;
  }

  .remove-btn:hover:not(:disabled) {
    background: var(--bg-2);
  }

  .remove-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .metadata-form {
    display: grid;
    gap: 1rem;
    padding: 1rem;
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: 6px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .form-group label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text);
  }

  .form-group input,
  .form-group select,
  .form-group textarea {
    padding: 0.5rem 0.75rem;
    background: var(--bg-0);
    border: 1px solid var(--border);
    border-radius: 4px;
    font-size: 0.875rem;
    color: var(--text);
    font-family: inherit;
  }

  .form-group input:focus,
  .form-group select:focus,
  .form-group textarea:focus {
    outline: 2px solid var(--focus);
    outline-offset: 1px;
  }

  .form-group textarea {
    resize: vertical;
  }

  .upload-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
  }

  .upload-progress {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .progress-bar {
    flex: 1;
    height: 6px;
    background: var(--bg-2);
    border-radius: 3px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--accent-1);
    transition: width 0.3s ease;
  }

  :global(.spinner) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 4px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-secondary {
    background: var(--bg-2);
    color: var(--text);
    border: 1px solid var(--border);
  }

  .btn-secondary:hover {
    background: var(--bg-1);
  }

  .btn-primary {
    background: var(--accent-1);
    color: var(--bg-0);
  }

  .btn-primary:hover {
    opacity: 0.9;
  }

  button:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }
</style>