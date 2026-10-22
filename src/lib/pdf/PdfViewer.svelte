<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { t } from 'svelte-i18n';
  import type { PDFDocumentProxy, PDFDocumentLoadingTask, RenderTask } from 'pdfjs-dist';
  import PdfAnnotationsLayer from './PdfAnnotationsLayer.svelte';

  let { src = '', maxScale = 3, defaultScale = 1, po = '', revision = 'current' } = $props<{
    src?: string; maxScale?: number; defaultScale?: number; po?: string; revision?: string;
  }>();
  let canvasEl = $state<HTMLCanvasElement>();
  let hostEl = $state<HTMLDivElement>();
  let container = $state<HTMLDivElement>();
  let pageNum = $state(1), pageCount = $state(1);
  // A default is a mount-time seed; page/zoom buttons own the live viewport.
  let scale = $state(untrack(() => defaultScale));
  let mounted = $state(false), visible = $state(false), full = $state(false);
  let pdfDoc = $state.raw<PDFDocumentProxy | null>(null);
  let documentLoading = $state(false), painting = $state(false), error = $state('');
  const loading = $derived(documentLoading || painting);
  let paintedView = $state.raw<{ doc: PDFDocumentProxy; page: number; zoom: number } | null>(null);
  let paintSucceeded = $state(false);
  const annotationsReady = $derived(paintSucceeded && !loading &&
    paintedView?.doc === pdfDoc && paintedView?.page === pageNum && paintedView?.zoom === boundedZoom(scale));
  const annotationPage = $derived(paintedView?.page ?? 1);
  let pdfModule: Promise<typeof import('pdfjs-dist')> | undefined;
  let renderTask: RenderTask | undefined;
  let paintGeneration = 0;

  function ensurePdf() {
    return pdfModule ??= Promise.all([
      import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
      import('pdfjs-dist/legacy/build/pdf.mjs')
    ]).then(([{ default: workerSrc }, module]) => {
      module.GlobalWorkerOptions.workerSrc = workerSrc;
      return module;
    }).catch(err => { pdfModule = undefined; throw err; });
  }
  function boundedZoom(value: number) {
    const maximum = Number.isFinite(maxScale) ? Math.max(.5, maxScale) : 3;
    return Math.min(maximum, Math.max(.5, Number.isFinite(value) ? value : 1));
  }
  function setZoom(value: number) {
    scale = boundedZoom(Math.round(value * 100) / 100);
    try { localStorage.setItem('rf_pdf_zoom', String(scale)); } catch { /* Preference storage is optional. */ }
  }
  async function fitToWidth() {
    const doc = pdfDoc, currentPage = pageNum;
    if (!doc || !container) return;
    try {
      const page = await doc.getPage(currentPage);
      if (!mounted || pdfDoc !== doc || pageNum !== currentPage || !container) return;
      const width = container.clientWidth - 24;
      if (width <= 0) return;
      const fit = boundedZoom(width / page.getViewport({ scale: 1 }).width);
      if (Math.abs(fit - scale) > .01) setZoom(fit);
    } catch { /* A document switch can destroy an outstanding page read. */ }
  }
  const prev = () => { if (pageNum > 1) pageNum--; };
  const next = () => { if (pageNum < pageCount) pageNum++; };

  onMount(() => {
    try { const saved = localStorage.getItem('rf_pdf_zoom'); if (saved) scale = boundedZoom(Number(saved)); }
    catch { /* Use the supplied default when storage is unavailable. */ }
    scale = boundedZoom(scale);
    mounted = true;
    const resize = new ResizeObserver(() => { void fitToWidth(); });
    if (container) resize.observe(container);
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { visible = true; observer.disconnect(); }
    }, { threshold: .1 });
    if (hostEl) observer.observe(hostEl);
    return () => { mounted = false; observer.disconnect(); resize.disconnect(); };
  });

  $effect(() => {
    const source = src;
    if (!mounted || !visible) return;
    let active = true;
    let task: PDFDocumentLoadingTask | undefined;
    let loaded: PDFDocumentProxy | undefined;
    pdfDoc = null;
    pageNum = 1; pageCount = 1; error = '';
    documentLoading = !!source;
    if (source) void (async () => {
      try {
        const library = await ensurePdf();
        if (!active) return;
        task = library.getDocument({ url: source,
          cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/cmaps/', cMapPacked: true,
          disableAutoFetch: true, disableStream: true });
        const doc = await task.promise;
        if (!active) { await doc.destroy(); return; }
        loaded = doc;
        pageCount = doc.numPages;
        pdfDoc = doc;
        void fitToWidth();
      } catch (err) {
        if (active) { console.error('Unable to load PDF', err); error = $t('pdf.error'); }
      } finally { if (active) documentLoading = false; }
    })();
    return () => {
      active = false;
      // Loading-task destruction also closes its worker and loaded document.
      if (task) void task.destroy().catch(() => {});
      else if (loaded) void loaded.destroy().catch(() => {});
    };
  });

  $effect(() => {
    const doc = pdfDoc, canvas = canvasEl, currentPage = pageNum, zoom = boundedZoom(scale);
    const token = ++paintGeneration;
    const previous = renderTask;
    previous?.cancel();
    renderTask = undefined;
    painting = false; paintSucceeded = false;
    if (!mounted || !doc || !canvas) {
      if (canvas && !doc) { canvas.width = 0; canvas.height = 0; }
      return;
    }
    let active = true;
    painting = true;
    void (async () => {
      try {
        // PDF.js does not allow concurrent renders on the same canvas.
        await previous?.promise.catch(() => {});
        const page = await doc.getPage(currentPage);
        if (!active || token !== paintGeneration) return;
        const viewport = page.getViewport({ scale: zoom });
        const ratio = window.devicePixelRatio || 1;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('PDF canvas unavailable');
        canvas.width = Math.floor(viewport.width * ratio);
        canvas.height = Math.floor(viewport.height * ratio);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        const task = page.render({ canvasContext: context, viewport,
          transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] });
        renderTask = task;
        await task.promise;
        if (active && token === paintGeneration) {
          paintedView = { doc, page: currentPage, zoom };
          paintSucceeded = true; error = '';
        }
      } catch (err: any) {
        if (active && token === paintGeneration && err?.name !== 'RenderingCancelledException') error = $t('pdf.error');
      } finally {
        if (active && token === paintGeneration) { painting = false; renderTask = undefined; }
      }
    })();
    return () => { active = false; if (token === paintGeneration) renderTask?.cancel(); };
  });
</script>

<div class="pdf-host" class:overlay={full} bind:this={hostEl}>
  <div class="pdf-controls" bind:this={container}>
    <div class="row" style="justify-content:space-between;margin-bottom:8px">
      <strong>PDF</strong>
      <div class="row">
        <div class="row">
          <button class="tag" onclick={prev} disabled={pageNum <= 1}>{$t('pdf.prev')}</button>
          <div class="tag">{$t('pdf.page', { current: pageNum, total: pageCount })}</div>
          <button class="tag" onclick={next} disabled={pageNum >= pageCount}>{$t('pdf.next')}</button>
        </div>
        <div class="row">
          <button
            class="tag"
            onclick={() => setZoom(scale - 0.2)}
            aria-label="Zoom out" disabled={scale <= 0.5}>-
          </button>
          <div class="tag">{Math.round(scale * 100)}%</div>
          <button
            class="tag"
            onclick={() => setZoom(scale + 0.2)}
            aria-label="Zoom in" disabled={scale >= maxScale}>+
          </button>
          <button class="tag" onclick={fitToWidth}>Fit</button>
        </div>
        <button class="tag" onclick={()=>full=!full}>{full?'Close':'Full screen'}</button>
      </div>
    </div>
  </div>
  {#if loading}
    <div class="pdf-loading" role="status">{$t('pdf.loading') || 'Loading...'}</div>
  {/if}
  {#if error}
    <div class="tag tag-error" role="alert" style="margin-bottom:8px">{error}</div>
  {/if}
  <div class="pdf-stage">
    <canvas
      class="viewer"
      bind:this={canvasEl}
      aria-busy={loading}
    ></canvas>
    {#if po}
      <!-- Keep drafts mounted during loading/zoom, including when storage is
           unavailable. Only the successfully painted view is interactive. -->
      <div class="pdf-annotations" hidden={!annotationsReady} inert={!annotationsReady}>
        <PdfAnnotationsLayer {po} {revision} page={annotationPage} />
      </div>
    {/if}
  </div>
</div>

<style>
.pdf-host{ 
  height: 60vh; 
  min-height: 400px;
  max-width: 100%;
  overflow: auto;
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
  z-index: var(--z-sticky);
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
.pdf-stage { position:relative;width:max-content; }
.pdf-annotations { position:absolute;inset:0; }
.viewer{
  max-width:none;
  height:auto;
  border-radius:12px;
  border:1px solid color-mix(in oklab,var(--border) 85%, transparent);
  background:var(--bg-0);
  display: block;
}
</style>
