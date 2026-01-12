<script lang="ts">
  export let sections:{id:string; title:string}[]=[];
  let openId = sections[0]?.id || '';
  
  function toggle(id:string){ 
    openId = openId===id ? '' : id; 
  }
</script>

<div class="acc">
  {#each sections as s}
    <h3>
      <button 
        class="acc-btn" 
        aria-expanded={openId===s.id} 
        aria-controls={`sect-${s.id}`} 
        id={`hdr-${s.id}`} 
        on:click={()=>toggle(s.id)}>
        {s.title}
      </button>
    </h3>
    <div 
      role="region" 
      id={`sect-${s.id}`} 
      aria-labelledby={`hdr-${s.id}`} 
      hidden={openId!==s.id} 
      class="panel">
      <slot name={s.id}/>
    </div>
  {/each}
</div>

<style>
.acc {
  display: grid;
  gap: 8px;
}
.acc h3 {
  margin: 0;
}
.acc-btn{
  display:block;
  width:100%;
  text-align:left;
  border:1px solid var(--border);
  border-radius:10px;
  padding:8px 12px;
  background:var(--bg-0);
  color: var(--text);
  cursor: pointer;
  font-weight: 600;
  font-size: 1rem;
}
.acc-btn:hover {
  background: var(--bg-2);
}
.panel{
  border-left:3px solid var(--border);
  padding:8px 12px;
  margin-top: 4px;
}
</style>
