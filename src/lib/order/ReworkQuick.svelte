<script lang="ts">
  import { STATIONS, type StationTag, type ReworkReason } from './stages';
  import Input from '$lib/ui/Input.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { t } from 'svelte-i18n';

  export let onSend: (station: StationTag, reason: ReworkReason, note: string) => void = () => {};

  let station: StationTag = 'CNC';
  let reason: ReworkReason = 'RECUT';
  let note = '';

  const OPTIONS: Record<StationTag, ReworkReason[]> = {
    CAD: ['CUSTOM'],
    CNC: ['RECUT', 'CUSTOM'],
    SANDING: ['RESAND', 'CUSTOM'],
    BENDING: ['REBEND', 'CUSTOM'],
    WELDING: ['REWELD', 'CUSTOM'],
    PAINT: ['REPAINT', 'CUSTOM'],
    ASSEMBLY: ['REASSEMBLE', 'CUSTOM'],
    QC: ['RECHECK', 'CUSTOM'],
    LOGISTICS: ['CUSTOM']
  };

  $: if (!OPTIONS[station].includes(reason)) {
    reason = OPTIONS[station][0];
  }

  function send() {
    onSend(station, reason, note.trim());
    note = '';
  }
</script>

<div class="card">
  <h3 style="margin:0 0 8px 0">{$t('rework.send')}</h3>
  <div class="grid" style="grid-template-columns:1fr 1fr">
    <div>
      <label class="muted" for="rework-station">{$t('terms.station')}</label>
      <select id="rework-station" class="rf-select" bind:value={station}>
        {#each STATIONS as s}
          <option value={s}>{s}</option>
        {/each}
      </select>
    </div>
    <div>
      <label class="muted" for="rework-reason">{$t('rework.reason')}</label>
      <select id="rework-reason" class="rf-select" bind:value={reason}>
        {#each OPTIONS[station] as r}
          <option value={r}>{$t(`rework.reasons.${r}`)}</option>
        {/each}
      </select>
    </div>
    <div style="grid-column:span 2">
      <Input bind:value={note} placeholder={$t('rework.note')} ariaLabel={$t('rework.note')} />
    </div>
  </div>
  <div class="row" style="margin-top:8px">
    <Button on:click={send}>{$t('rework.send')}</Button>
  </div>
</div>
