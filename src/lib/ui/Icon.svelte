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

  export let name: IconName = 'home';
  export let label: string | undefined;

  const map: Record<IconName, typeof Home> = {
    home: Home,
    orders: ClipboardList,
    inventory: Boxes,
    calendar: Calendar,
    settings: Settings,
    assets: Package,
    stations: Building
  };

  const C = map[name] ?? Home;
</script>

<svelte:component this={C} aria-hidden={label ? undefined : true} aria-label={label} />
