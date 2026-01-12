<script>
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import PdfAnnotationsLayer from './PdfAnnotationsLayer.svelte';

  export let src = '';
  export let maxScale = 3.0; // Allow higher zoom
  export let defaultScale = 1.0;
  export let po = ''; // For annotations
  export let revision = 'current'; // For annotations
  
  let canvasEl;
  let pageNum = 1;
  let pageCount = 1;
  let scale = defaultScale;
  let pdfjsLib;
  let mounted = false;
  let pdfDoc;
  let renderTask;
  let currentSrc = '';
  let loading = false;
  let error = '';
  let lastSrc = '';
  let full = false;
  let hostEl;
  let container;
  let ro;

  async function ensurePdf() {
    if (pdfjsLib) return;
    const [{ default: workerSrc }, pdfModule] = await Promise.all([
      import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
      import('pdfjs-dist/legacy/build/pdf.mjs')
    ]);
    pdfjsLib = pdfModule;
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
  }

  async function render(forceReload = false) {
    if (!mounted || !src || !canvasEl) return;
    await ensurePdf();
    loading = true;
    error = '';
    try {
      if (forceReload || currentSrc !== src) {
        renderTask?.cancel();
        await pdfDoc?.destroy?.();
        // Use cacheKey to help with loading optimization
        const loadingTask = pdfjsLib.getDocument({
          url: src,
          cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/cmaps/',
          cMapPacked: true,
          // Disable streaming for faster initial load on smaller files
          disableAutoFetch: true,
          disableStream: true
        });
        pdfDoc = await loadingTask.promise;
        currentSrc = src;
        lastSrc = src;
        pageCount = pdfDoc.numPages;
        pageNum = 1;
      }

      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale });
      const context = canvasEl.getContext('2d');
      
      // Use devicePixelRatio for better rendering on high-DPI displays
      const outputScale = window.devicePixelRatio || 1;
      
      canvasEl.width = Math.floor(viewport.width * outputScale);
      canvasEl.height = Math.floor(viewport.height * outputScale);
      canvasEl.style.width = Math.floor(viewport.width) + 'px';
      canvasEl.style.height = Math.floor(viewport.height) + 'px';
      
      const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;
      
      renderTask?.cancel();
      renderTask = page.render({ 
        canvasContext: context, 
        viewport,
        transform
      });
      await renderTask.promise;
      renderTask = undefined;
    } catch (err) {
      if (err?.name === 'RenderingCancelledException') {
        renderTask = undefined;
        return;
      }
      console.error('Unable to render PDF', err);
      error = $t('pdf.error');
      renderTask = undefined;
    } finally {
      loading = false;
    }
  }

  const prev = async () => {
    if (pageNum > 1) {
      pageNum--;
      await render();
    }
  };

  const next = async () => {
    if (pageNum < pageCount) {
      pageNum++;
      await render();
    }
  };

  function setZoom(z) {
    scale = Math.min(maxScale, Math.max(0.5, +z.toFixed(2)));
    if (typeof window !== 'undefined') {
      localStorage.setItem('rf_pdf_zoom', String(scale));
    }
    render();
  }

  function fitToWidth() {
    if (!pdfDoc || !container) return;
    pdfDoc.getPage(pageNum).then(page => {
      const viewport = page.getViewport({ scale: 1.0 });
      const containerWidth = container.clientWidth - 24; // padding
      const fitScale = Math.max(0.5, Math.min(maxScale, containerWidth / viewport.width));
      if (Math.abs(fitScale - scale) > 0.01) {
        setZoom(fitScale);
      }
    });
  }

  onMount(() => {
    mounted = true;
    
    // Load saved zoom preference
    if (typeof window !== 'undefined') {
      const savedZoom = localStorage.getItem('rf_pdf_zoom');
      if (savedZoom) {
        scale = +savedZoom || 1.0;
      }
    }
    
    // ResizeObserver to fit PDF to width on container resize
    ro = new ResizeObserver(() => {
      if (pdfDoc) fitToWidth();
    });
    if (container) ro.observe(container);
    
    // Lazy load PDF when it becomes visible
    const observer = new IntersectionObserver((entries) => {
      const entry = entries.find(e => e.isIntersecting);
      if (entry && src && !pdfDoc) {
        render(true).then(() => fitToWidth());
      }
    }, { threshold: 0.1 });
    
    if (hostEl) {
      observer.observe(hostEl);
    }
    
    return () => {
      mounted = false;
      observer.disconnect();
      ro?.disconnect();
      renderTask?.cancel();
      renderTask = undefined;
      currentSrc = '';
      lastSrc = '';
      pdfDoc?.destroy?.();
      pdfDoc = undefined;
      pdfjsLib = undefined;
    };
  });

  $: if (mounted && src && src !== lastSrc) {
    lastSrc = src;
    render(true).then(() => fitToWidth());
  }
</script>
<div class="pdf-host" class:overlay={full} bind:this={hostEl}>
  <div class="pdf-controls" bind:this={container}>
    <div class="row" style="justify-content:space-between;margin-bottom:8px">
      <strong>PDF</strong>
      <div class="row">
        <div class="row">
          <button class="tag" on:click={prev} disabled={pageNum <= 1}>{$t('pdf.prev')}</button>
          <div class="tag">{$t('pdf.page', { current: pageNum, total: pageCount })}</div>
          <button class="tag" on:click={next} disabled={pageNum >= pageCount}>{$t('pdf.next')}</button>
        </div>
        <div class="row">
          <button
            class="tag"
            on:click={() => setZoom(scale - 0.2)}
            disabled={scale <= 0.5}>-
          </button>
          <div class="tag">{Math.round(scale * 100)}%</div>
          <button
            class="tag"
            on:click={() => setZoom(scale + 0.2)}
            disabled={scale >= maxScale}>+
          </button>
          <button class="tag" on:click={fitToWidth}>Fit</button>
        </div>
        <button class="tag" on:click={()=>full=!full}>{full?'Close':'Full screen'}</button>
      </div>
    </div>
  </div>
  {#if loading}
    <div class="pdf-loading">{$t('pdf.loading') || 'Loading...'}</div>
  {/if}
  {#if error}
    <div class="tag tag-error" style="margin-bottom:8px">{error}</div>
  {/if}
  <div class="pdf-stage" style="position:relative">
    <canvas
      class="viewer"
      bind:this={canvasEl}
      aria-busy={loading}
    ></canvas>
    {#if po}
      <PdfAnnotationsLayer {po} {revision} />
    {/if}
  </div>
</div>

<style>
.pdf-host{ 
  height: 60vh; 
  min-height: 400px;
  max-width: 100%;
  overflow: hidden;
}

.overlay{
  position:fixed; 
  inset:auto 0 0 0; 
  top:10%;
  height:90%;
  background:var(--bg-0); 
  z-index:70; 
  padding:12px 12px calc(12px + var(--rail-safe));
  border:1px solid var(--border); 
  border-radius:16px 16px 0 0;
  overflow:auto;
}

@media (min-width:821px){ 
  .overlay{ 
    position:static; 
    height:auto; 
    border:none; 
    border-radius:12px;
  } 
}

.pdf-controls {
  position: sticky;
  top: 0;
  background: var(--bg-0);
  z-index: 10;
  padding: 8px 0;
}

.pdf-loading {
  text-align: center;
  padding: 20px;
  color: var(--muted);
  font-style: italic;
}

.tag:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.tag-error{
  background: color-mix(in oklab, var(--danger) 18%, transparent);
  color: var(--danger);
  border-color: color-mix(in oklab, var(--danger) 40%, transparent);
}
.viewer{
  max-width:100%;
  height:auto;
  border-radius:12px;
  border:1px solid color-mix(in oklab,var(--border) 85%, transparent);
  background:var(--bg-0);
  display: block;
}
</style>
