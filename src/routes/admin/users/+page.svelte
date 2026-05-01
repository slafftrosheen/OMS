<script lang="ts">
  import AlertCircle from 'lucide-svelte/icons/alert-circle';
  import Check from 'lucide-svelte/icons/check';
  import Edit2 from 'lucide-svelte/icons/edit-2';
  import Key from 'lucide-svelte/icons/key';
  import Search from 'lucide-svelte/icons/search';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import UserPlus from 'lucide-svelte/icons/user-plus';
  import X from 'lucide-svelte/icons/x';

  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import { t } from 'svelte-i18n';
  import { currentUser } from '$lib/auth/authState.svelte';
  import Icon from '$lib/ui/Icon.svelte';

  import type { Role, StationId } from '$lib/auth/types';
  import { ROLE_LABELS, STATION_LABELS, STATION_IDS } from '$lib/auth/types';

  interface AdminUser {
    id: string;
    username: string;
    displayName: string;
    email?: string;
    role: Role;
    stations: { stationId: StationId; isHead: boolean }[];
    isActive: boolean;
    lastLoginAt?: string;
    createdAt?: string;
    avatarUrl?: string;
  }

  const ALL_ROLES: Role[] = ['RD', 'Boss', 'HeadOfProduction', 'StationHead', 'Operator'];

  let users: AdminUser[] = $state([]);
  let loading = $state(true);
  let error = $state('');
  let searchQuery = $state('');
  let showInactive = $state(false);

  // Modal state
  let showModal = $state(false);
  let modalMode: 'create' | 'edit' | 'password' = $state('create');
  let editingUser: AdminUser | null = $state(null);
  let saving = $state(false);
  let modalError = $state('');
  let successMessage = $state('');

  // Form data
  let formData = $state({
    username: '',
    displayName: '',
    email: '',
    password: '',
    role: 'Operator' as Role,
    stations: [] as StationId[],
    stationHeads: [] as StationId[],  // stations where user is head
    isActive: true
  });

  let filteredUsers = $derived(users.filter(u => {
    const matchesSearch = searchQuery === '' ||
      u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.displayName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesActive = showInactive || u.isActive;
    return matchesSearch && matchesActive;
  }));

  let canManageUsers = $derived(
    $currentUser?.role === 'RD' || $currentUser?.role === 'Boss'
  );

  onMount(async () => {
    await loadUsers();
  });

  async function loadUsers() {
    loading = true;
    error = '';
    try {
      const res = await fetch(`${base}/api/users?active=false`);
      if (res.ok) {
        const raw: any[] = await res.json();
        users = raw.map(u => ({
          id: u.id,
          username: u.username ?? '',
          displayName: u.displayName ?? u.display_name ?? u.username ?? '',
          email: u.email,
          avatarUrl: u.avatarUrl ?? u.avatar_url,
          role: u.role ?? 'Operator',
          stations: Array.isArray(u.stations)
            ? u.stations.map((s: any) =>
                typeof s === 'string' ? { stationId: s as StationId, isHead: false } : s
              )
            : [],
          isActive: u.isActive ?? u.is_active ?? true,
          lastLoginAt: u.lastLoginAt ?? u.last_login_at,
          createdAt: u.createdAt ?? u.created_at,
        }));
      } else {
        error = 'Failed to load users';
      }
    } catch (e) {
      error = 'Failed to connect to server';
    } finally {
      loading = false;
    }
  }

  function openCreateModal() {
    modalMode = 'create';
    editingUser = null;
    formData = {
      username: '',
      displayName: '',
      email: '',
      password: '',
      role: 'Operator',
      stations: [],
      stationHeads: [],
      isActive: true
    };
    modalError = '';
    showModal = true;
  }

  function openEditModal(user: AdminUser) {
    modalMode = 'edit';
    editingUser = user;
    formData = {
      username: user.username,
      displayName: user.displayName,
      email: user.email || '',
      password: '',
      role: user.role,
      stations: user.stations.map(s => s.stationId),
      stationHeads: user.stations.filter(s => s.isHead).map(s => s.stationId),
      isActive: user.isActive
    };
    modalError = '';
    showModal = true;
  }

  function openPasswordModal(user: AdminUser) {
    modalMode = 'password';
    editingUser = user;
    formData.password = '';
    modalError = '';
    showModal = true;
  }

  function closeModal() {
    showModal = false;
    editingUser = null;
    modalError = '';
  }

  function toggleStation(stationId: StationId) {
    if (formData.stations.includes(stationId)) {
      formData.stations = formData.stations.filter(s => s !== stationId);
      formData.stationHeads = formData.stationHeads.filter(s => s !== stationId);
    } else {
      formData.stations = [...formData.stations, stationId];
    }
  }

  function toggleStationHead(stationId: StationId) {
    if (formData.stationHeads.includes(stationId)) {
      formData.stationHeads = formData.stationHeads.filter(s => s !== stationId);
    } else {
      if (!formData.stations.includes(stationId)) {
        formData.stations = [...formData.stations, stationId];
      }
      formData.stationHeads = [...formData.stationHeads, stationId];
    }
  }

  async function saveUser() {
    if (modalMode === 'password') {
      await resetPassword();
      return;
    }

    if (!formData.username || !formData.displayName) {
      modalError = $t('admin.users.messages.validation.required');
      return;
    }

    if (modalMode === 'create' && !formData.password) {
      modalError = $t('admin.users.messages.validation.password_required');
      return;
    }

    saving = true;
    modalError = '';

    try {
      const payload: any = {
        displayName: formData.displayName,
        email: formData.email || null,
        role: formData.role,
        stations: formData.stations.map(sid => ({
          stationId: sid,
          isHead: formData.stationHeads.includes(sid)
        })),
        isActive: formData.isActive
      };

      if (modalMode === 'create') {
        payload.username = formData.username.toLowerCase();
        payload.password = formData.password;

        const res = await fetch(`${base}/api/users`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          successMessage = $t('admin.users.messages.created');
          closeModal();
          await loadUsers();
        } else {
          const data = await res.json();
          modalError = data.error || $t('admin.users.messages.save_error');
        }
      } else {
        const res = await fetch(`${base}/api/users/${editingUser!.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          successMessage = $t('admin.users.messages.updated');
          closeModal();
          await loadUsers();
        } else {
          const data = await res.json();
          modalError = data.error || $t('admin.users.messages.save_error');
        }
      }
    } catch (e) {
      modalError = 'Failed to connect to server';
    } finally {
      saving = false;
    }

    setTimeout(() => successMessage = '', 3000);
  }

  async function resetPassword() {
    if (!formData.password || formData.password.length < 8) {
      modalError = $t('admin.users.messages.validation.password_length');
      return;
    }

    saving = true;
    modalError = '';

    try {
      const res = await fetch(`${base}/api/users/${editingUser!.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset_password', newPassword: formData.password })
      });

      if (res.ok) {
        successMessage = $t('admin.users.messages.password_reset');
        closeModal();
      } else {
        const data = await res.json();
        modalError = data.error || $t('admin.users.messages.save_error');
      }
    } catch (e) {
      modalError = 'Failed to connect to server';
    } finally {
      saving = false;
    }

    setTimeout(() => successMessage = '', 3000);
  }

  async function deactivateUser(user: AdminUser) {
    if (!confirm($t('admin.users.messages.confirm_deactivate', { name: user.displayName }))) return;

    try {
      const res = await fetch(`${base}/api/users/${user.id}`, { method: 'DELETE' });
      if (res.ok) {
        successMessage = $t('admin.users.messages.deactivated');
        await loadUsers();
      } else {
        error = $t('admin.users.messages.save_error');
      }
    } catch (e) {
      error = 'Failed to connect to server';
    }

    setTimeout(() => successMessage = '', 3000);
  }

  async function reactivateUser(user: AdminUser) {
    try {
      const res = await fetch(`${base}/api/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: true })
      });
      if (res.ok) {
        successMessage = $t('admin.users.messages.reactivated');
        await loadUsers();
      }
    } catch (e) {
      error = $t('admin.users.messages.save_error');
    }

    setTimeout(() => successMessage = '', 3000);
  }

  function getRoleBadgeClass(role: Role) {
    switch (role) {
      case 'RD':               return 'badge-rd';
      case 'Boss':             return 'badge-boss';
      case 'HeadOfProduction': return 'badge-hop';
      case 'StationHead':      return 'badge-lead';
      default:                 return 'badge-operator';
    }
  }

  function formatDate(dateStr?: string) {
    if (!dateStr) return $t('admin.users.never');
    return new Date(dateStr).toLocaleDateString('en-GB', { 
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' 
    });
  }
</script>

<svelte:head>
  <title>User Management - Admin</title>
</svelte:head>

<div class="users-page">
  <header class="page-header">
    <div>
      <h1>{$t('admin.users.title')}</h1>
      <p class="subtitle">{$t('admin.users.subtitle')}</p>
    </div>
    {#if canManageUsers}
      <button class="btn-primary" onclick={openCreateModal}>
        <UserPlus size={18} />
        {$t('admin.users.add')}
      </button>
    {/if}
  </header>

  {#if successMessage}
    <div class="alert alert-success">
      <Check size={18} />
      {successMessage}
    </div>
  {/if}

  {#if error}
    <div class="alert alert-error">
      <AlertCircle size={18} />
      {error}
    </div>
  {/if}

  <div class="controls">
    <div class="search-box">
      <Search size={18} />
      <input type="text" placeholder={$t('a11y.search')} bind:value={searchQuery} />
    </div>
    <label class="checkbox-label">
      <input type="checkbox" bind:checked={showInactive} />
      {$t('admin.users.show_inactive')}
    </label>
  </div>

  {#if loading}
    <div class="loading">{$t('admin.users.loading')}</div>
  {:else}
    <div class="users-table-wrapper">
      <table class="users-table">
        <thead>
          <tr>
            <th>{$t('admin.users.table.user')}</th>
            <th>Role</th>
            <th>Stations</th>
            <th>{$t('admin.users.table.status')}</th>
            <th>{$t('admin.users.table.last_login')}</th>
            {#if canManageUsers}
              <th>{$t('admin.users.table.actions')}</th>
            {/if}
          </tr>
        </thead>
        <tbody>
          {#each filteredUsers as user}
            <tr class:inactive={!user.isActive}>
              <td class="user-cell">
                <div class="user-info">
                  <span class="user-avatar">{user.displayName.charAt(0).toUpperCase()}</span>
                  <div>
                    <div class="user-name">{user.displayName}</div>
                    <div class="user-username">@{user.username}</div>
                  </div>
                </div>
              </td>
              <td>
                <span class="role-badge {getRoleBadgeClass(user.role)}">
                  {ROLE_LABELS[user.role] ?? user.role}
                </span>
              </td>
              <td>
                {#if user.stations.length > 0}
                  <div class="stations-list">
                    {#each user.stations.slice(0, 2) as s}
                      <span class="station-tag" class:head={s.isHead}>
                        {STATION_LABELS[s.stationId] ?? s.stationId}{s.isHead ? ' ★' : ''}
                      </span>
                    {/each}
                    {#if user.stations.length > 2}
                      <span class="extra-stations">+{user.stations.length - 2}</span>
                    {/if}
                  </div>
                {:else}
                  <span class="no-stations">—</span>
                {/if}
              </td>
              <td>
                <span class="status-badge" class:active={user.isActive} class:inactive={!user.isActive}>
                  {user.isActive ? $t('admin.users.status.active') : $t('admin.users.status.inactive')}
                </span>
              </td>
              <td class="date-cell">{formatDate(user.lastLoginAt)}</td>
              {#if canManageUsers}
                <td class="actions-cell">
                  <button class="btn-icon" title={$t('admin.users.edit')} onclick={() => openEditModal(user)}>
                    <Edit2 size={16} />
                  </button>
                  <button class="btn-icon" title={$t('admin.users.reset_password')} onclick={() => openPasswordModal(user)}>
                    <Key size={16} />
                  </button>
                  {#if user.isActive}
                    <button class="btn-icon btn-danger" title={$t('admin.users.status.inactive')} onclick={() => deactivateUser(user)}>
                      <Trash2 size={16} />
                    </button>
                  {:else}
                    <button class="btn-icon btn-success" title={$t('admin.users.status.active')} onclick={() => reactivateUser(user)}>
                      <Check size={16} />
                    </button>
                  {/if}
                </td>
              {/if}
            </tr>
          {:else}
            <tr>
              <td colspan={canManageUsers ? 6 : 5} class="empty-state">
                {$t('admin.users.no_users')}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<!-- Modal -->
{#if showModal}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="modal-backdrop" onclick={closeModal}>
    <div 
      class="modal" 
      onclick={(e) => e.stopPropagation()} 
      role="dialog" 
      aria-modal="true"
      tabindex="-1"
    >
      <div class="modal-header">
        <h2>
          {#if modalMode === 'create'}{$t('admin.users.add')}
          {:else if modalMode === 'edit'}{$t('admin.users.edit')}
          {:else}{$t('admin.users.reset_password')}
          {/if}
        </h2>
        <button class="btn-close" onclick={closeModal}>
          <X size={20} />
        </button>
      </div>

      {#if modalError}
        <div class="alert alert-error modal-alert">
          <AlertCircle size={18} />
          {modalError}
        </div>
      {/if}

      <div class="modal-body">
        {#if modalMode === 'password'}
          <div class="form-group">
            <label for="new-password">{$t('admin.users.form.new_password')}</label>
            <input 
              type="password" 
              id="new-password" 
              bind:value={formData.password}
              placeholder={$t('admin.users.form.placeholders.new_password')}
            />
          </div>
        {:else}
          <div class="form-row">
            <div class="form-group">
              <label for="username">{$t('admin.users.form.username')}</label>
              <input 
                type="text" 
                id="username" 
                bind:value={formData.username}
                disabled={modalMode === 'edit'}
                placeholder={$t('admin.users.form.placeholders.username')}
              />
            </div>
            <div class="form-group">
              <label for="display-name">{$t('admin.users.form.display_name')}</label>
              <input 
                type="text" 
                id="display-name" 
                bind:value={formData.displayName}
                placeholder={$t('admin.users.form.placeholders.display_name')}
              />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="email">{$t('admin.users.form.email')}</label>
              <input 
                type="email" 
                id="email" 
                bind:value={formData.email}
                placeholder={$t('admin.users.form.placeholders.email')}
              />
            </div>
            {#if modalMode === 'create'}
              <div class="form-group">
                <label for="password">{$t('admin.users.form.password')}</label>
                <input 
                  type="password" 
                  id="password" 
                  bind:value={formData.password}
                  placeholder={$t('admin.users.form.placeholders.password')}
                />
              </div>
            {/if}
          </div>

          <div class="form-group">
            <label for="user-role">Role</label>
            <select id="user-role" bind:value={formData.role}>
              {#each ALL_ROLES as r}
                <option value={r}>{ROLE_LABELS[r]}</option>
              {/each}
            </select>
          </div>

          <div class="form-group">
            <span class="group-label" id="station-assignments-label">Station Assignments</span>
            <p class="form-hint">Check a station to assign. Star (★) marks the station head.</p>
            <div class="stations-grid" role="group" aria-labelledby="station-assignments-label">
              {#each STATION_IDS as sid}
                {@const assigned = formData.stations.includes(sid)}
                {@const isHead = formData.stationHeads.includes(sid)}
                <div class="station-assign-row">
                  <label class="checkbox-item">
                    <input
                      type="checkbox"
                      checked={assigned}
                      onchange={() => toggleStation(sid)}
                    />
                    {STATION_LABELS[sid]}
                  </label>
                  {#if assigned && formData.role === 'StationHead'}
                    <label class="checkbox-item head-toggle" title="Station Head for this station">
                      <input
                        type="checkbox"
                        checked={isHead}
                        onchange={() => toggleStationHead(sid)}
                      />
                      ★ Head</label>
                  {/if}
                </div>
              {/each}
            </div>
          </div>

          {#if modalMode === 'edit'}
            <div class="form-group">
              <span class="group-label" id="permissions-label">{$t('admin.users.form.permissions')}</span>
              <div class="checkbox-group" role="group" aria-labelledby="permissions-label">
                <label class="checkbox-item">
                  <input type="checkbox" bind:checked={formData.isActive} />
                  {$t('admin.users.form.is_active')}
                </label>
              </div>
            </div>
          {/if}
        {/if}
      </div>

      <div class="modal-footer">
        <button class="btn-secondary" onclick={closeModal} disabled={saving}>
          {$t('actions.cancel')}
        </button>
        <button class="btn-primary" onclick={saveUser} disabled={saving}>
          {#if saving}{$t('actions.saving')}{:else}{$t('ui.save')}{/if}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .users-page {
    padding: 24px;
    max-width: 1400px;
    margin: 0 auto;
  }

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 24px;
  }

  h1 {
    margin: 0;
    font-size: 28px;
    font-weight: 700;
    color: var(--text);
  }

  .subtitle {
    margin: 4px 0 0 0;
    color: var(--text-2);
    font-size: 14px;
  }

  .btn-primary {
    display: flex;
    align-items: center;
    gap: 8px;
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

  .btn-secondary {
    padding: 10px 16px;
    background: var(--bg-2);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
  }

  .btn-secondary:hover:not(:disabled) {
    background: var(--bg-3);
  }

  .alert {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    border-radius: 6px;
    margin-bottom: 16px;
    font-size: 14px;
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

  .controls {
    display: flex;
    gap: 16px;
    align-items: center;
    margin-bottom: 20px;
  }

  .search-box {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: 6px;
    flex: 1;
    max-width: 300px;
  }

  .search-box input {
    border: none;
    background: transparent;
    outline: none;
    font-size: 14px;
    color: var(--text);
    width: 100%;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    color: var(--text-2);
    cursor: pointer;
  }

  .loading {
    text-align: center;
    padding: 40px;
    color: var(--text-2);
  }

  .users-table-wrapper {
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
  }

  .users-table {
    width: 100%;
    border-collapse: collapse;
  }

  .users-table th {
    text-align: left;
    padding: 12px 16px;
    background: var(--bg-2);
    font-size: 12px;
    font-weight: 600;
    color: var(--text-2);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-bottom: 1px solid var(--border);
  }

  .users-table td {
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
    font-size: 14px;
  }

  .users-table tr:last-child td {
    border-bottom: none;
  }

  .users-table tr.inactive {
    opacity: 0.6;
  }

  .user-cell {
    min-width: 200px;
  }

  .user-info {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .user-avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--accent, var(--brand));
    color: var(--bg-0);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: 14px;
  }

  .user-name {
    font-weight: 500;
    color: var(--text);
  }

  .user-username {
    font-size: 12px;
    color: var(--text-2);
  }

  .section-badge {
    display: inline-block;
    padding: 4px 8px;
    background: var(--bg-2);
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
  }

  .extra-sections, .extra-stations {
    font-size: 11px;
    color: var(--text-2);
    margin-left: 4px;
  }

  .role-badge {
    display: inline-block;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
  }

  .badge-rd       { background: color-mix(in oklab, var(--brand) 15%, transparent); color: var(--brand); border: 1px solid color-mix(in oklab, var(--brand) 30%, transparent); }
  .badge-boss     { background: color-mix(in oklab, var(--warn) 15%, transparent); color: color-mix(in oklab, var(--warn) 70%, black); border: 1px solid color-mix(in oklab, var(--warn) 30%, transparent); }
  .badge-hop      { background: color-mix(in oklab, var(--ok) 12%, transparent); color: color-mix(in oklab, var(--ok) 65%, black); border: 1px solid color-mix(in oklab, var(--ok) 25%, transparent); }
  .badge-lead     { background: var(--bg-2); color: var(--text); border: 1px solid var(--border); }
  .badge-operator { background: var(--bg-1); color: var(--text-2); border: 1px solid var(--border); }

  .stations-list {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .station-tag {
    display: inline-block;
    padding: 2px 6px;
    background: var(--bg-2);
    border-radius: 3px;
    font-size: 11px;
    text-transform: uppercase;
  }

  .no-stations {
    font-size: 12px;
    color: var(--text-2);
    font-style: italic;
  }

  .status-badge {
    display: inline-block;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
  }

  .status-badge.active { background: var(--ok-soft); color: color-mix(in oklab, var(--ok) 60%, black); }
  .status-badge.inactive { background: var(--error-soft); color: color-mix(in oklab, var(--error) 85%, black); }

  .date-cell {
    font-size: 12px;
    color: var(--text-2);
    white-space: nowrap;
  }

  .actions-cell {
    white-space: nowrap;
  }

  .btn-icon {
    padding: 6px;
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 4px;
    cursor: pointer;
    color: var(--text-2);
    margin-right: 4px;
  }

  .btn-icon:hover {
    background: var(--bg-2);
    color: var(--text);
  }

  .btn-icon.btn-danger:hover {
    background: var(--error-soft);
    color: color-mix(in oklab, var(--error) 85%, black);
    border-color: color-mix(in oklab, var(--error) 30%, transparent);
  }

  .btn-icon.btn-success:hover {
    background: var(--ok-soft);
    color: color-mix(in oklab, var(--ok) 60%, black);
    border-color: color-mix(in oklab, var(--ok) 35%, transparent);
  }

  .empty-state {
    text-align: center;
    padding: 40px;
    color: var(--text-2);
  }

  /* Modal */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: color-mix(in oklab, var(--bg-0) 55%, transparent);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--z-modal);
    padding: 20px;
  }

  .modal {
    background: var(--bg-1);
    border-radius: 12px;
    width: 100%;
    max-width: 560px;
    max-height: 90vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 24px;
    border-bottom: 1px solid var(--border);
  }

  .modal-header h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
  }

  .btn-close {
    padding: 4px;
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--text-2);
    border-radius: 4px;
  }

  .btn-close:hover {
    background: var(--bg-2);
    color: var(--text);
  }

  .modal-alert {
    margin: 16px 24px 0;
  }

  .modal-body {
    padding: 24px;
    overflow-y: auto;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    padding: 16px 24px;
    border-top: 1px solid var(--border);
  }

  .form-group {
    margin-bottom: 20px;
  }

  .form-group:last-child {
    margin-bottom: 0;
  }

  .form-group label,
  .group-label {
    display: block;
    margin-bottom: 6px;
    font-size: 14px;
    font-weight: 500;
    color: var(--text);
  }

  .form-group input[type="text"],
  .form-group input[type="email"],
  .form-group input[type="password"],
  .form-group select {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 6px;
    font-size: 14px;
    background: var(--bg-0);
    color: var(--text);
  }

  .form-group input:focus,
  .form-group select:focus {
    outline: none;
    border-color: var(--accent, var(--brand));
  }

  .form-group input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .form-group small {
    display: block;
    margin-top: 4px;
    font-size: 12px;
    color: var(--text-2);
  }

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }

  .checkbox-group {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }

  .checkbox-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
    cursor: pointer;
  }

  .stations-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 6px;
    margin-top: 8px;
  }

  .station-assign-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: var(--radius-sm);
    background: var(--bg-0);
    border: 1px solid var(--border);
  }

  .head-toggle {
    color: var(--warn);
    font-size: 12px;
    white-space: nowrap;
  }

  .station-tag.head {
    border-color: var(--warn);
    color: var(--warn);
  }

  .form-hint {
    font-size: 12px;
    color: var(--text-3);
    margin: 2px 0 8px;
  }

  .roles-grid {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .role-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .role-section {
    width: 100px;
    font-size: 13px;
    font-weight: 500;
  }

  .role-row select {
    flex: 1;
    padding: 8px 10px;
    font-size: 13px;
  }

  @media (max-width: 768px) {
    .page-header {
      flex-direction: column;
      gap: 16px;
    }

    .controls {
      flex-direction: column;
      align-items: stretch;
    }

    .search-box {
      max-width: none;
    }

    .form-row {
      grid-template-columns: 1fr;
    }

    .users-table-wrapper {
      overflow-x: auto;
    }
  }
</style>
