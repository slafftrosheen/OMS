<script lang="ts">
  import { base } from '$app/paths';
  import { t } from 'svelte-i18n';
  // Round 2: the original red round mark (unchanged geometry) + condensed system name.
</script>

<span class="rf-lockup">
  <img src={`${base}/brand/rf-logo-flat-red.svg`} alt={$t('app.brand.aria')} class="brand-logo" width="36" height="36" decoding="async" />
  <span class="rf-lockup__name" aria-hidden="true"><b>Reclame Fabriek</b><i>OMS</i></span>
</span>

<style>
  .rf-lockup{ display:inline-flex; align-items:center; gap:10px; color:var(--ink-0) }
  .brand-logo{ height:34px; width:34px; object-fit:contain; flex:0 0 auto }
  .rf-lockup__name{ display:flex; flex-direction:column; line-height:1; font-family:var(--font-display); text-transform:uppercase }
  .rf-lockup__name b{ font-weight:700; font-size:15px; letter-spacing:.04em }
  .rf-lockup__name i{ font-style:normal; font-weight:600; font-size:11px; letter-spacing:var(--tracking-label); color:var(--ink-2); margin-top:3px }
  @media (max-width:1200px){ .rf-lockup__name{ display:none } }
</style>
