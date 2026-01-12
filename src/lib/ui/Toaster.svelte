<script lang="ts">
  import { toasts, type Toast } from '$lib/stores/toast';
  let list: Toast[] = [];
const colors = {
  info: 'linear-gradient(90deg,var(--accent-2),var(--accent-1))',
  success: 'linear-gradient(90deg,var(--ok), color-mix(in oklab, var(--ok) 65%, var(--ink-0, var(--text))))',
  warning: 'linear-gradient(90deg,var(--warn), color-mix(in oklab, var(--warn) 70%, var(--ink-0, var(--text))))',
  error: 'linear-gradient(90deg,var(--danger), color-mix(in oklab, var(--danger) 65%, var(--ink-0, var(--text))))'
};
  $: $toasts, list = $toasts;
</script>

<style>
.wrap{position:fixed;right:var(--space-lg);bottom:var(--space-lg);display:grid;gap:var(--space-snug);z-index:9999}
.box{min-width:calc(280px * var(--font-scale, 1));max-width:calc(420px * var(--font-scale, 1));border-radius:var(--radius-md);padding:var(--space-md) calc(var(--space-md) + var(--space-xxs));background:var(--bg-1);border:1px solid var(--border);box-shadow:0 6px 18px rgba(var(--shadow-rgb)/0.18)}
.title{font-weight:800}
.msg{opacity:.9;margin-top:var(--space-xs)}
.bar{height:calc(4px * var(--font-scale, 1));border-radius:var(--radius-full);margin-top:var(--space-sm);overflow:hidden}
</style>

<div id="rf-toasts" class="wrap" role="status" aria-live="polite" aria-atomic="true">
  {#each list as t (t.id)}
    <div class="box" data-kind={t.kind}>
      {#if t.title}<div class="title">{t.title}</div>{/if}
      <div class="msg">{t.message}</div>
      <div class="bar" style="background:{colors[t.kind || 'info']}"></div>
    </div>
  {/each}
</div>
