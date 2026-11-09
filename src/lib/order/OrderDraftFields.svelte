<script lang="ts">
 import {t} from 'svelte-i18n';
 import ClientDeliveryAddresses from './ClientDeliveryAddresses.svelte';
 let {data,section='all',editable=true,addressLocked=false,errors={},idPrefix='',onChange}:{data:Record<string,any>;section?:'all'|'details'|'delivery';editable?:boolean;addressLocked?:boolean;errors?:Record<string,string>;idPrefix?:string;onChange:(patch:Record<string,unknown>)=>void}=$props();
 const details=['clientName','title','deadline','loadingDate','priority','notes'];
 const delivery=['deliveryAddress','deliveryContact','deliveryPhone','deliveryEmail'];
 const labels:Record<string,string>={clientName:'client',title:'title',deadline:'deadline',loadingDate:'loadingDate',priority:'priority',notes:'notes',deliveryAddress:'deliveryAddress',deliveryContact:'deliveryContact',deliveryPhone:'deliveryPhone',deliveryEmail:'deliveryEmail'};
 let fields=$derived(section==='details'?details:section==='delivery'?delivery:[...details,...delivery]);
</script>
<div class="draft-fields">
 {#if section!=='delivery'}<p class="po-reference">{$t('orders.new.details.po')}: {data.poNumber||$t('orders.new.details.po_pending')}</p>{/if}
 {#each fields as field}
  <div class="draft-field">
   <label for={idPrefix+field}>{$t('orderWorkspace.editor.'+labels[field])}</label>
   {#if field==='priority'}
    <select id={idPrefix+field} value={data[field]||'NORMAL'} disabled={!editable} onchange={e=>onChange({[field]:e.currentTarget.value})}>
     {#each ['LOW','NORMAL','HIGH','URGENT'] as level}<option value={level}>{$t('orderForm.priority.'+level)}</option>{/each}
    </select>
   {:else if field==='notes'||field==='deliveryAddress'}
    <textarea id={idPrefix+field} value={data[field]||''} rows="3" maxlength={field==='notes'?8000:2000} disabled={!editable||(addressLocked&&delivery.includes(field))} aria-invalid={!!errors[field]} oninput={e=>onChange({[field]:e.currentTarget.value})}></textarea>
   {:else}
    <input id={idPrefix+field} type={field==='deadline'||field==='loadingDate'?'date':field==='deliveryEmail'?'email':field==='deliveryPhone'?'tel':'text'} value={data[field]||''} maxlength="200" disabled={!editable||(addressLocked&&delivery.includes(field))} aria-invalid={!!errors[field]} oninput={e=>onChange({[field]:e.currentTarget.value})}/>
   {/if}
   {#if errors[field]}<p class="field-error">{errors[field]}</p>{/if}
  </div>
 {/each}
 {#if section!=='details'}<ClientDeliveryAddresses clientName={data.clientName||''} {editable} current={{deliveryAddress:data.deliveryAddress||'',deliveryContact:data.deliveryContact||'',deliveryPhone:data.deliveryPhone||'',deliveryEmail:data.deliveryEmail||''}} onSelect={onChange}/>{/if}
 {#if section!=='delivery'}
  <label class="check"><input type="checkbox" checked={!!data.isRd} disabled={!editable} onchange={e=>onChange({isRd:e.currentTarget.checked})}/>{$t('orderWorkspace.editor.rdOrder')}</label>
  {#if data.isRd}<div class="draft-field"><label for={idPrefix+'rdNotes'}>{$t('orderWorkspace.editor.rdNotes')}</label><textarea id={idPrefix+'rdNotes'} value={data.rdNotes||''} disabled={!editable} rows="3" maxlength="8000" oninput={e=>onChange({rdNotes:e.currentTarget.value})}></textarea></div>{/if}
 {/if}
</div>
<style>
 .draft-fields{display:grid;gap:var(--space-md);font-family:inherit;color:var(--ink-primary);font-size:var(--text-sm)}.draft-field{display:grid;gap:6px;min-width:0}label{font-weight:550}input,select,textarea{box-sizing:border-box;width:100%;min-height:40px;padding:9px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-0);color:var(--ink-primary);font:inherit}textarea{resize:vertical}input:disabled,select:disabled,textarea:disabled{opacity:.65}input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid var(--focus);outline-offset:2px}.check{display:flex;align-items:center;gap:8px}.check input{width:18px;min-height:18px}.po-reference{margin:0;font-size:var(--text-xs);color:var(--ink-secondary)}.field-error{margin:0;color:var(--danger);font-size:var(--text-xs)}[aria-invalid=true]{border-color:var(--danger)}
</style>
