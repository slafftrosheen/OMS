import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {stageProgressSummary,stageProgressPercent} from '../../src/lib/order/workspace-navigation';
import {summarizeNativeProfileConfiguration} from '../../src/lib/order/native-profile-context';
const read=(path:string)=>readFileSync(path,'utf8');

describe('OMS-R37 — native production packet and manufacturing status',()=>{
 it('counts manufacturing, not delivery, and retains optional legacy/QC stages',()=>{
   const rows=[
     {station:'CAD',state:'COMPLETED'}, {station:'CNC',state:'COMPLETED'},
     {station:'EDGE',state:'COMPLETED'}, {station:'ASSEMBLY',state:'COMPLETED'},
     {station:'PAINT',state:'COMPLETED'}, {station:'PACKAGING',state:'COMPLETED'},
     {station:'DELIVERY',state:'NOT_STARTED'}
   ];
   expect(stageProgressPercent(rows)).toBe(100);
   expect(stageProgressSummary(rows)).toEqual({
     percent:100,completed:6,total:6,blocked:0,rework:0
   });
   const interrupted=rows.map(row=>row.station==='PAINT'
     ? {...row,state:'BLOCKED'}:row);
   interrupted.push({station:'QC',state:'REWORK'});
   expect(stageProgressSummary(interrupted)).toEqual({
     percent:71,completed:5,total:7,blocked:1,rework:1
   });
   expect(stageProgressSummary(null).percent).toBe(0);
   expect(stageProgressSummary([{station:'DELIVERY',state:'COMPLETED'}]).percent).toBe(0);
 });
 it('keeps disabled manufacturing options out of the compact read-only summary',()=>{
   const summary=summarizeNativeProfileConfiguration({
     profileName:'Letter A',
     CNC_FREZER:{face:'',faceThickness:'5'},
     PAINTING:{face:false,faceColor:{system:'RAL',code:'9005'},
       sides:true,sidesColor:{system:'RAL',code:'9010'}},
     ASSEMBLING:{led:false,ledModule:'Legacy LED'}
   });
   expect(summary.profileName).toBe('Letter A');
   expect(summary.sections.CNC_FREZER).toBeUndefined();
   expect(summary.sections.PAINTING).not.toHaveProperty('faceColorcode');
   expect(summary.sections.PAINTING?.sidesColorcode).toBe('9010');
   expect(summary.sections.ASSEMBLING).not.toHaveProperty('ledModule');
 });
 it('only reads canonical, authenticated, existing order/profile/file contracts',()=>{
   const packet=read('src/lib/components/station/StationProductionPacket.svelte');
   const draft=read('src/routes/api/draft-orders/[id]/+server.ts');
   const fileApi=read('src/routes/api/files/+server.ts');
   expect(packet).toContain('/api/draft-orders/');
   expect(packet).toContain('fetchOrderFilePage<FileRow>(orderId,0,50)');
   expect(packet).toContain('snapshot.profiles');
   expect(packet).toContain('snapshot.updatedAt');
   expect(packet).toContain('OrderNativeProfileForm');
   expect(packet).toContain('editable={false}');
   expect(packet).toContain('summarizeNativeProfileConfiguration(profile.configuration)');
   expect(packet).toContain('/api/files/');
   expect(packet).toContain('?download=true');
   expect(packet).toContain('/stages');
   expect(packet).toContain('row.draft_order_id===orderId');
   expect(packet).toContain('currentStage={state:found.state');
   expect(packet).toContain('currentStage=null');
   expect(packet).not.toContain('blockedReason={packetTarget.stage.blocked_reason}');
   expect(packet).toContain('fileTotal=null');
   expect(packet).not.toContain('openrouter');
   expect(packet).not.toContain('method:\'POST\'');
   expect(packet).not.toContain('method:\'PUT\'');
   expect(draft).toContain('profiles:order_profiles(');
   expect(draft).toContain('order_index ?? 0');
   expect(fileApi).toContain(".from('order_files')");
   expect(fileApi).toContain('X-Total-Count');
 });
 it('attaches the packet to station cards without giving it stage mutation actions',()=>{
   const board=read('src/routes/station/[station]/+page.svelte');
   expect(board).toContain('StationProductionPacket');
   expect(board).toContain('onclick={()=>packetTarget=order}');
   expect(board).toContain('{#key packetTarget.id}');
   expect(board).toContain('onClose={()=>packetTarget=null}');
   expect(board).toContain("order.stage?.state==='BLOCKED'||order.stage?.state==='REWORK'");
   expect(board).not.toContain('if(order.stage?.blocked_reason)');
 });
 it('shows manufacturing completion and blockers on the order detail without changing workflow control',()=>{
   const overview=read('src/routes/orders/[id]/+page.svelte');
   expect(overview).toContain('stageProgressSummary(order?.stages)');
   expect(overview).toContain('stageProgressPercent(order.stages)');
   expect(overview).toContain('stageSummary.blocked>0 || stageSummary.rework>0');
   expect(overview).toContain('stageRow.blocked_reason');
   expect(overview).toContain('mayControlStage($currentUser,stageRow.station)');
 });
 it('has equivalent packet keys in English, Russian and Latvian',()=>{
   const langs=['en','ru','lv'].map(lang=>
     JSON.parse(read(`src/locales/${lang}.json`)).productionPacket);
   const keys=Object.keys(langs[0]).sort();
   for(const lang of langs){
     expect(Object.keys(lang).sort()).toEqual(keys);
     for(const key of keys)expect(typeof lang[key]).toBe('string');
   }
   for(const key of ['loadFailed','held','viewOriginal','noFiles',
     'progressSummary','progressHeld','moreFiles','fullOrder'])
     expect(langs[0][key].length).toBeGreaterThan(5);
 });
});
