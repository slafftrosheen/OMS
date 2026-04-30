<script lang="ts">
  // AI Lab overview — status dashboard + quick access.
  // Consolidates swarm nodes and recent runs history.
  import { onMount } from 'svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import type { IconName } from '$lib/ui/icons';
  import { base } from '$app/paths';

  type NodeState = {
    label: string; host: string; port: number; sidecarUrl: string;
    caps: string[]; inflight: number; lastSeen: number; lastStatus: string;
    warmModels: string[]; weight: number; vramGb: number;
  };

  type Run = {
    id: string; kind: string; status: string;
    node_label: string | null; model: string | null;
    cost_seconds: number | null; tokens_in: number | null; tokens_out: number | null;
    error: string | null; created_at: string;
  };

  let nodes = $state<NodeState[]>([]);
  let runs = $state<Run[]>([]);
  let knowledgeCounts = $state({ total: 0, ready: 0, queued: 0, failed: 0 });
  let runsTodayCount = $state(0);
  let now = $state(Date.now());

  async function refresh() {
    const [n, k, r] = await Promise.all([
      fetch('/api/ai/swarm?refresh=1').then((r) => r.json()).catch(() => ({ nodes: [] })),
      fetch('/api/ai/knowledge?limit=200').then((r) => r.json()).catch(() => ({ items: [], total: 0 })),
      fetch('/api/ai/runs?limit=20').then((r) => r.json()).catch(() => ({ items: [] }))
    ]);
    
    nodes = n.nodes ?? [];
    now = n.now ?? Date.now();
    runs = r.items ?? [];
    
    const items = (k.items ?? []) as Array<{ status: string }>;
    knowledgeCounts = {
      total: k.total ?? items.length,
      ready: items.filter((i) => i.status === 'ready').length,
      queued: items.filter((i) => i.status === 'queued' || i.status === 'extracting' || i.status === 'embedding').length,
      failed: items.filter((i) => i.status === 'failed').length
    };
    
    const today = new Date(); today.setHours(0, 0, 0, 0);
    runsTodayCount = runs.filter(
      (x) => new Date(x.created_at) >= today
    ).length;
  }

  onMount(() => {
    void refresh();
    const t = setInterval(refresh, 10_000);
    return () => clearInterval(t);
  });

  function ago(ms: number): string {
    if (!ms) return '—';
    const s = Math.max(0, Math.floor((now - ms) / 1000));
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    return `${Math.floor(s / 3600)}h ago`;
  }

  const tiles: Array<{ href: string; icon: IconName; label: string; desc: string }> = [
    { href: '/ai-lab/canvas',    icon: 'layout-grid',    label: 'Open canvas',
      desc: 'Wire AI nodes together on an infinite board.' },
    { href: '/orders',           icon: 'clipboard-list', label: 'View Orders',
      desc: 'Manage and review production orders.' },
    { href: '/calendar',         icon: 'calendar',       label: 'Calendar',
      desc: 'Check upcoming delivery and meeting schedules.' }
  ];
</script>

<div class="overview">
  <!-- Headline Stats -->
  <section class="status-grid">
    <div class="card stat-card">
      <div class="card-head"><Icon name="network" size="sm" /><span>Swarm Status</span></div>
      <div class="nums">
        <div><strong>{nodes.filter(n => n.lastStatus === 'up').length}</strong><span>up</span></div>
        <div><strong>{nodes.filter(n => n.lastStatus === 'down').length}</strong><span>down</span></div>
      </div>
    </div>

    <div class="card stat-card">
      <div class="card-head"><Icon name="library" size="sm" /><span>Knowledge Base</span></div>
      <div class="nums">
        <div><strong>{knowledgeCounts.ready}</strong><span>ready</span></div>
        <div><strong>{knowledgeCounts.queued}</strong><span>processing</span></div>
      </div>
    </div>

    <div class="card stat-card">
      <div class="card-head"><Icon name="list-checks" size="sm" /><span>Activity Today</span></div>
      <div class="nums">
        <div><strong>{runsTodayCount}</strong><span>AI runs</span></div>
      </div>
    </div>
  </section>

  <!-- Quick Access Tiles -->
  <section class="tiles-grid">
    {#each tiles as t}
      <a class="tile" href="{base}{t.href}">
        <div class="tile-icon"><Icon name={t.icon} size="md" /></div>
        <div class="tile-content">
          <strong>{t.label}</strong>
          <p>{t.desc}</p>
        </div>
      </a>
    {/each}
  </section>

  <div class="detailed-grid">
    <!-- Swarm Details -->
    <section class="swarm-details">
      <header class="section-head">
        <h3>Active Swarm</h3>
        <button class="btn-refresh" onclick={refresh}><Icon name="refresh-ccw" size="sm" /></button>
      </header>
      <div class="nodes-list">
        {#each nodes as n (n.label)}
          <article class="node-item" data-status={n.lastStatus}>
            <div class="node-main">
              <span class="dot"></span>
              <div class="node-info">
                <strong>{n.label}</strong>
                <span class="muted small">{n.host}:{n.port}</span>
              </div>
              <div class="node-stats">
                <span class="pill">VRAM {n.vramGb}GB</span>
                <span class="pill">{ago(n.lastSeen)}</span>
              </div>
            </div>
            <div class="caps">
              {#each n.caps as c}<span class="cap">{c}</span>{/each}
            </div>
            <div class="node-footer muted small">
              inflight: {n.inflight} · warm: {n.warmModels.length}
            </div>
          </article>
        {:else}
          <div class="card empty">No nodes connected to swarm.</div>
        {/each}
      </div>
    </section>

    <!-- Recent Runs -->
    <section class="runs-history">
      <header class="section-head">
        <h3>Recent AI Runs</h3>
        <a href="{base}/ai-lab/runs" class="muted small">View all</a>
      </header>
      <div class="runs-table-wrapper">
        <table class="runs-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Kind</th>
              <th>Status</th>
              <th>Model</th>
              <th>Secs</th>
            </tr>
          </thead>
          <tbody>
            {#each runs as r (r.id)}
              <tr data-status={r.status}>
                <td title={r.created_at}>{new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                <td><span class="kind-tag">{r.kind}</span></td>
                <td><span class="status-cell">{r.status}</span></td>
                <td class="trunc" title={r.model}>{r.model?.split('/').pop() || ''}</td>
                <td>{r.cost_seconds?.toFixed(1) || '—'}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  </div>
</div>

<style>
  .overview { display: flex; flex-direction: column; gap: 24px; }
  
  .status-grid {
    display: grid; gap: 16px;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  }
  
  .card {
    background: var(--glass-bg);
    backdrop-filter: var(--glass-blur);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-lg);
    padding: 16px;
    box-shadow: var(--glass-shadow);
  }
  
  .stat-card .nums { display: flex; gap: 24px; }
  .stat-card strong { font-size: 1.8rem; line-height: 1; }
  .stat-card span { color: var(--text-muted, #888); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; }
  
  .card-head { display: flex; align-items: center; gap: 8px; opacity: 0.7; margin-bottom: 12px; font-size: 0.85rem; font-weight: 600; }
  
  .tiles-grid {
    display: grid; gap: 16px;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  }
  
  .tile {
    display: flex; align-items: flex-start; gap: 16px;
    padding: 20px;
    background: var(--glass-bg);
    backdrop-filter: var(--glass-blur);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-lg);
    text-decoration: none; color: inherit;
    transition: all var(--transition-fast);
  }
  .tile:hover {
    transform: translateY(-2px);
    border-color: var(--brand);
    background: color-mix(in oklab, var(--brand) 4%, var(--glass-bg));
  }
  
  .tile-icon {
    padding: 10px; border-radius: 12px;
    background: color-mix(in oklab, var(--brand) 10%, transparent);
    color: var(--brand);
  }
  
  .tile-content strong { display: block; font-size: 1.1rem; margin-bottom: 4px; }
  .tile-content p { margin: 0; color: var(--text-muted, #888); font-size: 0.9rem; line-height: 1.4; }

  .detailed-grid {
    display: grid; gap: 24px;
    grid-template-columns: 1fr 1.5fr;
  }
  @media (max-width: 1000px) { .detailed-grid { grid-template-columns: 1fr; } }

  .section-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
  .section-head h3 { margin: 0; font-size: 1.1rem; opacity: 0.9; }

  .nodes-list { display: flex; flex-direction: column; gap: 10px; }
  .node-item {
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-md);
    padding: 12px;
    display: flex; flex-direction: column; gap: 8px;
  }
  .node-main { display: flex; align-items: center; gap: 10px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: #888; }
  .node-item[data-status="up"] .dot { background: #34c759; box-shadow: 0 0 8px #34c75944; }
  .node-item[data-status="down"] .dot { background: #ff453a; }
  
  .node-info { flex: 1; display: flex; flex-direction: column; }
  .node-stats { display: flex; gap: 6px; }
  .pill { font-size: 0.65rem; padding: 2px 8px; border-radius: 10px; background: color-mix(in oklab, #fff 5%, transparent); border: 1px solid var(--glass-border); }

  .caps { display: flex; flex-wrap: wrap; gap: 4px; }
  .cap { font-size: 0.65rem; padding: 1px 6px; border-radius: 4px; background: color-mix(in oklab, var(--brand) 10%, transparent); color: var(--brand); border: 1px solid color-mix(in oklab, var(--brand) 20%, transparent); }

  .runs-table-wrapper {
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-md);
    overflow: hidden;
  }
  .runs-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
  .runs-table th { text-align: left; padding: 10px 12px; background: color-mix(in oklab, #fff 3%, transparent); opacity: 0.6; font-weight: 600; }
  .runs-table td { padding: 8px 12px; border-top: 1px solid var(--glass-border); }
  
  .kind-tag { opacity: 0.8; font-family: var(--font-mono); font-size: 0.75rem; }
  .status-cell { text-transform: lowercase; }
  tr[data-status="done"] .status-cell { color: #34c759; }
  tr[data-status="failed"] .status-cell { color: #ff453a; }
  tr[data-status="running"] .status-cell { color: #ffd60a; }

  .trunc { max-width: 150px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .muted { color: var(--text-muted, #888); }
  .small { font-size: 0.75rem; }
  .btn-refresh { background: none; border: none; color: var(--text); opacity: 0.5; cursor: pointer; padding: 4px; border-radius: 4px; }
  .btn-refresh:hover { opacity: 1; background: var(--bg-2); }
  
  .empty { padding: 32px; text-align: center; color: var(--text-muted); }
</style>
