<script lang="ts">
  export let text = '';
  let id = `tt-${Math.random().toString(36).slice(2)}`;
  let show = false;
</script>

<span
  class="hint-wrap"
  on:mouseenter={() => (show = true)}
  on:mouseleave={() => (show = false)}
  on:focus={() => (show = true)}
  on:blur={() => (show = false)}
>
  <slot aria-describedby={id}></slot>
  {#if show}
    <span role="tooltip" id={id} class="hint">{text}</span>
  {/if}
</span>

<style>
.hint-wrap{position:relative;display:inline-flex}
.hint{position:absolute;top:100%;left:0;z-index:50;background:var(--bg-1);border:1px solid var(--border);border-radius:8px;padding:6px 8px;white-space:nowrap;box-shadow:0 6px 14px rgba(0,0,0,.15)}
</style>
