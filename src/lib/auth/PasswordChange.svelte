<script lang="ts">
  import { preventDefault } from 'svelte/legacy';

  import { base } from '$app/paths';
  import Icon from '$lib/ui/Icon.svelte';
  import { t } from 'svelte-i18n';

  let currentPassword = $state('');
  let newPassword = $state('');
  let confirmPassword = $state('');
  let saving = $state(false);
  let error = $state('');
  let success = $state('');
  let showCurrent = $state(false);
  let showNew = $state(false);

  async function changePassword() {
    error = '';
    success = '';

    if (!currentPassword || !newPassword || !confirmPassword) {
      error = 'All fields are required';
      return;
    }

    if (newPassword.length < 8) {
      error = 'New password must be at least 8 characters';
      return;
    }

    if (newPassword !== confirmPassword) {
      error = 'New passwords do not match';
      return;
    }

    saving = true;

    try {
      const res = await fetch(`${base}/api/auth/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword })
      });

      if (res.ok) {
        success = 'Password changed successfully';
        currentPassword = '';
        newPassword = '';
        confirmPassword = '';
      } else {
        const data = await res.json();
        error = data.error || 'Failed to change password';
      }
    } catch (e) {
      error = 'Failed to connect to server';
    } finally {
      saving = false;
    }

    if (success) {
      setTimeout(() => success = '', 5000);
    }
  }
</script>

<div class="card password-card">
  <h3><Lock size={18} /> {$t('settings.password.title', { default: 'Change Password' })}</h3>

  {#if success}
    <div class="alert alert-success">
      <Check size={16} />
      {success}
    </div>
  {/if}

  {#if error}
    <div class="alert alert-error">
      <AlertCircle size={16} />
      {error}
    </div>
  {/if}

  <form onsubmit={preventDefault(changePassword)}>
    <div class="form-group">
      <label for="current-password">{$t('settings.password.current', { default: 'Current Password' })}</label>
      <div class="password-input">
        {#if showCurrent}
          <input type="text" id="current-password" bind:value={currentPassword} />
        {:else}
          <input type="password" id="current-password" bind:value={currentPassword} />
        {/if}
        <button type="button" class="toggle-visibility" onclick={() => showCurrent = !showCurrent}>
          {#if showCurrent}<EyeOff size={16} />{:else}<Eye size={16} />{/if}
        </button>
      </div>
    </div>

    <div class="form-group">
      <label for="new-password">{$t('settings.password.new', { default: 'New Password' })}</label>
      <div class="password-input">
        {#if showNew}
          <input type="text" id="new-password" bind:value={newPassword} />
        {:else}
          <input type="password" id="new-password" bind:value={newPassword} />
        {/if}
        <button type="button" class="toggle-visibility" onclick={() => showNew = !showNew}>
          {#if showNew}<EyeOff size={16} />{:else}<Eye size={16} />{/if}
        </button>
      </div>
      <small>{$t('settings.password.hint', { default: 'Minimum 8 characters' })}</small>
    </div>

    <div class="form-group">
      <label for="confirm-password">{$t('settings.password.confirm', { default: 'Confirm New Password' })}</label>
      <input type="password" id="confirm-password" bind:value={confirmPassword} />
    </div>

    <button type="submit" class="btn-primary" disabled={saving}>
      {#if saving}Saving...{:else}{$t('settings.password.submit', { default: 'Change Password' })}{/if}
    </button>
  </form>
</div>

<style>
  .password-card {
    background: var(--bg-2);
  }

  h3 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 16px 0;
    font-size: 16px;
    font-weight: 600;
  }

  .alert {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-radius: 6px;
    margin-bottom: 16px;
    font-size: 13px;
  }

  .alert-success {
    background: var(--ok-soft);
    color: color-mix(in oklab, var(--ok) 60%, black);
    border: 1px solid color-mix(in oklab, var(--ok) 35%, transparent);
  }

  .alert-error {
    background: var(--error-soft);
    color: color-mix(in oklab, var(--error) 85%, black);
    border: 1px solid color-mix(in oklab, var(--error) 30%, transparent);
  }

  .form-group {
    margin-bottom: 16px;
  }

  label {
    display: block;
    margin-bottom: 6px;
    font-size: 13px;
    font-weight: 500;
    color: var(--text);
  }

  input {
    width: 100%;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: 6px;
    font-size: 14px;
    background: var(--bg-0);
    color: var(--text);
  }

  input:focus {
    outline: none;
    border-color: var(--accent, var(--brand));
  }

  .password-input {
    position: relative;
    display: flex;
    align-items: center;
  }

  .password-input input {
    padding-right: 36px;
  }

  .toggle-visibility {
    position: absolute;
    right: 8px;
    padding: 4px;
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--text-2);
    display: flex;
    align-items: center;
  }

  .toggle-visibility:hover {
    color: var(--text);
  }

  small {
    display: block;
    margin-top: 4px;
    font-size: 12px;
    color: var(--text-2);
  }

  .btn-primary {
    width: 100%;
    padding: 10px 16px;
    background: var(--accent, var(--brand));
    color: var(--bg-0);
    border: none;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--accent-hover, var(--brand));
  }

  .btn-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
