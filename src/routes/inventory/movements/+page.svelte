<script lang="ts">
  export let params = {};
  import { t } from 'svelte-i18n';
</script>

<section class="card">
  <h1 style="margin:0 0 8px 0">{$t('inventory.movements_page.title')}</h1>
  <p class="muted">{$t('inventory.movements_page.description')}</p>
</section>
