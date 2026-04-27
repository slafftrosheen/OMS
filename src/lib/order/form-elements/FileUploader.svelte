<script lang="ts">
  import Upload from 'lucide-svelte/icons/upload';
  import X from 'lucide-svelte/icons/x';
  import Icon from '$lib/ui/Icon.svelte';
  import type { FileRef } from '../types';

  let {
    accept = '.cdr,.pdf',
    label = 'Upload File',
    onFileSelected = () => {},
    currentFile = null,
    onClear = () => {}
  }: {
    accept?: string;
    label?: string;
    onFileSelected?: (file: File) => void;
    currentFile?: FileRef | null;
    onClear?: () => void;
  } = $props();

  let isDragging = $state(false);
  let fileInput: HTMLInputElement;

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    isDragging = true;
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    isDragging = false;
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    isDragging = false;
    
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  }

  function handleFileInput(e: Event) {
    const target = e.target as HTMLInputElement;
    const files = target.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  }

  function processFile(file: File) {
    // Validate file type
    const extension = '.' + file.name.split('.').pop()?.toLowerCase();
    const acceptedTypes = accept.split(',').map(t => t.trim().toLowerCase());
    
    if (!acceptedTypes.includes(extension)) {
      alert(`Invalid file type. Please upload ${accept} files only.`);
      return;
    }
    
    onFileSelected(file);
  }

  function handleClear(e: Event) {
    e.stopPropagation();
    onClear();
    if (fileInput) {
      fileInput.value = '';
    }
  }

  function handleClick() {
    if (!currentFile) {
      fileInput?.click();
    }
  }
</script>

<div
  class="file-uploader"
  class:dragging={isDragging}
  class:has-file={currentFile}
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
  onclick={handleClick}
  role="button"
  tabindex="0"
  onkeydown={(e) => e.key === 'Enter' && handleClick()}
>
  <input
    type="file"
    bind:this={fileInput}
    {accept}
    onchange={handleFileInput}
    style="display: none;"
  />
  
  {#if currentFile}
    <div class="file-info">
      <span class="file-name">{currentFile.name}</span>
      <button
        type="button"
        class="clear-btn"
        onclick={handleClear}
        aria-label="Clear file"
      >
        <X size={16} />
      </button>
    </div>
  {:else}
    <div class="upload-prompt">
      <Upload size={32} aria-hidden="true" />
      <span class="label">{label}</span>
      <span class="hint">or drag and drop</span>
      <span class="formats">{accept}</span>
    </div>
  {/if}
</div>

<style>
  .file-uploader {
    border: 2px dashed var(--border);
    border-radius: var(--radius-md);
    padding: var(--space-lg);
    min-height: 120px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background var(--motion-sm) var(--ease-standard), color var(--motion-sm) var(--ease-standard);
    background: var(--bg-0);
  }

  .file-uploader:hover {
    border-color: var(--accent-1);
    background: color-mix(in oklab, var(--accent-1) 5%, var(--bg-0));
  }

  .file-uploader.dragging {
    border-color: var(--accent-1);
    background: color-mix(in oklab, var(--accent-1) 10%, var(--bg-0));
  }

  .file-uploader.has-file {
    cursor: default;
    border-style: solid;
  }

  .file-uploader.has-file:hover {
    border-color: var(--border);
    background: var(--bg-0);
  }

  .upload-prompt {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-xs);
    color: var(--muted);
    text-align: center;
  }

  .label {
    font-weight: 600;
    color: var(--text);
  }

  .hint {
    font-size: 0.875rem;
  }

  .formats {
    font-size: 0.75rem;
    color: var(--muted);
  }

  .file-info {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    width: 100%;
  }

  .file-name {
    flex: 1;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .clear-btn {
    background: transparent;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: var(--space-xs);
    cursor: pointer;
    color: var(--text);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background var(--motion-sm) var(--ease-standard), color var(--motion-sm) var(--ease-standard);
  }

  .clear-btn:hover {
    background: var(--danger);
    border-color: var(--danger);
    color: var(--bg-0);
  }
</style>
