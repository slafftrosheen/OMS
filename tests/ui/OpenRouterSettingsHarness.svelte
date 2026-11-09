<script lang="ts">
  import '../../src/app.css';
  import {setContext} from 'svelte';
  import {authState} from '$lib/auth/authState.svelte';
  import Settings from '../../src/routes/settings/+page.svelte';
  authState.setUser({id:'fixture-rd',username:'fixture',displayName:'Fixture',
    role:new URLSearchParams(location.search).has('operator')?'Operator':'RD',stations:[]});
  setContext('authState',authState);
</script>
<Settings />
