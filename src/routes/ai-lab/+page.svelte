<script lang="ts">
  // AI Lab overview — status tiles + quick actions.
  import { onMount } from 'svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import type { IconName } from '$lib/ui/icons';
  import { base } from '$app/paths';

  type NodeState = {
    label: string; host: string; lastStatus: string;
    inflight: number; warmModels: string[]; vramGb: number; caps: string[];
  };

  let nodes = $state<NodeState[]>([]);
  let knowledgeCounts = $state({ total: 0, ready: 0, queued: 0, failed: 0 });
  let runsToday = $state(0);

  async function refresh() {
    const [n, k, r] = await Promise.all([
      fetch('/api/ai/swarm?refresh=1').then((r) => r.json()).catch(() => ({ nodes: [] })),
      fetch('/api/ai/knowledge?limit=200').then((r) => r.json()).catch(() => ({ items: [], total: 0 })),
      fetch('/api/ai/runs?limit=200').then((r) => r.json()).catch(() => ({ items: [] }))
    ]);
    nodes = n.nodes ?? [];
    const items = (k.items ?? []) as Array<{ status: string }>;
    knowledgeCounts = {
      total: k.total ?? items.length,
      ready: items.filter((i) => i.status === 'ready').length,
      queued: items.filter((i) => i.status === 'queued' || i.status === 'extracting' || i.status === 'embedding').length,
      failed: items.filter((i) => i.status === 'failed').length
    };
    const today = new Date(); today.setHours(0, 0, 0, 0);
    runsToday = ((r.items ?? []) as Array<{ created_at: string }>).filter(
      (x) => new Date(x.created_at) >= today
    ).length;
  }

  onMount(() => {
    void refresh();
    const t = setInterval(refresh, 15_000);
    return () => clearInterval(t);
  });

  const tiles: Array<{ href: string; icon: IconName; label: string; desc: string }> = [
    { href: '/ai-lab/chat',      icon: 'message-square', label: 'New conversation',
      desc: 'Tool-calling chat with citations from your knowledge base.' },
    { href: '/ai-lab/knowledge', icon: 'upload',         label: 'Feed knowledge',
      desc: 'Upload PDFs, drawings, photos, manuals, voice memos.' },
    { href: '/ai-lab/forge',     icon: 'image',          label: 'Forge content',
      desc: 'Image / mesh / audio / TTS generation.' },
    { href: '/ai-lab/canvas',    icon: 'layout-grid',    label: 'Open canvas',
      desc: 'Wire AI nodes together on an infinite board.' },
    { href: '/ai-lab/tools',     icon: 'wrench',         label: 'Browse toolbox',
      desc: 'CNC feeds & speeds, paint match, similar projects, …' }
  ];
</script>

<div class="overview">
  <section class="status">
    <div class="card">
      <div class="card-head"><Icon name="network" size="sm" /><span>Swarm</span></div>
      <div class="nodes">
        {#each nodes as n}
          <div class="node" data-status={n.lastStatus}>
            <div class="node-row">
              <span class="dot"></span>
              <strong>{n.label}</strong>
              <span class="muted">{n.host}</span>
              <span class="muted">{n.vramGb} GB</span>
            </div>
            <div class="caps">
              {#each n.caps as c}<span class="cap">{c}</span>{/each}
            </div>
            <div class="muted small">
              warm: {n.warmModels.length} · inflight: {n.inflight}
            </div>
          </div>
        {:else}
          <p class="muted">No AI nodes registered.</p>
        {/each}
      </div>
    </div>

    <div class="card">
      <div class="card-head"><Icon name="library" size="sm" /><span>Knowledge</span></div>
      <div class="nums">
        <div><strong>{knowledgeCounts.ready}</strong><span>ready</span></div>
        <div><strong>{knowledgeCounts.queued}</strong><span>processing</span></div>
        <div><strong>{knowledgeCounts.failed}</strong><span>failed</span></div>
        <div><strong>{knowledgeCounts.total}</strong><span>total</span></div>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><Icon name="list-checks" size="sm" /><span>Today</span></div>
      <div class="nums">
        <div><strong>{runsToday}</strong><span>AI runs</span></div>
      </div>
    </div>
  </section>

  <section class="tiles">
    {#each tiles as t}
      <a class="tile" href="{base}{t.href}">
        <Icon name={t.icon} size="md" />
        <strong>{t.label}</strong>
        <p>{t.desc}</p>
      </a>
    {/each}
  </section>
</div>

<style>
  .overview { display: grid; gap: calc(var(--space-md) * var(--density, 1)); }
  .status, .tiles {
    display: grid; gap: calc(var(--space-md) * var(--density, 1));
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  }
  .card {
    background: var(--glass-bg);
    backdrop-filter: var(--glass-blur);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-lg);
    padding: calc(var(--space-md) * var(--density, 1));
    box-shadow: var(--glass-shadow);
  }
  .card-head { display: flex; align-items: center; gap: 8px; opacity: 0.85; margin-bottom: 10px; }
  .nums { display: flex; gap: 24px; flex-wrap: wrap; }
  .nums div { display: flex; flex-direction: column; }
  .nums strong { font-size: 1.6rem; }
  .nums span { color: var(--text-muted, #888); font-size: 0.75rem; }
  .nodes { display: flex; flex-direction: column; gap: 12px; }
  .node-row { display: flex; align-items: center; gap: 8px; }
  .node-row .muted { color: var(--text-muted, #888); font-size: 0.8rem; }
  .small { font-size: 0.75rem; }
  .caps { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
  .cap {
    font-size: 0.65rem; padding: 1px 6px; border-radius: var(--radius-full);
    background: color-mix(in oklab, var(--brand) 10%, transparent);
    border: 1px solid color-mix(in oklab, var(--brand) 30%, transparent);
  }
  .dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: var(--text-muted, #888);
  }
  .node[data-status="up"]       .dot { background: #34c759; }
  .node[data-status="degraded"] .dot { background: #ffd60a; }
  .node[data-status="down"]     .dot { background: #ff453a; }
  .tile {
    display: flex; flex-direction: column; gap: 8px;
    padding: calc(var(--space-md) * var(--density, 1));
    background: var(--glass-bg);
    backdrop-filter: var(--glass-blur);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-lg);
    text-decoration: none; color: inherit;
    transition: transform var(--transition-fast), border-color var(--transition-fast);
  }
  .tile:hover {
    transform: translateY(-2px);
    border-color: color-mix(in oklab, var(--brand) 40%, transparent);
  }
  .tile p { margin: 0; color: var(--text-muted, #888); font-size: 0.85rem; }
</style>
