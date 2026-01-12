<script lang="ts">
import Button from '$lib/ui/Button.svelte';
import { TERMS } from '$lib/order/names';
import type { StationCode } from '$lib/order/names';
import { role } from '$lib/ui/RoleSwitch.svelte';
import { t } from 'svelte-i18n';

  export let value: Record<string, number> = {};
  export let onPropose: (changes: Record<string, number>) => void = () => {};
  export let onApplyAdmin: (changes: Record<string, number>) => void = () => {};

  const STATIONS = Object.keys(TERMS.stations) as StationCode[];

  function baseState(source: Record<string, number>) {
    const entries = STATIONS.map((code) => [code, Number(source?.[code] ?? 0)] as const);
    return Object.fromEntries(entries) as Record<string, number>;
  }

  let edited: Record<string, number> = baseState(value);
  let lastValue = value;

  $: if (lastValue !== value) {
    lastValue = value;
    edited = baseState(value);
  }

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

  $: pending = computeDiff();
  $: hasChanges = Object.keys(pending).length > 0;

  const sliderId = (station: string) => `progress-${station.toLowerCase()}`;

  $: isAdmin = $role === 'Admin';
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
    <Button variant="ghost" on:click={reset} disabled={!hasChanges}>{$t('progressEditor.reset')}</Button>
    {#if isAdmin}
      <Button disabled={!hasChanges} on:click={submitAdmin}>{$t('progressEditor.applyAdmin')}</Button>
    {:else}
      <Button disabled={!hasChanges} on:click={submitStation}>{$t('progressEditor.propose')}</Button>
    {/if}
  </div>
</div>
