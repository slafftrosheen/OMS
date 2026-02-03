<script lang="ts">
  import type { OrderStage } from '$lib/types/database';
  import { t } from '$lib/i18n';

  let { 
    stages = [], 
    readonly = false,
    onstageClick
  }: {
    stages?: OrderStage[];
    readonly?: boolean;
    onstageClick?: (stage: OrderStage) => void;
  } = $props();

  const stationOrder = [
    'CAD', 'CNC', 'SANDING', 'BENDING',
    'WELDING', 'PAINT', 'ASSEMBLY', 'QC', 'LOGISTICS'
  ];

  let orderedStages = $derived(stationOrder
    .map(station => stages.find(s => s.station === station))
    .filter(Boolean) as OrderStage[]);

  function getStateClass(state: string) {
    const classes: Record<string, string> = {
      NOT_STARTED: 'not-started',
      QUEUED: 'queued',
      IN_PROGRESS: 'in-progress',
      BLOCKED: 'blocked',
      REWORK: 'rework',
      COMPLETED: 'completed'
    };
    return classes[state] || 'not-started';
  }

  function getStateIcon(state: string) {
    const icons: Record<string, string> = {
      NOT_STARTED: '⚪',
      QUEUED: '🕐',
      IN_PROGRESS: '🔵',
      BLOCKED: '🔴',
      REWORK: '🟠',
      COMPLETED: '✅'
    };
    return icons[state] || '⚪';
  }

  function handleStageClick(stage: OrderStage) {
    if (!readonly) {
      onstageClick?.(stage);
    }
  }

  function formatDuration(hours?: number) {
    if (!hours) return '--';
    if (hours < 1) return `${Math.round(hours * 60)}m`;
    return `${hours.toFixed(1)}h`;
  }
</script>

<div class="stage-board">
  <div class="stages-container">
    {#each orderedStages as stage, index (stage.id)}
      <div class="stage-wrapper">
        <button
          class="stage-card stage-{getStateClass(stage.state)}"
          class:readonly
          on:click={() => handleStageClick(stage)}
          disabled={readonly}
          aria-label="{stage.station} - {stage.state}"
        >
          <div class="stage-header">
            <span class="stage-icon">{getStateIcon(stage.state)}</span>
            <span class="stage-name">{stage.station}</span>
          </div>

          <div class="stage-state">
            {stage.state.replace('_', ' ')}
          </div>

          {#if stage.state === 'BLOCKED' && stage.blocked_reason}
            <div class="blocked-reason">
              <small>{stage.blocked_reason}</small>
            </div>
          {/if}

          {#if stage.actual_hours || stage.estimated_hours}
            <div class="stage-timing">
              {#if stage.actual_hours}
                <span class="actual" title="Actual time">
                  ⏱️ {formatDuration(stage.actual_hours)}
                </span>
              {/if}
              {#if stage.estimated_hours && !stage.actual_hours}
                <span class="estimated" title="Estimated time">
                  ~{formatDuration(stage.estimated_hours)}
                </span>
              {/if}
            </div>
          {/if}

          {#if stage.notes}
            <div class="stage-notes">
              <small>{stage.notes}</small>
            </div>
          {/if}
        </button>

        {#if index < orderedStages.length - 1}
          <div class="stage-connector" class:completed={stage.state === 'COMPLETED'}>
            →
          </div>
        {/if}
      </div>
    {/each}
  </div>
</div>

<style>
  .stage-board {
    width: 100%;
    overflow-x: auto;
    padding: 1rem 0;
  }

  .stages-container {
    display: flex;
    gap: 0.5rem;
    min-width: min-content;
    padding: 0 1rem;
  }

  .stage-wrapper {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .stage-card {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1rem;
    min-width: 120px;
    border: 2px solid var(--border);
    border-radius: 8px;
    background: var(--bg-1);
    transition: all 0.2s ease;
    cursor: pointer;
    text-align: left;
  }

  .stage-card:not(.readonly):hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .stage-card:not(.readonly):focus {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }

  .stage-card.readonly {
    cursor: default;
  }

  /* State-specific colors */
  .stage-not-started {
    border-color: #6c757d;
    background: #f8f9fa;
  }

  .stage-queued {
    border-color: #17a2b8;
    background: #d1ecf1;
  }

  .stage-in-progress {
    border-color: #007bff;
    background: #cfe2ff;
    animation: pulse 2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.85; }
  }

  .stage-blocked {
    border-color: #dc3545;
    background: #f8d7da;
  }

  .stage-rework {
    border-color: #ffc107;
    background: #fff3cd;
  }

  .stage-completed {
    border-color: #28a745;
    background: #d4edda;
  }

  .stage-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .stage-icon {
    font-size: 1.25rem;
  }

  .stage-name {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text);
  }

  .stage-state {
    font-size: 0.75rem;
    color: var(--muted);
    text-transform: capitalize;
  }

  .blocked-reason,
  .stage-notes {
    font-size: 0.75rem;
    color: var(--muted);
    padding: 0.25rem;
    background: rgba(0, 0, 0, 0.05);
    border-radius: 4px;
  }

  .stage-timing {
    display: flex;
    gap: 0.5rem;
    font-size: 0.75rem;
  }

  .actual {
    color: var(--text);
    font-weight: 600;
  }

  .estimated {
    color: var(--muted);
  }

  .stage-connector {
    font-size: 1.5rem;
    color: var(--border);
    transition: color 0.3s ease;
  }

  .stage-connector.completed {
    color: #28a745;
  }

  @media (max-width: 768px) {
    .stages-container {
      flex-direction: column;
    }

    .stage-connector {
      transform: rotate(90deg);
    }
  }
</style>
