<script lang="ts">

/**
 * Webhook Manager Component
 * UI for managing webhooks and integrations
 */

import { onMount } from 'svelte';
import { 
  Webhook, 
  Plus, 
  Trash2, 
  Play, 
  Settings, 
  Filter,
  AlertTriangle,
  CheckCircle,
  Clock,
  Download,
  Upload
} from 'lucide-svelte';

let webhooks: any[] = $state([]);
let integrations: any[] = $state([]);
let loading = true;
let error: string | null = $state(null);

let showCreateModal = $state(false);
let showIntegrationModal = $state(false);

interface WebhookConfig {
  name: string;
  url: string;
  events: string[];
  authType: string;
  authConfig: { token?: string; apiKey?: string; username?: string; password?: string };
  headers: Record<string, string>;
  timeoutSeconds: number;
  retryEnabled: boolean;
  maxRetries: number;
}

interface IntegrationConfig {
  type: string;
  name: string;
  config: { webhook_url?: string };
}

let newWebhook: WebhookConfig = $state({
  name: '',
  url: '',
  events: [],
  authType: 'none',
  authConfig: {},
  headers: {},
  timeoutSeconds: 30,
  retryEnabled: true,
  maxRetries: 3
});

let newIntegration: IntegrationConfig = $state({
  type: 'slack',
  name: '',
  config: {}
});

const availableEvents = [
  'order.created',
  'order.updated', 
  'order.completed',
  'station.issue_reported',
  'station.quality_check',
  'loading.day_full',
  'photo.uploaded',
  'comment.added'
];

const integrationTypes = [
  { value: 'slack', label: 'Slack', icon: '💬' },
  { value: 'teams', label: 'Microsoft Teams', icon: '🔵' },
  { value: 'discord', label: 'Discord', icon: '🎮' },
  { value: 'custom', label: 'Custom Webhook', icon: '🔗' }
];

onMount(() => {
  loadWebhooks();
  loadIntegrations();
});

async function loadWebhooks() {
  try {
    const response = await fetch('/api/webhooks');
    const result = await response.json();
    webhooks = result.data;
  } catch (err) {
    console.error('Load webhooks error:', err);
    error = err instanceof Error ? err.message : 'Failed to load webhooks';
  }
}

async function loadIntegrations() {
  try {
    const response = await fetch('/api/integrations');
    const result = await response.json();
    integrations = result.data;
  } catch (err) {
    console.error('Load integrations error:', err);
    error = err instanceof Error ? err.message : 'Failed to load integrations';
  }
}

async function createWebhook() {
  try {
    const response = await fetch('/api/webhooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newWebhook)
    });

    if (response.ok) {
      showCreateModal = false;
      loadWebhooks();
      
      // Reset form
      newWebhook = {
        name: '',
        url: '',
        events: [],
        authType: 'none',
        authConfig: {},
        headers: {},
        timeoutSeconds: 30,
        retryEnabled: true,
        maxRetries: 3
      };
    }
  } catch (error) {
    console.error('Create webhook error:', error);
  }
}

async function deleteWebhook(id: string) {
  if (!confirm('Delete this webhook?')) return;
  
  try {
    await fetch(`/api/webhooks/${id}`, { method: 'DELETE' });
    loadWebhooks();
  } catch (error) {
    console.error('Delete error:', error);
  }
}

async function testWebhook(id: string) {
  try {
    const response = await fetch(`/api/webhooks/${id}/test`, {
      method: 'POST'
    });
    
    const result = await response.json();
    
    if (result.success) {
      alert('Webhook test successful!');
    } else {
      alert(`Webhook test failed: ${result.error}`);
    }
  } catch (error) {
    alert('Test failed');
  }
}

function getIconForType(type: string) {
  return integrationTypes.find(t => t.value === type)?.icon || '🔌';
}

function getStatusColor(status: string) {
  const colors: Record<string, string> = {
    success: 'var(--ok)',
    failed: 'var(--danger)',
    pending: 'var(--warn)',
    sending: 'var(--accent-1)'
  };
  return colors[status] || 'var(--muted)';
}
</script>

<div class="webhook-manager">
  <div class="manager-header">
    <h2>
      <Webhook size={24} />
      Webhooks & Integrations
    </h2>
    <div class="header-actions">
      <button class="btn-primary" onclick={() => showCreateModal = true}>
        <Plus size={16} />
        Add Webhook
      </button>
      <button class="btn-secondary" onclick={() => showIntegrationModal = true}>
        <Plus size={16} />
        Add Integration
      </button>
    </div>
  </div>

  {#if error}
    <div class="error-banner">{error}</div>
  {/if}

  <!-- Webhooks Section -->
  <section class="section">
    <div class="section-header">
      <h3>Webhooks</h3>
      <span class="count-badge">{webhooks.length}</span>
    </div>

    {#if webhooks.length === 0}
      <div class="empty-state">
        <Webhook size={48} />
        <p>No webhooks configured</p>
        <button class="btn-primary" onclick={() => showCreateModal = true}>
          Create Webhook
        </button>
      </div>
    {:else}
      <div class="webhooks-grid">
        {#each webhooks as webhook}
          <div class="webhook-card">
            <div class="card-header">
              <div class="webhook-info">
                <h4>{webhook.name}</h4>
                <p class="webhook-url">{webhook.url}</p>
              </div>
              
              <div class="webhook-status">
                {#if webhook.is_active}
                  <span class="status-badge active">Active</span>
                {:else}
                  <span class="status-badge inactive">Inactive</span>
                {/if}
              </div>
            </div>

            <div class="webhook-events">
              <strong>Events:</strong>
              {#each webhook.events as event (event)}
                <span class="event-tag">{event}</span>
              {/each}
            </div>

            <div class="webhook-stats">
              <div class="stat">
                <span class="stat-value">{webhook.delivery_stats?.count || 0}</span>
                <span class="stat-label">Deliveries</span>
              </div>
              <div class="stat">
                <span class="stat-value">{webhook.delivery_stats?.successful || 0}</span>
                <span class="stat-label">Success</span>
              </div>
              <div class="stat">
                <span class="stat-value">{webhook.delivery_stats?.failed || 0}</span>
                <span class="stat-label">Failed</span>
              </div>
            </div>

            <div class="card-actions">
              <button class="btn-icon" onclick={() => testWebhook(webhook.id)} title="Test">
                <Play size={16} />
              </button>
              <button class="btn-icon" title="Edit">
                <Settings size={16} />
              </button>
              <button class="btn-icon btn-danger" onclick={() => deleteWebhook(webhook.id)} title="Delete">
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </section>

  <!-- Integrations Section -->
  <section class="section">
    <div class="section-header">
      <h3>Integrations</h3>
      <span class="count-badge">{integrations.length}</span>
    </div>

    {#if integrations.length === 0}
      <div class="empty-state">
        <span class="integration-icon">💬</span>
        <p>No integrations configured</p>
        <button class="btn-primary" onclick={() => showIntegrationModal = true}>
          Connect Integration
        </button>
      </div>
    {:else}
      <div class="integrations-grid">
        {#each integrations as integration}
          <div class="integration-card">
            <div class="card-header">
              <div class="integration-info">
                <div class="integration-icon">{getIconForType(integration.integration_type)}</div>
                <div>
                  <h4>{integration.name}</h4>
                  <p class="integration-type">{integration.integration_type}</p>
                </div>
              </div>
              
              <div class="integration-status">
                {#if integration.is_active}
                  <span class="status-badge active">Connected</span>
                {:else}
                  <span class="status-badge inactive">Disconnected</span>
                {/if}
              </div>
            </div>

            <div class="integration-events">
              <strong>Subscribed to:</strong>
              {#each integration.subscribed_events as event (event)}
                <span class="event-tag">{event}</span>
              {/each}
            </div>

            <div class="card-actions">
              <button class="btn-icon" title="Configure">
                <Settings size={16} />
              </button>
              <button class="btn-icon btn-danger" title="Disconnect">
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </section>
</div>

{#if showCreateModal}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-overlay" onclick={() => showCreateModal = false}>
    <div class="modal-content" onclick={stopPropagation(bubble('click'))}>
      <h3>Create Webhook</h3>

      <div class="form-group">
        <label for="webhook-name">Name</label>
        <input
          id="webhook-name"
          type="text"
          bind:value={newWebhook.name}
          placeholder="My Webhook Endpoint"
        />
      </div>

      <div class="form-group">
        <label for="webhook-url">URL</label>
        <input
          id="webhook-url"
          type="url"
          bind:value={newWebhook.url}
          placeholder="https://example.com/webhook"
        />
      </div>

      <div class="form-group">
        <label>Events</label>
        <div class="checkbox-grid">
          {#each availableEvents as event}
            <label class="checkbox-label">
              <input
                type="checkbox"
                value={event}
                bind:group={newWebhook.events}
              />
              <span>{event}</span>
            </label>
          {/each}
        </div>
      </div>

      <div class="form-group">
        <label for="auth-type">Authentication</label>
        <select id="auth-type" bind:value={newWebhook.authType}>
          <option value="none">None</option>
          <option value="bearer">Bearer Token</option>
          <option value="api_key">API Key</option>
          <option value="basic">Basic Auth</option>
        </select>
      </div>

      {#if newWebhook.authType === 'bearer'}
        <div class="form-group">
          <label for="bearer-token">Token</label>
          <input
            id="bearer-token"
            type="password"
            bind:value={newWebhook.authConfig.token}
            placeholder="Enter bearer token"
          />
        </div>
      {/if}

      <div class="form-group">
        <label for="timeout">Timeout (seconds)</label>
        <input
          id="timeout"
          type="number"
          bind:value={newWebhook.timeoutSeconds}
          min="1"
          max="300"
        />
      </div>

      <div class="form-actions">
        <button class="btn-secondary" onclick={() => showCreateModal = false}>Cancel</button>
        <button class="btn-primary" onclick={createWebhook}>Create</button>
      </div>
    </div>
  </div>
{/if}

{#if showIntegrationModal}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-overlay" onclick={() => showIntegrationModal = false}>
    <div class="modal-content" onclick={stopPropagation(bubble('click'))}>
      <h3>Add Integration</h3>

      <div class="form-group">
        <label for="integration-type">Type</label>
        <select id="integration-type" bind:value={newIntegration.type}>
          {#each integrationTypes as type}
            <option value={type.value}>{type.label}</option>
          {/each}
        </select>
      </div>

      <div class="form-group">
        <label for="integration-name">Name</label>
        <input
          id="integration-name"
          type="text"
          bind:value={newIntegration.name}
          placeholder="My Slack Integration"
        />
      </div>

      {#if newIntegration.type === 'slack'}
        <div class="form-group">
          <label for="slack-webhook">Webhook URL</label>
          <input
            id="slack-webhook"
            type="url"
            bind:value={newIntegration.config.webhook_url}
            placeholder="https://hooks.slack.com/services/..."
          />
        </div>
      {/if}

      <div class="form-actions">
        <button class="btn-secondary" onclick={() => showIntegrationModal = false}>Cancel</button>
        <button class="btn-primary">Connect</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .webhook-manager {
    padding: 2rem;
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  .manager-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .manager-header h2 {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin: 0;
    font-size: 1.5rem;
    color: var(--text);
  }

  .header-actions {
    display: flex;
    gap: 0.75rem;
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .section-header h3 {
    margin: 0;
    font-size: 1.25rem;
    color: var(--text);
  }

  .count-badge {
    padding: 0.25rem 0.75rem;
    background: var(--bg-2);
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 500;
  }

  .webhooks-grid,
  .integrations-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
    gap: 1.5rem;
  }

  .webhook-card,
  .integration-card {
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }

  .webhook-info,
  .integration-info {
    flex: 1;
  }

  .webhook-info h4,
  .integration-info h4 {
    margin: 0 0 0.25rem 0;
    font-size: 1rem;
    color: var(--text);
  }

  .webhook-url {
    font-size: 0.875rem;
    color: var(--muted);
    word-break: break-all;
  }

  .integration-type {
    font-size: 0.75rem;
    color: var(--muted);
    text-transform: uppercase;
  }

  .integration-icon {
    font-size: 1.5rem;
    margin-right: 0.75rem;
  }

  .webhook-events,
  .integration-events {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .webhook-events strong,
  .integration-events strong {
    font-size: 0.875rem;
    color: var(--muted);
  }

  .event-tag {
    display: inline-block;
    padding: 0.25rem 0.5rem;
    background: var(--bg-2);
    border-radius: 4px;
    font-size: 0.75rem;
    color: var(--text);
  }

  .webhook-stats {
    display: flex;
    gap: 1.5rem;
  }

  .stat {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .stat-value {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text);
  }

  .stat-label {
    font-size: 0.75rem;
    color: var(--muted);
  }

  .card-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: auto;
  }

  .status-badge {
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 500;
    text-transform: uppercase;
  }

  .status-badge.active {
    background: var(--ok);
    color: white;
  }

  .status-badge.inactive {
    background: var(--muted);
    color: white;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem 2rem;
    text-align: center;
    color: var(--muted);
    border: 2px dashed var(--border);
    border-radius: 8px;
  }

  .empty-state .integration-icon {
    font-size: 3rem;
    margin-bottom: 1rem;
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

  .checkbox-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 0.75rem;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.2s;
  }

  .checkbox-label:hover {
    background: var(--bg-2);
  }

  .checkbox-label input {
    cursor: pointer;
  }

  .form-actions {
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

  .btn-primary:hover {
    opacity: 0.9;
  }

  .btn-secondary {
    background: var(--bg-2);
    color: var(--text);
    border: 1px solid var(--border);
  }

  .btn-secondary:hover {
    background: var(--bg-1);
  }

  .btn-icon {
    padding: 0.5rem;
    background: transparent;
    color: var(--text);
  }

  .btn-icon:hover {
    background: var(--bg-2);
  }

  .btn-danger {
    color: var(--danger);
  }

  .btn-danger:hover {
    background: var(--danger-bg);
  }

  button:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }

  .error-banner {
    padding: 0.75rem 1rem;
    background: var(--danger);
    color: white;
    border-radius: 6px;
    font-size: 0.875rem;
  }

  @media (max-width: 768px) {
    .webhook-manager {
      padding: 1rem;
    }

    .manager-header {
      flex-direction: column;
      align-items: stretch;
    }

    .header-actions {
      justify-content: flex-end;
    }

    .webhooks-grid,
    .integrations-grid {
      grid-template-columns: 1fr;
    }

    .webhook-stats {
      gap: 1rem;
    }
  }
</style>