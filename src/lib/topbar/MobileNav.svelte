<script lang="ts">
  import { base } from '$app/paths';
  import Home from 'lucide-svelte/icons/layout-dashboard';
  import Calendar from 'lucide-svelte/icons/calendar';
  import Boxes from 'lucide-svelte/icons/boxes';
  import Cog from 'lucide-svelte/icons/settings';
</script>

<nav class="rf-bottomnav" aria-label="Primary">
  <a href="{base}/"><Home/></a>
  <a href="{base}/calendar"><Calendar/></a>
  <a href="{base}/inventory"><Boxes/></a>
  <a href="{base}/settings"><Cog/></a>
</nav>

<style>
.rf-bottomnav{
  position:fixed; left:0; right:0; bottom:0;
  padding:8px max(8px, env(safe-area-inset-right,0px)) calc(8px + var(--rail-safe))
           max(8px, env(safe-area-inset-left,0px));
  border-top:1px solid var(--border); background:var(--bg-0); gap:8px;
  justify-content:space-around; z-index:80; display:none;
}
.rf-bottomnav a{ display:grid; place-items:center; width:var(--tap-min); height:var(--tap-min);
  border-radius:12px; border:1px solid var(--border); }
.rf-bottomnav a:focus-visible{ outline:3px solid var(--focus); outline-offset:2px; }
</style>
