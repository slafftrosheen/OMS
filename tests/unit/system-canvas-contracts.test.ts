import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { normalizeCanvasActions, canvasActionsRequireBatch } from '../../src/lib/components/canvas/toolkit-actions';
import { captureToolkitScene } from '../../src/lib/components/canvas/toolkit-scene';
import { applyToolkitActions } from '../../src/lib/components/canvas/toolkit-action-executor';

function editorFixture() {
  const card = { id:'shape:card',type:'idea-card',parentId:'page:main',index:'a1',x:10,y:20,
    rotation:0,opacity:1,isLocked:false,props:{w:290,h:222,title:'Keep this title',body:'Keep these details',kind:'idea',state:'open',accent:'#8775d1'} };
  const shapes = new Map<string,any>([[card.id,structuredClone(card)]]);
  const marks = new Map<string,any[]>();
  const calls:string[]=[];
  const editor:any = {
    shapes,calls,failWrite:false,
    getCurrentPageShapes:()=>[...shapes.values()], getCurrentPageId:()=> 'page:main',getSelectedShapeIds:()=> ['shape:card'],
    getInstanceState:()=>({isReadonly:false}),getShape:(id:string)=>shapes.get(id), getCurrentToolId:()=> 'select',
    getShapePageBounds:(id:string)=>{const s=shapes.get(id);return {x:s.x,y:s.y,w:s.props.w,h:s.props.h};},
    mark:(id:string)=>{calls.push('mark');marks.set(id,structuredClone([...shapes.values()]));},
    run:(fn:()=>void)=>{calls.push('run');fn();},
    bailToMark:(id:string)=>{calls.push('rollback');shapes.clear();for(const s of marks.get(id)??[])shapes.set(s.id,s);},
    updateShape:(patch:any)=>{calls.push('write');const s=shapes.get(patch.id);shapes.set(s.id,{...s,...patch,props:{...s.props,...patch.props}});if(editor.failWrite)throw new Error('storage fixture failure');},
    createShape:(shape:any)=>{calls.push('create');shapes.set(shape.id,{index:'a2',rotation:0,opacity:1,isLocked:false,...shape});}
  };
  return editor;
}
const proposal=(patch:object)=>({kind:'revise',target:'shape:card',reason:'Requested edit',...patch});
function roundtrip(editor:any,patch:object) {
  const proposed=normalizeCanvasActions([proposal(patch)],captureToolkitScene(editor));
  return normalizeCanvasActions(JSON.parse(JSON.stringify(proposed)));
}

describe('Canvas proposal -> persisted JSON -> editor contract',()=>{
  it('preserves the title when the model revises only the body',()=>{
    const editor=editorFixture(),actions=roundtrip(editor,{body:'New details'});
    assert.equal(actions.length,1);assert.equal('title' in actions[0],false);
    assert.equal(applyToolkitActions(editor,actions).ok,true);
    assert.equal(editor.getShape('shape:card').props.title,'Keep this title');
    assert.equal(editor.getShape('shape:card').props.body,'New details');
    assert.deepEqual(editor.calls,['mark','run','write','mark']);
  });
  it('preserves the body when revising only a title',()=>{
    const editor=editorFixture(),actions=roundtrip(editor,{title:'New title'});
    assert.equal('body' in actions[0],false);assert.equal(applyToolkitActions(editor,actions).ok,true);
    assert.equal(editor.getShape('shape:card').props.body,'Keep these details');
  });
  it('allows explicit empty text without clearing any omitted field',()=>{
    const editor=editorFixture();assert.equal(applyToolkitActions(editor,roundtrip(editor,{body:''})).ok,true);
    assert.equal(editor.getShape('shape:card').props.body,'');assert.equal(editor.getShape('shape:card').props.title,'Keep this title');
  });
  it('continues accepting complete older revision proposals',()=>{
    const editor=editorFixture();assert.equal(applyToolkitActions(editor,roundtrip(editor,{title:'Both',body:'Changed',state:'done'})).ok,true);
    assert.equal(editor.getShape('shape:card').props.state,'done');assert.equal(editor.getShape('shape:card').props.title,'Both');
  });
  it('rejects explicitly malformed fields rather than converting them to destructive empty strings',()=>{
    const scene=captureToolkitScene(editorFixture());
    for(const patch of [{title:42,body:'valid'},{body:null,title:'valid'},{title:'valid',state:'invented'}]) {
      assert.deepEqual(normalizeCanvasActions([proposal(patch)],scene),[]);
    }
  });
  it('rejects invalid supplied scenes instead of falling back to unscoped persistence parsing',()=>{
    for(const scene of [null,{},0,'bad',[],{version:2,shapes:[]},{version:1,shapes:Array(201).fill({})}]) {
      assert.deepEqual(normalizeCanvasActions([proposal({title:'Do not apply'})],scene as any),[]);
    }
  });
  it('retains the intentional no-context parser for saved proposals',()=>{
    assert.equal(normalizeCanvasActions([proposal({title:'Saved'})]).length,1);
    assert.equal(normalizeCanvasActions([proposal({title:'Saved'})],new Set(['shape:other'])).length,0);
  });
  it('rejects stale revisions after another user edit',()=>{
    const editor=editorFixture(),actions=roundtrip(editor,{title:'Old request'});
    editor.getShape('shape:card').props.body='User changed this';
    assert.equal(applyToolkitActions(editor,actions).messageKey,'canvas.editResult.stale');assert.deepEqual(editor.calls,[]);
  });
  it('keeps locked shape protection after proposal creation',()=>{
    const editor=editorFixture(),actions=roundtrip(editor,{title:'Do not write'});editor.getShape('shape:card').isLocked=true;
    assert.equal(applyToolkitActions(editor,actions).messageKey,'canvas.editResult.protected');assert.deepEqual(editor.calls,[]);
  });
  it('rolls back a failed edit with the existing undo boundary',()=>{
    const editor=editorFixture(),actions=roundtrip(editor,{body:'Temporary'});editor.failWrite=true;
    assert.equal(applyToolkitActions(editor,actions).ok,false);
    assert.equal(editor.getShape('shape:card').props.body,'Keep these details');
    assert.deepEqual(editor.calls,['mark','run','write','rollback']);
  });
  it('preserves real frame parenting and named batch dependencies',()=>{
    const editor=editorFixture();
    const actions=normalizeCanvasActions([
      {kind:'create',ref:'phase',shape:{type:'frame',x:10,y:10,props:{name:'Phase',w:900,h:600}},reason:''},
      {kind:'create',ref:'task',shape:{type:'idea-card',x:30,y:60,parentId:'@phase',props:{title:'Task',body:'Keep me'}},reason:''},
      {kind:'revise',target:'@task',body:'Refined',reason:''}
    ],captureToolkitScene(editor));
    assert.equal(canvasActionsRequireBatch(actions),true);assert.equal(actions.length,3);
    assert.equal(applyToolkitActions(editor,normalizeCanvasActions(JSON.parse(JSON.stringify(actions)))).ok,true);
    const frame=editor.getCurrentPageShapes().find((s:any)=>s.type==='frame');
    const task=editor.getCurrentPageShapes().find((s:any)=>s.parentId===frame.id);
    assert.equal(task.props.title,'Task');assert.equal(task.props.body,'Refined');
    assert.equal(editor.calls.filter((c:string)=>c==='run').length,1);
  });
});
