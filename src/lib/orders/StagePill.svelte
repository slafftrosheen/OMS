<script lang="ts">
  export let stage = 'CNC';     // CAD, CNC, Sanding, Bending, Welding, Paint, Assembly, QC, Delivery
  export let done  = false;
  export let redo: string | null = null;      // 'resand' | 'recut' | 'repaint' | ...
</script>

<span class="pill" data-done={done} data-redo={!!redo} title={redo ? `Redo: ${redo}` : stage}>
  {stage}{#if redo}<small aria-label="Redo required">⟲</small>{/if}
</span>

<style>
.pill{
  display:inline-flex;
  align-items:center;
  gap:var(--space-tight);
  padding:var(--space-xs) var(--space-sm);
  border:1px solid var(--border);
  border-radius:var(--radius-full);
}
.pill[data-done="true"]{
  background: var(--ok);
  color: var(--ink-0, var(--text));
  border-color: color-mix(in oklab,var(--ok) 80%, var(--ink-0, var(--text)));
}
.pill[data-redo="true"]{
  outline:calc(2px * var(--font-scale, 1)) dashed var(--warn);
  outline-offset:var(--space-xxs);
}
.pill small{ font-size:.8em; opacity:.9 }
</style>
