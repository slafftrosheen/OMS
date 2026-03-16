<script lang="ts">

/**
 * Backup Dashboard Component
 * Manage backups, restores, and system health
 */

import { onMount } from 'svelte';
import { 
  Database, 
  Download, 
  Upload, 
  Play, 
  Trash2, 
  Settings, 
  BarChart3,
  Clock,
  CheckCircle,
  AlertCircle,
  HardDrive,
  Server
} from 'lucide-svelte';

let backups: any[] = $state([]);
let statistics: any = $state(null);
let loading = $state(true);
let creating = $state(false);
let error: string | null = $state(null);
let showCreateModal = $state(false);

let newBackup = $state({
  name: '',
  type: 'full',
  scheduleEnabled: false,
  scheduleInterval: 24,
  retentionDays: 30,
  includeAttachments: true
});

onMount(() => {
  loadBackups();
  loadStatistics();
});

async function loadBackups() {
  loading = true;
  error = null;

  try {
    const response = await fetch('/api/backup?limit=20');
    const result = await response.json();
    backups = result.data;
  } catch (err) {
    console.error('Load error:', err);
    error = err instanceof Error ? err.message : 'Failed to load backups';
  } finally {
    loading = false;
  }
}

async function loadStatistics() {
  try {
    const response = await fetch('/api/backup/statistics');
    const result = await response.json();
    statistics = result.data;
  } catch (err) {
    console.error('Statistics error:', err);
  }
}

async function createBackup() {
  if (!newBackup.name.trim()) {
    alert('Please enter a backup name');
    return;
  }

  creating = true;
  error = null;

  try {
    const response = await fetch('/api/backup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newBackup.name,
        type: newBackup.type,
        scheduleEnabled: newBackup.scheduleEnabled,
        scheduleInterval: newBackup.scheduleEnabled ? newBackup.scheduleInterval : null,
        retentionDays: newBackup.retentionDays,
        includeAttachments: newBackup.includeAttachments
      })
    });

    if (response.ok) {
      showCreateModal = false;
      newBackup = {
        name: '',
        type: 'full',
        scheduleEnabled: false,
        scheduleInterval: 24,
        retentionDays: 30,
        includeAttachments: true
      };
      loadBackups();
      loadStatistics();
    } else {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to create backup');
    }
  } catch (err) {
    console.error('Create error:', err);
    error = err instanceof Error ? err.message : 'Failed to create backup';
  } finally {
    creating = false;
  }
}

async function restoreBackup(backupId: string) {
  if (!confirm('Restore from this backup? This will overwrite current data!')) return;

  try {
    const response = await fetch('/api/backup/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ backupId })
    });

    if (response.ok) {
      alert('Restore initiated successfully!');
    } else {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Restore failed');
    }
  } catch (err) {
    console.error('Restore error:', err);
    alert('Restore failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
  }
}

async function deleteBackup(backupId: string) {
  if (!confirm('Delete this backup? This cannot be undone.')) return;

  try {
    const response = await fetch(`/api/backup/${backupId}`, {
      method: 'DELETE'
    });

    if (response.ok) {
      loadBackups();
      loadStatistics();
    } else {
      throw new Error('Failed to delete backup');
    }
  } catch (err) {
    console.error('Delete error:', err);
    alert('Delete failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDate(date: string): string {
  return new Date(date).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    completed: 'var(--ok)',
    failed: 'var(--danger)',
    in_progress: 'var(--warn)',
    pending: 'var(--muted)',
    expired: 'var(--muted)'
  };
  return colors[status] || 'var(--muted)';
}

function getLogIcon(status: string) {
  const icons: Record<string, any> = {
    completed: CheckCircle,
    failed: AlertCircle,
    in_progress: Clock,
    pending: Clock,
    expired: AlertCircle
  };
  return icons[status] || Clock;
}
</script>

<div class="backup-dashboard">
  <div class="dashboard-header">
    <h1>
      <Server size={28} />
      Backup & Restore
    </h1>
    <div class="header-actions">
      <button class="btn-primary" onclick={() => showCreateModal = true}>
        <Play size={16} />
        Create Backup
      </button>
      <button class="btn-secondary">
        <Settings size={16} />
        Settings
      </button>
    </div>
  </div>

  {#if statistics}
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon" style="background: var(--accent-1);">
          <Database size={24} />
        </div>
        <div class="stat-content">
          <span class="stat-value">{statistics.total_backups || 0}</span>
          <span class="stat-label">Total Backups</span>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon" style="background: var(--ok);">
          <CheckCircle size={24} />
        </div>
        <div class="stat-content">
          <span class="stat-value">{statistics.successful_backups || 0}</span>
          <span class="stat-label">Successful</span>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon" style="background: var(--warn);">
          <HardDrive size={24} />
        </div>
        <div class="stat-content">
          <span class="stat-value">{formatBytes(statistics.total_size || 0)}</span>
          <span class="stat-label">Storage Used</span>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon" style="background: var(--accent-2);">
          <Clock size={24} />
        </div>
        <div class="stat-content">
          <span class="stat-value">{statistics.avg_duration || 0}s</span>
          <span class="stat-label">Avg Duration</span>
        </div>
      </div>
    </div>
  {/if}

  <div class="backups-section">
    <div class="section-header">
      <h2>Backup History</h2>
      <div class="section-actions">
        <input 
          type="text" 
          placeholder="Search backups..." 
          class="search-input"
        />
      </div>
    </div>

    {#if loading}
      <div class="loading">Loading backups...</div>
    {:else if error}
      <div class="error" role="alert">{error}</div>
    {:else if backups.length === 0}
      <div class="empty-state">
        <Database size={48} />
        <p>No backups found</p>
        <button class="btn-primary" onclick={() => showCreateModal = true}>
          Create First Backup
        </button>
      </div>
    {:else}
      <div class="backups-table">
        <table>
          <thead>
            <tr>
              <th>Status</th>
              <th>Name</th>
              <th>Type</th>
              <th>Size</th>
              <th>Duration</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each backups as backup}
              {@const SvelteComponent = getLogIcon(backup.status)}
              <tr>
                <td>
                  <div class="status-cell">
                    <SvelteComponent 
                      size={16} 
                      style="color: {getStatusColor(backup.status)}"
                    />
                    <span>{backup.status}</span>
                  </div>
                </td>
                <td>
                  <strong>{backup.backup_name}</strong>
                </td>
                <td>
                  <span class="type-badge">{backup.backup_type}</span>
                </td>
                <td>{formatBytes(backup.compressed_size_bytes || backup.file_size_bytes || 0)}</td>
                <td>{backup.duration_seconds}s</td>
                <td>{formatDate(backup.created_at)}</td>
                <td>
                  <div class="action-buttons">
                    {#if backup.status === 'completed'}
                      <button 
                        class="btn-icon"
                        onclick={() => restoreBackup(backup.id)}
                        title="Restore"
                      >
                        <Upload size={16} />
                      </button>
                    {/if}
                    <button 
                      class="btn-icon"
                      onclick={() => deleteBackup(backup.id)}
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
</div>

{#if showCreateModal}
  <div class="modal-overlay" onclick={() => showCreateModal = false}>
    <div class="modal-content" onclick={(e) => e.stopPropagation()}>
      <h3>Create Backup</h3>

      <div class="form-group">
        <label for="backup-name">Backup Name</label>
        <input
          id="backup-name"
          type="text"
          bind:value={newBackup.name}
          placeholder="Daily backup, Weekly archive, etc."
        />
      </div>

      <div class="form-group">
        <label for="backup-type">Backup Type</label>
        <select id="backup-type" bind:value={newBackup.type}>
          <option value="full">Full Backup</option>
          <option value="incremental">Incremental</option>
          <option value="differential">Differential</option>
        </select>
      </div>

      <div class="form-group">
        <label class="checkbox-label">
          <input 
            type="checkbox" 
            bind:checked={newBackup.includeAttachments}
          />
          <span>Include Attachments</span>
        </label>
      </div>

      <div class="form-group">
        <label class="checkbox-label">
          <input 
            type="checkbox" 
            bind:checked={newBackup.scheduleEnabled}
          />
          <span>Schedule Regular Backups</span>
        </label>
      </div>

      {#if newBackup.scheduleEnabled}
        <div class="form-group">
          <label for="schedule-interval">Schedule Interval (hours)</label>
          <input
            id="schedule-interval"
            type="number"
            bind:value={newBackup.scheduleInterval}
            min="1"
            max="168"
          />
        </div>
      {/if}

      <div class="form-group">
        <label for="retention-days">Retention Period (days)</label>
        <input
          id="retention-days"
          type="number"
          bind:value={newBackup.retentionDays}
          min="1"
          max="365"
        />
      </div>

      <div class="modal-actions">
        <button class="btn-secondary" onclick={() => showCreateModal = false}>
          Cancel
        </button>
        <button 
          class="btn-primary" 
          onclick={createBackup}
          disabled={creating || !newBackup.name.trim()}
        >
          {#if creating}
            Creating...
          {:else}
            Create Backup
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .backup-dashboard {
    padding: 2rem;
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  .dashboard-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .dashboard-header h1 {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin: 0;
    font-size: 1.75rem;
    color: var(--text);
  }

  .header-actions {
    display: flex;
    gap: 0.75rem;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1.5rem;
  }

  .stat-card {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1.5rem;
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: 8px;
  }

  .stat-icon {
    width: 56px;
    height: 56px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
  }

  .stat-content {
    display: flex;
    flex-direction: column;
  }

  .stat-value {
    font-size: 1.75rem;
    font-weight: 700;
    color: var(--text);
  }

  .stat-label {
    font-size: 0.875rem;
    color: var(--muted);
  }

  .backups-section {
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1.5rem;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .section-header h2 {
    margin: 0;
    font-size: 1.25rem;
    color: var(--text);
  }

  .section-actions {
    display: flex;
    gap: 0.75rem;
  }

  .search-input {
    padding: 0.5rem 1rem;
    background: var(--bg-0);
    border: 1px solid var(--border);
    border-radius: 6px;
    font-size: 0.875rem;
  }

  .search-input:focus {
    outline: 2px solid var(--focus);
    outline-offset: 1px;
  }

  .backups-table {
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  thead {
    background: var(--bg-0);
  }

  th {
    padding: 0.75rem 1rem;
    text-align: left;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  td {
    padding: 1rem;
    border-top: 1px solid var(--border);
    font-size: 0.875rem;
  }

  .status-cell {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .type-badge {
    padding: 0.25rem 0.5rem;
    background: var(--bg-2);
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 500;
    text-transform: uppercase;
  }

  .action-buttons {
    display: flex;
    gap: 0.5rem;
  }

  .btn-icon {
    padding: 0.5rem;
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text);
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-icon:hover {
    background: var(--bg-0);
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 4rem 2rem;
    color: var(--muted);
    text-align: center;
  }

  .empty-state svg {
    margin-bottom: 1rem;
  }

  .loading,
  .error {
    padding: 2rem;
    text-align: center;
  }

  .error {
    color: var(--danger);
  }

  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal-content {
    background: var(--bg-0);
    border-radius: 8px;
    padding: 2rem;
    width: 90%;
    max-width: 500px;
    max-height: 90vh;
    overflow-y: auto;
  }

  .modal-content h3 {
    margin: 0 0 1.5rem 0;
    font-size: 1.25rem;
    color: var(--text);
  }

  .form-group {
    margin-bottom: 1.5rem;
  }

  .form-group label {
    display: block;
    margin-bottom: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text);
  }

  .form-group input,
  .form-group select {
    width: 100%;
    padding: 0.5rem 0.75rem;
    background: var(--bg-0);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text);
    font-size: 0.875rem;
  }

  .form-group input:focus,
  .form-group select:focus {
    outline: 2px solid var(--focus);
    outline-offset: 1px;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
  }

  .checkbox-label input {
    width: 18px;
    height: 18px;
    cursor: pointer;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    margin-top: 1.5rem;
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

  .btn-primary {
    background: var(--accent-1);
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    opacity: 0.9;
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-secondary {
    background: var(--bg-2);
    color: var(--text);
    border: 1px solid var(--border);
  }

  .btn-secondary:hover {
    background: var(--bg-1);
  }

  button:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }

  @media (max-width: 768px) {
    .backup-dashboard {
      padding: 1rem;
    }

    .dashboard-header {
      flex-direction: column;
      align-items: stretch;
    }

    .header-actions {
      justify-content: flex-end;
    }

    .stats-grid {
      grid-template-columns: 1fr;
    }

    .section-header {
      flex-direction: column;
      align-items: stretch;
    }

    table {
      font-size: 0.8rem;
    }

    th, td {
      padding: 0.5rem;
    }
  }
</style>