<script lang="ts">
  import PdfViewer from '$lib/pdf/PdfViewer.svelte';
  import { t } from 'svelte-i18n';

  export let src = '';
  export let po = '';
  export let revision = 'current';
</script>

<div class="pdf-frame card">
  <div class="frame-head">
    <strong>{$t('pdf.label')}</strong>
    {#if src}
      <a class="tag" href={src} target="_blank" rel="noreferrer">{$t('pdf.open')}</a>
    {/if}
  </div>
  {#if src}
    <PdfViewer {src} {po} {revision} />
  {:else}
    <div class="placeholder muted">{$t('pdf.placeholder')}</div>
  {/if}
</div>

<style>
.pdf-frame{
  padding:0;
  display:flex;
  flex-direction:column;
  gap:0;
}
.frame-head{
  display:flex;
  justify-content:space-between;
  align-items:center;
  padding:8px 10px;
  border-bottom:1px solid var(--border);
  background:var(--bg-2);
}
.placeholder{
  padding:16px;
}
</style>
