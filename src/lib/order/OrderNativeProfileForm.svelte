<script lang="ts">
  import Profile7stVisual from '$lib/profiles/components/Profile7stVisual.svelte';

  // An isolated editing copy prevents the native form's default-merging effect
  // from silently changing stored order JSON just by opening the editor.
  let {configuration,editable,onChange}:{
    configuration:Record<string,unknown>|null|undefined;
    editable:boolean;
    onChange:(configuration:Record<string,unknown>)=>void;
  }=$props();
  let localConfiguration=$state<any>(JSON.parse(JSON.stringify(configuration??{})));

  function forwardExplicitEdit(value:Record<string,unknown>){
    if(!editable)return;
    // Preserve existing native (and legacy) keys; only a real user action
    // promotes the editable copy into parent draft state.
    onChange(JSON.parse(JSON.stringify(value)));
  }
</script>

<Profile7stVisual bind:configuration={localConfiguration}
  readonly={!editable} onchange={forwardExplicitEdit}/>
