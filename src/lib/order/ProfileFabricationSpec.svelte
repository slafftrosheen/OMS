<script lang="ts">
 import {t} from 'svelte-i18n';
 import {FABRICATION_METHODS,ILLUMINATION,MOUNTING,EXPOSURE,
   FAB_SPEC_FIELD_LIMITS,parseFabricationSpec,updateFabricationSpec}
   from './fabrication-spec';
 import type {FabricationSpec} from './fabrication-spec';
 let {value,readonly=false,onChange}:{
   value?:unknown;readonly?:boolean;
   onChange:(next:FabricationSpec|null)=>void
 }=$props();
 let parsed=$derived(parseFabricationSpec(value));
 let spec:FabricationSpec=$derived(parsed.spec??{version:1 as const});
 let localError=$state('');
 const dimensions=['width_mm','height_mm','depth_mm','thickness_mm'] as const;
 const options={
   method:FABRICATION_METHODS,illumination:ILLUMINATION,
   mounting:MOUNTING,exposure:EXPOSURE
 } as const;
 const descriptions=['material_note','finish_note','installation_note'] as const;
 function change(key:keyof FabricationSpec,next:string){
   localError='';
   try{onChange(updateFabricationSpec(value,key,next));}
   catch(e){localError=e instanceof Error?e.message:'Invalid measurement';}
 }
 function clearSpec(){localError='';onChange(null);}
</script>
<fieldset class="spec-panel" disabled={readonly}>
 <legend>{$t('fabricationSpec.title')}</legend>
 <p class="hint">{$t('fabricationSpec.subtitle')}</p>
 <div class="dimension-grid">
   {#each dimensions as key}
     <label class="spec-field">
       <span>{$t(`fabricationSpec.field.${key}`)} <small>mm</small></span>
       <input type="number" min="0.001" max={FAB_SPEC_FIELD_LIMITS[key]}
         step="0.001" inputmode="decimal"
         value={spec[key]??''}
         oninput={event=>change(key,event.currentTarget.value)}
         placeholder={$t('fabricationSpec.optional')}/>
     </label>
   {/each}
 </div>
 {#if spec.width_mm!==undefined&&spec.height_mm!==undefined}
   <p class="geometry-hint">
     {$t('fabricationSpec.rectangle')}: {(spec.width_mm*spec.height_mm/1e6).toLocaleString(undefined,{maximumFractionDigits:6})} m²
     <small>{$t('fabricationSpec.areaDisclaimer')}</small>
   </p>
 {/if}
 <div class="choices">
   {#each Object.keys(options) as field}
     <label class="spec-field">
       <span>{$t(`fabricationSpec.field.${field}`)}</span>
       <select value={String(spec[field as keyof typeof options]??'unspecified')}
         onchange={event=>change(field as keyof FabricationSpec,event.currentTarget.value)}>
         {#each options[field as keyof typeof options] as choice}
           <option value={choice}>{$t(`fabricationSpec.choice.${field}.${choice}`)}</option>
         {/each}
       </select>
     </label>
   {/each}
 </div>
 <div class="spec-notes">
   {#each descriptions as key}
     <label class="spec-field">
       <span>{$t(`fabricationSpec.field.${key}`)}</span>
       <textarea rows="2" maxlength="800" value={spec[key]??''}
         oninput={event=>change(key,event.currentTarget.value)}
         placeholder={$t('fabricationSpec.optional')}></textarea>
     </label>
   {/each}
 </div>
 {#each parsed.issues as issue,i (i)}
   <p class:warning={issue.type==='incomplete'} class:error={issue.type==='invalid'}
     role={issue.type==='invalid'?'alert':'status'}>
     {$t(issue.type==='incomplete'
       ?'fabricationSpec.incomplete':'fabricationSpec.invalid')}
   </p>
 {/each}
 {#if localError}<p role="alert" class="error">{localError}</p>{/if}
 <div class="foot">
   <p>{$t('fabricationSpec.notInstruction')}</p>
   <button type="button" onclick={clearSpec} disabled={readonly}>
     {$t('fabricationSpec.clear')}
   </button>
 </div>
</fieldset>
<style>
 .spec-panel{border:1px solid var(--border);background:var(--bg-1);border-radius:10px;
   padding:.9rem;margin:.7rem 0;display:grid;gap:.7rem;min-width:0;color:var(--text)}
 .spec-panel legend{font-size:.91rem;font-weight:700;padding:0 .3rem}
 .hint,.foot p{font-size:.76rem;color:var(--muted);margin:0}
 .dimension-grid,.choices{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.6rem}
 .spec-field{display:grid;gap:.35rem;font-size:.77rem;min-width:0}
 .spec-field small{color:var(--muted)}
 .spec-field input,.spec-field select,.spec-field textarea{background:var(--bg-2);
   color:var(--text);border:1px solid var(--border);border-radius:7px;
   padding:.5rem;min-width:0;width:100%;min-height:40px}
 .spec-field textarea{resize:vertical}
 .spec-notes{display:grid;gap:.55rem}
 .geometry-hint{font-size:.84rem;margin:0;font-weight:600}
 .geometry-hint small{display:block;font-weight:400;color:var(--muted)}
 .warning{color:var(--warn);font-size:.79rem;margin:0}
 .error{color:var(--error);font-size:.79rem;margin:0}
 .foot{display:flex;justify-content:space-between;align-items:center;gap:.8rem;flex-wrap:wrap}
 .foot p{flex:1}
 .foot button{background:var(--bg-2);border:1px solid var(--border);border-radius:7px;
   color:var(--text);min-height:38px;padding:.4rem .7rem;cursor:pointer}
 @media(max-width:600px){.dimension-grid,.choices{grid-template-columns:1fr}}
</style>
