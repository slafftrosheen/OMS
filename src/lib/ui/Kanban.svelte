<script lang="ts">
  export let lanes: { name: string; items: { id: string; title: string }[] }[] = [];
</script>

<div class="kanban">
  {#each lanes as lane}
    <section class="col">
      <header>{lane.name}</header>
      <div class="stack">
        {#each lane.items as it (it.id)}
          <article class="card">{it.title}</article>
        {/each}
      </div>
    </section>
  {/each}
</div>

<style>
.kanban{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
.col{background:var(--bg-1);border:1px solid var(--border);border-radius:12px;padding:10px}
header{font-weight:900;margin-bottom:8px}
.stack{display:grid;gap:8px}
.card{background:var(--bg-2);border:1px solid var(--border);border-radius:10px;padding:10px}
</style>
