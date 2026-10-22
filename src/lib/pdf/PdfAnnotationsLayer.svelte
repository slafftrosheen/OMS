<script lang="ts">
  import { tick } from 'svelte';
  import { annotationKey, readPdfNotes, readPdfRectangles, type PdfNote, type PdfRectangle } from './annotation-storage';

  let { po, revision = 'current', page = 1 }: { po: string; revision?: string; page?: number } = $props();
  let notes = $state<PdfNote[]>([]);
  let rects = $state<PdfRectangle[]>([]);
  let placing = $state(false);
  let loadedKey = $state('');
  let layer = $state<HTMLDivElement>();
  let surface = $state<HTMLButtonElement>();
  let start: { x: number; y: number } | null = null;
  const storageKey = $derived(annotationKey(po, revision, page));

  $effect(() => {
    const key = storageKey;
    let noteData: string | null = null, rectangleData: string | null = null;
    try { noteData = localStorage.getItem(key); rectangleData = localStorage.getItem(`${key}_rects`); }
    catch { /* Annotations still work when browser storage is unavailable. */ }
    notes = readPdfNotes(noteData); rects = readPdfRectangles(rectangleData);
    placing = false; start = null; loadedKey = key;
  });
  $effect(() => {
    if (loadedKey !== storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(notes));
      localStorage.setItem(`${storageKey}_rects`, JSON.stringify(rects));
    } catch { /* Storage can be unavailable or full. Keep the current draft. */ }
  });

  function generateId() {
    return globalThis.crypto?.randomUUID?.() ?? `note-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
  function position(event: MouseEvent | PointerEvent) {
    const box = surface!.getBoundingClientRect();
    const clamp = (value: number) => Math.max(0, Math.min(1, value));
    return { x: clamp((event.clientX - box.left) / Math.max(1, box.width)),
      y: clamp((event.clientY - box.top) / Math.max(1, box.height)) };
  }
  async function addNote(point = { x: .5, y: .5 }) {
    if (notes.length >= 200) return;
    const id = generateId(), context = storageKey;
    notes = [...notes, { id, ...point, text: '' }];
    await tick();
    if (context === storageKey) Array.from(layer?.querySelectorAll('textarea') ?? [])
      .find(element => element.dataset.noteId === id)?.focus();
  }
  function addRect() {
    placing = !placing; start = null;
    if (placing) surface?.focus();
  }
  function beginRectangle(event: PointerEvent) {
    if (!placing || event.button !== 0) return;
    start = position(event); surface?.setPointerCapture(event.pointerId);
  }
  function finishRectangle(event: PointerEvent) {
    if (!placing || !start) return;
    const end = position(event), width = Math.abs(end.x - start.x), height = Math.abs(end.y - start.y);
    if (width > .002 && height > .002 && rects.length < 200) {
      rects = [...rects, { id: generateId(), x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), w: width, h: height }];
    }
    placing = false; start = null;
  }
  function activateSurface(event: MouseEvent) {
    if (event.detail !== 0) return; // Pointer users place a note with a double click.
    if (placing) {
      if (rects.length < 200) rects = [...rects, { id: generateId(), x: .35, y: .4, w: .3, h: .2 }];
      placing = false; start = null;
    } else void addNote();
  }
</script>

<div class="annos" bind:this={layer}>
  <button type="button" class="annotation-surface" bind:this={surface}
    aria-label={placing ? 'Place rectangle annotation: drag, or press Enter for a centered rectangle' : 'PDF annotation area: double click or press Enter to add a note'}
    onclick={activateSurface} ondblclick={event => { if (!placing) void addNote(position(event)); }}
    onpointerdown={beginRectangle} onpointerup={finishRectangle}
    onpointercancel={() => { start = null; placing = false; }}
    onkeydown={event => { if (event.key === 'Escape' && placing) { event.stopPropagation(); placing = false; start = null; } }}
  ></button>
  {#each rects as rectangle (rectangle.id)}
    <div class="rect" style={`left:${rectangle.x * 100}%;top:${rectangle.y * 100}%;width:${rectangle.w * 100}%;height:${rectangle.h * 100}%`}
      title="Rectangle annotation"></div>
  {/each}
  {#each notes as note (note.id)}
    <div class="note" style={`left:${note.x * 100}%;top:${note.y * 100}%`}>
      <textarea data-note-id={note.id} bind:value={note.text} aria-label="PDF note" maxlength="10000" placeholder="Note…"></textarea>
    </div>
  {/each}
  <div class="toolbar small">
    <button type="button" class="tag ghost" onclick={() => addNote()} disabled={notes.length >= 200}>Add note</button>
    <button type="button" class="tag ghost" onclick={addRect} aria-pressed={placing} disabled={rects.length >= 200}>
      {placing ? 'Cancel rectangle' : 'Add rectangle'}
    </button>
  </div>
</div>

<style>
  .annos { position:absolute;inset:0;pointer-events:none; }
  .annotation-surface { position:absolute;inset:0;width:100%;height:100%;padding:0;border:0;background:transparent;pointer-events:auto; }
  .annotation-surface:focus-visible { outline:2px solid var(--accent-1);outline-offset:-2px; }
  .note { position:absolute;transform:translate(-50%,-50%);background:var(--bg-1);border:1px solid var(--border);border-radius:8px;padding:6px;width:180px;pointer-events:auto; }
  .note textarea { width:100%;min-height:60px;background:transparent;color:var(--ink-0,var(--text));resize:vertical;border:none;font-family:inherit; }
  .rect { position:absolute;border:2px solid var(--warn);background:color-mix(in oklab,var(--warn) 12%,transparent);border-radius:6px;pointer-events:none; }
  .toolbar.small { position:absolute;top:8px;right:8px;display:flex;gap:6px;pointer-events:auto; }
</style>
