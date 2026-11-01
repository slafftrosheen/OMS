import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {
  WORKSPACE_GROUPS,sectionFromQuery,validWorkspaceSection,workspaceGroup,
  sectionsForGroup,workspaceUrl,suggestedWorkspaceSection,stageProgressPercent,
  mayControlStage
} from '../../src/lib/order/workspace-navigation';

const read=(path:string)=>readFileSync(path,'utf8');
describe('OMS-R16 consolidated order workspace',()=>{
  it('provides one canonical section route for all eight task views',()=>{
    const ids=WORKSPACE_GROUPS.flatMap(g=>g.sections);
    expect(ids).toHaveLength(8);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(['details','files','intake','readiness',
      'layers','revisions','changes','chat']);
    for(const section of ids){
      expect(validWorkspaceSection(section)).toBe(true);
      expect(sectionsForGroup(workspaceGroup(section))).toContain(section);
      expect(sectionFromQuery(section)).toBe(section);
      expect(workspaceUrl('e4f5463e-7fb7-4cbb-9949-4c455597248f',section))
        .toContain(`?section=${section}`);
    }
    expect(sectionFromQuery('external')).toBe('details');
    expect(sectionFromQuery(null)).toBe('details');
    expect(sectionFromQuery('../../api/orders')).toBe('details');
  });
  it('suggests useful next section without granting lifecycle permissions',()=>{
    expect(suggestedWorkspaceSection('DRAFT',false,false)).toBe('files');
    expect(suggestedWorkspaceSection('DRAFT',true,false)).toBe('readiness');
    expect(suggestedWorkspaceSection('PENDING_REVIEW',true,true)).toBe('changes');
    expect(suggestedWorkspaceSection('CONFIRMED',true,false)).toBe('readiness');
    expect(suggestedWorkspaceSection('IN_PRODUCTION',false,false)).toBe('readiness');
    expect(suggestedWorkspaceSection('ARCHIVED',true,false)).toBe('changes');
  });
  it('computes actual production progress from canonical array rows, never numeric indexes',()=>{
    expect(stageProgressPercent(null)).toBe(0);
    expect(stageProgressPercent([])).toBe(0);
    expect(stageProgressPercent({CAD:'COMPLETED'})).toBe(0);
    expect(stageProgressPercent([{station:'CAD',state:'COMPLETED'},
      {station:'CNC',state:'IN_PROGRESS'}, {station:'PACKAGING',state:'NOT_STARTED'}]))
      .toBe(33);
    expect(stageProgressPercent([{station:'CAD',state:'COMPLETED'},
      {station:'CNC',state:'SKIPPED'}])).toBe(100);
    expect(stageProgressPercent([{broken:true}])).toBe(0);
  });
  it('mirrors server station assignment for UI gating without treating it as security',()=>{
    expect(mayControlStage({role:'Boss'},'CAD')).toBe(true);
    expect(mayControlStage({role:'Operator',stations:[{stationId:'CNC'}]},'cnc')).toBe(true);
    expect(mayControlStage({role:'Operator',stations:[{stationId:'CAD'}]},'CNC')).toBe(false);
    expect(mayControlStage({role:'StationHead',stations:[]},'CAD')).toBe(false);
    expect(mayControlStage(null,'CAD')).toBe(false);
  });
  it('replaces the overloaded sidebar with grouped sections, focus mode and deep-link state',()=>{
    const editor=read('src/routes/orders/[id]/edit/+page.svelte');
    expect(editor).toContain('WORKSPACE_GROUPS');
    expect(editor).toContain('sectionsForGroup(activeGroup)');
    expect(editor).toContain("sectionFromQuery(query.get('section'))");
    expect(editor).toContain("url.searchParams.set('section',section)");
    expect(editor).toContain('pushState(url.pathname+url.search,{})');
    expect(editor).toContain("sectionFromQuery(page.url.searchParams.get('section'))");
    expect(editor).toContain('class:workspace-focused={focusPanel}');
    expect(editor).toContain('workspace-panel-heading');
    expect(editor).toContain('workspace-flow');
    expect(editor).toContain('workspace-focused .order-field-panel');
    expect(editor).toContain('@media(max-width:720px)');
  });
  it('guards unsaved form and canvas changes when leaving the order',()=>{
    const editor=read('src/routes/orders/[id]/edit/+page.svelte');
    expect(editor).toContain('savedFormFingerprint');
    expect(editor).toContain('formFingerprint() !== savedFormFingerprint');
    expect(editor).toContain('hasUnsavedChanges');
    // Pointer/navigation behavior is exercised by the editor browser spec;
    // registering a guard must not depend on the exact destructuring syntax.
    expect(editor).toContain('beforeNavigate(');
    expect(editor).toContain('onbeforeunload=');
    expect(editor).toContain('savedFormFingerprint=formFingerprint()');
    expect(editor).toContain("notifySuccess('Draft saved')");
  });
  it('reuses one private-file component across editor and overview',()=>{
    const editor=read('src/routes/orders/[id]/edit/+page.svelte');
    const overview=read('src/routes/orders/[id]/+page.svelte');
    const files=read('src/lib/order/OrderFiles.svelte');
    expect(editor).toContain('<OrderFiles {orderId} compact={true} onChanged={refreshFileCount}');
    expect(overview).toContain('<OrderFiles {orderId} onChanged=');
    expect(overview).not.toContain('<FileUpload');
    expect(overview).not.toContain('<FileList');
    expect(files).toContain('onChanged?: () => void');
    expect(files).toContain('onChanged?.()');
    expect(overview).toContain("goto(base + workspaceUrl(orderId,'details'))");
    expect(overview).toContain("goto(base + workspaceUrl(orderId,'layers'))");
    expect(overview).toContain("goto(base + workspaceUrl(orderId,'revisions'))");
  });
  it('does not offer invalid COMPLETED stage transitions from order overview',()=>{
    const detail=read('src/routes/orders/[id]/+page.svelte');
    expect(detail).toContain("Array.isArray(order.stages) ? order.stages : []");
    expect(detail).toContain("stageRow.state");
    expect(detail).toContain('stageProgressPercent(order.stages)');
    expect(detail).toContain('mayControlStage($currentUser,stageRow.station)');
    expect(detail).toMatch(/blocked_reason:\s*reason\.trim\(\)/);
    expect(detail).not.toContain('<option value="COMPLETED">');
    expect(detail).not.toContain('<option value="SKIPPED">');
  });
  it('shows actual pending reviews and records decisions without auto-applying diffs',()=>{
    const editor=read('src/routes/orders/[id]/edit/+page.svelte');
    const list=read('src/lib/order/ChangeRequestList.svelte');
    expect(editor).toContain('cr.proposed_diff??cr.changes??{}');
    expect(editor).toContain("pendingReviewCount");
    expect(editor).toContain("fetch(`/api/change-requests/${encodeURIComponent(requestId)}/review`");
    expect(editor).toContain('reviewInProgress');
    expect(editor).not.toContain("'/approve'");
    expect(list).toContain("p.status==='pending'");
    expect(list).toContain('JSON.stringify(p.proposed, null, 2)');
  });
  it('has full nested translation parity in English, Russian and Latvian',()=>{
    const locales=['en','ru','lv'].map(lang=>JSON.parse(read(`src/locales/${lang}.json`)));
    const flatten=(value:Record<string,unknown>,prefix=''):string[]=>
      Object.entries(value).flatMap(([k,v])=>v&&typeof v==='object'&&!Array.isArray(v)
        ? flatten(v as Record<string,unknown>,prefix+k+'.'):[prefix+k]);
    const required=flatten(locales[0].orderWorkspace);
    expect(required.length).toBeGreaterThan(25);
    for(const lang of locales.slice(1)){
      const keys=flatten(lang.orderWorkspace);
      expect(keys.sort()).toEqual([...required].sort());
    }
  });
});
