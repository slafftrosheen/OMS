<script lang="ts">
  import { base } from '$app/paths';
  import { currentUser } from '$lib/auth/authState.svelte';
  import { can } from '$lib/auth/permission-utils';
  import { t } from 'svelte-i18n';
  
  let user = $derived($currentUser);
</script>

<svelte:head>
  <title>{$t('admin_dash.title')} - Reclame OMS</title>
</svelte:head>

{#if user}
  <div class="dashboard-container">
    <header class="dashboard-header">
      <h1>{$t('admin_dash.title')}</h1>
      <p class="subtitle">
        {user.displayName}
        <span class="role-badge">{user.role}</span>
      </p>
    </header>

    <div class="dashboard-grid">
      <div class="card">
        <h2>{$t('admin_dash.quick_actions')}</h2>
        <div class="actions">
          {#if can(user, 'createDraftOrder')}
            <a href="{base}/orders/new" class="action-btn action-btn--primary">{$t('admin_dash.create_order')}</a>
          {/if}
          {#if can(user, 'manageKnowledge')}
            <a href="{base}/inventory" class="action-btn">{$t('admin_dash.manage_inventory')}</a>
          {/if}
          {#if can(user, 'reviewQueue')}
            <a href="{base}/orders/review" class="action-btn">{$t('admin_dash.approve_changes')}</a>
          {/if}
        </div>
      </div>

      <div class="card">
        <h2>{$t('admin_dash.section_overview')}</h2>
        <p>{$t('admin_dash.section_desc')}</p>
        <ul>
          <li>{$t('admin_dash.order_management')}</li>
          <li>{$t('admin_dash.inventory_control')}</li>
          <li>{$t('admin_dash.user_admin')}</li>
          <li>{$t('admin_dash.system_settings')}</li>
        </ul>
      </div>

      <div class="card">
        <h2>{$t('admin_dash.your_sections')}</h2>
        <div class="section-list">
          {#if can(user, 'viewOrders')}
            <a href="{base}/orders" class="section-link">{$t('nav.orders')} <span aria-hidden="true">↗</span></a>
            <a href="{base}/production" class="section-link">{$t('nav.kanban')} <span aria-hidden="true">↗</span></a>
          {/if}
          {#if can(user, 'viewInventory')}
            <a href="{base}/inventory" class="section-link">{$t('nav.inventory')} <span aria-hidden="true">↗</span></a>
          {/if}
          {#if can(user, 'manageUsers')}
            <a href="{base}/admin/users" class="section-link">{$t('nav.users')} <span aria-hidden="true">↗</span></a>
          {/if}
          <a href="{base}/settings" class="section-link">{$t('nav.settings')} <span aria-hidden="true">↗</span></a>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .dashboard-container {max-width:1200px;margin:0 auto;padding:var(--space-lg) 0 var(--space-2xl);}
  .dashboard-header {position:relative;margin-bottom:var(--space-xl);padding:var(--space-lg) 0;
    border-bottom:1px solid var(--divider);}
  .dashboard-header::before {content:'';position:absolute;top:0;left:0;width:90px;height:2px;
    background:linear-gradient(90deg,var(--brand),var(--brand-2),transparent);}
  .dashboard-header h1 {margin:0 0 var(--space-sm);font-size:clamp(1.5rem,2.5vw,2rem);
    font-weight:750;letter-spacing:var(--tracking-tight);color:var(--ink-primary);}
  .subtitle {margin:0;font-size:var(--text-sm);color:var(--ink-secondary);
    display:flex;align-items:center;flex-wrap:wrap;gap:var(--space-sm);}
  .role-badge {display:inline-block;padding:4px 10px;background:var(--brand-soft);
    border:1px solid color-mix(in oklab,var(--brand) 35%,var(--border));
    color:var(--brand);border-radius:var(--radius-sm);font-size:var(--text-xs);font-weight:700;}
  .dashboard-grid {display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));
    gap:var(--space-md);}
  .card {background:var(--glass-bg-strong);border:1px solid var(--glass-border);
    border-radius:var(--radius-lg);padding:var(--space-xl);min-width:0;box-shadow:var(--glass-shadow-sm);}
  .card h2 {font-size:var(--text-lg);margin:0 0 var(--space-lg);font-weight:700;color:var(--ink-primary);}
  .card p,.card ul {color:var(--ink-secondary);font-size:var(--text-sm);line-height:1.6;}
  .card ul {padding-inline-start:var(--space-xl);}
  .card ul li {margin-bottom:var(--space-xs);}
  .actions,.section-list {display:flex;flex-direction:column;gap:var(--space-sm);}
  .action-btn,.section-link {display:flex;align-items:center;justify-content:space-between;
    padding:12px 14px;min-height:44px;background:var(--bg-1);border:1px solid var(--border);
    border-radius:var(--radius-md);color:var(--ink-primary);font-size:var(--text-sm);
    font-weight:650;text-decoration:none;transition:background var(--motion-sm) var(--ease-standard),
    border-color var(--motion-sm) var(--ease-standard);}
  .action-btn:hover,.section-link:hover {background:var(--bg-2);border-color:var(--border-strong);}
  .action-btn--primary {background:var(--brand);border-color:var(--brand);color:var(--on-brand);}
  .action-btn--primary:hover {background:var(--brand-2);border-color:var(--brand-2);}
  .section-link span {color:var(--ink-tertiary);}
  .action-btn:focus-visible,.section-link:focus-visible {outline:2px solid var(--focus);outline-offset:2px;}
  @media(max-width:640px) {.dashboard-container {padding:var(--space-sm) 0 var(--space-xl);}
    .card {padding:var(--space-lg);}}
  @media(prefers-reduced-transparency:reduce) {.card {background:var(--bg-1);}}
</style>
