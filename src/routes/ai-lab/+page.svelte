<script lang="ts">
  // AI Lab overview — OpenRouter status and recent runs.
  import { onMount } from 'svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import type { IconName } from '$lib/ui/icons';
  import { base } from '$app/paths';
  import { t } from 'svelte-i18n';


  type Run = {
    id: string; kind: string; status: string;
    node_label: string | null; model: string | null;
    cost_seconds: number | null; tokens_in: number | null; tokens_out: number | null;
    error: string | null; created_at: string;
  };

  let runs = $state<Run[]>([]);
  let runsTodayCount = $state(0);
  let providerStatus = $state('Checking OpenRouter…');

  async function refresh() {
    const [health, r] = await Promise.all([
      fetch('/api/ai/health').then((r) => r.json()).catch(() => ({ status: 'error' })),
      fetch('/api/ai/runs?limit=20').then((r) => r.json()).catch(() => ({ items: [] }))
    ]);
    providerStatus = health.status === 'ok' ? 'OpenRouter configured' : 'OpenRouter not configured';
    runs = r.items ?? [];
    
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


  const tiles: Array<{ href: string; icon: IconName; labelKey: string; descKey: string }> = [
    { href: '/ai-lab/canvas', icon: 'layout-grid',    labelKey: 'ailab.sections.canvas', descKey: 'ailab.tiles.canvas_desc' },
    { href: '/orders',        icon: 'clipboard-list', labelKey: 'nav.orders',            descKey: 'ailab.tiles.orders_desc' },
    { href: '/calendar',      icon: 'calendar',       labelKey: 'nav.calendar',          descKey: 'ailab.tiles.calendar_desc' }
  ];
</script>

<div class="overview">
  <!-- Headline Stats -->
  <section class="status-grid">
    <div class="card stat-card">
      <div class="card-head"><Icon name="network" size="sm" /><span>AI Provider</span></div>
      <div class="nums"><div><strong>{providerStatus}</strong></div></div>
    </div>

    <div class="card stat-card">
      <div class="card-head"><Icon name="list-checks" size="sm" /><span>{$t('ailab.recent_runs')}</span></div>
      <div class="nums">
        <div><strong>{runsTodayCount}</strong><span>{$t('ailab.cols.kind')}</span></div>
      </div>
    </div>
  </section>

  <!-- Quick Access Tiles -->
  <section class="tiles-grid">
    {#each tiles as tile}
      <a class="tile" href="{base}{tile.href}">
        <div class="tile-icon"><Icon name={tile.icon} size="md" /></div>
        <div class="tile-content">
          <strong>{$t(tile.labelKey)}</strong>
          <p>{$t(tile.descKey)}</p>
        </div>
      </a>
    {/each}
  </section>

  <div class="detailed-grid">
    <!-- OpenRouter routing status -->
    <section class="swarm-details">
      <header class="section-head">
        <h3>OpenRouter provider</h3>
        <button class="btn-refresh" onclick={refresh} aria-label={$t('common.refresh')}><Icon name="refresh-ccw" size="sm" /></button>
      </header>
      <div class="card empty">{providerStatus}. Manage the system credential in Settings (R&D only).</div>
    </section>

    <!-- Recent Runs -->
    <section class="runs-history">
      <header class="section-head">
        <h3>{$t('ailab.recent_runs')}</h3>
        <button class="btn-refresh" onclick={refresh} aria-label={$t('common.refresh')}>
          <Icon name="refresh-ccw" size="sm" />
        </button>
      </header>
      <div class="runs-table-wrapper">
        <table class="runs-table">
          <thead>
            <tr>
              <th>{$t('ailab.cols.time')}</th>
              <th>{$t('ailab.cols.kind')}</th>
              <th>{$t('ailab.cols.status')}</th>
              <th>{$t('ailab.cols.model')}</th>
              <th>{$t('ailab.cols.secs')}</th>
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
  .overview {
    display: flex;
    flex-direction: column;
    gap: var(--space-xl);
    animation: rf-fade-in var(--motion-md) var(--ease-standard) both;
  }

  .status-grid {
    display: grid;
    gap: var(--space-md);
    grid-template-columns: repeat(auto-fill, minmax(min(280px, 100%), 1fr));
  }

  .card {
    background: var(--glass-bg);
    backdrop-filter: var(--glass-blur);
    -webkit-backdrop-filter: var(--glass-blur);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-lg);
    padding: var(--space-lg);
    box-shadow: var(--glass-shadow), var(--glass-border-highlight);
  }

  .stat-card .nums {
    display: flex;
    gap: var(--space-xl);
  }
  .stat-card strong {
    font-size: var(--text-3xl);
    font-weight: 700;
    line-height: 1;
    letter-spacing: var(--tracking-tighter);
    font-variant-numeric: tabular-nums;
  }
  .stat-card span {
    color: var(--ink-tertiary);
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wider);
    font-weight: 500;
  }

  .card-head {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    color: var(--ink-tertiary);
    margin-bottom: var(--space-md);
    font-size: var(--text-sm);
    font-weight: 600;
  }

  .tiles-grid {
    display: grid;
    gap: var(--space-md);
    grid-template-columns: repeat(auto-fill, minmax(min(320px, 100%), 1fr));
  }

  .tile {
    display: flex;
    align-items: flex-start;
    gap: var(--space-md);
    padding: var(--space-lg);
    background: var(--glass-bg);
    backdrop-filter: var(--glass-blur);
    -webkit-backdrop-filter: var(--glass-blur);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-lg);
    text-decoration: none;
    color: inherit;
    transition:
      transform    var(--motion-md) var(--ease-spring-soft),
      border-color var(--motion-md) var(--ease-standard),
      box-shadow   var(--motion-md) var(--ease-standard),
      background   var(--motion-md) var(--ease-standard);
    position: relative;
    overflow: hidden;
    isolation: isolate;
  }
  .tile::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    opacity: 0;
    background: var(--spotlight);
    transition: opacity var(--motion-md) var(--ease-standard);
    border-radius: inherit;
    pointer-events: none;
  }
  .tile:hover {
    transform: translateY(-3px);
    border-color: color-mix(in oklab, var(--brand) 30%, var(--glass-border));
    background: color-mix(in oklab, var(--brand) 4%, var(--glass-bg));
    box-shadow: var(--glass-shadow-lg), var(--depth-glow-md);
  }
  .tile:hover::before { opacity: 1; }

  .tile-icon {
    padding: var(--space-sm);
    border-radius: var(--radius-md);
    background: color-mix(in oklab, var(--brand) 14%, transparent);
    color: var(--brand);
    transition: transform var(--motion-md) var(--ease-spring-soft);
  }
  .tile:hover .tile-icon { transform: scale(1.08) rotate(-3deg); }

  .tile-content strong {
    display: block;
    font-size: var(--text-md);
    font-weight: 600;
    margin-bottom: var(--space-xxs);
    letter-spacing: var(--tracking-tight);
  }
  .tile-content p {
    margin: 0;
    color: var(--ink-tertiary);
    font-size: var(--text-sm);
    line-height: var(--leading-snug);
  }

  .detailed-grid {
    display: grid;
    gap: var(--space-xl);
    grid-template-columns: 1fr 1.5fr;
  }
  @media (max-width: 1000px) {
    .detailed-grid { grid-template-columns: 1fr; }
  }

  .section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-md);
  }
  .section-head h3 {
    margin: 0;
    font-size: var(--text-lg);
    letter-spacing: var(--tracking-tight);
  }

  .nodes-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }
  .node-item {
    background: var(--glass-bg);
    backdrop-filter: var(--glass-material-thin);
    -webkit-backdrop-filter: var(--glass-material-thin);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-md);
    padding: var(--space-md);
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    transition:
      border-color var(--motion-sm) var(--ease-standard),
      transform    var(--motion-sm) var(--ease-spring-soft);
  }
  .node-item:hover {
    border-color: color-mix(in oklab, var(--brand) 22%, var(--glass-border));
    transform: translateX(2px);
  }
  .node-main {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: var(--radius-full);
    background: var(--ink-3);
    flex-shrink: 0;
  }
  .node-item[data-status="up"] .dot {
    background: var(--ok);
    box-shadow: 0 0 8px color-mix(in oklab, var(--ok) 50%, transparent);
    animation: rf-glow-pulse 2s ease-out infinite;
  }
  .node-item[data-status="down"] .dot { background: var(--error); }

  .node-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .node-stats {
    display: flex;
    gap: var(--space-xs);
    flex-wrap: wrap;
  }
  .pill {
    font-size: var(--text-xs);
    font-weight: 500;
    padding: var(--space-xxs) var(--space-sm);
    border-radius: var(--radius-full);
    background: color-mix(in oklab, var(--bg-2) 70%, transparent);
    border: 1px solid var(--glass-border);
    color: var(--ink-secondary);
  }

  .caps {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xxs);
  }
  .cap {
    font-size: var(--text-xs);
    padding: var(--space-xxs) var(--space-sm);
    border-radius: var(--radius-sm);
    background: color-mix(in oklab, var(--brand) 12%, transparent);
    color: var(--brand);
    border: 1px solid color-mix(in oklab, var(--brand) 22%, transparent);
    font-weight: 500;
  }

  .runs-table-wrapper {
    background: var(--glass-bg);
    backdrop-filter: var(--glass-material-thin);
    -webkit-backdrop-filter: var(--glass-material-thin);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-md);
    overflow: hidden;
  }
  .runs-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-sm);
  }
  .runs-table th {
    text-align: left;
    padding: var(--space-sm) var(--space-md);
    background: color-mix(in oklab, var(--bg-2) 60%, transparent);
    color: var(--ink-tertiary);
    font-weight: 600;
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wider);
  }
  .runs-table td {
    padding: var(--space-sm) var(--space-md);
    border-top: 1px solid var(--divider);
  }
  .runs-table tbody tr {
    transition: background var(--motion-sm) var(--ease-standard);
  }
  .runs-table tbody tr:hover {
    background: color-mix(in oklab, var(--bg-2) 40%, transparent);
  }

  .kind-tag {
    color: var(--ink-secondary);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    padding: var(--space-xxs) var(--space-sm);
    background: color-mix(in oklab, var(--bg-2) 70%, transparent);
    border-radius: var(--radius-sm);
  }
  .status-cell {
    text-transform: lowercase;
    font-weight: 500;
  }
  tr[data-status="done"]    .status-cell { color: var(--ok); }
  tr[data-status="failed"]  .status-cell { color: var(--error); }
  tr[data-status="running"] .status-cell { color: var(--warn); }

  .trunc {
    max-width: 150px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .muted { color: var(--ink-tertiary); }
  .small { font-size: var(--text-xs); }

  .btn-refresh {
    background: transparent;
    border: 1px solid transparent;
    color: var(--ink-secondary);
    cursor: pointer;
    padding: var(--space-xs);
    border-radius: var(--radius-md);
    transition:
      background var(--motion-sm) var(--ease-standard),
      color      var(--motion-sm) var(--ease-standard),
      transform  var(--motion-sm) var(--ease-spring-soft);
    display: inline-flex;
  }
  .btn-refresh:hover {
    background: var(--bg-2);
    color: var(--ink-primary);
    transform: rotate(180deg);
  }

  .empty {
    padding: var(--space-2xl);
    text-align: center;
    color: var(--ink-tertiary);
  }
</style>
