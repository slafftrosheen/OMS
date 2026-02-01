<script lang="ts">
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import { t } from 'svelte-i18n';
  import { currentUser } from '$lib/auth/user-store';
  import { UserPlus, Edit2, Trash2, Key, Search, X, Check, AlertCircle } from 'lucide-svelte';

  interface User {
    id: number;
    username: string;
    displayName: string;
    email?: string;
    primarySection: string;
    sections: string[];
    roles: Record<string, string>;
    stations: string[];
    isActive: boolean;
    lastLoginAt?: string;
    createdAt?: string;
  }

  let users: User[] = [];
  let loading = true;
  let error = '';
  let searchQuery = '';
  let showInactive = false;

  // Modal state
  let showModal = false;
  let modalMode: 'create' | 'edit' | 'password' = 'create';
  let editingUser: User | null = null;
  let saving = false;
  let modalError = '';
  let successMessage = '';

  // Form data
  let formData = {
    username: '',
    displayName: '',
    email: '',
    password: '',
    primarySection: 'Production',
    sections: ['Production'] as string[],
    roles: {
      Admin: 'Viewer',
      Production: 'Operator',
      Logistics: 'Viewer'
    } as Record<string, string>,
    stations: [] as string[],
    isActive: true
  };

  const allSections = ['Admin', 'Production', 'Logistics'];
  const allRoles = ['SuperAdmin', 'StationLead', 'Operator', 'Viewer'];
  const allStations = ['CNC', 'SANDING', 'PAINTING', 'ASSEMBLY', 'WELDING', 'LOGISTICS', 'QUALITY'];

  $: filteredUsers = users.filter(u => {
    const matchesSearch = searchQuery === '' ||
      u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.displayName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesActive = showInactive || u.isActive;
    return matchesSearch && matchesActive;
  });

  $: canManageUsers = $currentUser?.roles?.Admin === 'SuperAdmin';

  onMount(async () => {
    await loadUsers();
  });

  async function loadUsers() {
    loading = true;
    error = '';
    try {
      const res = await fetch(`${base}/api/users?active=false`);
      if (res.ok) {
        users = await res.json();
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
      primarySection: 'Production',
      sections: ['Production'],
      roles: { Admin: 'Viewer', Production: 'Operator', Logistics: 'Viewer' },
      stations: [],
      isActive: true
    };
    modalError = '';
    showModal = true;
  }

  function openEditModal(user: User) {
    modalMode = 'edit';
    editingUser = user;
    formData = {
      username: user.username,
      displayName: user.displayName,
      email: user.email || '',
      password: '',
      primarySection: user.primarySection,
      sections: [...user.sections],
      roles: { ...user.roles },
      stations: [...user.stations],
      isActive: user.isActive
    };
    modalError = '';
    showModal = true;
  }

  function openPasswordModal(user: User) {
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

  function toggleSection(section: string) {
    if (formData.sections.includes(section)) {
      formData.sections = formData.sections.filter(s => s !== section);
      if (formData.primarySection === section) {
        formData.primarySection = formData.sections[0] || 'Production';
      }
    } else {
      formData.sections = [...formData.sections, section];
    }
  }

  function toggleStation(station: string) {
    if (formData.stations.includes(station)) {
      formData.stations = formData.stations.filter(s => s !== station);
    } else {
      formData.stations = [...formData.stations, station];
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

    if (formData.sections.length === 0) {
      modalError = $t('admin.users.messages.validation.section_required');
      return;
    }

    saving = true;
    modalError = '';

    try {
      const payload: any = {
        displayName: formData.displayName,
        email: formData.email || null,
        primarySection: formData.primarySection,
        sections: formData.sections,
        roles: formData.roles,
        stations: formData.stations,
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

  async function deactivateUser(user: User) {
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

  async function reactivateUser(user: User) {
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

  function getRoleBadgeClass(role: string) {
    switch (role) {
      case 'SuperAdmin': return 'badge-admin';
      case 'StationLead': return 'badge-lead';
      case 'Operator': return 'badge-operator';
      default: return 'badge-viewer';
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
      <button class="btn-primary" on:click={openCreateModal}>
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
            <th>{$t('admin.users.table.section')}</th>
            <th>{$t('admin.users.table.roles')}</th>
            <th>{$t('admin.users.table.stations')}</th>
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
                <span class="section-badge">{user.primarySection}</span>
                {#if user.sections.length > 1}
                  <span class="extra-sections">+{user.sections.length - 1}</span>
                {/if}
              </td>
              <td>
                <span class="role-badge {getRoleBadgeClass(user.roles[user.primarySection])}">
                  {user.roles[user.primarySection]}
                </span>
              </td>
              <td>
                {#if user.stations.length > 0}
                  <div class="stations-list">
                    {#each user.stations.slice(0, 2) as station}
                      <span class="station-tag">{station}</span>
                    {/each}
                    {#if user.stations.length > 2}
                      <span class="extra-stations">+{user.stations.length - 2}</span>
                    {/if}
                  </div>
                {:else}
                  <span class="no-stations">{$t('admin.users.all_stations')}</span>
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
                  <button class="btn-icon" title={$t('admin.users.edit')} on:click={() => openEditModal(user)}>
                    <Edit2 size={16} />
                  </button>
                  <button class="btn-icon" title={$t('admin.users.reset_password')} on:click={() => openPasswordModal(user)}>
                    <Key size={16} />
                  </button>
                  {#if user.isActive}
                    <button class="btn-icon btn-danger" title={$t('admin.users.status.inactive')} on:click={() => deactivateUser(user)}>
                      <Trash2 size={16} />
                    </button>
                  {:else}
                    <button class="btn-icon btn-success" title={$t('admin.users.status.active')} on:click={() => reactivateUser(user)}>
                      <Check size={16} />
                    </button>
                  {/if}
                </td>
              {/if}
            </tr>
          {:else}
            <tr>
              <td colspan={canManageUsers ? 7 : 6} class="empty-state">
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
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="modal-backdrop" on:click={closeModal}>
    <div 
      class="modal" 
      on:click|stopPropagation 
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
        <button class="btn-close" on:click={closeModal}>
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
            <label id="sections-label">{$t('admin.users.form.sections')}</label>
            <div class="checkbox-group" role="group" aria-labelledby="sections-label">
              {#each allSections as section}
                <label class="checkbox-item">
                  <input 
                    type="checkbox" 
                    checked={formData.sections.includes(section)}
                    on:change={() => toggleSection(section)}
                  />
                  {section}
                </label>
              {/each}
            </div>
          </div>

          <div class="form-group">
            <label for="primary-section">{$t('admin.users.form.primary_section')}</label>
            <select id="primary-section" bind:value={formData.primarySection}>
              {#each formData.sections as section}
                <option value={section}>{section}</option>
              {/each}
            </select>
          </div>

          <div class="form-group">
            <label id="roles-per-section-label">{$t('admin.users.form.roles_per_section')}</label>
            <div class="roles-grid" role="group" aria-labelledby="roles-per-section-label">
              {#each formData.sections as section}
                <div class="role-row">
                  <span class="role-section">{section}</span>
                  <select bind:value={formData.roles[section]}>
                    {#each allRoles as role}
                      <option value={role}>{role}</option>
                    {/each}
                  </select>
                </div>
              {/each}
            </div>
          </div>

          <div class="form-group">
            <label id="station-assignments-label">{$t('admin.users.form.station_assignments')}</label>
            <div class="checkbox-group stations-group" role="group" aria-labelledby="station-assignments-label">
              {#each allStations as station}
                <label class="checkbox-item">
                  <input 
                    type="checkbox" 
                    checked={formData.stations.includes(station)}
                    on:change={() => toggleStation(station)}
                  />
                  {station}
                </label>
              {/each}
            </div>
            <small>{$t('admin.users.form.all_stations_hint')}</small>
          </div>

          {#if modalMode === 'edit'}
            <div class="form-group">
              <label id="permissions-label">{$t('admin.users.form.permissions')}</label>
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
        <button class="btn-secondary" on:click={closeModal} disabled={saving}>
          {$t('actions.cancel')}
        </button>
        <button class="btn-primary" on:click={saveUser} disabled={saving}>
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
    background: var(--accent, #3b82f6);
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--accent-hover, #2563eb);
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
    background: #ecfdf5;
    color: #065f46;
    border: 1px solid #a7f3d0;
  }

  .alert-error {
    background: #fef2f2;
    color: #991b1b;
    border: 1px solid #fecaca;
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
    background: var(--accent, #3b82f6);
    color: white;
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

  .badge-admin { background: #fef3c7; color: #92400e; }
  .badge-lead { background: #dbeafe; color: #1e40af; }
  .badge-operator { background: #d1fae5; color: #065f46; }
  .badge-viewer { background: var(--bg-2); color: var(--text-2); }

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

  .status-badge.active { background: #d1fae5; color: #065f46; }
  .status-badge.inactive { background: #fee2e2; color: #991b1b; }

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
    background: #fee2e2;
    color: #991b1b;
    border-color: #fecaca;
  }

  .btn-icon.btn-success:hover {
    background: #d1fae5;
    color: #065f46;
    border-color: #a7f3d0;
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
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
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

  .form-group label {
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
    border-color: var(--accent, #3b82f6);
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

  .stations-group {
    gap: 8px;
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
