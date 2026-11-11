<script lang="ts">
  import {locale} from 'svelte-i18n';
  import {loadDxfPreview, type DxfPreviewData} from './dxf-preview';
  import {filePreviewCopy} from './file-preview-copy';
  let {source, title, zoom = 1}: {source: File | string; title: string; zoom?: number} = $props();
  const copy = $derived(filePreviewCopy($locale));
  let data = $state<DxfPreviewData | null>(null);
  let problem = $state('');
  $effect(() => {
    const controller = new AbortController(); let active = true;
    data = null; problem = '';
    void loadDxfPreview(source, controller.signal).then(result => {
      if (active) data = result;
    }).catch(error => { if (active) problem = error.message === 'limit' ? 'limit' : 'failed'; });
    return () => { active = false; controller.abort(); };
  });
</script>
<div class="dxf-preview" aria-label={copy.preview}>
  {#if problem}<p role="alert">{problem === 'limit' ? copy.limit : copy.failed}</p>
  {:else if data}
    <svg data-testid="dxf-preview-svg" role="img" aria-label={`${copy.preview}: ${title}`} viewBox={data.viewBox}
      style:transform={`scale(${zoom})`} preserveAspectRatio="xMidYMid meet">
      {#each data.paths as path}<path d={path} fill="none" stroke="currentColor" stroke-width="1.2" vector-effect="non-scaling-stroke" />{/each}
    </svg>
    {#if !data.unit}<p>{copy.units}</p>{/if}
    {#if data.omitted.length}<p role="status">{copy.partial} {data.omitted.map(item => item.type).join(', ')}</p>{/if}
  {:else}<p role="status">{copy.loading}</p>{/if}
</div>
<style>
  .dxf-preview{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;width:100%;height:100%;min-height:180px;color:var(--ink-primary,var(--text));background:var(--bg-1);overflow:auto}
  svg{display:block;width:100%;height:100%;min-height:200px;flex:1;transform-origin:center}
  p{padding:8px;margin:0;font-size:12px;overflow-wrap:anywhere}
</style>
