<script lang="ts">
  import HelpCircle from 'lucide-svelte/icons/help-circle';
  import { t } from 'svelte-i18n';
  import { base } from '$app/paths';
</script>

<section class="card">
  <h1 style="margin: 0 0 16px 0; display: flex; align-items: center; gap: 12px;">
    <HelpCircle size={28} aria-hidden="true" />
    {$t('help.page_title', { default: 'Help & Documentation' })}
  </h1>
  <p class="muted">
    {$t('help.contact', { default: 'Need more help? Contact your system administrator or refer to the user documentation.' })}
  </p>
  <div style="margin-top: 12px;">
    <a href={`${base}/`} class="tag">← {$t('nav.dashboard')}</a>
  </div>
</section>
