<script lang="ts">
  import { ui } from '$lib/state/ui';
  import AArrowDown from 'lucide-svelte/icons/a-arrow-down';
  import AArrowUp from 'lucide-svelte/icons/a-arrow-up';
  import { onDestroy, onMount } from 'svelte';

  const steps = [0.90, 1.00, 1.10, 1.20, 1.30];
  const minScale = steps[0];
  const maxScale = steps[steps.length - 1];

  let refreshZoom: (() => void) | null = null;
  let currentScale = 1;
  const unsubscribe = ui.subscribe(p => {
    currentScale = p.fontScale;
    refreshZoom?.();
  });

  onDestroy(unsubscribe);

  $: canDecrement = currentScale > minScale + 0.001;
  $: canIncrement = currentScale < maxScale - 0.001;

  function inc() {
    const next = steps.find(s => s > currentScale);
    if (!next) return;
    ui.update(p => ({ ...p, fontScale: next }));
  }

  function dec() {
    const next = [...steps].reverse().find(s => s < currentScale);
    if (!next) return;
    ui.update(p => ({ ...p, fontScale: next }));
  }

  onMount(() => {
    if (typeof window === 'undefined') return;
    const doc = document.documentElement;
    const viewport = window.visualViewport;

    let raf = 0;
    const apply = () => {
      const zoom = viewport?.scale;
      if (zoom && !Number.isNaN(zoom)) {
        doc.style.setProperty('--text-zoom', zoom.toFixed(3));
      } else {
        const computed = parseFloat(getComputedStyle(doc).fontSize) || 16;
        const baseline = currentScale ? computed / (16 * currentScale) : computed / 16;
        doc.style.setProperty('--text-zoom', baseline.toFixed(3));
      }
    };

    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(apply);
    };

    apply();

    const resizeEvents: Array<[EventTarget, string]> = [];

    if (viewport) {
      resizeEvents.push([viewport, 'resize'], [viewport, 'scroll']);
    }
    resizeEvents.push([window, 'resize']);

    resizeEvents.forEach(([target, type]) => target.addEventListener(type, schedule, { passive: true }));

    refreshZoom = schedule;

    return () => {
      resizeEvents.forEach(([target, type]) => target.removeEventListener(type, schedule));
      cancelAnimationFrame(raf);
      refreshZoom = null;
    };
  });
</script>

<div class="text-size-row">
  <button
    class="text-size-btn"
    aria-label="Smaller text"
    on:click={dec}
    disabled={!canDecrement}
  >
    <AArrowDown size={16} aria-hidden="true" />
  </button>
  <span class="text-size-label">{Math.round(currentScale * 100)}%</span>
  <button
    class="text-size-btn"
    aria-label="Larger text"
    on:click={inc}
    disabled={!canIncrement}
  >
    <AArrowUp size={16} aria-hidden="true" />
  </button>
</div>

<style>
  .text-size-row {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
  }

  .text-size-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-2);
    min-width: 32px;
    text-align: center;
    user-select: none;
    flex-shrink: 0;
  }

  .text-size-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    min-width: 28px;
    min-height: 28px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 6px;
    color: var(--text-2);
    cursor: pointer;
    transition: all 0.15s ease;
    flex-shrink: 0;
  }

  .text-size-btn:hover:not(:disabled) {
    background: var(--bg-2);
    color: var(--text);
  }

  .text-size-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .text-size-btn :global(svg) {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }
</style>
