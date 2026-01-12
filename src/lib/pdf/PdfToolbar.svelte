<script lang="ts">
  export let page = 1; 
  export let pages = 1; 
  export let zoom = 1;
  export let setPage: (n:number)=>void; 
  export let setZoom: (z:number)=>void;
  
  const MIN_ZOOM = 0.5;
  const MAX_ZOOM = 3;
  const ZOOM_STEP = 0.1;
</script>

<div class="toolbar">
  <button class="tag ghost" on:click={()=>setPage(Math.max(1,page-1))} aria-label="Prev page">‹</button>
  <span>{page} / {pages}</span>
  <button class="tag ghost" on:click={()=>setPage(Math.min(pages,page+1))} aria-label="Next page">›</button>
  <span class="sep"></span>
  <button class="tag ghost" on:click={()=>setZoom(Math.max(MIN_ZOOM,+(zoom-ZOOM_STEP).toFixed(2)))} aria-label="Zoom out">–</button>
  <span>{Math.round(zoom*100)}%</span>
  <button class="tag ghost" on:click={()=>setZoom(Math.min(MAX_ZOOM,+(zoom+ZOOM_STEP).toFixed(2)))} aria-label="Zoom in">+</button>
</div>

<style>
.toolbar{ position:sticky; top: calc(56px + 8px); background:var(--bg-1); border:1px solid var(--border); border-radius:12px; padding:6px; display:flex; gap:8px; align-items:center; z-index: 3; }
.sep{ flex:0 0 1px; background:var(--border); height:20px; }
</style>
