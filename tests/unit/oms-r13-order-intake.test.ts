import { describe,expect,it } from 'vitest';
import { readFileSync } from 'node:fs';
import { INTAKE_FIELDS,INTAKE_JSON_SCHEMA,intakeModelSchema,
  normalizeIntakeProposals,proposalsToPatch } from '../../src/lib/order/intake-contract';
import { openRouterRequestBody } from '../../src/lib/server/ai/openrouter';

const read=(p:string)=>readFileSync(p,'utf8');
const base={
  proposals:[
    {field:'clientName',value:' Baltic Signs ',evidence:'Baltic Signs SIA',confidence:'high'},
    {field:'deadline',value:'2026-11-05',evidence:'Delivery 05/11/2026',confidence:'medium'},
    {field:'isRd',value:'true',evidence:'R&D prototype',confidence:'high'}
  ],
  profileSuggestions:[{name:'Illuminated letters',quantity:6,details:'Acrylic faces'}],
  missing:['LED supply voltage not specified']
};

describe('OMS-R13 OpenRouter Smart Order Intake',()=>{
  it('strictly accepts only valid model output and never allows lifecycle/PO mutations',()=>{
    expect(intakeModelSchema.safeParse(base).success).toBe(true);
    expect(INTAKE_FIELDS).not.toContain('poNumber');
    expect(INTAKE_FIELDS).not.toContain('status');
    expect(INTAKE_FIELDS).not.toContain('profileTemplateId');
    expect(()=>normalizeIntakeProposals({
      ...base,proposals:[{field:'poNumber',value:'PO-77',evidence:'Document PO-77',confidence:'high'}]
    })).toThrow();
    expect(()=>normalizeIntakeProposals({...base,confirmOrder:true})).toThrow();
    expect(()=>normalizeIntakeProposals({...base,profileSuggestions:[
      {name:'Sign',quantity:3,details:'acrylic',profileTemplateId:'fake'}
    ]})).toThrow();
  });
  it('normalizes fields, filters impossible dates and unverified enums, deduplicates suggestions',()=>{
    const result=normalizeIntakeProposals({...base,proposals:[
      ...base.proposals,
      {...base.proposals[0],value:'second guessed name'},
      {field:'deadline',value:'2026-02-30',evidence:'Date appears uncertain',confidence:'low'},
      {field:'priority',value:'CRITICAL',evidence:'Very urgent',confidence:'low'},
      {field:'deliveryEmail',value:'malformed',evidence:'Contact',confidence:'low'}
    ]});
    expect(result.proposals.map(p=>p.field)).toEqual(['clientName','deadline','isRd']);
    expect(result.proposals[0].value).toBe('Baltic Signs');
    expect(proposalsToPatch(result.proposals)).toEqual({
      clientName:'Baltic Signs',deadline:'2026-11-05',isRd:true
    });
  });
  it('configures genuine JSON Schema output and requires supporting OpenRouter providers',()=>{
    const b=openRouterRequestBody({
      model:'configured/compatible-model',
      messages:[{role:'user',content:'Read actual order source'}],
      jsonSchema:{name:'oms_order_intake_v1',schema:INTAKE_JSON_SCHEMA as unknown as Record<string,unknown>}
    });
    expect(b.response_format).toEqual({type:'json_schema',json_schema:{
      name:'oms_order_intake_v1',strict:true,schema:INTAKE_JSON_SCHEMA
    }});
    expect(b.provider).toEqual({require_parameters:true});
    expect(b.messages[0].content).toBe('Read actual order source');
  });
  it('requires a linked private order file, editor role, rate limiting and bounded real bytes',()=>{
    const api=read('src/routes/api/ai/order-intake/+server.ts');
    expect(api).toContain('aiRateLimit(rateLimitIdentifier(event))');
    expect(api).toContain('canEditDraft(user.role');
    expect(api).toContain("from('order_files')");
    expect(api).toContain(".eq('draft_order_id',order.id).eq('file_id',fileId)");
    expect(api).toContain("from('files')");
    expect(api).toContain("readOrderStoredFile(locals,file,toolkitMediaLimit(kind))");
    expect(api).toContain('matchesOrderFileSignature');
    expect(api).toContain('toolkitMediaContent(filename,file.mimetype,bytes)');
    expect(api).toContain('jsonSchema:{name:');
    expect(api).toContain("process.env.OPENROUTER_ORDER_INTAKE_STRICT==='false'");
    expect(api).toContain('{jsonMode:true}');
    expect(api).toContain('normalizeIntakeProposals(modelJson)');
    expect(api).toContain("process.env.OPENROUTER_TOOLKIT_PDF_OCR==='true'");
    expect(api).toContain("provenance:'model-reported'");
    expect(api).toContain("'Cache-Control':'private, no-store'");
    expect(api).not.toContain(".update(");
    expect(api).not.toContain(".insert(");
    expect(api).not.toContain('getPublicUrl');
    expect(api).not.toContain('getSignedUrl');
  });
  it('retired PDF endpoint cannot read binary as Latin1 or auto-update forms',()=>{
    const old=read('src/routes/api/ai/canvas/extract-pdf/+server.ts');
    expect(old).toContain("from '../../order-intake/+server'");
    expect(old).not.toContain('latin1');
    expect(old).not.toContain('pdf-parse');
    const editor=read('src/routes/orders/[id]/edit/+page.svelte');
    const pdf=editor.split('function extractPdfToForms()')[1]?.split('Tool definitions')[0]??'';
    expect(pdf).toContain("rightTab='intake'");
    expect(pdf).not.toContain("fetch(");
    expect(pdf).not.toContain('clientName = data.details');
    expect(editor).toContain('<OrderIntakeAssistant {orderId}');
  });
  it('forces explicit unchecked field approvals, verifies current state, never auto saves',()=>{
    const ui=read('src/lib/order/OrderIntakeAssistant.svelte');
    expect(ui).toContain('approvals={};');
    expect(ui).toContain('consent');
    expect(ui).toContain('confirmPaidOcr');
    expect(ui).toContain("fetch('/api/ai/order-intake'");
    expect(ui).toContain('JSON.stringify(current)!==baseState');
    expect(ui).toContain('fresh.updatedAt!==analysis.orderUpdatedAt');
    expect(ui).toContain('onApply(proposalsToPatch(accepted))');
    expect(ui).not.toContain("fetch('/api/draft-orders/");
    const editor=read('src/routes/orders/[id]/edit/+page.svelte');
    expect(editor).toContain('Only the allowlisted draft fields');
    expect(editor).toContain("rightTab='details'");
    expect(editor).toContain("canEdit");
  });
  it('keeps EN, LV and RU UI translation parity',()=>{
    const keys=Object.keys(JSON.parse(read('src/locales/en.json')).orderIntake);
    expect(keys.length).toBeGreaterThan(20);
    for(const lang of ['ru','lv']){
      const translated=JSON.parse(read(`src/locales/${lang}.json`)).orderIntake;
      for(const key of keys) expect(translated[key],`${lang}.${key}`).toBeTypeOf('string');
    }
  });
});
