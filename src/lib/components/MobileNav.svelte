<script lang="ts">
    import { page } from '$app/stores';
    import { Menu, X, Home, Package, Inbox, BarChart3, Users, Settings } from 'lucide-svelte';
    import { slide } from 'svelte/transition';

    export let open = false;

    const navItems = [
        { href: '/dashboard', icon: Home, label: 'Dashboard' },
        { href: '/orders', icon: Package, label: 'Orders' },
        { href: '/inventory', icon: Inbox, label: 'Inventory' },
        { href: '/analytics', icon: BarChart3, label: 'Analytics' },
        { href: '/team', icon: Users, label: 'Team' },
        { href: '/settings', icon: Settings, label: 'Settings' }
    ];

    function isActive(href: string) {
        return $page.url.pathname === href || $page.url.pathname.startsWith(href + '/');
    }

    function handleNavClick() {
        open = false;
    }
</script>

<!-- Mobile Header -->
<div class="mobile-header">
    <button class="menu-toggle" on:click={() => open = !open}>
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
        <slot name="actions" />
    </div>
</div>

<!-- Mobile Sidebar -->
{#if open}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="mobile-overlay" on:click={() => open = false} transition:slide></div>
    <nav class="mobile-nav" transition:slide={{ axis: 'x' }}>
        <div class="nav-header">
            <h2>Menu</h2>
            <button class="close-btn" on:click={() => open = false}>
                <X size={20} />
            </button>
        </div>

        <div class="nav-items">
            {#each navItems as item}
                <a
                    href={item.href}
                    class="nav-item"
                    class:active={isActive(item.href)}
                    on:click={handleNavClick}
                >
                    <svelte:component this={item.icon} size={20} />
                    <span>{item.label}</span>
                </a>
            {/each}
        </div>

        <div class="nav-footer">
            <slot name="footer" />
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
        border-bottom: 1px solid #e5e7eb;
        align-items: center;
        padding: 0 15px;
        z-index: 100;
    }

    .menu-toggle {
        background: none;
        border: none;
        padding: 8px;
        cursor: pointer;
        color: #374151;
    }

    .logo {
        flex: 1;
        text-align: center;
    }

    .logo-text {
        font-size: 1.25rem;
        font-weight: 700;
        color: #3b82f6;
    }

    .header-actions {
        display: flex;
        gap: 8px;
    }

    .mobile-overlay {
        display: none;
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 110;
    }

    .mobile-nav {
        display: none;
        position: fixed;
        top: 0;
        left: 0;
        bottom: 0;
        width: 280px;
        background: white;
        box-shadow: 2px 0 8px rgba(0,0,0,0.1);
        z-index: 120;
        flex-direction: column;
    }

    .nav-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 20px;
        border-bottom: 1px solid #e5e7eb;
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
        color: #6b7280;
        border-radius: 4px;
    }

    .close-btn:hover {
        background: #f3f4f6;
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
        color: #374151;
        text-decoration: none;
        margin-bottom: 4px;
        transition: all 0.2s;
    }

    .nav-item:hover {
        background: #f3f4f6;
    }

    .nav-item.active {
        background: #eff6ff;
        color: #3b82f6;
        font-weight: 500;
    }

    .nav-footer {
        padding: 15px;
        border-top: 1px solid #e5e7eb;
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
