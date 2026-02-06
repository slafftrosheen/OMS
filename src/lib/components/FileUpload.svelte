<script lang="ts">
  import { createClient } from '@supabase/supabase-js';
  import { env } from '$env/dynamic/public';

  const supabase = createClient(
    env.PUBLIC_SUPABASE_URL || import.meta.env.PUBLIC_SUPABASE_URL,
    env.PUBLIC_SUPABASE_ANON_KEY || import.meta.env.PUBLIC_SUPABASE_ANON_KEY
  );

  let {
    orderId,
    accept = '*',
    maxSize = 10 * 1024 * 1024,
    multiple = true,
    onupload
  }: {
    orderId: string;
    accept?: string;
    maxSize?: number;
    multiple?: boolean;
    onupload?: (files: any[]) => void;
  } = $props();

  let uploading = $state(false);
  let progress = $state(0);
  let error = $state('');
  let dragOver = $state(false);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;

    error = '';
    uploading = true;
    progress = 0;

    const uploadedFiles = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // Validate file size
        if (file.size > maxSize) {
          throw new Error(`File ${file.name} exceeds maximum size of ${(maxSize / 1024 / 1024).toFixed(0)}MB`);
        }

        // Generate unique file path
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `orders/${orderId}/${fileName}`;

        // Upload to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('order-files')
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) throw uploadError;

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('order-files')
          .getPublicUrl(filePath);

        // Create file record in database
        const { data: fileRecord, error: dbError } = await supabase
          .from('files')
          .insert({
            order_id: orderId,
            filename: file.name,
            filepath: filePath,
            filesize: file.size,
            mimetype: file.type,
            url: publicUrl
          })
          .select()
          .single();

        if (dbError) throw dbError;

        uploadedFiles.push(fileRecord);
        progress = ((i + 1) / files.length) * 100;
      }

      onupload?.(uploadedFiles);
    } catch (err: any) {
      error = err.message;
      console.error('Upload error:', err);
    } finally {
      uploading = false;
      progress = 0;
    }
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    dragOver = false;
    handleFiles(event.dataTransfer?.files || null);
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    dragOver = true;
  }

  function handleDragLeave() {
    dragOver = false;
  }
</script>

<div
  class="file-upload"
  class:drag-over={dragOver}
  class:uploading
  role="region"
  aria-label="File Upload Drop Zone"
  ondrop={handleDrop}
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
>
  {#if uploading}
    <div class="upload-progress">
      <div class="spinner"></div>
      <p>Uploading... {progress.toFixed(0)}%</p>
      <div class="progress-bar">
        <div class="progress-fill" style="width: {progress}%"></div>
      </div>
    </div>
  {:else}
    <svg class="upload-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>

    <h3>Drop files here or click to browse</h3>
    <p class="upload-hint">
      Maximum file size: {(maxSize / 1024 / 1024).toFixed(0)}MB
    </p>

    <input
      type="file"
      {accept}
      {multiple}
      onchange={(e) => handleFiles(e.currentTarget.files)}
      class="file-input"
    />
  {/if}

  {#if error}
    <div class="error-message">{error}</div>
  {/if}
</div>

<style>
  .file-upload {
    position: relative;
    border: 2px dashed var(--border);
    border-radius: 8px;
    padding: 3rem 2rem;
    text-align: center;
    background: var(--bg-0);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .file-upload:hover {
    border-color: var(--accent-1);
    background: var(--bg-1);
  }

  .file-upload.drag-over {
    border-color: var(--accent-1);
    background: rgba(var(--accent-1-rgb), 0.1);
    transform: scale(1.02);
  }

  .file-upload.uploading {
    cursor: default;
    pointer-events: none;
  }

  .upload-icon {
    color: var(--muted);
    margin-bottom: 1rem;
  }

  .file-upload:hover .upload-icon {
    color: var(--accent-1);
  }

  h3 {
    margin: 0 0 0.5rem 0;
    color: var(--text);
    font-size: 1.125rem;
  }

  .upload-hint {
    margin: 0;
    color: var(--muted);
    font-size: 0.875rem;
  }

  .file-input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }

  .upload-progress {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
  }

  .spinner {
    width: 48px;
    height: 48px;
    border: 4px solid var(--border);
    border-top-color: var(--accent-1);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .upload-progress p {
    margin: 0;
    color: var(--text);
    font-weight: 600;
  }

  .progress-bar {
    width: 100%;
    max-width: 300px;
    height: 8px;
    background: var(--bg-2);
    border-radius: 4px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--accent-1);
    transition: width 0.3s ease;
  }

  .error-message {
    margin-top: 1rem;
    padding: 0.75rem;
    background: rgba(220, 53, 69, 0.1);
    border: 1px solid var(--danger);
    border-radius: 4px;
    color: var(--danger);
    font-size: 0.875rem;
  }
</style>
