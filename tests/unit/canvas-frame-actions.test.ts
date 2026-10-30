import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { normalizeCanvasActions, canvasActionsRequireBatch, canvasActionTargets, CANVAS_ACTION_INSTRUCTIONS } from '../../src/lib/components/canvas/toolkit-actions';
import { captureToolkitScene } from '../../src/lib/components/canvas/toolkit-scene';
import { applyToolkitActions } from '../../src/lib/components/canvas/toolkit-action-executor';
function editor(initial:any[]=[]){
  let shapes=structuredClone(initial),saved:any[]=[];let page='page:one';let calls=0;
  return {getCurrentPageShapes:()=>shapes,getSelectedShapeIds:()=>[],getCurrentPageId:()=>page,switchPage:()=>{page='page:two';},
    getShape:(id:string)=>shapes.find(s=>s.id===id),getInstanceState:()=>({isReadonly:false}),getViewportPageBounds:()=>({x:0,y:0,w:1200,h:900}),
    getShapePageBounds:(id:string)=>{const s=shapes.find(s=>s.id===id);return s?{x:s.x,y:s.y,w:s.props.w??100,h:s.props.h??100}:null;},
    createShape:(s:any)=>{calls++;shapes.push({...s,index:'a1',rotation:0,opacity:1,isLocked:false});},
    mark:()=>{if(!saved.length)saved=structuredClone(shapes);},run:(fn:()=>void)=>fn(),bailToMark:()=>{shapes=structuredClone(saved);},
    deleteShapes:(ids:string[])=>{shapes=shapes.filter(s=>!ids.includes(s.id));}, count:()=>calls, shapes:()=>shapes
  };
}
const frame=()=>({id:'shape:frame',type:'frame',parentId:'page:one',index:'a1',x:100,y:100,props:{w:800,h:600,name:'Production'},isLocked:false,rotation:0,opacity:1});
const create=(parentId?:unknown,type='note',ref?:string)=>({kind:'create',...(ref?{ref}:{}),shape:{type,x:30,y:40,...(parentId===undefined?{}:{parentId}),props:type==='frame'?{w:800,h:600,name:'Phase'}:{text:'Task'}},reason:'Organize'});
describe('reviewed frame-aware canvas creation',()=>{
  it('preserves frame ownership and stale guards through proposal persistence',()=>{
    const ed=editor([frame()]);const actions=normalizeCanvasActions([create('shape:frame')],captureToolkitScene(ed));
    assert.equal((actions[0] as any).shape.parentId,'shape:frame');assert.ok(actions[0].expected?.['shape:frame']);
    assert.deepEqual(normalizeCanvasActions(JSON.parse(JSON.stringify(actions))),actions);
    assert.deepEqual(canvasActionTargets(actions[0]),['shape:frame']);
    assert.equal(applyToolkitActions(ed,actions).ok,true);assert.equal(ed.shapes()[1].parentId,'shape:frame');assert.equal(ed.shapes()[1].x,30);
  });
  it('creates a frame and its nested objects in a single dependent batch',()=>{
    const ed=editor();const actions=normalizeCanvasActions([create(undefined,'frame','phase'),create('@phase','note','task')],captureToolkitScene(ed));
    assert.equal(actions.length,2);assert.equal(canvasActionsRequireBatch(actions),true);
    assert.equal(applyToolkitActions(ed,actions).ok,true);assert.equal(ed.shapes()[1].parentId,ed.shapes()[0].id);
  });
  it('rejects unknown, non-frame, self and forward parents without flattening children onto the page',()=>{
    const ed=editor([{...frame(),type:'geo'}]);
    for(const bad of [[create('shape:missing')],[create('shape:frame')],[create('@later'),create(undefined,'frame','later')],[create('@self','frame','self')],[create(null)],[create('page:other')],[create('javascript:bad')]]) assert.deepEqual(normalizeCanvasActions(bad,captureToolkitScene(ed)),[]);
    assert.deepEqual(normalizeCanvasActions([create(undefined,'note','notFrame'),create('@notFrame')],captureToolkitScene(editor())),[]);
  });
  it('rejects locked parents and parents with protected descendants',()=>{
    for(const items of [[{...frame(),isLocked:true}],[frame(),{...frame(),id:'shape:private',type:'chat',parentId:'shape:frame'}]]){
      assert.deepEqual(normalizeCanvasActions([create('shape:frame')],captureToolkitScene(editor(items))),[]);
    }
  });
  it('rejects stale frame proposals, changed pages and missing version guards',()=>{
    const ed=editor([frame()]);const actions=normalizeCanvasActions([create('shape:frame')],captureToolkitScene(ed));
    ed.shapes()[0].x=200;assert.equal(applyToolkitActions(ed,actions).messageKey,'canvas.editResult.stale');assert.equal(ed.count(),0);
    const ed2=editor([frame()]);const unguarded=normalizeCanvasActions([create('shape:frame')]);
    assert.equal(applyToolkitActions(ed2,unguarded).ok,false);assert.equal(ed2.count(),0);
    const ed3=editor([frame()]);ed3.switchPage();assert.equal(applyToolkitActions(ed3,actions).ok,false);
  });
  it('rolls back the whole batch when the editor fails to retain the requested parent',()=>{
    const ed=editor([frame()]);const original=ed.createShape;
    ed.createShape=(s:any)=>original({...s,parentId:'page:one'});
    const actions=normalizeCanvasActions([create('shape:frame')],captureToolkitScene(ed));
    assert.equal(applyToolkitActions(ed,actions).ok,false);assert.equal(ed.shapes().length,1);
  });
  it('keeps page-level creates compatible and rejects use after parent deletion',()=>{
    const ed=editor([frame()]);assert.equal(applyToolkitActions(ed,normalizeCanvasActions([create()],captureToolkitScene(ed))).ok,true);
    const actions=normalizeCanvasActions([{kind:'delete',targets:['shape:frame'],reason:'Remove'},create('shape:frame')],captureToolkitScene(ed));
    const before=ed.shapes().length;assert.equal(applyToolkitActions(ed,actions).ok,false);assert.equal(ed.shapes().length,before);
  });
  it('rejects malformed model shape values without throwing',()=>{
    for(const shape of [null,undefined,true,42,'frame',[],{parentId:'@later'}]) assert.deepEqual(normalizeCanvasActions([{kind:'create',shape}],captureToolkitScene(editor())),[]);
  });
  it('teaches OpenRouter the supported container contract without allowing arbitrary reparenting',()=>{
    assert.ok(CANVAS_ACTION_INSTRUCTIONS.includes('parentId?:'));assert.ok(CANVAS_ACTION_INSTRUCTIONS.includes('existing editable frame'));
    assert.deepEqual(normalizeCanvasActions([{kind:'update',target:'shape:frame',patch:{parentId:'page:other'}}],captureToolkitScene(editor([frame()]))),[]);
  });
});
