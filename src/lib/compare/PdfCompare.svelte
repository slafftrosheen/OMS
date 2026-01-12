<script lang="ts">
  import { onMount } from 'svelte';
  export let left:{url:string,name:string};   // current
  export let right:{url:string,name:string};  // candidate
  let lhost:HTMLDivElement, rhost:HTMLDivElement, slider:HTMLInputElement;
  let total=1, page=1, ready=false;

  async function mount(el:HTMLElement, url:string){
    // pdf.js lite mount (assumes window.pdfjsLib & worker loaded in app.html)
    const pdf = await (window as any).pdfjsLib.getDocument(url).promise;
    total = Math.max(total, pdf.numPages);
    const cvs = document.createElement('canvas'); const ctx=cvs.getContext('2d')!;
    el.innerHTML=''; el.appendChild(cvs);
    async function render(p:number){
      const pg = await pdf.getPage(p);
      const vw = Math.min(el.clientWidth, 900);
      const vp = pg.getViewport({ scale: vw/pg.getViewport({scale:1}).width });
      cvs.width = vp.width; cvs.height=vp.height;
      await pg.render({canvasContext:ctx, viewport:vp}).promise;
    }
    return { render };
  }

  let L:any, R:any;
  async function setup(){
    if (!lhost || !rhost || !left?.url || !right?.url) return;
    ready=false;
    L = await mount(lhost, left.url);
    R = await mount(rhost, right.url);
    ready=true; jump(page);
  }
  function jump(p:number){ page=p; L?.render(page); R?.render(page); }

  let prevLeft=''; let prevRight='';
  $: if (left?.url && right?.url){
    if (left.url!==prevLeft || right.url!==prevRight){
      prevLeft = left.url; prevRight = right.url;
      setup();
    }
  }

  onMount(()=>{
    const roL = new ResizeObserver(()=>ready && L?.render(page));
    const roR = new ResizeObserver(()=>ready && R?.render(page));
    if (lhost) roL.observe(lhost);
    if (rhost) roR.observe(rhost);
    setup();
  });
</script>

<div class="cmp">
  <header class="row" style="justify-content:space-between;align-items:center">
    <div class="row" style="gap:8px"><strong>{left.name}</strong><span>⇄</span><strong>{right.name}</strong></div>
    <div class="row" style="gap:8px; align-items:center">
      <label class="row" style="gap:6px">Page <input bind:this={slider} type="range" min="1" max={total} bind:value={page} on:input={(e)=>jump(+e.currentTarget.value)} style="width:220px"></label>
      <span class="muted">{page} / {total}</span>
    </div>
  </header>

  <div class="split">
    <div class="pane" bind:this={lhost} aria-label="Current revision PDF"></div>
    <div class="pane" bind:this={rhost} aria-label="Candidate revision PDF"></div>
  </div>
</div>

<style>
.cmp{ display:grid; gap:10px }
.split{ display:grid; grid-template-columns:1fr 1fr; gap:10px }
.pane{ border:1px solid var(--border); border-radius:12px; padding:8px; min-height:40vh; background:var(--bg-0) }
@media (max-width: 820px){
  .split{ grid-template-columns:1fr; }
  .pane{ min-height:60vh }
}
</style>
