<script lang="ts">
  import Activity from 'lucide-svelte/icons/activity';
  import AlertTriangle from 'lucide-svelte/icons/alert-triangle';
  import Clock from 'lucide-svelte/icons/clock';
  import Download from 'lucide-svelte/icons/download';
  import Eye from 'lucide-svelte/icons/eye';
  import Shield from 'lucide-svelte/icons/shield';
/**
 * Audit Dashboard Component
 * Comprehensive view of system activity and security events
 */

import { onMount } from 'svelte';
import Icon from '$lib/ui/Icon.svelte';
import { AuditService } from '$lib/server/audit-service';

let auditSummary: any = $state(null);
let loading = $state(true);
let error: string | null = $state(null);
let activeTab: 'activity' | 'security' | 'logs' = $state('activity');
let filters = $state({
  dateRange: '7d',
  user: '',
  action: '',
  resource: '',
  search: ''
});

onMount(() => {
  loadSummary();
});

async function loadSummary() {
  loading = true;
  error = null;

  try {
    auditSummary = await AuditService.getAuditSummary();
  } catch (err) {
    console.error('Load error:', err);
    error = err instanceof Error ? err.message : 'Failed to load audit data';
  } finally {
    loading = false;
  }
}

function exportLogs() {
  // Implementation for exporting audit logs
  console.log('Exporting audit logs...');
}

function refreshData() {
  loadSummary();
}
</script>

<div class="audit-dashboard">
  <div class="dashboard-header">
    <div class="header-content">
      <h1>
        <Shield size={28} />
        Audit & Security
      </h1>
      <p>Monitor system activity and security events</p>
    </div>

    <div class="header-actions">
      <button class="btn-secondary" onclick={refreshData}>
        <Clock size={16} />
        Refresh
      </button>
      <button class="btn-primary" onclick={exportLogs}>
        <Download size={16} />
        Export Logs
      </button>
    </div>
  </div>

  {#if loading}
    <div class="loading">Loading audit data...</div>
  {:else if error}
    <div class="error">{error}</div>
  {:else if auditSummary}
    <!-- Summary Cards -->
    <div class="summary-grid">
      <div class="summary-card">
        <div class="card-icon" style="background: var(--accent-1);">
          <Activity size={24} color="white" />
        </div>
        <div class="card-content">
          <h3>{auditSummary.activityCount}</h3>
          <p>Activities (30d)</p>
        </div>
      </div>

      <div class="summary-card">
        <div class="card-icon" style="background: var(--danger);">
          <AlertTriangle size={24} color="white" />
        </div>
        <div class="card-content">
          <h3>{auditSummary.securityEvents}</h3>
          <p>Security Events</p>
        </div>
      </div>

      <div class="summary-card">
        <div class="card-icon" style="background: var(--ok);">
          <Eye size={24} color="white" />
        </div>
        <div class="card-content">
          <h3>{auditSummary.recentActivity.length}</h3>
          <p>Recent Actions</p>
        </div>
      </div>
    </div>

    <!-- Tabs -->
    <div class="tabs">
      <button 
        class="tab-btn"
        class:active={activeTab === 'activity'}
        onclick={() => activeTab = 'activity'}
      >
        <Activity size={16} />
        Activity
      </button>
      <button 
        class="tab-btn"
        class:active={activeTab === 'security'}
        onclick={() => activeTab = 'security'}
      >
        <Shield size={16} />
        Security
      </button>
      <button 
        class="tab-btn"
        class:active={activeTab === 'logs'}
        onclick={() => activeTab = 'logs'}
      >
        <Eye size={16} />
        Audit Logs
      </button>
    </div>

    <!-- Activity Tab -->
    {#if activeTab === 'activity'}
      <div class="tab-content">
        <div class="filters">
          <div class="filter-group">
            <label>Date Range</label>
            <select bind:value={filters.dateRange}>
              <option value="1d">Last 24 hours</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
            </select>
          </div>
        </div>

        <div class="activity-list">
          {#each auditSummary.recentActivity as activity, i}
            <div class="activity-item">
              <div class="activity-icon">
                <Activity size={16} />
              </div>
              <div class="activity-details">
                <div class="activity-header">
                  <strong>{activity.action}</strong>
                  <span class="activity-time">{new Date(activity.createdAt).toLocaleString()}</span>
                </div>
                <div class="activity-meta">
                  <span class="activity-user">{activity.user}</span>
                  <span class="activity-resource">{activity.resourceType}</span>
                </div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Security Tab -->
    {#if activeTab === 'security'}
      <div class="tab-content">
        <div class="security-list">
          {#each auditSummary.securityEvents as event, i}
            <div class="security-item">
              <div class="security-icon" class:high={event.severity === 'high'} class:critical={event.severity === 'critical'}>
                <AlertTriangle size={16} />
              </div>
              <div class="security-details">
                <div class="security-header">
                  <strong>{event.eventType}</strong>
                  <span class="security-severity">{event.severity}</span>
                </div>
                <p class="security-description">{event.description}</p>
                <div class="security-meta">
                  <span>{event.userEmail || 'System'}</span>
                  <span>{new Date(event.createdAt).toLocaleString()}</span>
                </div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Audit Logs Tab -->
    {#if activeTab === 'logs'}
      <div class="tab-content">
        <div class="logs-filters">
          <input 
            type="text" 
            placeholder="Search logs..." 
            bind:value={filters.search}
          />
          <select bind:value={filters.action}>
            <option value="">All Actions</option>
            <option value="create">Create</option>
            <option value="update">Update</option>
            <option value="delete">Delete</option>
            <option value="view">View</option>
          </select>
        </div>

        <div class="logs-table">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>User</th>
                <th>Action</th>
                <th>Resource</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {#each auditSummary.auditLogs as log}
                <tr>
                  <td>{new Date(log.createdAt).toLocaleString()}</td>
                  <td>{log.userEmail}</td>
                  <td>{log.action}</td>
                  <td>{log.resourceType} #{log.resourceId}</td>
                  <td>
                    <span class="status-badge" class:success={log.status === 'success'} class:error={log.status === 'failure'}>
                      {log.status}
                    </span>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .audit-dashboard {
    padding: 2rem;
    background: var(--bg-0);
    min-height: 100vh;
  }

  .dashboard-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 2rem;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .header-content h1 {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin: 0 0 0.25rem 0;
    font-size: 1.75rem;
    color: var(--text);
  }

  .header-content p {
    margin: 0;
    color: var(--muted);
  }

  .header-actions {
    display: flex;
    gap: 0.75rem;
  }

  .summary-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1.5rem;
    margin-bottom: 2rem;
  }

  .summary-card {
    display: flex;
    gap: 1rem;
    padding: 1.5rem;
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: 8px;
  }

  .card-icon {
    width: 60px;
    height: 60px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .card-content h3 {
    margin: 0 0 0.25rem 0;
    font-size: 2rem;
    color: var(--text);
  }

  .card-content p {
    margin: 0;
    color: var(--muted);
    font-size: 0.875rem;
  }

  .tabs {
    display: flex;
    border-bottom: 1px solid var(--border);
    margin-bottom: 1.5rem;
  }

  .tab-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1.5rem;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--muted);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .tab-btn:hover {
    color: var(--text);
  }

  .tab-btn.active {
    color: var(--accent-1);
    border-bottom-color: var(--accent-1);
  }

  .tab-content {
    min-height: 400px;
  }

  .filters {
    display: flex;
    gap: 1rem;
    margin-bottom: 1.5rem;
    flex-wrap: wrap;
  }

  .filter-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .filter-group label {
    font-size: 0.875rem;
    color: var(--muted);
  }

  .filter-group select,
  .filter-group input {
    padding: 0.5rem 0.75rem;
    background: var(--bg-0);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text);
    font-size: 0.875rem;
  }

  .activity-list,
  .security-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .activity-item,
  .security-item {
    display: flex;
    gap: 1rem;
    padding: 1rem;
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: 6px;
  }

  .activity-icon,
  .security-icon {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-2);
    color: var(--accent-1);
    flex-shrink: 0;
  }

  .security-icon.high {
    background: var(--warn);
    color: var(--bg-0);
  }

  .security-icon.critical {
    background: var(--danger);
    color: var(--bg-0);
  }

  .activity-details,
  .security-details {
    flex: 1;
  }

  .activity-header,
  .security-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.25rem;
  }

  .activity-header strong,
  .security-header strong {
    color: var(--text);
  }

  .activity-time,
  .security-severity {
    font-size: 0.75rem;
    color: var(--muted);
  }

  .security-severity {
    padding: 0.125rem 0.5rem;
    background: var(--bg-2);
    border-radius: 12px;
  }

  .security-severity.high {
    background: var(--warn);
    color: var(--bg-0);
  }

  .security-severity.critical {
    background: var(--danger);
    color: var(--bg-0);
  }

  .security-description {
    margin: 0.25rem 0 0.5rem 0;
    color: var(--text);
    font-size: 0.875rem;
    line-height: 1.4;
  }

  .activity-meta,
  .security-meta {
    display: flex;
    gap: 1rem;
    font-size: 0.75rem;
    color: var(--muted);
  }

  .activity-user,
  .activity-resource {
    padding: 0.125rem 0.5rem;
    background: var(--bg-2);
    border-radius: 12px;
  }

  .logs-filters {
    display: flex;
    gap: 1rem;
    margin-bottom: 1.5rem;
    flex-wrap: wrap;
  }

  .logs-filters input,
  .logs-filters select {
    padding: 0.5rem 0.75rem;
    background: var(--bg-0);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text);
  }

  .logs-table {
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  th {
    padding: 0.75rem 1rem;
    text-align: left;
    background: var(--bg-0);
    border-bottom: 2px solid var(--border);
    color: var(--text);
    font-weight: 600;
    font-size: 0.875rem;
  }

  td {
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--border);
    color: var(--text);
    font-size: 0.875rem;
  }

  .status-badge {
    padding: 0.25rem 0.5rem;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 500;
  }

  .status-badge.success {
    background: var(--ok);
    color: var(--bg-0);
  }

  .status-badge.error {
    background: var(--danger);
    color: var(--bg-0);
  }

  .loading,
  .error {
    padding: 2rem;
    text-align: center;
    color: var(--muted);
  }

  .error {
    color: var(--danger);
  }

  button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-secondary {
    background: var(--bg-2);
    color: var(--text);
    border: 1px solid var(--border);
  }

  .btn-secondary:hover {
    background: var(--bg-1);
  }

  .btn-primary {
    background: var(--accent-1);
    color: var(--bg-0);
  }

  .btn-primary:hover {
    opacity: 0.9;
  }

  button:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }
</style>