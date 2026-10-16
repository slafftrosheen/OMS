import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {mayConfirm} from '../../src/lib/order/lifecycle-guards';

const read=(p:string)=>readFileSync(p,'utf8');
const migration=read('supabase/migrations/20261016000001_confirmation_handoff_guards.sql');
const confirm=read('src/routes/api/draft-orders/[id]/confirm/+server.ts');
const editor=read('src/routes/orders/[id]/edit/+page.svelte');
const queue=read('src/routes/orders/review/+page.svelte');

describe('OMS-R36 — human production release, revision and delivery',()=>{
 it('keeps the documented direct manager DRAFT approval policy intact',()=>{
   expect(mayConfirm('DRAFT')).toBe(true);
   expect(mayConfirm('PENDING_REVIEW')).toBe(true);
   expect(mayConfirm('IN_PRODUCTION')).toBe(false);
   expect(migration).toContain("IF v_status NOT IN ('DRAFT','draft','PENDING_REVIEW')");
   expect(migration).toContain("v_role <> 'Boss'");
   expect(migration).toContain("v_role NOT IN ('RD','Boss','HeadOfProduction')");
 });
 it('requires persisted linked files at the same locked confirmation transition',()=>{
   expect(migration).toContain('WHERE id=p_order_id FOR UPDATE');
   const files=migration.indexOf('IF NOT EXISTS (\n   SELECT 1 FROM public.order_files ofl');
   const stages=migration.indexOf('INSERT INTO public.order_stages');
   const publish=migration.indexOf('UPDATE public.draft_orders');
   expect(files).toBeGreaterThan(0);
   expect(files).toBeLessThan(stages);
   expect(stages).toBeLessThan(publish);
   expect(migration).toContain('JOIN public.files f ON f.id=ofl.file_id');
   expect(migration).toContain('is_active=TRUE');
 });
 it('uses a new strict revision-bound confirmation RPC while keeping two-argument callers compatible',()=>{
   expect(migration).toContain('p_expected_updated_at TIMESTAMPTZ');
   expect(migration).toContain('v_current.updated_at IS DISTINCT FROM p_expected_updated_at');
   expect(migration).toContain('SELECT public.confirm_order_with_stages(p_order_id,p_po_number)');
   expect(migration).toContain('REVOKE ALL ON FUNCTION public.confirm_order_with_stages(UUID,TEXT,TIMESTAMPTZ)');
   expect(migration).toContain('TO authenticated');
   expect(confirm).toContain('p_expected_updated_at:expectedUpdatedAt.data');
   expect(confirm).toContain("z.string().max(64).datetime({offset:true})");
   expect(confirm).toContain("status:428");
 });
 it('does not duplicate production notifications when a racing confirmation is idempotent',()=>{
   const rpc=confirm.indexOf("'confirm_order_with_stages'");
   const idempotent=confirm.indexOf('if(confirmation.idempotent===true)');
   const activity=confirm.indexOf(".from('order_activity_log').insert(");
   const room=confirm.indexOf('await postStationMessage(');
   const notification=confirm.indexOf('await notifyOrderConfirmed(');
   expect(rpc).toBeGreaterThan(0);
   expect(idempotent).toBeGreaterThan(rpc);
   expect(activity).toBeGreaterThan(idempotent);
   expect(room).toBeGreaterThan(idempotent);
   expect(notification).toBeGreaterThan(idempotent);
   expect(confirm.slice(idempotent,activity)).toContain('return json(');
   expect(confirm).toContain("confirmError.code === 'P0001'");
 });
 it('editor verifies canonical file count and sends post-save version',()=>{
   const flow=editor.slice(editor.indexOf('async function confirmOrder()'),
     editor.indexOf('// ── Request rework'));
   expect(flow).toContain('const count=await refreshFileCount();');
   expect(flow).toContain('if(count<1)');
   expect(flow).toContain('if (!(await saveDraft()))');
   expect(flow).toContain('expectedUpdatedAt:orderUpdatedAt');
   expect(flow).toContain("res.status===409||res.status===428");
   expect(editor).toContain("orderWorkspace.confirmDirectDraft");
   expect(editor).toContain("orderWorkspace.confirmFilesMissing");
 });
 it('review queue fetches the current saved order and never confirms an unversioned summary card',()=>{
   expect(queue).toContain('async function openConfirm(order: PendingOrder)');
   expect(queue).toContain('confirmRevision=latest.updatedAt;');
   expect(queue).toContain('confirmFiles=latest.files.length;');
   expect(queue).toContain('confirmDocumentNames=latest.files.slice(0,8)');
   expect(queue).toContain('expectedUpdatedAt:confirmRevision');
   expect(queue).toContain('!confirmRevision || !confirmFiles');
   expect(queue).toContain('confirmLoadSequence');
   expect(queue).toContain('orders.review.due');
   expect(queue).toContain('orderWorkspace.confirmProfilesCount');
 });
 it('localizes production release across EN, RU, LV without new mandatory fields',()=>{
   const required=['confirmProductionWarning','confirmDirectDraft','confirmFilesUnknown',
     'confirmFilesMissing','confirmLinkedFiles','confirmSaveFirst','confirmReloadRequired',
     'confirmChecking','confirmTitle','confirmPoLabel','confirmPoPlaceholder',
     'confirmBossRequired','confirmCancel','confirmAction','confirmingAction',
     'confirmProfilesCount'];
   for(const lang of ['en','ru','lv']){
     const obj=JSON.parse(read(`src/locales/${lang}.json`));
     for(const key of required){
       expect(typeof obj.orderWorkspace[key]).toBe('string');
       expect(obj.orderWorkspace[key].length).toBeGreaterThan(2);
     }
   }
   expect(editor).not.toContain('<ProfileFabricationSpec');
   expect(queue).not.toContain('fabricationSpec');
 });
});
