<script lang="ts">
  import { base } from '$app/paths';
  import { t } from 'svelte-i18n';
</script>

<img src={`${base}/logo.png`} alt={$t('app.brand.aria')} class="brand-logo" width="220" height="64" decoding="async" />

<style>
.brand-logo {
  height: 36px;
  width: auto;
  object-fit: contain;
}
</style>
