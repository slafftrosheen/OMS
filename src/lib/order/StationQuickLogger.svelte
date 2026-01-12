<script lang="ts">
  import { t } from 'svelte-i18n';
  import Select from '$lib/ui/Select.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { TERMS } from '$lib/order/names';
  import type { StationCode } from '$lib/order/names';

  export let onSubmit: (payload: { station: string; progress?: number; note?: string }) => void = () => {};

  let station: StationCode = 'SANDING';
  let progress = 0;
  let note = '';
  let noteInput: HTMLInputElement | null = null;
  const progressId = 'station-quick-progress';

  $: stationOptions = Object.entries(TERMS.stations).map(([code, label]) => ({
    label: $t(label),
    value: code as StationCode
  }));

  function clamp(value: number) {
    return Math.max(0, Math.min(100, value));
  }

  function send() {
    const trimmedNote = note.trim();
    const hasNote = trimmedNote.length > 0;
    const hasProgress = typeof progress === 'number' && progress > 0;
    if (!hasNote && !hasProgress) return;

    const normalized = hasProgress ? clamp(progress) : undefined;
    onSubmit({
      station,
      progress: normalized,
      note: hasNote ? trimmedNote : undefined
    });
    progress = 0;
    note = '';
  }

  export function focus() {
    noteInput?.focus();
  }
</script>

<div class="card">
  <h3 style="margin:0 0 8px 0">{$t('station.quick_log_heading')}</h3>
  <div class="grid" style="grid-template-columns:1fr 1fr;gap:12px">
    <Select bind:value={station} options={stationOptions} ariaLabel={$t('station.station_label')} />
    <div>
      <label class="muted" for={progressId}>{$t('station.progress_label')}</label>
      <input id={progressId} class="rf-input" type="number" min="0" max="100" bind:value={progress} />
    </div>
    <div style="grid-column:span 2">
      <input
        id="quicklog-note"
        class="rf-input"
        bind:value={note}
        placeholder={$t('station.quick_log_note_placeholder')}
        aria-label={$t('station.quick_log_note_placeholder')}
        bind:this={noteInput}
      />
    </div>
  </div>
  <div class="row" style="margin-top:8px">
    <Button on:click={send}>{$t('station.log')}</Button>
  </div>
</div>
