import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {
  REVISION_FIELDS,REVISION_JSON_SCHEMA,parseRevisionModel,
  selectedRevisionDiff,revisionValue,safeRevisionDescription,
  revisionEvidenceSchema
} from '../../src/lib/order/revision-contract';
import {openRouterRequestBody} from '../../src/lib/server/ai/openrouter';
const source=(file:string)=>readFileSync(file,'utf8');
const oldId='7bdd17fe-1283-4aba-b875-04d212885c3d';
const newId='3e068b5c-9982-40ad-b51a-91559e7c0c3d';
const orderId='d3846080-7faf-45dc-a5ab-e9740208398c';
const hashA='a'.repeat(64),hashB='b'.repeat(64);
const fields=[
  {field:'title',before:'Old sign',after:'New sign',
    oldEvidence:'OLD SIGN',newEvidence:'NEW SIGN',confidence:'high'},
  {field:'due_date',before:'2026-11-01',after:'2026-11-03',
    oldEvidence:'01 November 2026',newEvidence:'03 November 2026',confidence:'medium'}
] as const;
const compare={summary:'Design and due date changed',changes:fields,
  questions:['Are mounting brackets included?'],risks:['Check current production progress']};

describe('OMS-R15 customer file revision intelligence',()=>{
  it('rejects privileged lifecycle/PO/profile mutations and malformed fields',()=>{
    expect(REVISION_FIELDS).not.toContain('status');
    expect(REVISION_FIELDS).not.toContain('po_number');
    expect(REVISION_FIELDS).not.toContain('profile_template_id');
    expect(()=>parseRevisionModel({...compare,changes:[{
      field:'status',before:'DRAFT',after:'CONFIRMED',
      oldEvidence:'DRAFT',newEvidence:'CONFIRMED',confidence:'high'
    }]})).toThrow();
    expect(()=>parseRevisionModel({...compare,poNumber:'111'})).toThrow();
    expect(revisionValue('due_date','2026-02-30')).toBeNull();
    expect(revisionValue('priority','MUST')).toBeNull();
    expect(revisionValue('is_rd','perhaps')).toBeNull();
  });
  it('deduplicates suggestions and maps selected values to approved columns only',()=>{
    const data=parseRevisionModel({...compare,changes:[
      ...fields,{...fields[0],after:'Duplicate title'}]});
    expect(data.changes).toHaveLength(2);
    expect(selectedRevisionDiff(data.changes)).toEqual({
      title:'New sign',due_date:'2026-11-03'
    });
    expect(selectedRevisionDiff([{
      field:'is_rd',before:'false',after:'true',
      oldEvidence:'standard',newEvidence:'R&D test',confidence:'low'
    }])).toEqual({is_rd:true});
  });
  it('stores both immutable file identities, hashes, selected source excerpts and order revision',()=>{
    const input=revisionEvidenceSchema.parse({
      orderId,baselineFileId:oldId,revisedFileId:newId,
      baselineSha256:hashA,revisedSha256:hashB,
      orderUpdatedAt:'2026-10-13T13:12:00+00:00',
      summary:'Updated proposal',
      changes:[fields[0]],consent:true
    });
    const description=safeRevisionDescription(input);
    expect(description).toContain(oldId);
    expect(description).toContain(newId);
    expect(description).toContain(hashA);
    expect(description).toContain(hashB);
    expect(description).toContain('2026-10-13T13:12:00');
    expect(description).toContain('OLD SIGN');
    expect(description).toContain('NEW SIGN');
    expect(description).not.toContain('CONFIRMED');
    expect(description.length).toBeLessThan(4000);
    expect(revisionEvidenceSchema.safeParse({...input,consent:false}).success).toBe(false);
    expect(revisionEvidenceSchema.safeParse({...input,poNumber:'FAKE'}).success).toBe(false);
  });
  it('requires real RLS-linked order assets and verified SHA-256',()=>{
    const files=source('src/lib/server/order/revision-files.ts');
    expect(files).toContain("from('order_files')");
    expect(files).toContain(".eq('draft_order_id',orderId).in('file_id',ids)");
    expect(files).toContain("from('files')");
    expect(files).toContain("createHash('sha256')");
    expect(files).toContain("readOrderStoredFile(locals,file,toolkitMediaLimit(kind))");
    expect(files).toContain('matchesOrderFileSignature');
    expect(files).toContain('total>20*1024*1024');
    expect(files).not.toContain('getPublicUrl');
    expect(files).not.toContain('createSignedUrl');
  });
  it('uses actual multimodal bytes and strict schema for read-only model comparison',()=>{
    const api=source('src/routes/api/ai/order-revisions/+server.ts');
    expect(api).toContain('aiRateLimit(rateLimitIdentifier(event))');
    expect(api).toContain('consent:z.literal(true)');
    expect(api).toContain('loadRevisionFiles(locals');
    expect(api).toContain('canEditDraft(user.role');
    expect(api).toContain('canEditConfirmedMetadata(user.role)');
    expect(api).toContain('REVISION_JSON_SCHEMA');
    expect(api).toContain("id:'file-parser'");
    expect(api).toContain("engine:'cloudflare-ai'");
    expect(api).toContain('parseRevisionModel(JSON.parse(response.text))');
    expect(api).toContain("provenance:'model-reported'");
    expect(api).not.toContain('.update(');
    expect(api).not.toContain('.insert(');
    expect(api).not.toContain('.rpc(');
    const request=openRouterRequestBody({
      model:'provider/capable-model',
      messages:[{role:'user',content:'Compare both files'}],
      jsonSchema:{name:'oms_order_revision_v1',
        schema:REVISION_JSON_SCHEMA as unknown as Record<string,unknown>}
    });
    expect(request.response_format).toEqual({
      type:'json_schema',json_schema:{
        name:'oms_order_revision_v1',strict:true,schema:REVISION_JSON_SCHEMA
      }
    });
  });
  it('creates a tracked change request only after rechecking actual files and saved order',()=>{
    const api=source('src/routes/api/orders/revision-change-request/+server.ts');
    expect(api).toContain('revisionEvidenceSchema.safeParse');
    expect(api).toContain('order.updated_at!==input.orderUpdatedAt');
    expect(api).toContain('baseline.sha256!==input.baselineSha256');
    expect(api).toContain('revised.sha256!==input.revisedSha256');
    expect(api).toContain('selectedRevisionDiff(input.changes)');
    expect(api).toContain("rpc(");
    expect(api).toContain("'create_change_request'");
    expect(api).not.toContain('.update(');
    expect(api).not.toContain("'apply_change_request'");
  });
  it('uses separate human review without automatically applying approved CRs',()=>{
    const component=source('src/lib/order/RevisionIntelligence.svelte');
    const editor=source('src/routes/orders/[id]/edit/+page.svelte');
    expect(component).toContain('bind:checked={consent}');
    expect(component).toContain("checked={checked[i]===true}");
    expect(component).toContain("fetch('/api/ai/order-revisions'");
    expect(component).toContain("fetch('/api/orders/revision-change-request'");
    expect(component).toContain('/api/change-requests/');
    expect(component).toContain('/review');
    expect(component).not.toContain('/approve');
    expect(component).not.toContain('/apply');
    expect(editor).toContain('<RevisionIntelligence {orderId}');
    expect(editor).toContain("rightTab === 'revisions'");
  });
  it('locks SECURITY DEFINER RPCs to authenticated roles and forbids status/PO field writes',()=>{
    const sql=source('supabase/migrations/20261013000002_harden_change_request_rpcs.sql');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.create_change_request');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.review_change_request');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.apply_change_request');
    expect(sql).toContain('v_role NOT IN');
    expect(sql).toContain("v_row.status<>'pending'");
    expect(sql).toContain("v_row.status<>'approved'");
    expect(sql).toContain('FOR UPDATE');
    expect(sql).toContain('REVOKE ALL ON FUNCTION');
    expect(sql).not.toContain("v_key NOT IN ('title', 'client', 'due_date', 'loading_date', 'priority',\n                         'notes', 'is_rd', 'rd_notes', 'badges', 'status')");
    const shared=source('src/lib/server/change-requests/contract.ts');
    expect(shared).not.toContain("'badges', 'status'");
    expect(sql.split('AS $$').length-1).toBe(3);
    expect(sql.split('$$;').length-1).toBe(3);
  });
  it('retains full EN/RU/LV translation key parity',()=>{
    const locales=['en','ru','lv'].map(lang=>JSON.parse(source(`src/locales/${lang}.json`)));
    const fields=Object.keys(locales[0].revisionIntelligence);
    expect(fields.length).toBeGreaterThan(25);
    for(const locale of locales.slice(1))
      expect(Object.keys(locale.revisionIntelligence).sort()).toEqual([...fields].sort());
  });
});
