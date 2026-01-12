<script lang="ts">
  import { onMount } from 'svelte';
  import Button from '$lib/ui/Button.svelte';
  import { role } from '$lib/ui/RoleSwitch.svelte';
  import { TERMS } from '$lib/order/names';
  import { t } from 'svelte-i18n';
  import { get } from 'svelte/store';
  import {
    ALLOWED,
    STATIONS,
    STATE_LABEL,
    type StageMap,
    type StageState,
    type StationTag
  } from './stages';

  export let value: StageMap = {} as StageMap;
  export let onApplyAdmin: (station: StationTag, state: StageState, note?: string) => void = () => {};
  export let onPropose: (station: StationTag, state: StageState, note?: string) => void = () => {};

  const DEFAULT_STATE: StageState = 'NOT_STARTED';

  let selected: Record<StationTag, StageState> = {} as Record<StationTag, StageState>;
  let notes: Record<StationTag, string> = {} as Record<StationTag, string>;
  let lastValue: StageMap = {} as StageMap;

  function init() {
    for (const station of STATIONS) {
      const current = value?.[station] ?? DEFAULT_STATE;
      selected[station] = current;
      notes[station] = notes[station] ?? '';
    }
    lastValue = value;
  }

  onMount(init);

  $: if (lastValue !== value) {
    init();
  }

  $: isAdmin = $role === 'Admin';

  function optionsFor(station: StationTag): StageState[] {
    const current = value?.[station] ?? DEFAULT_STATE;
    const allowed = ALLOWED[current] ?? [];
    const set = new Set<StageState>([current, ...allowed]);
    return Array.from(set);
  }

  function stageLabel(state: StageState) {
    return get(t)(STATE_LABEL[state]);
  }

  function stationName(station: StationTag) {
    const name = TERMS.stations as Record<string, string>;
    return get(t)(name?.[station] ?? station);
  }

  function submit(station: StationTag) {
    const current = value?.[station] ?? DEFAULT_STATE;
    const next = selected[station] ?? current;
    if (next === current) return;
    const note = notes[station]?.trim() || '';
    if (isAdmin) {
      onApplyAdmin(station, next, note);
    } else {
      onPropose(station, next, note);
    }
    notes[station] = '';
  }
</script>

<div class="card">
  <h3 style="margin:0 0 8px 0">{$t('stageEditor.title')}</h3>
  <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px">
    {#each STATIONS as station}
      {@const current = value?.[station] ?? DEFAULT_STATE}
      <div class="card station-box">
        <div class="row" style="justify-content:space-between;align-items:center">
          <b>{stationName(station)}</b>
          <span class="muted">{stageLabel(current)}</span>
        </div>
        <label class="muted" for={`stage-${station}`}>{$t('stageEditor.next')}</label>
        <select
          class="rf-select"
          id={`stage-${station}`}
          bind:value={selected[station]}
        >
          {#each optionsFor(station) as option}
            <option value={option}>{stageLabel(option)}</option>
          {/each}
        </select>
        <label class="muted" for={`stage-note-${station}`} style="margin-top:6px">{get(t)('rework.note')}</label>
        <textarea
          id={`stage-note-${station}`}
          class="rf-input"
          rows="2"
          bind:value={notes[station]}
          placeholder={get(t)('rework.note')}
        ></textarea>
        <div class="row" style="justify-content:flex-end;margin-top:8px">
          <Button on:click={() => submit(station)} disabled={selected[station] === current}>
            {isAdmin ? $t('stageEditor.apply') : $t('stageEditor.propose')}
          </Button>
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
.station-box{
  padding:10px;
  display:flex;
  flex-direction:column;
  gap:6px;
}
</style>
