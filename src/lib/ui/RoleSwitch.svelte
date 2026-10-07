<script module>
  import { writable } from 'svelte/store';
  const isBrowser = typeof window !== 'undefined';
  const seed = isBrowser ? localStorage.getItem('rf_role') || 'RD' : 'RD';
  export const role = writable(seed);
  role.subscribe(v => { if (isBrowser) localStorage.setItem('rf_role', v); });
</script>

<script>
  import { t } from 'svelte-i18n';

  let current = $derived($role);

  const label = () => $t('roles.label');
  const admin = () => 'R&D';
  const station = () => $t('roles.station');
</script>

<div class="row" role="group" aria-label={label()}>
  <button class="tag" aria-pressed={current==='RD'} onclick={()=>role.set('RD')}>{admin()}</button>
  <button class="tag" aria-pressed={current==='Station'} onclick={()=>role.set('Station')}>{station()}</button>
</div>
