<script lang="ts">
  let {
    title
  }: {
    title: string;
  } = $props();
</script>

<div class="section-header">
  {title}
</div>

<style>
  .section-header {
    background: var(--ink-primary)000;
    color: var(--bg-0);
    padding: 8px 12px;
    font-size: 11px;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
</style>
