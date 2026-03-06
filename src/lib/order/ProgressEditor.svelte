<script lang="ts">
import Button from '$lib/ui/Button.svelte';
import { TERMS } from '$lib/order/names';
import type { StationCode } from '$lib/order/names';
import { role } from '$lib/ui/RoleSwitch.svelte';
import { t } from 'svelte-i18n';

  let {
    value = {},
    onPropose = () => {},
    onApplyAdmin = () => {}
  }: {
    value?: Record<string, number>;
    onPropose?: (changes: Record<string, number>) => void;
    onApplyAdmin?: (changes: Record<string, number>) => void;
  } = $props();

  const STATIONS = Object.keys(TERMS.stations) as StationCode[];

  function baseState(source: Record<string, number>) {
    const entries = STATIONS.map((code) => [code, Number(source?.[code] ?? 0)] as const);
    return Object.fromEntries(entries) as Record<string, number>;
  }

  let edited: Record<string, number> = $state(baseState(value));
  let lastValue = $state(value);

  $effect(() => {
    if (lastValue !== value) {
      lastValue = value;
      edited = baseState(value);
    }
  });

  function reset() {
    edited = baseState(value);
  }

  function submitAdmin() {
    if (!hasChanges) return;
    onApplyAdmin(pending);
    reset();
  }

  function submitStation() {
    if (!hasChanges) return;
    onPropose(pending);
    reset();
  }

  function computeDiff() {
    const out: Record<string, number> = {};
    const keys = new Set([...STATIONS, ...Object.keys(value ?? {})]);
    for (const key of keys) {
      const next = Number(edited?.[key] ?? 0);
      const prev = Number(value?.[key] ?? 0);
      if (next !== prev) {
        out[key] = next;
      }
    }
    return out;
  }

  let pending = $derived(computeDiff());
  let hasChanges = $derived(Object.keys(pending).length > 0);

  const sliderId = (station: string) => `progress-${station.toLowerCase()}`;

  let isAdmin = $derived($role === 'Admin');
</script>

<div class="card">
  <h3 style="margin:0 0 8px 0">{$t('progressEditor.title')}</h3>
  <div class="grid" style="grid-template-columns:1fr 1fr">
    {#each STATIONS as s}
      <div class="card" style="padding:10px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <b id={`${sliderId(s)}-label`}>{$t(TERMS.stations[s])}</b>
          <span class="muted">{Math.round(edited[s] ?? 0)}%</span>
        </div>
        <input
          id={sliderId(s)}
          type="range"
          min="0"
          max="100"
          step="5"
          class="rf-input"
          style="width:100%"
          bind:value={edited[s]}
          aria-labelledby={`${sliderId(s)}-label`}
        />
      </div>
    {/each}
  </div>
  <div class="row" style="margin-top:10px">
    <Button variant="ghost" onclick={reset} disabled={!hasChanges}>{$t('progressEditor.reset')}</Button>
    {#if isAdmin}
      <Button disabled={!hasChanges} onclick={submitAdmin}>{$t('progressEditor.applyAdmin')}</Button>
    {:else}
      <Button disabled={!hasChanges} onclick={submitStation}>{$t('progressEditor.propose')}</Button>
    {/if}
  </div>
</div>
