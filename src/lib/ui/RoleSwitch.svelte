<script context="module">
  import { writable } from 'svelte/store';
  const isBrowser = typeof window !== 'undefined';
  const seed = isBrowser ? localStorage.getItem('rf_role') || 'Admin' : 'Admin';
  export const role = writable(seed);
  role.subscribe(v => { if (isBrowser) localStorage.setItem('rf_role', v); });
</script>

<script>
  import { t } from 'svelte-i18n';

  $: current = $role;

  const label = () => $t('roles.label');
  const admin = () => $t('roles.admin');
  const station = () => $t('roles.station');
</script>

<div class="row" role="group" aria-label={label()}>
  <button class="tag" aria-pressed={current==='Admin'} on:click={()=>role.set('Admin')}>{admin()}</button>
  <button class="tag" aria-pressed={current==='Station'} on:click={()=>role.set('Station')}>{station()}</button>
</div>
