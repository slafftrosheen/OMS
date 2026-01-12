<!-- src/lib/profiles/components/fields/InfoBox.svelte -->
<script lang="ts">
  import { AlertCircle, Info, AlertTriangle } from 'lucide-svelte';

  export let content: string = '';
  export let type: 'info' | 'warning' | 'danger' = 'info';
  export let icon: string = 'alert-circle';
  export let fullWidth: boolean = false;

  const iconMap = {
    'alert-circle': AlertCircle,
    'info': Info,
    'alert-triangle': AlertTriangle
  };

  $: IconComponent = iconMap[icon] || AlertCircle;
</script>

<div class="info-box" class:info={type === 'info'} class:warning={type === 'warning'} class:danger={type === 'danger'} class:full-width={fullWidth}>
  <div class="icon">
    <svelte:component this={IconComponent} size={20} />
  </div>
  <div class="content">
    {@html content}
  </div>
</div>

<style>
  .info-box {
    display: flex;
    align-items: flex-start;
    gap: var(--space-sm, 8px);
    padding: var(--space-md, 12px);
    border-radius: var(--radius-md, 6px);
    border: 2px solid;
    font-size: var(--text-sm, 0.875rem);
  }

  .info-box.info {
    background: #EBF5FF;
    border-color: #3B82F6;
    color: #1E40AF;
  }

  .info-box.warning {
    background: #FFF9E6;
    border-color: #F59E0B;
    color: #92400E;
  }

  .info-box.danger {
    background: #FEE2E2;
    border-color: #EF4444;
    color: #991B1B;
  }

  .icon {
    flex-shrink: 0;
    display: flex;
  }

  .content {
    flex: 1;
    line-height: 1.5;
  }

  .full-width {
    grid-column: 1 / -1;
  }
</style>
