<script lang="ts">
  import { fieldDiff } from './diff';

  let {
    baseFields = {} as Record<string, any>,
    candidateFields = {} as Record<string, any>,
    fileList = [] as { rev: string; name: string; size: number; date: string }[],
    canManage = false,
    onUseAsCurrent = (rev: string) => {},
    activeRev = null as string | null,
    previewRev = null as string | null,
    onpreview
  }: {
    baseFields?: Record<string, any>;
    candidateFields?: Record<string, any>;
    fileList?: { rev: string; name: string; size: number; date: string }[];
    canManage?: boolean;
    onUseAsCurrent?: (rev: string) => void;
    activeRev?: string | null;
    previewRev?: string | null;
    onpreview?: (rev: string) => void;
  } = $props();

  const changes = fieldDiff(baseFields, candidateFields);
</script>

<div class="grid" style="grid-template-columns:1fr 1fr" role="group" aria-labelledby="compare-heading">
  <h2 id="compare-heading" class="sr-only">Comparison View</h2>
  
  <div class="card">
    <h3>Fields</h3>
    {#if changes.length === 0}
      <div class="muted" aria-live="polite">No changes</div>
    {/if}
    {#each changes as c}
      <div class="row" style="justify-content:space-between" role="region" aria-labelledby={`change-${c.key}`}>
        <div id={`change-${c.key}`}><b>{c.key}</b></div>
        <div class="row" style="gap:8px" role="group" aria-label="Field changes">
          <span class="tag" aria-label={`Previous value: ${String(c.from ?? '')}`}>from: {String(c.from ?? '')}</span>
          <span class="tag" aria-label={`New value: ${String(c.to ?? '')}`}>to: {String(c.to ?? '')}</span>
        </div>
      </div>
    {/each}
  </div>

  <div class="card">
    <h3>Files</h3>
    <table class="rf-table" role="table" aria-label="File comparison list">
      <thead role="rowgroup">
        <tr role="row">
          <th role="columnheader">Rev</th>
          <th role="columnheader">File</th>
          <th role="columnheader">Size</th>
          <th role="columnheader">Date</th>
          <th role="columnheader">Actions</th>
        </tr>
      </thead>
      <tbody role="rowgroup">
        {#each fileList as f}
          <tr 
            class:active={f.rev === activeRev} 
            class:preview={f.rev === previewRev} 
            onclick={() => onpreview?.(f.rev)}
            role="row"
            tabindex="0"
            aria-selected={f.rev === previewRev}
            aria-label={`File revision ${f.rev.slice(0, 8)}, ${f.name}, ${(f.size / 1024).toFixed(1)} KB, ${new Date(f.date).toLocaleString()}`}
          >
            <td role="cell">{f.rev.slice(0, 8)}</td>
            <td role="cell">{f.name}</td>
            <td role="cell" aria-label={`${(f.size / 1024).toFixed(1)} kilobytes`}>{(f.size / 1024).toFixed(1)} KB</td>
            <td role="cell" aria-label={`Uploaded on ${new Date(f.date).toLocaleString()}`}>{new Date(f.date).toLocaleString()}</td>
            <td role="cell">
              {#if canManage}
                <button 
                  class="tag" 
                  onclick={(e) => { e.stopPropagation(); onUseAsCurrent(f.rev); }}
                  aria-label={`Set ${f.name} as current version`}
                >
                  Use as current
                </button>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<style>
  tr.preview { background: color-mix(in oklab, var(--bg-2) 70%, transparent); }
  tr.active { font-weight: 600; }
  
  /* Screen reader only class */
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  
  /* Focus styles for keyboard navigation */
  tr[tabindex]:focus {
    outline: 2px solid var(--accent-1);
    outline-offset: 2px;
  }
</style>
