<script lang="ts">
/**
 * Change Request Card Component
 * Displays a single CR with approval actions for admins
 */

import { createEventDispatcher } from 'svelte';
import { Check, X, MessageSquare, Clock, CheckCircle, XCircle } from 'lucide-svelte';
import type { ChangeRequest } from '$lib/types/change-request';

export let cr: ChangeRequest;
export let isAdmin = false;

const dispatch = createEventDispatcher();

function formatDate(date: string) {
  return new Date(date).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'approved': return CheckCircle;
    case 'rejected': return XCircle;
    case 'applied': return Check;
    default: return Clock;
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case 'approved': return 'var(--ok)';
    case 'rejected': return 'var(--danger)';
    case 'applied': return 'var(--ok)';
    default: return 'var(--warn)';
  }
}

function handleApprove() {
  dispatch('approve', { id: cr.id });
}

function handleReject() {
  dispatch('reject', { id: cr.id });
}

function handleApply() {
  dispatch('apply', { id: cr.id });
}

function viewDetails() {
  dispatch('view', { id: cr.id });
}
</script>

<article class="cr-card" class:pending={cr.status === 'pending'}>
  <header class="cr-header">
    <div class="cr-title-row">
      <h3 class="cr-title">{cr.title}</h3>
      <div class="cr-status" style="color: {getStatusColor(cr.status)}">
        <svelte:component this={getStatusIcon(cr.status)} size={16} />
        <span>{cr.status}</span>
      </div>
    </div>
    
    <div class="cr-meta">
      <span class="cr-station">{cr.station}</span>
      <span class="cr-separator">•</span>
      <span class="cr-author">by {cr.proposed_by_user?.email || 'Unknown'}</span>
      <span class="cr-separator">•</span>
      <time class="cr-date" datetime={cr.created_at}>
        {formatDate(cr.created_at)}
      </time>
    </div>
  </header>

  {#if cr.description}
    <p class="cr-description">{cr.description}</p>
  {/if}

  <div class="cr-changes">
    <h4 class="changes-title">Proposed Changes:</h4>
    <dl class="changes-list">
      {#each Object.entries(cr.changes) as [field, change]}
        <div class="change-item">
          <dt class="change-field">{field}:</dt>
          <dd class="change-value">
            <span class="old-value">{change.old}</span>
            <span class="arrow">→</span>
            <span class="new-value">{change.new}</span>
          </dd>
        </div>
      {/each}
    </dl>
  </div>

  <footer class="cr-footer">
    <button class="btn-secondary" on:click={viewDetails}>
      <MessageSquare size={16} />
      View Details
    </button>

    {#if isAdmin && cr.status === 'pending'}
      <div class="admin-actions">
        <button class="btn-danger" on:click={handleReject}>
          <X size={16} />
          Reject
        </button>
        <button class="btn-success" on:click={handleApprove}>
          <Check size={16} />
          Approve
        </button>
      </div>
    {/if}

    {#if isAdmin && cr.status === 'approved'}
      <button class="btn-primary" on:click={handleApply}>
        <Check size={16} />
        Apply Changes
      </button>
    {/if}
  </footer>
</article>

<style>
  .cr-card {
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1.5rem;
    transition: box-shadow 0.2s;
  }

  .cr-card.pending {
    border-left: 3px solid var(--warn);
  }

  .cr-card:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .cr-header {
    margin-bottom: 1rem;
  }

  .cr-title-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .cr-title {
    font-size: 1.125rem;
    font-weight: 600;
    margin: 0;
    color: var(--text);
  }

  .cr-status {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.875rem;
    font-weight: 500;
    text-transform: capitalize;
  }

  .cr-meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    color: var(--muted);
  }

  .cr-station {
    font-weight: 500;
    color: var(--accent-1);
  }

  .cr-separator {
    color: var(--muted);
  }

  .cr-description {
    margin: 1rem 0;
    color: var(--text);
    line-height: 1.5;
  }

  .cr-changes {
    background: var(--bg-0);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 1rem;
    margin: 1rem 0;
  }

  .changes-title {
    font-size: 0.875rem;
    font-weight: 600;
    margin: 0 0 0.75rem 0;
    color: var(--text);
  }

  .changes-list {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .change-item {
    display: flex;
    gap: 0.5rem;
    font-size: 0.875rem;
  }

  .change-field {
    font-weight: 500;
    color: var(--muted);
    min-width: 100px;
  }

  .change-value {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .old-value {
    color: var(--danger);
    text-decoration: line-through;
  }

  .arrow {
    color: var(--muted);
  }

  .new-value {
    color: var(--ok);
    font-weight: 500;
  }

  .cr-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border);
  }

  .admin-actions {
    display: flex;
    gap: 0.5rem;
  }

  button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 4px;
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

  .btn-danger {
    background: var(--danger);
    color: white;
  }

  .btn-danger:hover {
    opacity: 0.9;
  }

  .btn-success {
    background: var(--ok);
    color: white;
  }

  .btn-success:hover {
    opacity: 0.9;
  }

  .btn-primary {
    background: var(--accent-1);
    color: white;
  }

  .btn-primary:hover {
    opacity: 0.9;
  }

  button:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }
</style>