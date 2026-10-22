<script lang="ts">
  import { untrack } from 'svelte';
  import Profile7stVisual from '$lib/profiles/components/Profile7stVisual.svelte';

  // An isolated editing copy prevents the native form's default-merging effect
  // from silently changing stored order JSON just by opening the editor.
  let {configuration,editable,onChange}:{
    configuration:Record<string,unknown>|null|undefined;
    editable:boolean;
    onChange:(configuration:Record<string,unknown>)=>void;
  }=$props();
  // The parent keys this editor by the opened profile. Later onChange echoes
  // must not replace the user's isolated working copy or merge defaults upstream.
  let localConfiguration=$state<any>(untrack(() => JSON.parse(JSON.stringify(configuration??{}))));

  function forwardExplicitEdit(value:unknown){
    if(!editable||!value||typeof value!=='object'||Array.isArray(value))return;
    // Preserve existing native (and legacy) keys; only a real user action
    // promotes the editable copy into parent draft state.
    onChange(JSON.parse(JSON.stringify(value)));
  }
</script>

<Profile7stVisual bind:configuration={localConfiguration}
  readonly={!editable} onchange={forwardExplicitEdit}/>
