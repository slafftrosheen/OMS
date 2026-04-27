<script lang="ts">
  import BarChart3 from 'lucide-svelte/icons/bar-chart-3';
  import Home from 'lucide-svelte/icons/home';
  import Inbox from 'lucide-svelte/icons/inbox';
  import Menu from 'lucide-svelte/icons/menu';
  import Package from 'lucide-svelte/icons/package';
  import Settings from 'lucide-svelte/icons/settings';
  import Users from 'lucide-svelte/icons/users';
  import X from 'lucide-svelte/icons/x';
    import { page } from '$app/state';
    import Icon from '$lib/ui/Icon.svelte';
    import { slide } from 'svelte/transition';

    interface Props {
        open?: boolean;
        actions?: import('svelte').Snippet;
        footer?: import('svelte').Snippet;
    }

    let { open = $bindable(false), actions, footer }: Props = $props();

    const navItems = [
        { href: '/dashboard', icon: Home, label: 'Dashboard' },
        { href: '/orders', icon: Package, label: 'Orders' },
        { href: '/inventory', icon: Inbox, label: 'Inventory' },
        { href: '/analytics', icon: BarChart3, label: 'Analytics' },
        { href: '/team', icon: Users, label: 'Team' },
        { href: '/settings', icon: Settings, label: 'Settings' }
    ];

    function isActive(href: string) {
        return page.url.pathname === href || page.url.pathname.startsWith(href + '/');
    }

    function handleNavClick() {
        open = false;
    }
</script>

<!-- Mobile Header -->
<div class="mobile-header">
    <button class="menu-toggle" onclick={() => open = !open}>
        {#if open}
            <X size={24} />
        {:else}
            <Menu size={24} />
        {/if}
    </button>

    <div class="logo">
        <span class="logo-text">OMS</span>
    </div>

    <div class="header-actions">
        {@render actions?.()}
    </div>
</div>

<!-- Mobile Sidebar -->
{#if open}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="mobile-overlay" onclick={() => open = false} transition:slide></div>
    <nav class="mobile-nav" transition:slide={{ axis: 'x' }}>
        <div class="nav-header">
            <h2>Menu</h2>
            <button class="close-btn" onclick={() => open = false}>
                <X size={20} />
            </button>
        </div>

        <div class="nav-items">
            {#each navItems as item}
                <a
                    href={item.href}
                    class="nav-item"
                    class:active={isActive(item.href)}
                    onclick={handleNavClick}
                >
                    <item.icon size={20} />
                    <span>{item.label}</span>
                </a>
            {/each}
        </div>

        <div class="nav-footer">
            {@render footer?.()}
        </div>
    </nav>
{/if}

<style>
    .mobile-header {
        display: none;
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        height: 60px;
        background: white;
        border-bottom: 1px solid var(--border);
        align-items: center;
        padding: 0 15px;
        z-index: var(--z-overlay);
    }

    .menu-toggle {
        background: none;
        border: none;
        padding: 8px;
        cursor: pointer;
        color: var(--ink-secondary);
    }

    .logo {
        flex: 1;
        text-align: center;
    }

    .logo-text {
        font-size: 1.25rem;
        font-weight: 700;
        color: var(--brand);
    }

    .header-actions {
        display: flex;
        gap: 8px;
    }

    .mobile-overlay {
        display: none;
        position: fixed;
        inset: 0;
        background: color-mix(in oklab, var(--bg-0) 55%, transparent);
        z-index: calc(var(--z-sticky) + 10);
    }

    .mobile-nav {
        display: none;
        position: fixed;
        top: 0;
        left: 0;
        bottom: 0;
        width: 280px;
        background: white;
        box-shadow: 2px 0 8px color-mix(in oklab, var(--bg-0) 10%, transparent);
        z-index: calc(var(--z-sticky) + 20);
        flex-direction: column;
    }

    .nav-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 20px;
        border-bottom: 1px solid var(--border);
    }

    .nav-header h2 {
        margin: 0;
        font-size: 1.25rem;
        font-weight: 600;
    }

    .close-btn {
        background: none;
        border: none;
        padding: 4px;
        cursor: pointer;
        color: var(--ink-tertiary);
        border-radius: 4px;
    }

    .close-btn:hover {
        background: var(--bg-2);
    }

    .nav-items {
        flex: 1;
        padding: 10px;
        overflow-y: auto;
    }

    .nav-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 15px;
        border-radius: 8px;
        color: var(--ink-secondary);
        text-decoration: none;
        margin-bottom: 4px;
        transition: all 0.2s;
    }

    .nav-item:hover {
        background: var(--bg-2);
    }

    .nav-item.active {
        background: var(--brand-soft);
        color: var(--brand);
        font-weight: 500;
    }

    .nav-footer {
        padding: 15px;
        border-top: 1px solid var(--border);
    }

    @media (max-width: 768px) {
        .mobile-header {
            display: flex;
        }

        .mobile-overlay {
            display: block;
        }

        .mobile-nav {
            display: flex;
        }
    }
</style>
