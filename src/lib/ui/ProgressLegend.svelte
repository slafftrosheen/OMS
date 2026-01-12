<script lang="ts">
  import { t } from 'svelte-i18n';

  export let stages: { name: string; value: number }[] = [];
</script>

<section class="card" aria-labelledby="progress-legend" aria-describedby="progress-desc">
  <h3 id="progress-legend">{$t('order.progress')}</h3>
  <p id="progress-desc" class="muted">{$t('order.progress_help')}</p>
  <div class="legend">
    {#each stages as s}
      <div class="row" style="justify-content:space-between">
        <span>{s.name}</span>
        <span class="muted">{s.value}%</span>
      </div>
      <div
        class="rf-progress"
        role="progressbar"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={s.value}
        aria-label={$t('order.progressbar_label', { name: s.name })}
      >
        <div class="bar" style={`width:${Math.max(0, Math.min(100, s.value))}%`}></div>
      </div>
    {/each}
  </div>
</section>

<style>
.legend{display:grid;gap:8px}
.rf-progress{background:var(--bg-2)}
</style>
