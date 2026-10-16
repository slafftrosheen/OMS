import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {parseReviewChange,REVIEW_KINDS} from '../../src/lib/order/production-exceptions';
import {oversightProductionFindings,mergeProductionReviews}
  from '../../src/lib/order/production-exception-queue';
import type {ProductionOversight} from '../../src/lib/order/production-oversight';
import type {ExceptionReview} from '../../src/lib/order/production-exceptions';

const read=(path:string)=>readFileSync(path,'utf8');
const id='11111111-1111-4111-8111-111111111111';
const version='2026-10-16T12:00:00.123Z';

describe('OMS-R40: existing audited management reviews for production oversight',()=>{
 it('permits both new kinds through the existing strictly validated claim contract',()=>{
   for(const kind of ['STAGE_UNCHANGED','MATERIAL_SKIPPED'] as const){
     expect(REVIEW_KINDS).toContain(kind);
     expect(parseReviewChange({action:'claim',orderId:id,station:'cnc',kind,
       dueDate:'2026-10-20',note:'Investigate this saved evidence'}))
       .toMatchObject({action:'claim',orderId:id,station:'CNC',kind});
   }
   expect(()=>parseReviewChange({action:'claim',orderId:id,station:'CNC',
     kind:'OVERRIDE_STOCK',dueDate:'2026-10-20'})).toThrow();
   expect(()=>parseReviewChange({action:'resolve',reviewId:id,
     expectedUpdatedAt:version,note:' '})).toThrow();
   expect(parseReviewChange({action:'resolve',reviewId:id,
     expectedUpdatedAt:version,note:'Reconciled and documented'}).action)
     .toBe('resolve');
 });
 it('converts R39 evidence to R25 review findings without writing any data',()=>{
   const source:ProductionOversight={
     asOf:version,total:2,skippedCount:1,unchangedCount:1,
     previewLimit:50,truncated:false,signals:[
       {key:id+':CNC:STAGE_UNCHANGED',kind:'STAGE_UNCHANGED',orderId:id,
        station:'CNC',poNumber:'PO-321',title:'Letters',
        status:'IN_PRODUCTION',stageState:'IN_PROGRESS',
        recordedAt:'2026-10-12T08:00:00Z',elapsedHours:100,reason:null},
       {key:id+':PAINT:MATERIAL_SKIPPED',kind:'MATERIAL_SKIPPED',orderId:id,
        station:'PAINT',poNumber:'PO-321',title:'Letters',
        status:'IN_PRODUCTION',stageState:'COMPLETED',
        recordedAt:'2026-10-15T08:00:00Z',elapsedHours:28,
        reason:'No shop materials used'}
     ]
   };
   const result=oversightProductionFindings(source);
   expect(result).toHaveLength(2);
   expect(result[0]).toMatchObject({kind:'STAGE_UNCHANGED',hours:100,
     details:'stageRecordUnchanged',orderId:id,station:'CNC'});
   expect(result[1]).toMatchObject({kind:'MATERIAL_SKIPPED',hours:null,
     details:'materialSkipForReview',sourceNote:'No shop materials used'});
   expect(new Set(result.map(x=>x.key)).size).toBe(2);
   const prior:ExceptionReview={id,draft_order_id:id,station:'PAINT',
     kind:'MATERIAL_SKIPPED',status:'RESOLVED',owner_id:id,due_date:null,
     follow_up_note:'Checked',resolution_note:'Stock reconciliation accepted',
     updated_at:version,created_at:version,resolved_at:version,updated_by:id};
   const merged=mergeProductionReviews(result,[prior]);
   expect(merged.find(r=>r.station==='PAINT')?.review?.status).toBe('RESOLVED');
   expect(merged.find(r=>r.station==='PAINT')?.sourceActive).toBe(true);
   expect(merged.find(r=>r.station==='CNC')?.review).toBeNull();
 });
 it('extends existing R25 RPC and check constraint, not a second ledger or mutation path',()=>{
   const sql=read('supabase/migrations/20261016000003_production_oversight_review_kinds.sql');
   expect(sql).toContain('DROP CONSTRAINT IF EXISTS production_exception_reviews_kind_check');
   expect(sql).toContain("'STAGE_UNCHANGED','MATERIAL_SKIPPED'");
   expect(sql).toContain('CREATE OR REPLACE FUNCTION public.oms_manage_production_exception(');
   expect(sql).not.toContain('CREATE TABLE');
   expect(sql).toContain("p_action IN ('claim','reopen')");
   expect(sql).toContain('v_stage.updated_at <= now()-INTERVAL \'72 hours\'');
   expect(sql).toContain("v_stage.state::text IN ('QUEUED','IN_PROGRESS')");
   expect(sql).toContain("v_stage.consumption_skipped IS TRUE");
   expect(sql).toContain("v_stage.state::text='COMPLETED'");
   expect(sql).toContain("v_order.status::text IN ('CONFIRMED','IN_PRODUCTION','READY_TO_LOAD')");
   expect(sql).toContain('v_review.updated_at IS DISTINCT FROM p_expected_updated_at');
   expect(sql).toContain('INSERT INTO public.production_exception_events');
   expect(sql).toContain("v_role NOT IN ('RD','Boss','HeadOfProduction')");
   expect(sql).toContain("NOTIFY pgrst, 'reload schema'");
   expect(sql).not.toContain("UPDATE public.order_stages");
   expect(sql).not.toContain("UPDATE public.inventory_items");
 });
 it('keeps manager-only live evidence, consent and source completeness explicit',()=>{
   const page=read('src/routes/production/exceptions/+page.svelte');
   const board=read('src/routes/api/production/board/+server.ts');
   const api=read('src/routes/api/production/exception-reviews/+server.ts');
   expect(board).toContain('canManageSharedInventory(locals.user.role)');
   expect(api).toContain('canManageSharedInventory(locals.user.role)');
   expect(page).toContain('managerSnapshot');
   expect(page).toContain('oversightReady');
   expect(page).toContain('oversightProductionFindings(oversight)');
   expect(page).toContain("!['STAGE_UNCHANGED','MATERIAL_SKIPPED'].includes(r.kind)");
   expect(page).toContain("oversight?.truncated===true");
   expect(page).toContain("productionExceptions.sourceOutsidePreview");
   expect(page).toContain("productionExceptions.oversightUnavailable");
   expect(page).toContain("productionExceptions.materialReconciliationGuidance");
   expect(page).toContain("productionExceptions.stageAgeGuidance");
   expect(page).toContain('request.expectedUpdatedAt=row.review.updated_at');
   expect(page).toContain('/api/production/exception-reviews');
   const source=read('src/lib/order/production-exception-queue.ts');
   expect(source).not.toContain("fetch(");
   expect(source).not.toContain(".update(");
 });
 it('deep-links to a specific kind, station and order without duplicate review UI',()=>{
   const planning=read('src/routes/production/+page.svelte');
   const reviews=read('src/routes/production/exceptions/+page.svelte');
   expect(planning).toContain('/production/exceptions?kind=');
   expect(planning).toContain('signal.orderId');
   expect(reviews).toContain("page.url.searchParams.get('orderId')");
   expect(reviews).toContain("page.url.searchParams.get('station')");
   expect(reviews).toContain("page.url.searchParams.get('kind')");
   expect(reviews).toContain('!focusOrder||r.orderId===focusOrder');
 });
 it('has EN/RU/LV label parity and describes incomplete evidence',()=>{
   const required=['oversightUnavailable','oversightPreviewLimited','sourceOutsidePreview',
     'materialReconciliationGuidance','stageAgeGuidance','filteredOrder','clearOrderFilter'];
   for(const lang of ['en','ru','lv']){
     const section=JSON.parse(read(`src/locales/${lang}.json`)).productionExceptions;
     for(const key of required)expect(typeof section[key]).toBe('string');
     for(const kind of ['STAGE_UNCHANGED','MATERIAL_SKIPPED'])
       expect(typeof section.kind[kind]).toBe('string');
     for(const detail of ['stageRecordUnchanged','materialSkipForReview'])
       expect(typeof section.detail[detail]).toBe('string');
   }
 });
});
