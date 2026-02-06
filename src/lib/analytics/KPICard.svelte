<script lang="ts">
/**
 * KPI Card Component
 * Display single KPI metric with icon and trend
 */

import type { Component } from 'svelte';

let {
  title,
  value,
  icon,
  trend = '',
  color = 'var(--accent-1)',
  suffix = ''
}: {
  title: string;
  value: number | string;
  icon: Component;
  trend?: string;
  color?: string;
  suffix?: string;
} = $props();

let IconComponent = $derived(icon);
</script>

<div class="kpi-card">
  <div class="card-header">
    <span class="card-title">{title}</span>
    <div class="card-icon" style="background-color: {color};">
      <IconComponent size={20} />
    </div>
  </div>

  <div class="card-value" style="color: {color};">
    {value}<span class="suffix">{suffix}</span>
  </div>

  {#if trend}
    <div class="card-trend">
      {trend}
    </div>
  {/if}
</div>

<style>
  .kpi-card {
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .kpi-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .card-title {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .card-icon {
    width: 40px;
    height: 40px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
  }

  .card-value {
    font-size: 2rem;
    font-weight: 700;
    line-height: 1;
  }

  .suffix {
    font-size: 1.25rem;
    font-weight: 500;
    opacity: 0.7;
    margin-left: 0.25rem;
  }

  .card-trend {
    font-size: 0.75rem;
    color: var(--muted);
  }
</style>