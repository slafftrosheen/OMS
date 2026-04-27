<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from '$lib/ui/Icon.svelte';

  type Node = {
    label: string; host: string; port: number; sidecarUrl: string;
    caps: string[]; inflight: number; lastSeen: number; lastStatus: string;
    warmModels: string[]; weight: number; vramGb: number;
  };

  let nodes = $state<Node[]>([]);
  let now = $state(Date.now());

  async function refresh() {
    const j = await (await fetch('/api/ai/swarm?refresh=1')).json();
    nodes = j.nodes ?? [];
    now = j.now ?? Date.now();
  }

  onMount(() => {
    void refresh();
    const t = setInterval(refresh, 8_000);
    return () => clearInterval(t);
  });

  function ago(ms: number): string {
    if (!ms) return '—';
    const s = Math.max(0, Math.floor((now - ms) / 1000));
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    return `${Math.floor(s / 3600)}h ago`;
  }
</script>

<div class="sw">
  <header>
    <h2>Swarm</h2>
    <button class="btn ghost" onclick={refresh}><Icon name="refresh-ccw" size="sm" /> Refresh</button>
  </header>
  <div class="grid">
    {#each nodes as n (n.label)}
      <article class="node" data-status={n.lastStatus}>
        <header class="nh">
          <span class="dot"></span>
          <strong>{n.label}</strong>
          <span class="muted">{n.host}:{n.port}</span>
          <span class="weight">w {n.weight}</span>
        </header>
        <div class="row">
          <span class="pill">VRAM {n.vramGb} GB</span>
          <span class="pill">inflight {n.inflight}</span>
          <span class="pill">{ago(n.lastSeen)}</span>
        </div>
        <div class="caps">
          {#each n.caps as c}<span class="cap">{c}</span>{/each}
        </div>
        <details>
          <summary>warm models · {n.warmModels.length}</summary>
          <ul>
            {#each n.warmModels as m}<li><code>{m}</code></li>{/each}
            {#if n.warmModels.length === 0}<li class="muted">— none —</li>{/if}
          </ul>
        </details>
        <p class="sidecar"><span class="muted">sidecar</span> <code>{n.sidecarUrl}</code></p>
      </article>
    {/each}
  </div>
</div>

<style>
  .sw { display: flex; flex-direction: column; gap: 14px; }
  header { display: flex; align-items: center; gap: 12px; }
  .grid {
    display: grid; gap: 12px;
    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  }
  .node {
    background: var(--glass-bg);
    backdrop-filter: var(--glass-blur);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-lg);
    padding: 14px;
    display: flex; flex-direction: column; gap: 8px;
  }
  .nh { display: flex; align-items: center; gap: 8px; }
  .nh .weight { margin-left: auto; font-size: 0.75rem; color: var(--text-muted, #888); }
  .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--text-muted, #888); }
  .node[data-status="up"] .dot { background: #34c759; }
  .node[data-status="degraded"] .dot { background: #ffd60a; }
  .node[data-status="down"] .dot { background: #ff453a; }
  .row { display: flex; gap: 6px; flex-wrap: wrap; }
  .pill {
    font-size: 0.7rem; padding: 1px 8px; border-radius: var(--radius-full);
    border: 1px solid var(--glass-border);
  }
  .cap {
    font-size: 0.7rem; padding: 1px 8px; border-radius: var(--radius-full);
    background: color-mix(in oklab, var(--brand) 8%, transparent);
    border: 1px solid color-mix(in oklab, var(--brand) 30%, transparent);
  }
  .caps { display: flex; gap: 4px; flex-wrap: wrap; }
  details summary { cursor: pointer; font-size: 0.85rem; opacity: 0.85; }
  details ul { padding-left: 18px; margin: 6px 0; }
  details code { font-size: 0.75rem; opacity: 0.8; }
  .sidecar { margin: 0; font-size: 0.75rem; }
  .muted { color: var(--text-muted, #888); }
  .btn {
    padding: 8px 14px; border-radius: var(--radius-full);
    background: var(--brand); color: white; border: 0; cursor: pointer; font: inherit;
    display: inline-flex; align-items: center; gap: 6px;
  }
  .btn.ghost { background: transparent; color: var(--text); border: 1px solid var(--glass-border); }
</style>
