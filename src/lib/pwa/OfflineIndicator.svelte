<script lang="ts">
/**
 * Offline Mode Indicator Component
 */

import { WifiOff } from 'lucide-svelte';
</script>

<div class="offline-indicator">
  <div class="indicator-content">
    <WifiOff size={16} />
    <span>You're offline</span>
  </div>
</div>

<style>
  .offline-indicator {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 9998;
    animation: slideDown 0.3s ease-out;
  }

  @keyframes slideDown {
    from {
      transform: translateY(-100%);
    }
    to {
      transform: translateY(0);
    }
  }

  .indicator-content {
    background: var(--warn, #f59e0b);
    color: white;
    padding: 0.75rem 1rem;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
  }
</style>