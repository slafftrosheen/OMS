<script lang="ts">
  // Toolbox — list every registered AI tool, group by category, link to runner.
  import { onMount } from 'svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import type { IconName } from '$lib/ui/icons';

  type Tool = {
    slug: string; label: string; description: string | null;
    icon: string | null; category: string | null; stations: string[]; enabled: boolean;
  };
  let tools = $state<Tool[]>([]);

  onMount(async () => {
    const j = await (await fetch('/api/ai/tools')).json();
    tools = j.tools ?? [];
  });

  const grouped = $derived(() => {
    const m = new Map<string, Tool[]>();
    for (const t of tools) {
      const k = t.category ?? 'misc';
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(t);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  });
</script>

<div class="toolbox">
  <header>
    <h2>Toolbox</h2>
    <p class="muted">Every tool below is callable by the chat LLM and exposed to operators in their station drawer (where allowed).</p>
  </header>

  {#each grouped() as [cat, list]}
    <section class="cat">
      <h3>{cat}</h3>
      <div class="grid">
        {#each list as t (t.slug)}
          <article class="tool">
            <div class="head">
              <Icon name={(t.icon as IconName) ?? 'wrench'} size="sm" />
              <strong>{t.label}</strong>
            </div>
            {#if t.description}<p>{t.description}</p>{/if}
            {#if t.stations.length}
              <div class="stations">
                {#each t.stations as s}<span class="pill">{s}</span>{/each}
              </div>
            {/if}
            <code class="slug">{t.slug}</code>
          </article>
        {/each}
      </div>
    </section>
  {/each}
</div>

<style>
  .toolbox { display: flex; flex-direction: column; gap: 18px; }
  .muted { color: var(--text-muted, #888); }
  h3 { margin: 0 0 8px; text-transform: capitalize; }
  .grid {
    display: grid; gap: 10px;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  }
  .tool {
    background: var(--glass-bg);
    backdrop-filter: var(--glass-blur);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-md);
    padding: 12px;
    display: flex; flex-direction: column; gap: 6px;
  }
  .head { display: flex; align-items: center; gap: 6px; }
  p { margin: 0; color: var(--text-muted, #888); font-size: 0.85rem; }
  .stations { display: flex; flex-wrap: wrap; gap: 4px; }
  .pill {
    font-size: 0.7rem; padding: 1px 8px; border-radius: var(--radius-full);
    background: color-mix(in oklab, var(--brand) 8%, transparent);
    border: 1px solid color-mix(in oklab, var(--brand) 30%, transparent);
  }
  .slug {
    font-size: 0.7rem; opacity: 0.7;
    background: color-mix(in oklab, #ffffff 4%, transparent);
    padding: 2px 6px; border-radius: var(--radius-sm);
    align-self: start;
  }
</style>
