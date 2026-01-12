<script lang="ts">
  export let po: string;
  export let revision: string = 'current';
  
  // Fallback for crypto.randomUUID for older browsers
  function generateId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
  
  let notes: { id: string; x: number; y: number; text: string }[] =
    JSON.parse(localStorage.getItem(key()) || '[]');
  
  function key() {
    return `rf_pdf_notes_${po}_${revision}`;
  }
  
  $: localStorage.setItem(key(), JSON.stringify(notes));

  let placing = false;
  let rects: { id: string; x: number; y: number; w: number; h: number }[] =
    JSON.parse(localStorage.getItem(key() + '_rects') || '[]');
  
  $: localStorage.setItem(key() + '_rects', JSON.stringify(rects));

  function onDblClick(e: MouseEvent) {
    const el = e.currentTarget as HTMLElement;
    const bb = el.getBoundingClientRect();
    const x = (e.clientX - bb.left) / bb.width;
    const y = (e.clientY - bb.top) / bb.height;
    notes = [...notes, { id: generateId(), x, y, text: '' }];
  }
  
  function addRect() {
    placing = true;
  }
  
  let start: { x: number; y: number } | null = null;
  
  function onDown(e: MouseEvent) {
    if (!placing) return;
    const el = e.currentTarget as HTMLElement;
    const bb = el.getBoundingClientRect();
    start = { x: (e.clientX - bb.left) / bb.width, y: (e.clientY - bb.top) / bb.height };
  }
  
  function onMove(e: MouseEvent) {
    if (!placing || !start) return;
    /* live preview optional */
  }
  
  function onUp(e: MouseEvent) {
    if (!placing || !start) return;
    const el = e.currentTarget as HTMLElement;
    const bb = el.getBoundingClientRect();
    const x2 = (e.clientX - bb.left) / bb.width;
    const y2 = (e.clientY - bb.top) / bb.height;
    const r = {
      id: generateId(),
      x: Math.min(start.x, x2),
      y: Math.min(start.y, y2),
      w: Math.abs(x2 - start.x),
      h: Math.abs(y2 - start.y)
    };
    rects = [...rects, r];
    placing = false;
    start = null;
  }
</script>

<div
  class="annos"
  on:dblclick={onDblClick}
  on:mousedown={onDown}
  on:mousemove={onMove}
  on:mouseup={onUp}>
  {#each rects as r}
    <div
      class="rect"
      style={`left:${r.x * 100}%;top:${r.y * 100}%;width:${r.w * 100}%;height:${r.h * 100}%`}
      title="Rect annotation"></div>
  {/each}

  {#each notes as n}
    <div class="note" style={`left:${n.x * 100}%;top:${n.y * 100}%`}>
      <textarea bind:value={n.text} placeholder="Note…" />
    </div>
  {/each}
  
  <div class="toolbar small">
    <button class="tag ghost" on:click={addRect}>Add rectangle</button>
  </div>
</div>

<style>
  .annos {
    position: absolute;
    inset: 0;
    pointer-events: all;
  }
  .note {
    position: absolute;
    transform: translate(-50%, -50%);
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 6px;
    width: 180px;
    pointer-events: all;
  }
  .note textarea {
    width: 100%;
    min-height: 60px;
    background: transparent;
    color: var(--ink-0, var(--text));
    resize: vertical;
    border: none;
    font-family: inherit;
  }
  .rect {
    position: absolute;
    border: 2px solid var(--warn);
    background: color-mix(in oklab, var(--warn) 12%, transparent);
    border-radius: 6px;
    pointer-events: none;
  }
  .toolbar.small {
    position: absolute;
    top: 8px;
    right: 8px;
    display: flex;
    gap: 6px;
    pointer-events: all;
  }
</style>
