<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { fieldDiff } from './diff';

  export let baseFields: Record<string, any> = {};
  export let candidateFields: Record<string, any> = {};
  export let fileList: { rev: string; name: string; size: number; date: string }[] = [];
  export let canManage = false;
  export let onUseAsCurrent = (rev: string) => {};
  export let activeRev: string | null = null;
  export let previewRev: string | null = null;

  const dispatch = createEventDispatcher<{ preview: string }>();
  const changes = fieldDiff(baseFields, candidateFields);
</script>

<div class="grid" style="grid-template-columns:1fr 1fr">
  <div class="card">
    <h3>Fields</h3>
    {#if changes.length === 0}<div class="muted">No changes</div>{/if}
    {#each changes as c}
      <div class="row" style="justify-content:space-between">
        <div><b>{c.key}</b></div>
        <div class="row" style="gap:8px">
          <span class="tag">from: {String(c.from ?? '')}</span>
          <span class="tag">to: {String(c.to ?? '')}</span>
        </div>
      </div>
    {/each}
  </div>

  <div class="card">
    <h3>Files</h3>
    <table class="rf-table">
      <thead><tr><th>Rev</th><th>File</th><th>Size</th><th>Date</th><th></th></tr></thead>
      <tbody>
        {#each fileList as f}
          <tr class:active={f.rev === activeRev} class:preview={f.rev === previewRev} on:click={() => dispatch('preview', f.rev)}>
            <td>{f.rev.slice(0, 8)}</td>
            <td>{f.name}</td>
            <td>{(f.size / 1024).toFixed(1)} KB</td>
            <td>{new Date(f.date).toLocaleString()}</td>
            <td>{#if canManage}<button class="tag" on:click|stopPropagation={() => onUseAsCurrent(f.rev)}>Use as current</button>{/if}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<style>
  tr.preview { background: color-mix(in oklab, var(--bg-2) 70%, transparent); }
  tr.active { font-weight: 600; }
</style>
