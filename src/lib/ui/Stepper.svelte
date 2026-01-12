<script lang="ts">
  export let steps: { name: string; done?: boolean }[] = [];
</script>

<div class="stepper">
  {#each steps as s, i}
    <div class="node" data-done={s.done}>
      <div class="dot">{s.done ? '✓' : i+1}</div>
      <div class="label">{s.name}</div>
      {#if i < steps.length - 1}<div class="line" aria-hidden="true"></div>{/if}
    </div>
  {/each}
</div>

<style>
.stepper{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.node{display:flex;align-items:center;gap:8px;position:relative}
.dot{width:26px;height:26px;border-radius:999px;display:grid;place-items:center;background:var(--bg-2);border:1px solid var(--border)}
.node[data-done="true"] .dot{background:linear-gradient(90deg,var(--accent-1),var(--accent-2));color:var(--ink-0, var(--text));font-weight:900;border:none}
.label{font-weight:700}
.line{width:36px;height:2px;background:var(--border)}
</style>
