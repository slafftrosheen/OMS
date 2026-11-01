import { describe,it,expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  reconcileOrderMaterials,deterministicReadiness,parseReadinessModel,
  READINESS_JSON_SCHEMA,PRODUCTION_STATIONS,readinessEvidenceSchema
} from '../../src/lib/order/production-readiness';
import { openRouterRequestBody } from '../../src/lib/server/ai/openrouter';

const read=(file:string)=>readFileSync(file,'utf8');
const id='11111111-1111-4111-a111-111111111111';
const item='22222222-2222-4222-a222-222222222222';
const material={id,material_type:'ACRYLIC-3',quantity:6,unit:'PCS'};
const inventory=[{id:item,sku:'ACRYLIC-3',code:'MAT001',stock:7,min_stock:2,unit:'PCS'}];
const evidence=()=>({
  orderId:id,status:'PENDING_REVIEW',updatedAt:'2026-10-13T12:00:00Z',
  client:'Test customer',title:'Channel letters',dueDate:'2026-11-01',
  priority:'NORMAL',notes:'Check with customer',
  profiles:[{id,templateId:item,templateName:'Channel letters',templateCode:'P120',
    quantity1:6,quantity2:0,quantity3:0,quantity4:0}],
  materials:reconcileOrderMaterials([material],inventory),
  fileCount:1,stageCodes:[],inventoryChecked:true
});
describe('OMS-R14 grounded production intelligence',()=>{
  it('compares exact SKU/code only, checks units and distinguishes unknown inventory',()=>{
    const result=reconcileOrderMaterials([material],inventory);
    expect(result).toMatchObject([{match:'exact-sku',inventoryId:item,
      required:6,available:7,status:'sufficient'}]);
    expect(reconcileOrderMaterials([{...material,material_type:'Acrylic'}],inventory)[0].status)
      .toBe('unknown');
    expect(reconcileOrderMaterials([{...material,unit:'M2'}],inventory)[0].status)
      .toBe('unknown');
    expect(reconcileOrderMaterials([{...material,quantity:0}],inventory)[0].status)
      .toBe('unknown');
    expect(reconcileOrderMaterials([material],[...inventory,{...inventory[0],id}])[0].match)
      .toBe('ambiguous');
    expect(reconcileOrderMaterials([material],[{...inventory[0],stock:3}])[0].status)
      .toBe('insufficient');
  });
  it('blocks actual shortages and empty orders independently from the model',()=>{
    const ok=readinessEvidenceSchema.parse(evidence());
    expect(deterministicReadiness(ok).state).toBe('needs-review');
    expect(deterministicReadiness(ok).issues.some(i=>i.code==='low-stock-after-use')).toBe(true);
    const insufficient=readinessEvidenceSchema.parse({
      ...evidence(),materials:reconcileOrderMaterials([material],[{...inventory[0],stock:1}])
    });
    expect(deterministicReadiness(insufficient).state).toBe('blocked');
    expect(deterministicReadiness(insufficient).issues.some(i=>i.code==='stock-shortfall')).toBe(true);
    const missing=readinessEvidenceSchema.parse({...evidence(),profiles:[],dueDate:null,
      materials:[],fileCount:0});
    expect(deterministicReadiness(missing).state).toBe('blocked');
    expect(deterministicReadiness(missing).issues.map(i=>i.code)).toContain('missing-profiles');
    expect(deterministicReadiness(missing).issues.map(i=>i.code)).toContain('missing-deadline');
  });
  it('rejects model inventions of noncanonical stations or database operations',()=>{
    const good={summary:'Possible production route',recommendations:[
      {station:'CAD',why:'A production drawing is required',priority:'high'},
      {station:'CAD',why:'duplicate',priority:'normal'},
      {station:'ASSEMBLY',why:'Parts need assembly',priority:'normal'}
    ],risks:['Verify actual machine capacity'],questions:['Is the LED voltage known?']};
    expect(parseReadinessModel(good).recommendations.map(r=>r.station)).toEqual(['CAD','ASSEMBLY']);
    expect(()=>parseReadinessModel({...good,recommendations:[
      {station:'LASER_NEW',why:'Invented machine',priority:'high'}
    ]})).toThrow();
    expect(()=>parseReadinessModel({...good,confirmed:true})).toThrow();
    expect(PRODUCTION_STATIONS).toContain('EDGE');
    expect(PRODUCTION_STATIONS).toContain('DELIVERY');
  });
  it('requests strict structured OpenRouter JSON output and bounded station enums',()=>{
    const request=openRouterRequestBody({
      model:'provider/compatible-model',messages:[{role:'user',content:'Review evidence'}],
      jsonSchema:{name:'oms_production_readiness_v1',
        schema:READINESS_JSON_SCHEMA as unknown as Record<string,unknown>}
    });
    expect(request.response_format).toEqual({
      type:'json_schema',
      json_schema:{name:'oms_production_readiness_v1',strict:true,schema:READINESS_JSON_SCHEMA}
    });
    expect(request.provider).toEqual({require_parameters:true});
  });
  it('reads canonical RLS tables only and never executes a model-directed write',()=>{
    const api=read('src/routes/api/ai/order-readiness/+server.ts');
    for(const name of ['draft_orders','order_profiles','order_materials','order_files',
      'order_stages','materials','profile_templates']){
      expect(api).toContain(`from('${name}')`);
    }
    expect(api).toContain('locals.supabase');
    expect(api).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(api).toContain('canEditDraft(user.role');
    expect(api).toContain('canEditConfirmedMetadata(user.role)');
    expect(api).toContain('aiRateLimit(rateLimitIdentifier(event))');
    expect(api).toContain('consent:z.literal(true)');
    expect(api).toContain('profiles:evidence.profiles.slice(0,30)');
    expect(api).toContain('materials:evidence.materials.slice(0,50)');
    expect(api).toContain('limit(101)');
    expect(api).toContain('limit(1001)');
    expect(api).toContain('deterministicReadiness(evidence)');
    expect(api).toContain('reconcileOrderMaterials');
    expect(api).toContain('parseReadinessModel(candidate)');
    expect(api).toContain("ai:null,model:null");
    expect(api).not.toContain('.update(');
    expect(api).not.toContain('.insert(');
    expect(api).not.toContain('.rpc(');
    expect(api).not.toContain('createSignedUrl');
    expect(api).toContain("'Cache-Control':'private, no-store'");
  });
  it('shows honest outcomes, verified stock figures and station advice in the order editor',()=>{
    const panel=read('src/lib/order/OrderReadinessAssistant.svelte');
    const editor=read('src/routes/orders/[id]/edit/+page.svelte');
    expect(panel).toContain("fetch('/api/ai/order-readiness'");
    expect(panel).toContain('bind:checked={consent}');
    expect(panel).toContain('consent:true');
    expect(panel).toContain("report.aiWarning");
    expect(panel).toContain("report.materials");
    expect(panel).toContain("report.ai.recommendations");
    expect(panel).toContain("!currentReport");
    expect(editor).toContain('<OrderReadinessAssistant {orderId}');
    expect(editor).toContain("{ id: 'readiness', label: $t('productionReadiness.title') }");
    expect(editor).toContain("hidden={toolId !== 'readiness'}");
    expect(editor).toContain('content: orderAssistantContent');
    expect(editor).toContain("canRun={!!$currentUser && can($currentUser, 'editOrder')");
    expect(editor).toContain("fetch('/api/order/profile-choices'");
    expect(editor).toContain('showTemplates={true} templates={profileChoices}');
    const sheet=read('src/lib/order/OrderProfileSheet.svelte');
    expect(sheet).toContain('profileTemplateId: event.currentTarget.value || null');
    expect(sheet).toContain('profile_template_id: event.currentTarget.value || null');
    expect(sheet).toContain('disabled={!editable || !!templateError}');
    const catalog=read('src/routes/api/order/profile-choices/+server.ts');
    expect(catalog).toContain("if(!locals.user)throw error(401");
    expect(catalog).toContain("from('profile_templates')");
    expect(catalog).toContain(".eq('is_active',true)");
    expect(catalog).toContain("'Cache-Control':'private, no-store'");
  });
  it('maintains translation parity across EN/RU/LV',()=>{
    const en=JSON.parse(read('src/locales/en.json')).productionReadiness;
    expect(Object.keys(en).length).toBeGreaterThan(18);
    function flat(value:Record<string,unknown>,prefix=''):string[] {
      return Object.entries(value).flatMap(([k,v])=>v&&typeof v==='object'
        && !Array.isArray(v)?flat(v as Record<string,unknown>,prefix+k+'.')
        : [prefix+k]);
    }
    const required=flat(en);
    for(const language of ['ru','lv']){
      const translated=JSON.parse(read(`src/locales/${language}.json`)).productionReadiness;
      for(const path of required){
        const found=path.split('.').reduce((v,k)=>v?.[k],translated as any);
        expect(found,`${language}.${path}`).toBeTypeOf('string');
      }
    }
  });
});
