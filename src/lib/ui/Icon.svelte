<script lang="ts">
  import Home from 'lucide-svelte/icons/home';
  import Package from 'lucide-svelte/icons/package';
  import ClipboardList from 'lucide-svelte/icons/clipboard-list';
  import Calendar from 'lucide-svelte/icons/calendar';
  import Settings from 'lucide-svelte/icons/settings';
  import Boxes from 'lucide-svelte/icons/boxes';
  import Building from 'lucide-svelte/icons/building-2';

  export type IconName =
    | 'home'
    | 'orders'
    | 'inventory'
    | 'calendar'
    | 'settings'
    | 'assets'
    | 'stations';

  let {
    name = 'home',
    label = undefined
  }: {
    name?: IconName;
    label?: string;
  } = $props();

  const map: Record<IconName, typeof Home> = {
    home: Home,
    orders: ClipboardList,
    inventory: Boxes,
    calendar: Calendar,
    settings: Settings,
    assets: Package,
    stations: Building
  };

  let C = $derived(map[name] ?? Home);
</script>

<C aria-hidden={label ? undefined : true} aria-label={label} />
