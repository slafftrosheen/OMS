import { describe, expect, it } from 'vitest';
import { captureToolkitScene, normalizeToolkitScene, canvasShapeVersion, MAX_SCENE_SHAPES } from '../../src/lib/components/canvas/toolkit-scene';
import { normalizeCanvasActions, normalizeEditableProps } from '../../src/lib/components/canvas/toolkit-actions';
import { applyToolkitActions, applyToolkitAction } from '../../src/lib/components/canvas/toolkit-action-executor';
import { parseToolkitModelResponse } from '../../src/lib/server/toolkit/ai-response';
import { sceneImageCandidates, loadSceneVision } from '../../src/lib/server/toolkit/scene-vision';
import { normalizeDrawingSnapshot, readToolkitAssistantRequest } from '../../src/lib/server/toolkit/drawing-snapshot';

function shape(id: string, type = 'geo', props: Record<string, unknown> = {}, extra: any = {}) {
  return { id: `shape:${id}`, type, x: 20, y: 30, rotation: 0, opacity: 1,
    parentId: 'page:one', index: `a${id}`, isLocked: false, props: { w: 200, h: 120, ...props }, ...extra };
}
function mockEditor(input: any[]) {
  let shapes = structuredClone(input);
  const marks = new Map<string, any[]>();
  const bindings: any[] = [];
  let selected: string[] = [];
  const calls: string[] = [];
  const editor: any = {
    calls, bindings,
    getCurrentPageShapes: () => shapes,
    getSelectedShapeIds: () => selected,
    select: (...ids: string[]) => { selected = ids; },
    getCurrentPageId: () => 'page:one',
    getInstanceState: () => ({ isReadonly: false }),
    getShape: (id: string) => shapes.find(shape => shape.id === id),
    getShapePageBounds: (id: string) => {
      const item = shapes.find(shape => shape.id === id);
      return item ? { x: item.x, y: item.y, w: item.props.w ?? 200, h: item.props.h ?? 120,
        center: { x: item.x + (item.props.w ?? 200) / 2, y: item.y + (item.props.h ?? 120) / 2 } } : null;
    },
    getShapeGeometry: (id: string) => ({ bounds: editor.getShapePageBounds(id) }),
    getBindingsFromShape: (id: string) => bindings.filter(binding => binding.fromId === id),
    getViewportPageBounds: () => ({ x: 0, y: 0, w: 1200, h: 800, center: { x: 600, y: 400 } }),
    updateShape: (patch: any) => {
      calls.push('update');
      shapes = shapes.map(shape => shape.id === patch.id ? { ...shape, ...patch, props: { ...shape.props, ...patch.props } } : shape);
    },
    updateShapes: (patches: any[]) => patches.forEach(editor.updateShape),
    nudgeShapes: (ids: string[], delta: any) => ids.forEach(id => {
      const item = editor.getShape(id); editor.updateShape({ id, x: item.x + delta.x, y: item.y + delta.y });
    }),
    resizeShape: (id: string, scale: any) => {
      const item = editor.getShape(id); editor.updateShape({ id, props: { w: item.props.w * scale.x, h: item.props.h * scale.y } });
    },
    createShape: (item: any) => { calls.push('create'); shapes.push({ x: 0, y: 0, rotation: 0, opacity: 1, index: 'z', isLocked: false, ...item }); },
    createBindings: (items: any[]) => { calls.push('bindings'); bindings.push(...items); },
    deleteShapes: (ids: string[]) => { calls.push('delete'); shapes = shapes.filter(shape => !ids.includes(shape.id)); },
    duplicateShapes: (ids: string[]) => { calls.push('duplicate'); for (const id of ids) shapes.push({ ...structuredClone(editor.getShape(id)), id: `${id}:copy` }); },
    groupShapes: () => { calls.push('group'); }, ungroupShapes: () => { calls.push('ungroup'); },
    bringToFront: () => { calls.push('front'); }, sendToBack: () => { calls.push('back'); },
    bringForward: () => { calls.push('forward'); }, sendBackward: () => { calls.push('backward'); },
    alignShapes: () => { calls.push('align'); }, distributeShapes: () => { calls.push('distribute'); },
    mark: (id: string) => { calls.push('mark'); marks.set(id, structuredClone(shapes)); },
    run: (fn: () => void) => { calls.push('run'); fn(); },
    bailToMark: (id: string) => { calls.push('rollback'); shapes = structuredClone(marks.get(id)!); }
  };
  return editor;
}

describe('Full Canvas scene context', () => {
  it('includes native drawings, text, media, hierarchy and selection without copying private node threads', () => {
    const editor = mockEditor([
      shape('text', 'text', { text: 'Welcome', color: 'violet' }),
      shape('image', 'document', { kind: 'image', fileId: '11111111-1111-4111-8111-111111111111', title: 'Logo', url: '/api/toolkit/assets/private/content' }),
      shape('freehand', 'draw', { segments: [{ points: [{x:0,y:0},{x:1,y:1}] }] }),
      shape('chat', 'chat', { title: 'Private chat', messages: [{content:'NEVER COPY THIS'}], content: 'SECRET' }),
      shape('calculator', 'lumigrid', { input: {ledCount:100}, output: {watts:123} }),
      shape('form', 'order-details', { title: 'Order', clientName: 'PRIVATE ORDER FIELD' })
    ]);
    editor.select('shape:image');
    const scene = captureToolkitScene(editor);
    expect(scene.shapes).toHaveLength(6);
    expect(scene.shapes[0].id).toBe('shape:image');
    expect(scene.selectedIds).toEqual(['shape:image']);
    expect(scene.shapes.find(s => s.id === 'shape:text')?.props.text).toBe('Welcome');
    expect(scene.shapes.find(s => s.id === 'shape:freehand')?.props.pointCount).toBe(2);
    expect(scene.shapes.find(s => s.id === 'shape:calculator')?.props.toolOutput).toBe('{"watts":123}');
    expect(scene.shapes.find(s => s.id === 'shape:form')?.editable).toBe(false);
    expect(JSON.stringify(scene)).not.toContain('NEVER COPY THIS');
    expect(JSON.stringify(scene)).not.toContain('PRIVATE ORDER FIELD');
    expect(JSON.stringify(scene)).not.toContain('/api/toolkit/assets/private/content');
  });
  it('clearly reports bounded boards while retaining selected shapes', () => {
    const editor = mockEditor(Array.from({length:220}, (_, i) => shape(String(i))));
    editor.select('shape:219');
    const scene = captureToolkitScene(editor);
    expect(scene.shapes).toHaveLength(MAX_SCENE_SHAPES);
    expect(scene.shapes[0].id).toBe('shape:219');
    expect(scene.totalShapes).toBe(220);
    expect(scene.truncated).toBe(true);
  });
  it('locks ancestors containing protected nodes, and children of locked groups', () => {
    const editor = mockEditor([
      shape('group', 'group'), shape('form', 'profile-7st', {}, {parentId:'shape:group'}),
      shape('locked', 'group', {}, {isLocked:true}), shape('child', 'geo', {}, {parentId:'shape:locked'})
    ]);
    const scene = captureToolkitScene(editor);
    expect(scene.shapes.every(item => !item.editable)).toBe(true);
  });
  it('fingerprints include position, content, parent, lock and size changes but not key insertion order', () => {
    const a = shape('a');
    expect(canvasShapeVersion(a)).toBe(canvasShapeVersion({...a, props:{h:120,w:200}}));
    expect(canvasShapeVersion(a) === canvasShapeVersion({...a, x:30})).toBe(false);
    expect(canvasShapeVersion(a) === canvasShapeVersion({...a, props:{...a.props,text:'Changed'}})).toBe(false);
    expect(canvasShapeVersion(a) === canvasShapeVersion({...a, parentId:'shape:other'})).toBe(false);
    expect(normalizeToolkitScene({version:1,shapes:Array(201).fill(a)})).toBeNull();
  });
});

describe('Validated Canvas proposals', () => {
  it('permits cohesive native geometry, style, text, creation and arrangement operations', () => {
    const editor = mockEditor([shape('a'),shape('b'),shape('c')]);
    const scene = captureToolkitScene(editor);
    const proposals = normalizeCanvasActions([
      {kind:'update',target:'shape:a',patch:{rotation:Math.PI/2,props:{text:'New label',color:'violet'}},reason:'Highlight'},
      {kind:'move',targets:['shape:b'],dx:100,dy:50},
      {kind:'resize',target:'shape:b',width:400,height:240},
      {kind:'align',targets:['shape:a','shape:b'],alignment:'top'},
      {kind:'distribute',targets:['shape:a','shape:b','shape:c'],axis:'horizontal'},
      {kind:'create',shape:{type:'text',x:100,y:0,props:{text:'Heading',font:'sans'}}},
      {kind:'delete',targets:['shape:c']}
    ],scene);
    expect(proposals).toHaveLength(7);
    expect(proposals[0].expected?.['shape:a']).toBe(canvasShapeVersion(editor.getShape('shape:a')));
    expect(proposals[0].pageId).toBe('page:one');
    const parsed = parseToolkitModelResponse(JSON.stringify({reply:'Ready',actions:proposals}),scene,'Fallback');
    expect(parsed.actions).toHaveLength(7);
  });
  it('rejects arbitrary fields, unsafe URLs, missing targets, nonfinite dimensions, and protected form writes', () => {
    const editor = mockEditor([shape('a'),shape('order','order-details')]);
    expect(normalizeCanvasActions([
      {kind:'update',target:'shape:a',patch:{parentId:'shape:order'}},
      {kind:'update',target:'shape:a',patch:{props:{onClick:'evil'}}},
      {kind:'update',target:'shape:order',patch:{props:{clientName:'Overwrite'}}},
      {kind:'delete',targets:['shape:missing']},
      {kind:'resize',target:'shape:a',width:Infinity,height:100},
      {kind:'create',shape:{type:'document',x:0,y:0,props:{url:'javascript:alert(1)'}}},
      {kind:'create',shape:{type:'document',x:0,y:0,props:{url:'http://localhost/private'}}}
    ],captureToolkitScene(editor))).toEqual([]);
    expect(normalizeEditableProps('geo',{w:0})).toBeNull();
    expect(normalizeEditableProps('text',{text:''})).toEqual({text:''});
  });
  it('creates media only through the same safe URL policy as manual paste', () => {
    const scene = captureToolkitScene(mockEditor([]));
    const actions = normalizeCanvasActions([
      {kind:'create',shape:{type:'document',x:100,y:50,props:{url:'https://youtu.be/dQw4w9WgXcQ'}}},
      {kind:'create',shape:{type:'document',x:100,y:50,props:{url:'https://example.com/video.mp4',kind:'image'}}}
    ],scene);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({shape:{props:{kind:'embed'}}});
  });
  it('keeps old card-only callers conservative and preserves guards when saving private proposals', () => {
    expect(normalizeCanvasActions([{kind:'delete',targets:['shape:a']}],new Set(['shape:a']))).toEqual([]);
    const scene = captureToolkitScene(mockEditor([shape('a')]));
    const action = normalizeCanvasActions([{kind:'delete',targets:['shape:a']}],scene)[0];
    expect(normalizeCanvasActions([action])[0]).toEqual(action);
  });
});

describe('Atomic reviewed Canvas editing', () => {
  it('applies multiple changes in one transaction with one undo boundary', () => {
    const editor = mockEditor([shape('a'),shape('b')]);
    const actions = normalizeCanvasActions([
      {kind:'update',target:'shape:a',patch:{props:{text:'Final label',color:'green'}}},
      {kind:'move',targets:['shape:a','shape:b'],dx:80,dy:20},
      {kind:'resize',target:'shape:b',width:400,height:240}
    ],captureToolkitScene(editor));
    expect(applyToolkitActions(editor,actions).ok).toBe(true);
    expect(editor.getShape('shape:a')).toMatchObject({x:100,y:50,props:{text:'Final label',color:'green'}});
    expect(editor.getShape('shape:b').props).toMatchObject({w:400,h:240});
    expect(editor.calls.filter((c:string)=>c==='run')).toHaveLength(1);
    expect(editor.calls.filter((c:string)=>c==='mark')).toHaveLength(2);
  });
  it('blocks changed content/geometry and newly added descendants before touching any shape', () => {
    const editor = mockEditor([shape('group','group'),shape('child','geo',{}, {parentId:'shape:group'})]);
    const action = normalizeCanvasActions([{kind:'delete',targets:['shape:group']}],captureToolkitScene(editor))[0];
    editor.createShape(shape('new-child','geo',{}, {parentId:'shape:group'}));
    editor.calls.length = 0;
    expect(applyToolkitAction(editor,action).messageKey).toBe('canvas.editResult.stale');
    expect(editor.calls).toEqual([]);
    const edit = normalizeCanvasActions([{kind:'update',target:'shape:child',patch:{x:100}}],captureToolkitScene(editor))[0];
    editor.updateShape({id:'shape:child',props:{text:'Human edit'}}); editor.calls.length=0;
    expect(applyToolkitAction(editor,edit).ok).toBe(false);
    expect(editor.calls).toEqual([]);
  });
  it('blocks removal of groups containing order forms, missing targets, locked parents and page changes', () => {
    const editor = mockEditor([shape('a'),shape('group','group'),shape('form','order-details',{}, {parentId:'shape:group'})]);
    const forged:any = {kind:'delete',targets:['shape:group'],reason:'',expected:{}};
    expect(applyToolkitAction(editor,forged).messageKey).toBe('canvas.editResult.protected');
    const action = normalizeCanvasActions([{kind:'delete',targets:['shape:a']}],captureToolkitScene(editor))[0];
    editor.getCurrentPageId=()=> 'page:two';
    expect(applyToolkitAction(editor,action).messageKey).toBe('canvas.editResult.pageChanged');
    editor.getCurrentPageId=()=> 'page:one'; editor.deleteShapes(['shape:a']); editor.calls.length=0;
    expect(applyToolkitAction(editor,action).messageKey).toBe('canvas.editResult.missing');
    expect(editor.calls).toEqual([]);
  });
  it('rolls the whole proposal back when a later editor operation fails', () => {
    const editor = mockEditor([shape('a'),shape('b')]);
    const before = structuredClone(editor.getCurrentPageShapes());
    const actions = normalizeCanvasActions([
      {kind:'update',target:'shape:a',patch:{props:{text:'Changed'}}},
      {kind:'connect',from:'shape:a',to:'shape:b'}
    ],captureToolkitScene(editor));
    editor.createBindings=()=>{throw new Error('Editor schema rejected binding');};
    expect(applyToolkitActions(editor,actions).messageKey).toBe('canvas.editResult.failed');
    expect(editor.getCurrentPageShapes()).toEqual(before);
    expect(editor.calls).toContain('rollback');
  });
  it('creates bound arrows between native shapes and rejects duplicate links', () => {
    const editor=mockEditor([shape('a'),shape('b')]);
    const action=normalizeCanvasActions([{kind:'connect',from:'shape:a',to:'shape:b',label:'Flow'}],captureToolkitScene(editor))[0];
    expect(applyToolkitAction(editor,action).ok).toBe(true);
    expect(editor.bindings.map((b:any)=>b.toId)).toEqual(['shape:a','shape:b']);
    expect(editor.getCurrentPageShapes().find((s:any)=>s.type==='arrow').props.text).toBe('Flow');
    expect(applyToolkitAction(editor,action).messageKey).toBe('canvas.editResult.duplicateConnection');
  });
});

function visionDb(assets: any[], boardVisible=true) {
  const downloads:string[]=[]; const lookups:any[]=[];
  const png=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0]);
  return {
    downloads,lookups,
    from(table:string){
      const filters:Record<string,string>={};
      const query:any={select:()=>query,eq:(key:string,value:string)=>{filters[key]=value;return query;},
        maybeSingle:async()=>{lookups.push({table,filters});return {error:null,data:table==='canvas_documents'?(boardVisible?{id:filters.id}:null):assets.find(a=>a.id===filters.id&&a.canvas_id===filters.canvas_id)??null};}};
      return query;
    },
    storage:{from:()=>({download:async(path:string)=>{downloads.push(path);return {data:new Blob([png]),error:null};}})}
  };
}
describe('Authorized real image context', () => {
  const board='22222222-2222-4222-8222-222222222222';
  const asset='11111111-1111-4111-8111-111111111111';
  it('selects bounded actual file IDs, never a web URL or arbitrary image payload', () => {
    const editor=mockEditor([
      shape('web','document',{kind:'image',url:'https://example.com/private.png'}),
      shape('file','document',{kind:'image',fileId:asset}),
      shape('duplicate','document',{kind:'image',fileId:asset})
    ]);
    editor.select('shape:duplicate');
    expect(sceneImageCandidates(captureToolkitScene(editor))).toEqual([{shapeId:'shape:duplicate',assetId:asset}]);
  });
  it('downloads only a same-board RLS-visible asset, checks bytes, and emits real base64 pixels', async()=>{
    const db=visionDb([{id:asset,canvas_id:board,mime_type:'image/png',file_name:'Logo.png',storage_path:'private/logo.png',bytes:12}]);
    const scene=captureToolkitScene(mockEditor([shape('image','document',{kind:'image',fileId:asset})]));
    const result=await loadSceneVision(db,board,scene);
    expect(result.included).toHaveLength(1);
    expect(result.parts[1]).toMatchObject({type:'image_url'});
    expect(JSON.stringify(result.parts)).toContain('data:image/png;base64,');
    expect(JSON.stringify(result.parts)).not.toContain('private/logo.png');
    expect(db.downloads).toEqual(['private/logo.png']);
    expect(db.lookups[1].filters).toEqual({id:asset,canvas_id:board});
  });
  it('rejects invisible boards and skips mismatched ownership or oversized images without downloading', async()=>{
    const scene=captureToolkitScene(mockEditor([shape('image','document',{kind:'image',fileId:asset})]));
    const invisible=visionDb([],false);
    let denied=false;try{await loadSceneVision(invisible,board,scene);}catch{denied=true;}
    expect(denied).toBe(true);expect(invisible.downloads).toEqual([]);
    const otherBoard=visionDb([{id:asset,canvas_id:'different',mime_type:'image/png',bytes:12}]);
    expect((await loadSceneVision(otherBoard,board,scene)).included).toEqual([]);
    expect(otherBoard.downloads).toEqual([]);
    const large=visionDb([{id:asset,canvas_id:board,mime_type:'image/png',bytes:5*1024*1024}]);
    expect((await loadSceneVision(large,board,scene)).skipped[0].reason).toBe('tooLarge');
    expect(large.downloads).toEqual([]);
  });
});

describe('Bounded drawing pixel context', () => {
  function snapshot(width=320,height=180) {
    const png=Buffer.alloc(33);
    Buffer.from([137,80,78,71,13,10,26,10]).copy(png);
    png.writeUInt32BE(13,8);png.write('IHDR',12,'ascii');png.writeUInt32BE(width,16);png.writeUInt32BE(height,20);
    return {dataUrl:`data:image/png;base64,${png.toString('base64')}`,width,height,shapeIds:['shape:a'],scope:'page',omitted:2};
  }
  const scene=captureToolkitScene(mockEditor([shape('a')]));
  it('requires actual PNG signature, bounded dimensions and shapes from the supplied scene',()=>{
    expect(normalizeDrawingSnapshot(snapshot(),scene)?.shapeIds).toEqual(['shape:a']);
    expect(()=>normalizeDrawingSnapshot(snapshot(2000),scene)).toThrow();
    expect(()=>normalizeDrawingSnapshot({...snapshot(),width:10},scene)).toThrow();
    expect(()=>normalizeDrawingSnapshot({...snapshot(),shapeIds:['shape:unknown']},scene)).toThrow();
    expect(()=>normalizeDrawingSnapshot({...snapshot(),dataUrl:'data:image/svg+xml;base64,PHN2Zz4='},scene)).toThrow();
    expect(()=>normalizeDrawingSnapshot({...snapshot(),dataUrl:'data:image/png;base64,'+Buffer.alloc(33).toString('base64')},scene)).toThrow();
  });
  it('bounds streaming assistant bodies independently of the larger media upload limit',async()=>{
    expect(await readToolkitAssistantRequest(new Request('https://example.com',{method:'POST',body:JSON.stringify({prompt:'Edit'})}))).toEqual({prompt:'Edit'});
    let oversized=false;
    try { await readToolkitAssistantRequest(new Request('https://example.com',{method:'POST',body:'x'.repeat(2*1024*1024+1)})); } catch { oversized=true; }
    expect(oversized).toBe(true);
    let invalid=false;
    try { await readToolkitAssistantRequest(new Request('https://example.com',{method:'POST',body:'not json'})); } catch { invalid=true; }
    expect(invalid).toBe(true);
  });
});
