<script lang="ts">
  import CheckCircle from 'lucide-svelte/icons/check-circle';
  import Download from 'lucide-svelte/icons/download';
  import File from 'lucide-svelte/icons/file';
  import { base } from '$app/paths';
  import { modalDialog } from '$lib/ui/modal-dialog';
  import FileSpreadsheet from 'lucide-svelte/icons/file-spreadsheet';
  import FileText from 'lucide-svelte/icons/file-text';
  import Loader2 from 'lucide-svelte/icons/loader-2';
  import X from 'lucide-svelte/icons/x';

/**
 * Export Dialog Component
 * UI for generating exports with templates
 */


let {
  exportType = 'orders',
  filters = {},
  show = $bindable(false),
  onclose
}: {
  exportType?: 'orders' | 'stations' | 'loading_schedule';
  filters?: Record<string, any>;
  show?: boolean;
  onclose?: () => void;
} = $props();

let format: 'excel' | 'pdf' | 'csv' = $state('excel');
let selectedColumns: string[] = $state([]);
let useTemplate = $state(false);
let selectedTemplate: any = $state(null);
let templates: any[] = $state([]);
let exporting = $state(false);
let exportResult: any = $state(null);
let error: string | null = $state(null);

// Available columns based on export type
const availableColumns: Record<string, string[]> = {
  orders: [
    'po_number',
    'title',
    'client',
    'status',
    'created_at',
    'loading_date',
    'notes'
  ],
  stations: [
    'station',
    'po_number',
    'log_type',
    'message',
    'created_at',
    'created_by_email'
  ],
  loading_schedule: [
    'date',
    'notes',
    'max_capacity',
    'current_capacity',
    'order_count'
  ]
};

const formatIcons: Record<string, typeof FileSpreadsheet> = {
  excel: FileSpreadsheet,
  pdf: FileText,
  csv: File
};

const formatLabels = {
  excel: 'Excel (.xlsx)',
  pdf: 'PDF Document',
  csv: 'CSV File'
};

let columns = $derived(availableColumns[exportType] || []);
const titleId = $props.id();
let generation = 0;
let exportController: AbortController | undefined;
let downloadTimer: ReturnType<typeof setTimeout> | undefined;
$effect(() => {
  selectedColumns = [...availableColumns[exportType]];
  selectedTemplate = null; useTemplate = false;
});

function cancelExport() {
  generation++;
  exportController?.abort(); exportController = undefined;
  if (downloadTimer) clearTimeout(downloadTimer);
  downloadTimer = undefined; exporting = false;
}

$effect(() => {
  const visible = show, type = exportType;
  cancelExport();
  exportResult = null; error = null; templates = [];
  if (!visible) return;
  const token = generation, controller = new AbortController();
  void (async () => {
    try {
      const response = await fetch(`${base}/api/export/templates?type=${type}`, { signal: controller.signal });
      const result = await response.json();
      if (response.ok && token === generation && Array.isArray(result.data)) templates = result.data;
    } catch (err) {
      if (!controller.signal.aborted) console.error('Failed to load templates:', err);
    }
  })();
  return () => { controller.abort(); cancelExport(); };
});

async function handleExport() {
  if (exporting || selectedColumns.length === 0) return;
  const token = generation, controller = new AbortController();
  exportController = controller;
  exporting = true; error = null; exportResult = null;
  try {
    const response = await fetch(`${base}/api/export`, {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exportType, format, filters, columns: selectedColumns,
        templateId: useTemplate ? selectedTemplate?.id || null : null })
    });
    const result = await response.json();
    if (token !== generation || controller.signal.aborted) return;
    if (!response.ok || !result.data) throw new Error(result.message || 'Export failed');
    exportResult = result.data;
    const downloadUrl = result.data.downloadUrl;
    downloadTimer = setTimeout(() => {
      downloadTimer = undefined;
      if (token === generation && show && typeof downloadUrl === 'string') window.open(downloadUrl, '_blank', 'noopener');
    }, 1000);
  } catch (err) {
    if (token === generation && !controller.signal.aborted) error = err instanceof Error ? err.message : 'Export failed';
  } finally {
    if (token === generation) { exporting = false; exportController = undefined; }
  }
}

function handleTemplateSelect(template: any) {
  selectedTemplate = template;
  if (template.columns && template.columns.length > 0) {
    selectedColumns = template.columns.filter((column: string) => columns.includes(column));
  }
  if (template.format && template.format in formatLabels) {
    format = template.format;
  }
}

function selectFormat(key: string) {
  format = key as 'excel' | 'pdf' | 'csv';
}

function handleClose() {
  cancelExport();
  show = false;
  exportResult = null;
  error = null;
  onclose?.();
}

</script>

{#if show}
  <dialog class="modal-overlay" aria-labelledby={titleId} use:modalDialog={{ onClose: handleClose }}>
    <div class="modal-content">
      <div class="modal-header">
        <h3 id={titleId}>
          <Download size={20} />
          Export {exportType.replace('_', ' ')}
        </h3>
        <button class="close-btn" onclick={handleClose} aria-label="Close">
          <X size={20} />
        </button>
      </div>

      <div class="modal-body">
        {#if exportResult}
          <div class="export-success">
            <CheckCircle size={48} style="color: var(--ok)" />
            <h4>Export Complete!</h4>
            <p>
              Exported {exportResult.recordsCount} records
              ({(exportResult.fileSize / 1024).toFixed(1)} KB)
            </p>
            <p class="export-time">
              Processing time: {exportResult.processingTime}ms
            </p>
            <a 
              href={exportResult.downloadUrl}
              download={exportResult.fileName}
              class="download-link"
              target="_blank" rel="noopener noreferrer"
            >
              <Download size={16} />
              Download {exportResult.fileName}
            </a>
          </div>
        {:else}
          <!-- Format Selection -->
          <div class="section">
            <h4>Select Format</h4>
            <div class="format-options">
              {#each Object.entries(formatLabels) as [key, label]}
                {@const SvelteComponent = formatIcons[key]}
                <button
                  class="format-option"
                  class:active={format === key}
                  onclick={() => selectFormat(key)}
                  aria-pressed={format === key} disabled={exporting}
                >
                  <SvelteComponent size={24} />
                  <span>{label}</span>
                </button>
              {/each}
            </div>
          </div>

          <!-- Template Selection -->
          {#if templates.length > 0}
            <div class="section">
              <div class="section-header">
                <h4>Use Template (Optional)</h4>
                <label class="checkbox-label">
                  <input type="checkbox" bind:checked={useTemplate} disabled={exporting} />
                  <span>Use template</span>
                </label>
              </div>

              {#if useTemplate}
                <div class="template-list">
                  {#each templates as template}
                    <button
                      class="template-item"
                      class:active={selectedTemplate?.id === template.id}
                      onclick={() => handleTemplateSelect(template)}
                      aria-pressed={selectedTemplate?.id === template.id} disabled={exporting}
                    >
                      <div class="template-info">
                        <strong>{template.name}</strong>
                        {#if template.description}
                          <span class="template-desc">{template.description}</span>
                        {/if}
                      </div>
                      <span class="template-format">{template.format.toUpperCase()}</span>
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}

          <!-- Column Selection -->
          {#if !useTemplate || !selectedTemplate}
            <div class="section">
              <h4>Select Columns</h4>
              <div class="column-list">
                {#each columns as column}
                  <label class="column-checkbox">
                    <input
                      type="checkbox"
                      value={column}
                      bind:group={selectedColumns} disabled={exporting}
                    />
                    <span>{column.replace(/_/g, ' ')}</span>
                  </label>
                {/each}
              </div>
            </div>
          {/if}

          {#if error}
            <div class="error-message" role="alert">
              {error}
            </div>
          {/if}
        {/if}
      </div>

      <div class="modal-actions">
        <button class="btn-secondary" onclick={handleClose}>
          {exportResult ? 'Close' : 'Cancel'}
        </button>
        
        {#if !exportResult}
          <button 
            class="btn-primary"
            onclick={handleExport}
            disabled={exporting || selectedColumns.length === 0}
          >
            {#if exporting}
              <Loader2 size={16} class="spinner" />
              Exporting...
            {:else}
              <Download size={16} />
              Export {format.toUpperCase()}
            {/if}
          </button>
        {/if}
      </div>
    </div>
  </dialog>
{/if}

<style>
  .modal-overlay:not([open]) { display:none; }
  .modal-overlay::backdrop { background:transparent; }
  .modal-overlay {
    margin:0;width:100%;height:100%;max-width:none;max-height:none;border:0;color:inherit;
    position: fixed;
    inset: 0;
    background: color-mix(in oklab, var(--bg-0) 55%, transparent);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--z-modal);
    padding: 1rem;
  }

  .modal-content {
    background: var(--bg-0);
    border-radius: 8px;
    width: 100%;
    max-width: 600px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.5rem;
    border-bottom: 1px solid var(--border);
  }

  .modal-header h3 {
    margin: 0;
    font-size: 1.25rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .close-btn {
    padding: 0.5rem;
    background: transparent;
    border: none;
    color: var(--muted);
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.2s;
  }

  .close-btn:hover {
    background: var(--bg-2);
    color: var(--text);
  }

  .modal-body {
    flex: 1;
    overflow-y: auto;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .section h4 {
    margin: 0;
    font-size: 1rem;
    color: var(--text);
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    cursor: pointer;
  }

  .format-options {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 0.75rem;
  }

  .format-option {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 1rem;
    background: var(--bg-1);
    border: 2px solid var(--border);
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .format-option:hover {
    background: var(--bg-2);
  }

  .format-option.active {
    border-color: var(--accent-1);
    background: var(--bg-2);
  }

  .format-option span {
    font-size: 0.875rem;
    font-weight: 500;
  }

  .template-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    max-height: 200px;
    overflow-y: auto;
  }

  .template-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
    text-align: left;
  }

  .template-item:hover {
    background: var(--bg-2);
  }

  .template-item.active {
    border-color: var(--accent-1);
    background: var(--bg-2);
  }

  .template-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .template-desc {
    font-size: 0.75rem;
    color: var(--muted);
  }

  .template-format {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--accent-1);
  }

  .column-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 0.75rem;
  }

  .column-checkbox {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.2s;
  }

  .column-checkbox:hover {
    background: var(--bg-2);
  }

  .column-checkbox input {
    cursor: pointer;
  }

  .export-success {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    padding: 2rem;
    text-align: center;
  }

  .export-success h4 {
    margin: 0;
    font-size: 1.25rem;
    color: var(--ok);
  }

  .export-success p {
    margin: 0;
    color: var(--muted);
  }

  .export-time {
    font-size: 0.75rem;
  }

  .download-link {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1.5rem;
    background: var(--accent-1);
    color: var(--bg-0);
    text-decoration: none;
    border-radius: 6px;
    font-weight: 500;
    transition: opacity 0.2s;
    margin-top: 1rem;
  }

  .download-link:hover {
    opacity: 0.9;
  }

  .error-message {
    padding: 0.75rem 1rem;
    background: var(--danger);
    color: var(--bg-0);
    border-radius: 6px;
    font-size: 0.875rem;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    padding: 1.5rem;
    border-top: 1px solid var(--border);
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

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-secondary {
    background: var(--bg-2);
    color: var(--text);
    border: 1px solid var(--border);
  }

  .btn-secondary:hover:not(:disabled) {
    background: var(--bg-1);
  }

  .btn-primary {
    background: var(--accent-1);
    color: var(--bg-0);
  }

  .btn-primary:hover:not(:disabled) {
    opacity: 0.9;
  }

  :global(.spinner) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>