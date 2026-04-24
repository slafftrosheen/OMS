<!-- src/lib/profiles/components/fields/InfoBox.svelte -->
<script lang="ts">
  import Icon from '$lib/ui/Icon.svelte';

  interface Props {
    content?: string;
    type?: 'info' | 'warning' | 'danger';
    icon?: string;
    fullWidth?: boolean;
  }

  let {
    content = '',
    type = 'info',
    icon = 'alert-circle',
    fullWidth = false
  }: Props = $props();

  const iconMap: Record<string, typeof AlertCircle> = {
    'alert-circle': AlertCircle,
    'info': Info,
    'alert-triangle': AlertTriangle
  };

  let IconComponent = $derived(iconMap[icon] || AlertCircle);
</script>

<div class="info-box" class:info={type === 'info'} class:warning={type === 'warning'} class:danger={type === 'danger'} class:full-width={fullWidth}>
  <div class="icon">
    <IconComponent size={20} />
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
    background: var(--brand-soft);
    border-color: var(--brand);
    color: color-mix(in oklab, var(--brand) 85%, black);
  }

  .info-box.warning {
    background: var(--warn-soft);
    border-color: var(--warn);
    color: color-mix(in oklab, var(--warn) 60%, black);
  }

  .info-box.danger {
    background: var(--error-soft);
    border-color: var(--error);
    color: color-mix(in oklab, var(--error) 80%, black);
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
