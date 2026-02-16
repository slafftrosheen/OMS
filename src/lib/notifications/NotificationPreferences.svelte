<script lang="ts">

/**
 * Notification Preferences Component
 * User interface for managing email notification settings
 */

import { onMount } from 'svelte';
import { Bell, BellOff, Clock, Mail, Save, Check } from 'lucide-svelte';

let preferences: any = $state(null);
let loading = $state(true);
let saving = $state(false);
let saved = $state(false);
let error: string | null = $state(null);

onMount(() => {
  loadPreferences();
});

async function loadPreferences() {
  loading = true;
  error = null;

  try {
    const response = await fetch('/api/notifications/preferences');
    if (!response.ok) throw new Error('Failed to load preferences');

    const result = await response.json();
    preferences = result.data;

  } catch (err) {
    console.error('Load error:', err);
    error = err instanceof Error ? err.message : 'Failed to load preferences';
  } finally {
    loading = false;
  }
}

async function savePreferences() {
  saving = true;
  saved = false;
  error = null;

  try {
    const response = await fetch('/api/notifications/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(preferences)
    });

    if (!response.ok) throw new Error('Failed to save preferences');

    const result = await response.json();
    preferences = result.data;
    saved = true;

    setTimeout(() => {
      saved = false;
    }, 3000);

  } catch (err) {
    console.error('Save error:', err);
    error = err instanceof Error ? err.message : 'Failed to save preferences';
  } finally {
    saving = false;
  }
}
</script>

<div class="notification-preferences">
  <div class="preferences-header">
    <h2>
      <Bell size={24} />
      Notification Preferences
    </h2>
    <p class="header-subtitle">
      Manage how and when you receive notifications
    </p>
  </div>

  {#if loading}
    <div class="loading">Loading preferences...</div>
  {:else if error}
    <div class="error" role="alert">{error}</div>
  {:else if preferences}
    <form onsubmit={preventDefault(savePreferences)}>
      <!-- Global Settings -->
      <section class="preferences-section">
        <h3>
          <Mail size={20} />
          Email Notifications
        </h3>
        
        <label class="toggle-field">
          <input
            type="checkbox"
            bind:checked={preferences.email_enabled}
          />
          <div class="toggle-label">
            <strong>Enable email notifications</strong>
            <span class="field-hint">Receive notifications via email</span>
          </div>
        </label>
      </section>

      {#if preferences.email_enabled}
        <!-- Order Notifications -->
        <section class="preferences-section">
          <h3>Order Notifications</h3>
          
          <div class="checkbox-group">
            <label class="checkbox-field">
              <input
                type="checkbox"
                bind:checked={preferences.order_created}
              />
              <span>Order created</span>
            </label>

            <label class="checkbox-field">
              <input
                type="checkbox"
                bind:checked={preferences.order_updated}
              />
              <span>Order updated</span>
            </label>

            <label class="checkbox-field">
              <input
                type="checkbox"
                bind:checked={preferences.order_assigned}
              />
              <span>Order assigned to me</span>
            </label>

            <label class="checkbox-field">
              <input
                type="checkbox"
                bind:checked={preferences.order_completed}
              />
              <span>Order completed</span>
            </label>
          </div>
        </section>

        <!-- Station Notifications -->
        <section class="preferences-section">
          <h3>Station Notifications</h3>
          
          <div class="checkbox-group">
            <label class="checkbox-field">
              <input
                type="checkbox"
                bind:checked={preferences.station_issue}
              />
              <span>Issues reported</span>
            </label>

            <label class="checkbox-field">
              <input
                type="checkbox"
                bind:checked={preferences.station_rework}
              />
              <span>Rework required</span>
            </label>

            <label class="checkbox-field">
              <input
                type="checkbox"
                bind:checked={preferences.station_quality_check}
              />
              <span>Quality check completed</span>
            </label>
          </div>
        </section>

        <!-- Loading Notifications -->
        <section class="preferences-section">
          <h3>Loading Notifications</h3>
          
          <div class="checkbox-group">
            <label class="checkbox-field">
              <input
                type="checkbox"
                bind:checked={preferences.loading_day_full}
              />
              <span>Loading day at capacity</span>
            </label>

            <label class="checkbox-field">
              <input
                type="checkbox"
                bind:checked={preferences.loading_reminder}
              />
              <span>Loading day reminders</span>
            </label>
          </div>
        </section>

        <!-- Other Notifications -->
        <section class="preferences-section">
          <h3>Other Notifications</h3>
          
          <div class="checkbox-group">
            <label class="checkbox-field">
              <input
                type="checkbox"
                bind:checked={preferences.comment_mentioned}
              />
              <span>Mentioned in comments</span>
            </label>

            <label class="checkbox-field">
              <input
                type="checkbox"
                bind:checked={preferences.photo_added}
              />
              <span>Photo added to order</span>
            </label>
          </div>
        </section>

        <!-- Digest Settings -->
        <section class="preferences-section">
          <h3>Digest Emails</h3>
          
          <label class="toggle-field">
            <input
              type="checkbox"
              bind:checked={preferences.daily_digest}
            />
            <div class="toggle-label">
              <strong>Daily digest</strong>
              <span class="field-hint">Summary of daily activities</span>
            </div>
          </label>

          <label class="toggle-field">
            <input
              type="checkbox"
              bind:checked={preferences.weekly_digest}
            />
            <div class="toggle-label">
              <strong>Weekly digest</strong>
              <span class="field-hint">Summary of weekly activities</span>
            </div>
          </label>

          {#if preferences.daily_digest || preferences.weekly_digest}
            <div class="field-group">
              <label for="digest-time">Digest delivery time</label>
              <input
                id="digest-time"
                type="time"
                bind:value={preferences.digest_time}
              />
            </div>
          {/if}
        </section>

        <!-- Quiet Hours -->
        <section class="preferences-section">
          <h3>
            <Clock size={20} />
            Quiet Hours
          </h3>
          
          <label class="toggle-field">
            <input
              type="checkbox"
              bind:checked={preferences.quiet_hours_enabled}
            />
            <div class="toggle-label">
              <strong>Enable quiet hours</strong>
              <span class="field-hint">Pause notifications during specific hours</span>
            </div>
          </label>

          {#if preferences.quiet_hours_enabled}
            <div class="time-range">
              <div class="field-group">
                <label for="quiet-start">From</label>
                <input
                  id="quiet-start"
                  type="time"
                  bind:value={preferences.quiet_hours_start}
                />
              </div>

              <div class="field-group">
                <label for="quiet-end">To</label>
                <input
                  id="quiet-end"
                  type="time"
                  bind:value={preferences.quiet_hours_end}
                />
              </div>
            </div>
          {/if}
        </section>
      {/if}

      <!-- Save Button -->
      <div class="form-actions">
        {#if saved}
          <div class="save-success">
            <Check size={16} />
            Preferences saved
          </div>
        {/if}

        <button
          type="submit"
          class="btn-primary"
          disabled={saving}
        >
          {#if saving}
            Saving...
          {:else}
            <Save size={16} />
            Save Preferences
          {/if}
        </button>
      </div>
    </form>
  {/if}
</div>

<style>
  .notification-preferences {
    max-width: 800px;
    margin: 0 auto;
    padding: 2rem;
  }

  .preferences-header {
    margin-bottom: 2rem;
  }

  .preferences-header h2 {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin: 0 0 0.5rem 0;
    font-size: 1.75rem;
    color: var(--text);
  }

  .header-subtitle {
    margin: 0;
    color: var(--muted);
  }

  .preferences-section {
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1.5rem;
    margin-bottom: 1.5rem;
  }

  .preferences-section h3 {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0 0 1rem 0;
    font-size: 1rem;
    color: var(--text);
  }

  .toggle-field {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 0.75rem;
    cursor: pointer;
    border-radius: 6px;
    transition: background 0.2s;
  }

  .toggle-field:hover {
    background: var(--bg-2);
  }

  .toggle-field input[type="checkbox"] {
    width: 20px;
    height: 20px;
    margin-top: 2px;
    cursor: pointer;
  }

  .toggle-label {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .toggle-label strong {
    color: var(--text);
  }

  .field-hint {
    font-size: 0.875rem;
    color: var(--muted);
  }

  .checkbox-group {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .checkbox-field {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem;
    cursor: pointer;
    border-radius: 4px;
    transition: background 0.2s;
  }

  .checkbox-field:hover {
    background: var(--bg-2);
  }

  .checkbox-field input {
    width: 18px;
    height: 18px;
    cursor: pointer;
  }

  .field-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 1rem;
  }

  .field-group label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text);
  }

  .field-group input[type="time"] {
    padding: 0.5rem;
    background: var(--bg-0);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text);
    font-size: 0.875rem;
  }

  .time-range {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    margin-top: 1rem;
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 1rem;
    padding-top: 1rem;
  }

  .save-success {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--ok);
    font-size: 0.875rem;
    font-weight: 500;
  }

  .btn-primary {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1.5rem;
    background: var(--accent-1);
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: opacity 0.2s;
  }

  .btn-primary:hover:not(:disabled) {
    opacity: 0.9;
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
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

  @media (max-width: 768px) {
    .notification-preferences {
      padding: 1rem;
    }

    .time-range {
      grid-template-columns: 1fr;
    }
  }
</style>