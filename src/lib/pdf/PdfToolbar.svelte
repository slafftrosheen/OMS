<script lang="ts">
  interface Props {
    page?: number;
    pages?: number;
    zoom?: number;
    setPage: (n:number)=>void;
    setZoom: (z:number)=>void;
  }

  let {
    page = 1,
    pages = 1,
    zoom = 1,
    setPage,
    setZoom
  }: Props = $props();
  
  const MIN_ZOOM = 0.5;
  const MAX_ZOOM = 3;
  const ZOOM_STEP = 0.1;
</script>

<div class="toolbar">
  <button class="tag ghost" onclick={()=>setPage(Math.max(1,page-1))} aria-label="Prev page">‹</button>
  <span>{page} / {pages}</span>
  <button class="tag ghost" onclick={()=>setPage(Math.min(pages,page+1))} aria-label="Next page">›</button>
  <span class="sep"></span>
  <button class="tag ghost" onclick={()=>setZoom(Math.max(MIN_ZOOM,+(zoom-ZOOM_STEP).toFixed(2)))} aria-label="Zoom out">–</button>
  <span>{Math.round(zoom*100)}%</span>
  <button class="tag ghost" onclick={()=>setZoom(Math.min(MAX_ZOOM,+(zoom+ZOOM_STEP).toFixed(2)))} aria-label="Zoom in">+</button>
</div>

<style>
.toolbar{ position:sticky; top: calc(56px + 8px); background:var(--bg-1); border:1px solid var(--border); border-radius:12px; padding:6px; display:flex; gap:8px; align-items:center; z-index: 3; }
.sep{ flex:0 0 1px; background:var(--border); height:20px; }
</style>
