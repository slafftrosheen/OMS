import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {deriveProductionOversight,STAGE_UNCHANGED_HOURS}
  from '../../src/lib/order/production-oversight';
import {deriveProductionPlanning,type OrderRow,type StageRow}
  from '../../src/lib/order/production-planning';

const read=(path:string)=>readFileSync(path,'utf8');
const asOf='2026-10-16T18:00:00.000Z';
const orders:OrderRow[]=[
  {id:'alpha',status:'IN_PRODUCTION',title:'Letter A',po_number:'PO-1'},
  {id:'beta',status:'ON_HOLD',title:'Hold'},
  {id:'gamma',status:'DISPATCHED',title:'Delivered'},
  {id:'delta',status:'READY_TO_LOAD',title:'Ready'}
];

describe('OMS-R39 — manager production oversight',()=>{
  it('flags elapsed stage updates only on active unpaused work, not as a claim of inactivity',()=>{
    expect(STAGE_UNCHANGED_HOURS).toBe(72);
    const stages:StageRow[]=[
      {draft_order_id:'alpha',station:'CNC',state:'IN_PROGRESS',
        updated_at:'2026-10-13T17:59:59Z'},
      {draft_order_id:'alpha',station:'CAD',state:'QUEUED',
        updated_at:'2026-10-13T18:00:00Z'},
      {draft_order_id:'alpha',station:'PAINT',state:'NOT_STARTED',
        updated_at:'2026-10-12T00:00:00Z'},
      {draft_order_id:'beta',station:'EDGE',state:'QUEUED',
        updated_at:'2026-10-10T00:00:00Z'},
      {draft_order_id:'gamma',station:'CNC',state:'IN_PROGRESS',
        updated_at:'2026-10-01T00:00:00Z'},
      {draft_order_id:'alpha',station:'ASSEMBLY',state:'IN_PROGRESS',
        updated_at:'not-a-date'}
    ];
    const result=deriveProductionOversight(orders,stages,asOf);
    expect(result.unchangedCount).toBe(2);
    expect(result.skippedCount).toBe(0);
    expect(result.signals.map(x=>x.station)).toEqual(['CNC','CAD']);
    expect(result.signals[0]).toMatchObject({
      kind:'STAGE_UNCHANGED',poNumber:'PO-1',elapsedHours:72,
      stageState:'IN_PROGRESS'
    });
  });
  it('reports actual material-declaration skips on completed stages without claiming an outstanding debt',()=>{
    const result=deriveProductionOversight(orders,[
      {draft_order_id:'alpha',station:'CAD',state:'COMPLETED',
        consumption_skipped:true,consumption_skipped_reason:'No stock used',
        completed_at:'2026-10-15T18:00:00Z'},
      {draft_order_id:'delta',station:'PAINT',state:'COMPLETED',
        consumption_skipped:false,completed_at:'2026-10-15T18:00:00Z'},
      {draft_order_id:'gamma',station:'CNC',state:'COMPLETED',
        consumption_skipped:true,completed_at:'2026-10-15T18:00:00Z'}
    ],asOf);
    expect(result).toMatchObject({skippedCount:1,unchangedCount:0,total:1});
    expect(result.signals[0]).toMatchObject({
      kind:'MATERIAL_SKIPPED',station:'CAD',reason:'No stock used',
      elapsedHours:24
    });
    expect(result.signals[0].key).toBe('alpha:CAD:MATERIAL_SKIPPED');
  });
  it('keeps both categories visible when there are many more records than the preview permits',()=>{
    const many:StageRow[]=[];
    const largeOrders:OrderRow[]=[];
    for(let i=0;i<130;i++){
      const id='o'+i;
      largeOrders.push({id,status:'IN_PRODUCTION'});
      many.push({draft_order_id:id,station:'CAD',state:'COMPLETED',
        consumption_skipped:true,updated_at:'2026-10-10T00:00:00Z'});
      many.push({draft_order_id:id,station:'CNC',state:'QUEUED',
        updated_at:'2026-10-10T00:00:00Z'});
    }
    const result=deriveProductionOversight(largeOrders,many,asOf);
    expect(result.total).toBe(260);
    expect(result.skippedCount).toBe(130);
    expect(result.unchangedCount).toBe(130);
    expect(result.truncated).toBe(true);
    expect(result.signals).toHaveLength(100);
    expect(result.signals.filter(x=>x.kind==='MATERIAL_SKIPPED')).toHaveLength(50);
    expect(result.signals.filter(x=>x.kind==='STAGE_UNCHANGED')).toHaveLength(50);
  });
  it('does not alter existing stage planning counts just to find material audit records',()=>{
    const rows:StageRow[]=[
      {draft_order_id:'alpha',station:'CNC',state:'IN_PROGRESS'},
      {draft_order_id:'alpha',station:'CAD',state:'COMPLETED',consumption_skipped:true}
    ];
    const planning=deriveProductionPlanning(orders,rows,'2026-10-16');
    expect(planning.totals.activeAssignments).toBe(1);
    expect(planning.stations.CAD).toHaveLength(0);
    expect(planning.stations.CNC).toHaveLength(1);
  });
  it('returns detailed oversight only for management roles in the existing RLS backed board API',()=>{
    const api=read('src/routes/api/production/board/+server.ts');
    expect(api).toContain("canManageSharedInventory(locals.user.role)");
    expect(api).toContain("deriveProductionOversight(orders,stages,asOf):null");
    expect(api).toContain("consumption_skipped,consumption_skipped_reason");
    expect(api).not.toContain(".neq('state','COMPLETED')");
    expect(api).toContain("from('draft_orders')");
    expect(api).toContain("from('order_stages')");
    expect(api).toContain("'Cache-Control':'private, no-store'");
    expect(api).toContain('STAGE_ID_CHUNK=50');
  });
  it('provides manager-only UI, evidence caveats, and links to the existing exception queue',()=>{
    const page=read('src/routes/production/+page.svelte');
    expect(page).toContain("['RD','Boss','HeadOfProduction']");
    expect(page).toContain('{#if isManager && oversight}');
    expect(page).toContain("payload.oversight");
    expect(page).toContain('/production/exceptions');
    expect(page).toContain("productionOversight.explanation");
    expect(page).toContain('oversight.truncated');
    expect(page).not.toContain("api/production/oversight");
  });
  it('translates review signals, limitations and call-to-action in all supported languages',()=>{
    const labels=['title','explanation','reviewQueue','unchangedCount','skippedCount',
      'filter','all','stageUnchanged','materialSkipped','ago','inspectOrder',
      'noFindings','truncated','showMore'];
    for(const lang of ['en','ru','lv']){
      const content=JSON.parse(read(`src/locales/${lang}.json`)).productionOversight;
      for(const key of labels)expect(typeof content[key]).toBe('string');
      expect(content.ago).toContain('{hours}');
      expect(content.truncated).toContain('{limit}');
    }
  });
});
