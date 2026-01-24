<script lang="ts">
/**
 * Station Timeline Component
 * Visual timeline of all station activities for an order
 */

import { onMount } from 'svelte';
import { 
  Clock, 
  AlertCircle, 
  CheckCircle, 
  MessageSquare, 
  Camera,
  Tool,
  QrCode
} from 'lucide-svelte';

export let orderId: string;
export let station: string | null = null;

let logs: any[] = [];
let loading = true;
let error: string | null = null;
let filterType = 'all';

const typeFilters = [
  { value: 'all', label: 'All' },
  { value: 'stage_change', label: 'Stage Changes' },
  { value: 'comment', label: 'Comments' },
  { value: 'rework', label: 'Rework' },
  { value: 'quality_check', label: 'QC' },
  { value: 'issue', label: 'Issues' }
];

const logTypeIcons = {
  stage_change: Clock,
  comment: MessageSquare,
  rework: Tool,
  quality_check: CheckCircle,
  issue: AlertCircle,
  photo: Camera,
  scan: QrCode
};

onMount(() => {
  loadLogs();
});

async function loadLogs() {
  loading = true;
  error = null;

  try {
    const params = new URLSearchParams({ orderId });
    if (station) params.append('station', station);
    if (filterType !== 'all') params.append('type', filterType);

    const response = await fetch(`/api/station-logs?${params}`);
    if (!response.ok) throw new Error('Failed to load logs');

    const result = await response.json();
    logs = result.data;
  } catch (err) {
    console.error('Load error:', err);
    error = err instanceof Error ? err.message : 'Failed to load timeline';
  } finally {
    loading = false;
  }
}

function formatDate(date: string) {
  return new Date(date).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getLogIcon(logType: string) {
  return logTypeIcons[logType] || Clock;
}

function getLogColor(log: any) {
  if (log.is_issue && !log.issue_resolved) return 'var(--danger)';
  if (log.log_type === 'quality_check' && log.quality_score >= 4) return 'var(--ok)';
  if (log.log_type === 'rework') return 'var(--warn)';
  return 'var(--accent-1)';
}

$: if (filterType) loadLogs();
</script>

<div class="station-timeline">
  <div class="timeline-header">
    <h3>Activity Timeline</h3>
    <div class="filter-tabs" role="tablist">
      {#each typeFilters as filter}
        <button
          role="tab"
          class="filter-tab"
          class:active={filterType === filter.value}
          on:click={() => filterType = filter.value}
          aria-selected={filterType === filter.value}
        >
          {filter.label}
        </button>
      {/each}
    </div>
  </div>

  {#if loading}
    <div class="loading">Loading timeline...</div>
  {:else if error}
    <div class="error">{error}</div>
  {:else if logs.length === 0}
    <div class="empty">No activity logs found</div>
  {:else}
    <div class="timeline-track">
      {#each logs as log, i (log.id)}
        <div class="timeline-item">
          <div class="timeline-marker" style="border-color: {getLogColor(log)}">
            <svelte:component 
              this={getLogIcon(log.log_type)} 
              size={20}
              style="color: {getLogColor(log)}"
            />
          </div>

          <div class="timeline-content">
            <div class="log-header">
              <div class="log-station">{log.station}</div>
              <time class="log-time" datetime={log.created_at}>
                {formatDate(log.created_at)}
              </time>
            </div>

            <p class="log-message">{log.message}</p>

            {#if log.previous_stage && log.new_stage && log.previous_stage !== log.new_stage}
              <div class="stage-change">
                <span class="old-stage">{log.previous_stage}</span>
                <span class="arrow">→</span>
                <span class="new-stage">{log.new_stage}</span>
              </div>
            {/if}

            {#if log.quality_score}
              <div class="quality-score">
                Quality: {'★'.repeat(log.quality_score)}{'☆'.repeat(5 - log.quality_score)}
              </div>
            {/if}

            {#if log.duration_minutes}
              <div class="duration">
                Duration: {Math.round(log.duration_minutes)} minutes
              </div>
            {/if}

            {#if log.is_issue}
              <div class="issue-badge" class:resolved={log.issue_resolved}>
                <AlertCircle size={14} />
                {log.issue_resolved ? 'Issue Resolved' : `Issue: ${log.issue_severity}`}
              </div>
            {/if}

            {#if log.tags && log.tags.length > 0}
              <div class="tags">
                {#each log.tags as tag}
                  <span class="tag">{tag}</span>
                {/each}
              </div>
            {/if}

            <div class="log-meta">
              <span class="log-author">{log.created_by_email}</span>
              {#if log.attachment_count > 0}
                <span class="attachments">
                  <Camera size={12} />
                  {log.attachment_count} {log.attachment_count === 1 ? 'photo' : 'photos'}
                </span>
              {/if}
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .station-timeline {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .timeline-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .timeline-header h3 {
    margin: 0;
    font-size: 1.25rem;
    color: var(--text);
  }

  .filter-tabs {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .filter-tab {
    padding: 0.375rem 0.75rem;
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: 4px;
    font-size: 0.875rem;
    color: var(--text);
    cursor: pointer;
    transition: all 0.2s;
  }

  .filter-tab:hover {
    background: var(--bg-2);
  }

  .filter-tab.active {
    background: var(--accent-1);
    color: white;
    border-color: var(--accent-1);
  }

  .timeline-track {
    position: relative;
    padding-left: 2.5rem;
  }

  .timeline-track::before {
    content: '';
    position: absolute;
    left: 1.125rem;
    top: 0;
    bottom: 0;
    width: 2px;
    background: var(--border);
  }

  .timeline-item {
    position: relative;
    display: flex;
    gap: 1rem;
    margin-bottom: 2rem;
  }

  .timeline-marker {
    position: absolute;
    left: -2.5rem;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 50%;
    border: 3px solid;
    background: var(--bg-0);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1;
  }

  .timeline-content {
    flex: 1;
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .log-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .log-station {
    font-weight: 600;
    color: var(--accent-1);
    font-size: 0.875rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .log-time {
    font-size: 0.75rem;
    color: var(--muted);
  }

  .log-message {
    margin: 0;
    color: var(--text);
    line-height: 1.5;
  }

  .stage-change {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    padding: 0.5rem;
    background: var(--bg-0);
    border-radius: 4px;
  }

  .old-stage {
    color: var(--muted);
    text-decoration: line-through;
  }

  .arrow {
    color: var(--muted);
  }

  .new-stage {
    color: var(--ok);
    font-weight: 500;
  }

  .quality-score {
    font-size: 0.875rem;
    color: var(--warn);
  }

  .duration {
    font-size: 0.75rem;
    color: var(--muted);
  }

  .issue-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    background: var(--danger);
    color: white;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 500;
    align-self: flex-start;
  }

  .issue-badge.resolved {
    background: var(--ok);
  }

  .tags {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .tag {
    padding: 0.125rem 0.5rem;
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 3px;
    font-size: 0.75rem;
    color: var(--muted);
  }

  .log-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: 0.5rem;
    border-top: 1px solid var(--border);
    font-size: 0.75rem;
    color: var(--muted);
  }

  .log-author {
    font-weight: 500;
  }

  .attachments {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .loading,
  .error,
  .empty {
    padding: 2rem;
    text-align: center;
    color: var(--muted);
  }

  .error {
    color: var(--danger);
  }
</style>