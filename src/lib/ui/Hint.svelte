<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    text = '',
    children
  }: {
    text?: string;
    children?: Snippet;
  } = $props();

  let id = `tt-${Math.random().toString(36).slice(2)}`;
  let show = $state(false);
</script>

<span
  class="hint-wrap"
  onmouseenter={() => (show = true)}
  onmouseleave={() => (show = false)}
  onfocus={() => (show = true)}
  onblur={() => (show = false)}
  role="group"
>
  {#if children}
    <span aria-describedby={id}>
      {@render children()}
    </span>
  {/if}
  {#if show}
    <span role="tooltip" id={id} class="hint">{text}</span>
  {/if}
</span>

<style>
.hint-wrap{position:relative;display:inline-flex}
.hint{position:absolute;top:100%;left:0;z-index: var(--z-overlay);background:var(--bg-1);border:1px solid var(--border);border-radius:8px;padding:6px 8px;white-space:nowrap;box-shadow:0 6px 14px oklch(0% 0 0 / 15%)}
</style>
