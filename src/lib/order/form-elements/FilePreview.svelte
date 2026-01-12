<script lang="ts">
  import { FileText } from 'lucide-svelte';
  import type { FileRef } from '../types';

  export let file: FileRef | null = null;
  export let previewUrl: string | null = null;

  $: isPdf = file?.kind === 'pdf' || file?.name.toLowerCase().endsWith('.pdf');
  $: isCdr = file?.kind === 'cdr' || file?.name.toLowerCase().endsWith('.cdr');
</script>

{#if file}
  <div class="file-preview">
    {#if isPdf && previewUrl}
      <iframe
        src={previewUrl}
        title="PDF Preview"
        class="pdf-frame"
      />
    {:else if isCdr}
      <div class="cdr-placeholder">
        <FileText size={48} aria-hidden="true" />
        <div class="cdr-info">
          <span class="file-type">CDR File</span>
          <span class="file-name">{file.name}</span>
        </div>
      </div>
    {:else}
      <div class="cdr-placeholder">
        <FileText size={48} aria-hidden="true" />
        <div class="cdr-info">
          <span class="file-type">File</span>
          <span class="file-name">{file.name}</span>
        </div>
      </div>
    {/if}
  </div>
{:else}
  <div class="no-preview">
    <span class="muted">No file uploaded</span>
  </div>
{/if}

<style>
  .file-preview {
    width: 100%;
    height: 100%;
    min-height: 200px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    overflow: hidden;
    background: var(--bg-0);
  }

  .pdf-frame {
    width: 100%;
    height: 100%;
    min-height: 400px;
    border: none;
  }

  .cdr-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-md);
    height: 100%;
    min-height: 200px;
    padding: var(--space-lg);
    color: var(--muted);
  }

  .cdr-info {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-xs);
    text-align: center;
  }

  .file-type {
    font-weight: 600;
    font-size: 0.875rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text);
  }

  .file-name {
    font-size: 0.875rem;
    color: var(--muted);
    word-break: break-all;
  }

  .no-preview {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 200px;
    border: 1px dashed var(--border);
    border-radius: var(--radius-md);
    background: var(--bg-0);
  }
</style>
