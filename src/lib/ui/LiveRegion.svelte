<script lang="ts">
  import { liveText } from '$lib/a11y/store';
</script>

<div
  aria-live="polite"
  aria-atomic="true"
  style="position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden"
>
  {$liveText}
</div>
