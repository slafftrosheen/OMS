<script lang="ts">
  import { STATE_LABEL, STATE_TONE, STATIONS, type StageCycle, type StageMap, type StationTag } from './stages';
  import { TERMS } from '$lib/order/names';
  import { t } from 'svelte-i18n';
  import Badge from '$lib/ui/Badge.svelte';

  let {
    stages = {} as StageMap,
    cycles = []
  }: {
    stages?: StageMap;
    cycles?: StageCycle[];
  } = $props();

  function count(station: StationTag) {
    return cycles.filter((cycle) => cycle.station === station).length;
  }

  const reworkReasons = $derived(
    cycles.map(cycle => ({
      ...cycle,
      label: $t(`rework.reasons.${cycle.reason}`)
    }))
  );

  function detail(station: StationTag) {
    return reworkReasons
      .filter((cycle) => cycle.station === station)
      .map((cycle) => {
        const suffix = cycle.note ? ` – ${cycle.note}` : '';
        return `${cycle.idx}. ${cycle.label}${suffix}`;
      })
      .join('\n');
  }

  function stationLabel(station: StationTag) {
    const name = TERMS.stations as Record<string, string>;
    return $t(name?.[station] ?? station);
  }
</script>

<div class="card">
  <h3 style="margin:0 0 8px 0">{$t('order.progress')}</h3>
  <ul class="list">
    {#each STATIONS as station}
      {@const state = stages?.[station] ?? 'NOT_STARTED'}
      <li class="row" style="justify-content:space-between; align-items:center">
        <span class="row" style="gap:6px">
          <b>{stationLabel(station)}</b>
          {#if count(station) > 0}
            <span class="tag badge-warn" title={detail(station)}>x{count(station)} {$t('rework.x_repeat')}</span>
          {/if}
        </span>
        <Badge tone={STATE_TONE[state] === 'muted' ? 'neutral' : STATE_TONE[state]}>{$t(STATE_LABEL[state])}</Badge>
      </li>
    {/each}
  </ul>
</div>

<style>
.list{
  display:grid;
  gap:8px;
  padding:0;
  margin:0;
  list-style:none;
}
</style>
