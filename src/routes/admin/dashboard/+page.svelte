<script lang="ts">
  export let params = {};
  import { base } from '$app/paths';
  import { currentUser } from '$lib/auth/user-store';
  import { can } from '$lib/auth/permission-utils';
  import { t } from 'svelte-i18n';
  
  $: user = $currentUser;
</script>

<svelte:head>
  <title>Admin Dashboard - Reclame OMS</title>
</svelte:head>

{#if user}
  <div class="dashboard-container">
    <header class="dashboard-header">
      <h1>{$t('sections.admin', 'Admin')} Dashboard</h1>
      <p class="subtitle">
        Welcome, {user.displayName}! 
        <span class="role-badge">{user.roles.Admin}</span>
      </p>
    </header>
    
    <div class="dashboard-grid">
      <div class="card">
        <h2>Quick Actions</h2>
        <div class="actions">
          {#if can(user, 'Admin', 'createOrder')}
            <a href="{base}/orders" class="action-btn">Create Order</a>
          {/if}
          {#if can(user, 'Admin', 'editInventory')}
            <a href="{base}/inventory" class="action-btn">Manage Inventory</a>
          {/if}
          {#if can(user, 'Admin', 'approveChange')}
            <a href="{base}/orders" class="action-btn">Approve Changes</a>
          {/if}
        </div>
      </div>
      
      <div class="card">
        <h2>Section Overview</h2>
        <p>Manage all aspects of the organization from this section.</p>
        <ul>
          <li>Order Management</li>
          <li>Inventory Control</li>
          <li>User Administration</li>
          <li>System Settings</li>
        </ul>
      </div>
      
      <div class="card">
        <h2>Your Sections</h2>
        <div class="section-list">
          {#each user.sections as section}
            <a href="{base}/{section.toLowerCase()}/dashboard" class="section-link">
              {section}
            </a>
          {/each}
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
.dashboard-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px;
}

.dashboard-header {
  margin-bottom: 32px;
}

.dashboard-header h1 {
  margin: 0 0 8px 0;
  font-size: 32px;
  font-weight: 700;
  color: var(--text);
}

.subtitle {
  margin: 0;
  font-size: 16px;
  color: var(--text-2);
}

.role-badge {
  display: inline-block;
  padding: 2px 8px;
  background: var(--accent, #3b82f6);
  color: white;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  margin-left: 8px;
}

.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 24px;
}

.card {
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 24px;
}

.card h2 {
  margin: 0 0 16px 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--text);
}

.card p {
  margin: 0 0 16px 0;
  color: var(--text-2);
}

.card ul {
  margin: 0;
  padding-left: 20px;
  color: var(--text-2);
}

.card ul li {
  margin-bottom: 8px;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.action-btn {
  padding: 12px 16px;
  background: var(--accent, #3b82f6);
  color: white;
  border-radius: 6px;
  text-decoration: none;
  text-align: center;
  font-weight: 500;
  transition: background 0.2s ease;
}

.action-btn:hover {
  background: var(--accent-hover, #2563eb);
}

.section-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-link {
  padding: 12px;
  background: var(--bg-0);
  border: 1px solid var(--border);
  border-radius: 6px;
  text-decoration: none;
  color: var(--text);
  transition: border-color 0.2s ease;
}

.section-link:hover {
  border-color: var(--accent, #3b82f6);
}
</style>
