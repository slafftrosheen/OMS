<!--
  OrderFlowStrip — Réclame Fabriek OMS · Round 5
  The order's life in one line (Draft → Review → Confirmed → Production → Loading → Dispatched → Archived)
  plus the single next step and who owns it. Read-only guidance: the button only calls an action the
  page already offers under the same permission.
-->
<script lang="ts">
  import { t } from 'svelte-i18n';
  import Icon from '$lib/ui/Icon.svelte';
  import { ORDER_FLOW_STEPS, orderFlow, type OrderFlowAction, type OrderFlowPermissions } from './order-flow';

  let { status, stages = [], can, busy = false, onAction }: {
    status: unknown; stages?: unknown; can: OrderFlowPermissions; busy?: boolean;
    onAction: (action: Exclude<OrderFlowAction, null>) => void;
  } = $props();

  let flow = $derived(orderFlow(status, stages, can));
  let stationName = $derived(flow.station ? $t(`stations.${flow.station}`, { default: flow.station }) : '');
  let announce = $derived(`${flow.step ? $t(`orderFlow.steps.${flow.step}`) : ''} ${$t(`orderFlow.next.${flow.next}`, { values: { station: stationName } })}`);
</script>

<section class="rf-flow" data-tone={flow.tone} aria-label={$t('orderFlow.title')}>
  <ol class="rf-flow-steps">
    {#each ORDER_FLOW_STEPS as step, i (step)}
      <li data-state={flow.tone === 'stopped' ? 'stopped' : i < flow.index || flow.tone === 'done' ? 'done' : i === flow.index ? 'now' : 'next'}
        aria-current={i === flow.index ? 'step' : undefined} style={`--i:${i}`}>
        <span class="dot" aria-hidden="true"></span><span class="label">{$t(`orderFlow.steps.${step}`)}</span>
      </li>
    {/each}
  </ol>
  <div class="rf-flow-next">
    <span class="rf-flow-icon" aria-hidden="true">
      <Icon name={flow.tone === 'blocked' ? 'alert-triangle' : flow.tone === 'held' ? 'pause' : flow.tone === 'done' ? 'check' : flow.tone === 'stopped' ? 'x' : 'arrow-right'} size="sm" />
    </span>
    <p aria-live="polite">
      <strong>{$t('orderFlow.nextLabel')}</strong>
      {$t(`orderFlow.next.${flow.next}`, { values: { station: stationName } })}
      {#if flow.owner}<span class="owner">· {$t(`orderFlow.owner.${flow.owner}`)}</span>{/if}
    </p>
    {#if flow.action}
      <button type="button" class="rf-flow-go" disabled={busy} onclick={() => flow.action && onAction(flow.action)} data-testid="order-flow-action">
        {$t(`orderFlow.action.${flow.action}`)} <span aria-hidden="true">→</span>
      </button>
    {/if}
  </div>
  <span class="sr-only" role="status">{announce}</span>
</section>

<style>
  .rf-flow { display: grid; gap: 10px; padding: 12px 14px; border: 1px solid var(--border); border-radius: var(--radius-md, 6px); background: var(--bg-1); }
  .rf-flow[data-tone='blocked'] { border-color: var(--error); background-image: var(--fault-stripe, none); background-size: 100% 3px; background-repeat: no-repeat; }
  .rf-flow-steps { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; }
  .rf-flow-steps li { position: relative; display: grid; gap: 6px; justify-items: start; min-width: 0; color: var(--ink-tertiary, var(--ink-secondary)); font-size: var(--text-xs); }
  .rf-flow-steps li::before { content: ''; position: absolute; top: 4px; left: 12px; right: -4px; height: 2px; background: var(--border); }
  .rf-flow-steps li:last-child::before { display: none; }
  .rf-flow-steps li[data-state='done']::before { background: var(--ink-primary); transform-origin: left; animation: rf-flow-rail var(--motion-lg, 280ms) var(--ease-carriage, ease-out) both; animation-delay: calc(var(--i) * 50ms); }
  .dot { position: relative; z-index: 1; width: 10px; height: 10px; border-radius: 2px; border: 2px solid var(--border); background: var(--bg-1); box-sizing: border-box; }
  li[data-state='done'] .dot { background: var(--ink-primary); border-color: var(--ink-primary); }
  li[data-state='now'] .dot { border-color: var(--live, var(--ink-primary)); background: var(--live, var(--ink-primary)); box-shadow: 0 0 0 3px var(--live-soft, transparent); animation: rf-flow-pulse 2.4s ease-in-out infinite; }
  li[data-state='now'] { color: var(--ink-primary); font-weight: 650; }
  li[data-state='done'] { color: var(--ink-secondary); }
  .rf-flow[data-tone='blocked'] li[data-state='now'] .dot { background: var(--error); border-color: var(--error); box-shadow: none; animation: none; }
  .rf-flow[data-tone='held'] li[data-state='now'] .dot { background: transparent; border-color: var(--warn, var(--ink-secondary)); animation: none; box-shadow: none; }
  .label { font-family: var(--font-display, inherit); text-transform: uppercase; letter-spacing: .04em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
  .rf-flow-next { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .rf-flow-next p { margin: 0; flex: 1; min-width: 200px; color: var(--ink-primary); font-size: var(--text-sm); line-height: 1.45; }
  .rf-flow-next strong { font-family: var(--font-display, inherit); text-transform: uppercase; letter-spacing: .05em; font-size: var(--text-xs); color: var(--ink-secondary); margin-right: 6px; }
  .owner { color: var(--ink-secondary); }
  .rf-flow-icon { display: inline-grid; place-items: center; width: 28px; height: 28px; border-radius: 4px; background: var(--bg-2); color: var(--ink-primary); }
  .rf-flow[data-tone='blocked'] .rf-flow-icon { background: var(--error); color: var(--on-error, #fff); }
  .rf-flow-go { font: inherit; font-size: var(--text-sm); font-weight: 600; min-height: 40px; padding: 8px 14px; border-radius: var(--radius-sm, 4px); border: 1px solid var(--ink-primary); background: var(--ink-primary); color: var(--bg-0); cursor: pointer; transition: transform var(--motion-sm, 140ms) var(--ease-machine, ease-out); }
  .rf-flow-go:hover:not(:disabled) span { display: inline-block; transform: translateX(3px); transition: transform var(--motion-sm, 140ms) var(--ease-machine, ease-out); }
  .rf-flow-go:active:not(:disabled) { transform: scale(.98); }
  .rf-flow-go:disabled { opacity: .5; cursor: default; }
  .rf-flow-go:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  @keyframes rf-flow-rail { from { transform: scaleX(0); } to { transform: none; } }
  @keyframes rf-flow-pulse { 0%, 100% { box-shadow: 0 0 0 3px var(--live-soft, transparent); } 50% { box-shadow: 0 0 0 6px var(--live-soft, transparent); } }
  @media (max-width: 640px) {
    .rf-flow-steps { grid-template-columns: repeat(7, 1fr); }
    .label { display: none; }
    li[data-state='now'] .label { display: block; position: absolute; top: 16px; left: 0; overflow: visible; }
    .rf-flow-steps { padding-bottom: 18px; }
  }
  @media (prefers-reduced-motion: reduce) { .rf-flow-steps li::before, .dot { animation: none !important; } }
</style>
