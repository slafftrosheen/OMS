<script lang="ts">
  import dayjs from 'dayjs';
  import { locale, t } from 'svelte-i18n';
  import { modalDialog } from '$lib/ui/modal-dialog';

  let { po = '', onPick = (_date: string) => {}, onClose = () => {} } = $props<{
    po?: string;
    onPick?: (date: string) => void;
    onClose?: () => void;
  }>();
  let month = $state(dayjs());
  let open = $state(true);
  let target: string | undefined;
  let dates = $derived(Array.from({ length: month.daysInMonth() }, (_, i) => month.startOf('month').add(i, 'day')));
  let monthLabel = $derived(new Intl.DateTimeFormat($locale || 'en', { year: 'numeric', month: 'long' }).format(month.toDate()));

  $effect.pre(() => {
    if (target === po) return;
    target = po;
    month = dayjs();
    open = true;
  });

  function close() { open = false; onClose(); }
  function pick(date: string) { onPick(date); close(); }
</script>

{#if open}
  <dialog class="sheet" aria-label={$t('calendar.agenda.loading_date')} use:modalDialog={{ onClose: close, initialFocus: '.tile' }}>
    <div class="card">
      <div class="row" style="justify-content:space-between;align-items:center">
        <strong>{$t('calendar.agenda.loading_date')}</strong>
        <button type="button" class="tag ghost" onclick={close}>{$t('common.close')}</button>
      </div>
      <div class="row" style="justify-content:space-between;align-items:center">
        <button type="button" class="tag" aria-label={$t('calendar.prevMonth')} onclick={() => month = month.subtract(1, 'month')}>◀</button>
        <span aria-live="polite">{monthLabel}</span>
        <button type="button" class="tag" aria-label={$t('calendar.nextMonth')} onclick={() => month = month.add(1, 'month')}>▶</button>
      </div>
      <div class="grid" style="grid-template-columns:repeat(7,1fr);margin-top:8px">
        {#each dates as date (date.format('YYYY-MM-DD'))}
          <button type="button" class="tile" onclick={() => pick(date.format('YYYY-MM-DD'))} aria-label={date.format('YYYY-MM-DD')}>
            {date.date()}
          </button>
        {/each}
      </div>
    </div>
  </dialog>
{/if}

<style>
.sheet{position:fixed;inset:0;margin:0;width:100%;height:100%;max-width:none;max-height:none;border:0;background:transparent;color:var(--text);padding:12px}
.sheet[open]{display:grid;place-items:center}
.sheet::backdrop{background:color-mix(in oklab, var(--bg-0) 50%, transparent)}
.card{width:min(560px,100%);max-height:90dvh;overflow:auto;padding:12px}
.tile{height:64px;border:1px solid var(--border);background:var(--bg-0);color:var(--text);border-radius:10px;padding:6px;text-align:left}
.tile:focus-visible{outline:2px solid var(--brand);outline-offset:2px}
</style>
