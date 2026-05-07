<script lang="ts">
  let {
    label = 'Profile 7st'
  }: {
    label?: string;
  } = $props();
</script>

<div class="profile-badge">
  {label}
</div>

<style>
  .profile-badge {
    background: var(--brand);
    color: white;
    padding: 8px 16px;
    border-radius: 4px;
    font-weight: bold;
    font-size: 14px;
    display: inline-block;
  }
</style>
