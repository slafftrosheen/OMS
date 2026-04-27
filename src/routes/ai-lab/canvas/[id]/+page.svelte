<script lang="ts">
  // Lightweight canvas editor — saves a JSON payload (drawing primitives) to
  // canvas_documents. A full tldraw integration can drop in later by replacing
  // <CanvasBoard /> with the tldraw <Tldraw> component and persisting its store
  // snapshot via PATCH /api/ai/canvas/[id].
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import Icon from '$lib/ui/Icon.svelte';

  type Stroke = { points: Array<{ x: number; y: number }>; color: string; w: number };
  type Payload = { strokes: Stroke[]; bg: string };

  let canvasEl: HTMLCanvasElement | undefined = $state();
  let title = $state('Untitled canvas');
  let payload = $state<Payload>({ strokes: [], bg: 'transparent' });
  let drawing = $state(false);
  let color = $state('#ff453a');
  let width = $state(3);
  let dirty = $state(false);
  let savedAt = $state<string | null>(null);

  const id = $derived(page.params.id ?? '');

  async function load() {
    if (!id) return;
    const j = await (await fetch(`/api/ai/canvas/${id}`)).json();
    if (j.canvas) {
      title = j.canvas.title;
      payload = (j.canvas.payload as Payload) ?? { strokes: [], bg: 'transparent' };
      redraw();
    }
  }

  async function save() {
    if (!id) return;
    await fetch(`/api/ai/canvas/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, payload })
    });
    savedAt = new Date().toLocaleTimeString();
    dirty = false;
  }

  function start(e: PointerEvent) {
    drawing = true;
    payload.strokes.push({ points: [{ x: e.offsetX, y: e.offsetY }], color, w: width });
  }
  function move(e: PointerEvent) {
    if (!drawing) return;
    const s = payload.strokes[payload.strokes.length - 1];
    s.points.push({ x: e.offsetX, y: e.offsetY });
    redraw();
    dirty = true;
  }
  function end() { drawing = false; }

  function redraw() {
    const c = canvasEl;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const s of payload.strokes) {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.w;
      ctx.beginPath();
      s.points.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
    }
  }

  function clearAll() {
    payload = { strokes: [], bg: payload.bg };
    redraw();
    dirty = true;
  }

  onMount(() => {
    void load();
    const t = setInterval(() => { if (dirty) void save(); }, 5_000);
    return () => clearInterval(t);
  });
</script>

<div class="canvas-page">
  <header>
    <input bind:value={title} onchange={() => (dirty = true)} class="title" />
    <input type="color" bind:value={color} title="colour" />
    <input type="range" min="1" max="20" bind:value={width} title="thickness" />
    <button class="btn ghost" onclick={clearAll}><Icon name="eraser" size="sm" /> Clear</button>
    <button class="btn" onclick={save} disabled={!dirty}><Icon name="save" size="sm" /> Save</button>
    {#if savedAt}<span class="muted small">saved {savedAt}</span>{/if}
  </header>
  <canvas
    bind:this={canvasEl}
    width="1200"
    height="700"
    onpointerdown={start}
    onpointermove={move}
    onpointerup={end}
    onpointerleave={end}
  ></canvas>
</div>

<style>
  .canvas-page { display: flex; flex-direction: column; gap: 8px; }
  header { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .title {
    flex: 1;
    background: transparent;
    color: inherit;
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-md);
    padding: 8px 10px; font: inherit; min-width: 200px;
  }
  canvas {
    width: 100%; height: 70vh; max-height: 800px;
    background: var(--glass-bg);
    backdrop-filter: var(--glass-blur);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-lg);
    touch-action: none;
  }
  .btn {
    padding: 8px 14px; border-radius: var(--radius-full);
    background: var(--brand); color: white; border: 0; cursor: pointer; font: inherit;
    display: inline-flex; gap: 6px; align-items: center;
  }
  .btn.ghost { background: transparent; color: var(--text); border: 1px solid var(--glass-border); }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .muted { color: var(--text-muted, #888); }
  .small { font-size: 0.75rem; }
</style>
