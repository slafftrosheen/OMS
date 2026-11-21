<!--
  RouteLine — Reclame Fabriek OMS · Round 2
  The visible route every order travels: CAD → CNC → EDGE → ASSEMBLY → PAINT → PACKAGING → DELIVERY.
  Node states:  done = solid ink · running = Lumen glow (live) · queued = outline
                held (BLOCKED / REWORK) = Oxide fill + hazard stripe + icon (never colour alone)
                skipped = dashed.   The segment up to the furthest completed node is drawn solid.
  Sizes: sm (lists), md (order workspace), floor (station tablets / wall).
-->
<script lang="ts">
  import { t } from 'svelte-i18n';
  import Icon from './Icon.svelte';
  import type { IconName } from './icons';
  import { WORKFLOW_STATIONS } from '$lib/order/workflow';

  type StageLike = { station?: string | null; state?: string | null; blocked_reason?: string | null };

  let {
    stages = [],
    current = null,
    size = 'md',
    showLabels = true,
    label = null
  }: {
    stages?: StageLike[] | null;
    current?: string | null;
    size?: 'sm' | 'md' | 'floor';
    showLabels?: boolean;
    label?: string | null;
  } = $props();

  const ICON: Record<string, IconName> = {
    CAD: 'station-cad', CNC: 'station-cnc', EDGE: 'station-edge', ASSEMBLY: 'station-assembly',
    PAINT: 'station-paint', PACKAGING: 'station-packaging', DELIVERY: 'station-delivery'
  } as Record<string, IconName>;

  type Node = { code: string; state: string; tone: 'done' | 'live' | 'held' | 'queued' | 'skip' | 'idle'; reason?: string | null };

  let nodes = $derived.by((): Node[] => {
    const rows = Array.isArray(stages) ? stages : [];
    const byCode = new Map(rows.map((r) => [String(r.station ?? '').toUpperCase(), r]));
    // Standard route first, then any extra legacy stations the order actually carries.
    const codes = [...WORKFLOW_STATIONS as readonly string[]];
    for (const r of rows) {
      const c = String(r.station ?? '').toUpperCase();
      if (c && !codes.includes(c)) codes.splice(Math.max(codes.length - 1, 0), 0, c);
    }
    return codes
      .filter((c) => byCode.has(c) || (WORKFLOW_STATIONS as readonly string[]).includes(c))
      .map((code) => {
        const row = byCode.get(code);
        const state = String(row?.state ?? (row ? 'NOT_STARTED' : 'SKIPPED')).toUpperCase();
        const tone: Node['tone'] =
          state === 'COMPLETED' ? 'done'
          : state === 'IN_PROGRESS' ? 'live'
          : state === 'BLOCKED' || state === 'REWORK' ? 'held'
          : state === 'QUEUED' ? 'queued'
          : state === 'SKIPPED' ? 'skip'
          : 'idle';
        return { code, state, tone, reason: row?.blocked_reason ?? null };
      });
  });

  let lastDone = $derived(nodes.reduce((acc, n, i) => (n.tone === 'done' ? i : acc), -1));
  let progress = $derived(nodes.length > 1 ? Math.max(0, lastDone) / (nodes.length - 1) : 0);
  let running = $derived(nodes.some(node => node.tone === 'live'));
  let doneCount = $derived(nodes.filter((n) => n.tone === 'done').length);
  let aria = $derived(
    label ?? `${$t('orderDetail.tabs.stages', { default: 'Route' })}: ${doneCount}/${nodes.filter((n) => n.tone !== 'skip').length}`
  );
  const stationLabel = (code: string) => $t(`stations.${code}`, { default: code });
  const stateLabel = (state: string) => $t(`orderDetail.stage_status.${state}`, { default: state.replace(/_/g, ' ') });
</script>

<div class="rf-routeline" data-size={size} role="list" aria-label={aria} style="--rl-p:{progress}; --n:{nodes.length}">
  <div class="rf-routeline__rail" data-live={running} aria-hidden="true"><span class="rf-routeline__fill"></span></div>
  {#each nodes as n (n.code)}
    <div
      class="rf-routeline__node"
      role="listitem"
      data-tone={n.tone}
      data-current={current && current.toUpperCase() === n.code ? 'true' : null}
      data-station={n.code.toLowerCase()}
      title={`${stationLabel(n.code)} · ${stateLabel(n.state)}${n.reason ? ` — ${n.reason}` : ''}`}
    >
      <span class="rf-routeline__pin">
        {#if n.tone === 'done'}
          <Icon name="check" size={size === 'floor' ? 20 : 14} />
        {:else if n.tone === 'held'}
          <Icon name="alert-triangle" size={size === 'floor' ? 20 : 14} />
        {:else}
          <Icon name={ICON[n.code] ?? 'circle-dashed'} size={size === 'floor' ? 20 : 14} />
        {/if}
      </span>
      {#if showLabels}
        <span class="rf-routeline__code">{n.code}</span>
        {#if size !== 'sm'}<span class="rf-routeline__state">{stateLabel(n.state)}</span>{/if}
      {/if}
      <span class="sr-only">{stationLabel(n.code)}: {stateLabel(n.state)}{n.reason ? ` — ${n.reason}` : ''}</span>
    </div>
  {/each}
</div>

<style>
  .rf-routeline{ --pin:28px; --rail:3px; position:relative; display:grid; grid-auto-flow:column; grid-auto-columns:1fr;
    align-items:start; gap:0; padding-top:2px; font-family:var(--font-display); }
  .rf-routeline__code{ overflow-wrap:anywhere }
  .rf-routeline[data-size='sm']{ --pin:20px; --rail:2px }
  .rf-routeline[data-size='floor']{ --pin:44px; --rail:4px }

  /* Rail runs pin-centre to pin-centre; the fill is the completed section. */
  .rf-routeline__rail{ position:absolute; top:calc(2px + var(--pin) / 2 - var(--rail) / 2); height:var(--rail);
    left:calc(100% / var(--n, 7) / 2); right:calc(100% / var(--n, 7) / 2); background:var(--border-strong); border-radius:2px; }
  .rf-routeline__fill{ position:absolute; inset:0 auto 0 0; width:calc(var(--rl-p) * 100%); background:var(--ink-0);
    transition:width var(--motion-xl) var(--ease-carriage); }
  .rf-routeline__rail[data-live='true']{ overflow:hidden }
  .rf-routeline__rail[data-live='true']::after{ content:''; position:absolute; inset:0 auto 0 0; width:100%;
    background:linear-gradient(90deg, transparent 0 40%, var(--live) 50%, transparent 60% 100%);
    animation:rf-routeline-chase 1s var(--ease-carriage) infinite; }

  .rf-routeline__node{ position:relative; display:flex; flex-direction:column; align-items:center; gap:4px; min-width:0; text-align:center }
  .rf-routeline__pin{ position:relative; z-index:1; display:grid; place-items:center; width:var(--pin); height:var(--pin);
    border-radius:var(--radius-sm); background:var(--bg-1); color:var(--ink-2); border:1.5px solid var(--border-strong);
    transition:background var(--motion-md) var(--ease-machine), color var(--motion-md) var(--ease-machine), border-color var(--motion-md) var(--ease-machine); }
  .rf-routeline__code{ font-size:12px; font-weight:600; letter-spacing:var(--tracking-label); color:var(--ink-1); line-height:1 }
  .rf-routeline__state{ font-family:var(--font-sans); font-size:11px; color:var(--ink-2); line-height:1.2;
    max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
  .rf-routeline[data-size='sm'] .rf-routeline__code{ font-size:10px }
  .rf-routeline[data-size='floor'] .rf-routeline__code{ font-size:16px }
  .rf-routeline[data-size='floor'] .rf-routeline__state{ font-size:13px }

  .rf-routeline__node[data-tone='done'] .rf-routeline__pin{ background:var(--ink-0); border-color:var(--ink-0); color:var(--bg-0) }
  .rf-routeline__node[data-tone='queued'] .rf-routeline__pin{ border-color:var(--ink-1); color:var(--ink-0) }
  .rf-routeline__node[data-tone='skip'] .rf-routeline__pin{ border-style:dashed; opacity:.55 }
  .rf-routeline__node[data-tone='skip'] .rf-routeline__code{ opacity:.55; text-decoration:line-through }
  /* Live = Lumen. Running right now, nothing else. */
  .rf-routeline__node[data-tone='live'] .rf-routeline__pin{ border-color:var(--live-ink); color:var(--ink-0); }
  .rf-routeline__node[data-tone='live'] .rf-routeline__pin::after{ content:''; position:absolute; top:-2px; right:-2px;
    width:5px; height:5px; border-radius:1px; background:var(--live); }
  :global(html:is([data-theme='DarkVim'],[data-theme='ByPlace'][data-place='floor'])) .rf-routeline__node[data-tone='live'] .rf-routeline__pin{
    background:var(--live); border-color:var(--live); color:#1C1D20; animation:rf-rl-live 2.4s ease-in-out infinite; }
  .rf-routeline__node[data-tone='live'] .rf-routeline__state{ color:var(--ink-0); font-weight:600 }
  /* Held = fault: oxide + hazard stripe + warning icon. */
  .rf-routeline__node[data-tone='held'] .rf-routeline__pin{ background:var(--hazard), var(--error); border-color:var(--error); color:#fff }
  .rf-routeline__node[data-tone='held'] .rf-routeline__state{ color:var(--error); font-weight:600 }
  .rf-routeline__node[data-current='true'] .rf-routeline__code{ color:var(--ink-0); text-decoration:underline; text-decoration-thickness:2px; text-underline-offset:4px }

  @keyframes rf-rl-live{ 0%,100%{ box-shadow:0 0 0 3px var(--live-soft), 0 0 6px var(--live) } 50%{ box-shadow:0 0 0 5px var(--live-soft), 0 0 16px var(--live) } }
  @keyframes rf-routeline-chase{ from { transform:translateX(-60%) } to { transform:translateX(60%) } }
  @media (prefers-reduced-motion: reduce){
    :global(html) .rf-routeline__node[data-tone='live'] .rf-routeline__pin{ animation:none!important; box-shadow:0 0 0 3px var(--live-soft) }
    .rf-routeline__rail[data-live='true']::after{ animation:none; display:none }
    .rf-routeline__fill{ transition:none }
  }
  .sr-only{ position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap }
</style>
