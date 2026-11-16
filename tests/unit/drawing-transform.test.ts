import {describe,it} from 'vitest';
import assert from 'node:assert/strict';
import {Box} from '@tldraw/tldraw';
import {prepareTransformPlan,applyTransformPlan,transformAnchorPoint,type TransformOptions} from '../../src/lib/components/canvas/drawing-transform';

const shape=(id:string,x=0,y=0,w=100,h=50,extra:Record<string,any>={}):any=>({id,type:'geo',parentId:'page:a',x,y,rotation:0,isLocked:false,meta:{},props:{w,h,geo:'rectangle'},...extra});
const move=(values:Partial<TransformOptions>={}):TransformOptions=>({kind:'position',relative:true,x:10,y:20,anchor:'center',copies:0,...values} as TransformOptions);
const scale=(values:Partial<TransformOptions>={}):TransformOptions=>({kind:'scale',x:2,y:2,anchor:'center',copies:0,...values} as TransformOptions);
function canvas(initial:any[],selected=initial.filter(s=>s.parentId==='page:a').map(s=>s.id)){
  let records=new Map(initial.map(s=>[s.id,structuredClone(s)])),ids=[...selected],readOnly=false,sequence=0,snapshot:any;
  let refuse=false,clamp=false,incomplete=false,resizeCalls=0,rollbacks=0,marks=0;
  const matrix=(input:any):any=>{
    const s=typeof input==='string'?records.get(input):input,parent=records.get(s.parentId),up=parent?matrix(parent):null;
    const origin=up?up.applyToPoint(s):{x:s.x,y:s.y},angle=s.rotation+(up?.rotation()??0);
    return {point:()=>({...origin}),rotation:()=>angle,applyToPoint:(p:any)=>({x:origin.x+p.x*Math.cos(angle)-p.y*Math.sin(angle),y:origin.y+p.x*Math.sin(angle)+p.y*Math.cos(angle)})};
  };
  const parentPoint=(input:any,p:any)=>{const s=typeof input==='string'?records.get(input):input,parent=records.get(s.parentId);if(!parent)return {...p};const m=matrix(parent),o=m.point(),a=-m.rotation();return {x:(p.x-o.x)*Math.cos(a)-(p.y-o.y)*Math.sin(a),y:(p.x-o.x)*Math.sin(a)+(p.y-o.y)*Math.cos(a)};};
  const descendants=(roots:string[])=>{const result=new Set(roots);for(const id of result)for(const s of records.values())if(s.parentId===id)result.add(s.id);return result;};
  const editor:any={
    options:{maxShapesPerPage:2000},getShape:(id:string)=>records.get(id),getSelectedShapeIds:()=>[...ids],setSelectedShapes:(next:string[])=>{ids=[...next];},
    getCurrentPage:()=>({id:'page:a',meta:{}}),getCurrentPageShapeIds:()=>new Set(records.keys()),getCurrentPageShapesSorted:()=>[...records.values()],
    getShapeAndDescendantIds:descendants,getInstanceState:()=>({isReadonly:readOnly}),isShapeOrAncestorLocked:(s:any)=>s.isLocked||!!(records.get(s.parentId)&&editor.isShapeOrAncestorLocked(records.get(s.parentId))),
    getShapeMask:(id:string)=>records.get(id)?.masked,getBindingsInvolvingShape:(id:string)=>records.get(id)?.bound?[{}]:[],
    getShapePageTransform:matrix,getPointInParentSpace:parentPoint,
    getShapeUtil:(s:any)=>({canResize:()=>!s.noResize,isAspectRatioLocked:()=>!!s.aspectLocked}),
    getShapeGeometry:(input:any)=>{const s=typeof input==='string'?records.get(input):input;return {bounds:new Box(0,0,s.props.w,s.props.h)};},
    getShapePageBounds:(s:any)=>{const m=matrix(s),{w,h}=s.props;return Box.FromPoints([{x:0,y:0},{x:w,y:0},{x:w,y:h},{x:0,y:h}].map(m.applyToPoint));},
    getCamera:()=>({x:0,y:0,z:1}),setCamera:()=>{},complete:()=>{},setCurrentTool:()=>{},
    mark:(mark:string)=>{marks++;if(!mark.endsWith('-complete'))snapshot={records:structuredClone([...records]),ids:[...ids]};},run:(fn:()=>void)=>fn(),
    bailToMark:()=>{rollbacks++;records=new Map(snapshot.records);ids=[...snapshot.ids];},
    updateShapes:(updates:any[])=>{if(refuse)return;for(const u of updates)records.set(u.id,{...records.get(u.id),...u,props:{...records.get(u.id).props,...u.props}});},
    resizeShape:(id:string,factors:any,options:any)=>{
      resizeCalls++;if(refuse)return;
      const s=options.initialShape,m=options.initialPageTransform,origin=m.point(),a=options.scaleOrigin;
      const point={x:a.x+(origin.x-a.x)*factors.x,y:a.y+(origin.y-a.y)*factors.y};
      const local=parentPoint(id,point),swapped=Math.abs(Math.cos(m.rotation()))<1e-8;
      editor.updateShapes([{id,type:s.type,x:local.x,y:local.y,props:{w:clamp?1:s.props.w*(swapped?factors.y:factors.x),h:s.props.h*(swapped?factors.x:factors.y)}}]);
    },
    duplicateShapes:(roots:string[])=>{
      const all=[...descendants(roots)],mapping=new Map(all.map(id=>[id,id+'-copy-'+(++sequence)]));
      for(const id of all){if(incomplete&&id===all.at(-1))continue;const s=records.get(id);records.set(mapping.get(id)!,{...structuredClone(s),id:mapping.get(id),parentId:mapping.get(s.parentId)??s.parentId});}
      // Deliberately reverse native selection order; no source-index assumptions.
      ids=roots.map(id=>mapping.get(id)!).reverse();
    }
  };
  return {editor,get:(id:string)=>records.get(id),all:()=>[...records.values()],select:(next:string[])=>{ids=next;},readonly:()=>{readOnly=true;},refuse:()=>{refuse=true;},clamp:()=>{clamp=true;},incomplete:()=>{incomplete=true;},stats:()=>({resizeCalls,rollbacks,marks})};
}
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-6,a+' ≠ '+b);
describe('Whole-selection transformations',()=>{
  it('places all nine reference points on page-axis bounds',()=>{
    assert.deepEqual(transformAnchorPoint({x:10,y:20,w:80,h:40},'bottom-right'),{x:90,y:60});
    assert.deepEqual(transformAnchorPoint({x:10,y:20,w:80,h:40},'center'),{x:50,y:40});
    assert.throws(()=>transformAnchorPoint({x:0,y:0,w:1,h:1},'missing' as any));
  });
  it('moves selected group and selected descendant exactly once',()=>{
    const c=canvas([shape('g',20,30,0,0,{type:'group'}),shape('a',10,10,100,50,{parentId:'g'})],['g','a']);
    const p=prepareTransformPlan(c.editor,move());assert.deepEqual(p.results,[{x:40,y:60,w:100,h:50}]);
    assert.equal(applyTransformPlan(c.editor,p),true);assert.equal(c.get('g').x,30);assert.equal(c.get('a').x,10);assert.equal(c.stats().marks,2);
  });
  it('uses page-space movement inside a rotated parent',()=>{
    const c=canvas([shape('g',100,100,0,0,{type:'group',rotation:Math.PI/2}),shape('a',0,0,100,50,{parentId:'g'})],['a']);
    const p=prepareTransformPlan(c.editor,move({x:25,y:0}));assert.equal(applyTransformPlan(c.editor,p),true);
    near(c.get('a').x,0);near(c.get('a').y,-25);
  });
  it('moves the complete selection to an absolute reference coordinate',()=>{
    const c=canvas([shape('a',0,0,20,10),shape('b',30,20,20,10)]);
    const p=prepareTransformPlan(c.editor,move({relative:false,x:100,y:200,anchor:'bottom-right'}));
    assert.deepEqual(p.results,[{x:50,y:170,w:50,h:30}]);assert.equal(applyTransformPlan(c.editor,p),true);assert.equal(c.get('a').x,50);assert.equal(c.get('b').x,80);
  });
  it('creates cumulative position copies while retaining original metadata and groups',()=>{
    const c=canvas([shape('g',0,0,0,0,{type:'group'}),shape('a',10,20,20,10,{parentId:'g',meta:{omsObjectName:'Letter A'}})],['g']);
    const p=prepareTransformPlan(c.editor,move({x:30,y:0,copies:2}));assert.equal(p.generated,4);assert.equal(applyTransformPlan(c.editor,p),true);
    assert.deepEqual(c.all().filter(s=>s.type==='group').map(s=>s.x).sort((a,b)=>a-b),[0,30,60]);
    assert.equal(c.all().filter(s=>s.meta.omsObjectName==='Letter A').length,3);assert.equal(c.stats().marks,2);
  });
  it('uses the first absolute copy offset for all later copies',()=>{
    const c=canvas([shape('a',10,20,20,10)]),p=prepareTransformPlan(c.editor,move({relative:false,x:100,y:200,anchor:'top-left',copies:2}));
    assert.deepEqual(p.results.map(b=>[b.x,b.y]),[[100,200],[190,380]]);assert.equal(applyTransformPlan(c.editor,p),true);
  });
  it('scales several objects around a shared fixed centre without translating twice',()=>{
    const c=canvas([shape('a',0,0,20,10),shape('b',30,0,20,10)]),p=prepareTransformPlan(c.editor,scale());
    assert.deepEqual(p.results,[{x:-25,y:-5,w:100,h:20}]);assert.equal(applyTransformPlan(c.editor,p),true);assert.equal(c.get('a').x,-25);assert.equal(c.get('b').x,35);
  });
  it('scales children of nested rotated groups, retaining parent records',()=>{
    const c=canvas([shape('g',100,100,0,0,{type:'group',rotation:Math.PI/2}),shape('h',10,10,0,0,{type:'group',parentId:'g'}),shape('a',0,0,20,10,{parentId:'h'})],['g']);
    const before=structuredClone(c.get('g')),p=prepareTransformPlan(c.editor,scale());assert.equal(applyTransformPlan(c.editor,p),true);assert.deepEqual(c.get('g'),before);near(c.get('a').props.w,40);near(c.get('a').props.h,20);
  });
  it('allows exact unequal scale on a quarter-turn object',()=>{
    const c=canvas([shape('a',100,100,20,10,{rotation:Math.PI/2})]),p=prepareTransformPlan(c.editor,scale({x:2,y:3,anchor:'top-left'}));
    assert.equal(applyTransformPlan(c.editor,p),true);near(c.get('a').props.w,60);near(c.get('a').props.h,20);
  });
  it('rejects unequal scale for oblique and aspect-locked objects before mutation',()=>{
    for(const extra of [{rotation:Math.PI/4},{aspectLocked:true}]){const c=canvas([shape('a',0,0,20,10,extra)]);assert.throws(()=>prepareTransformPlan(c.editor,scale({y:3})),/proportions/);assert.equal(c.stats().marks,0);}
  });
  it('creates progressively smaller copies around the same reference point',()=>{
    const c=canvas([shape('a',0,0,100,50)]),p=prepareTransformPlan(c.editor,scale({x:0.5,y:0.5,copies:2}));
    assert.deepEqual(p.results.map(b=>b.w),[50,25]);assert.equal(applyTransformPlan(c.editor,p),true);
    assert.deepEqual(c.all().map(s=>s.props.w).sort((a,b)=>a-b),[25,50,100]);
    for(const s of c.all())near(s.x+s.props.w/2,50);
  });
  it('does not rely on native duplicate selection order',()=>{
    const c=canvas([shape('a',0,0,20,10),shape('b',30,0,30,10)]),p=prepareTransformPlan(c.editor,scale({copies:1}));
    assert.equal(applyTransformPlan(c.editor,p),true);assert.deepEqual(c.all().filter(s=>s.id.includes('copy')).map(s=>s.props.w).sort((a,b)=>a-b),[40,60]);
  });
  it('uses exact analytic ellipse bounds for a rotated selection',()=>{
    const c=canvas([shape('a',0,0,100,20,{type:'cad-ellipse',rotation:Math.PI/4})]),p=prepareTransformPlan(c.editor,scale());
    near(p.source.w,Math.sqrt(5200));near(p.results[0].w,Math.sqrt(5200)*2);assert.equal(applyTransformPlan(c.editor,p),true);
  });
  it('rejects stale selection and document edits',()=>{
    const c=canvas([shape('a'),shape('b')],['a']),p=prepareTransformPlan(c.editor,move());c.select(['b']);assert.equal(applyTransformPlan(c.editor,p),false);
    c.select(['a']);c.get('a').x=10;assert.equal(applyTransformPlan(c.editor,p),false);assert.equal(c.stats().marks,0);
  });
  it('checks permissions again immediately before apply',()=>{
    const c=canvas([shape('a')]),p=prepareTransformPlan(c.editor,move());c.readonly();assert.equal(applyTransformPlan(c.editor,p),false);assert.equal(c.get('a').x,0);
  });
  it('rejects forms, locked descendants, frame children, bindings and clipping',()=>{
    for(const extra of [{type:'profile-7st'},{isLocked:true},{bound:true},{masked:true},{meta:{omsVectorPaint:{clips:[{}]}}}])assert.throws(()=>prepareTransformPlan(canvas([shape('a',0,0,20,10,extra)]).editor,move()));
    const c=canvas([shape('frame',0,0,100,50,{type:'frame'}),shape('a',0,0,20,10,{parentId:'frame'})],['a']);assert.throws(()=>prepareTransformPlan(c.editor,move()),/unsupported/);
    const g=canvas([shape('g',0,0,0,0,{type:'group'}),shape('a',0,0,20,10,{parentId:'g',isLocked:true})],['g']);assert.throws(()=>prepareTransformPlan(g.editor,move()),/protected/);
  });
  it('rolls back refused movement and clamped resizing',()=>{
    for(const kind of ['move','scale']){const c=canvas([shape('a')]),p=prepareTransformPlan(c.editor,kind==='move'?move():scale());kind==='move'?c.refuse():c.clamp();assert.equal(applyTransformPlan(c.editor,p),false);assert.equal(c.get('a').x,0);assert.equal(c.get('a').props.w,100);assert.equal(c.stats().rollbacks,1);}
  });
  it('rolls back incomplete group duplication',()=>{
    const c=canvas([shape('g',0,0,0,0,{type:'group'}),shape('a',0,0,20,10,{parentId:'g'})],['g']),p=prepareTransformPlan(c.editor,move({copies:1}));c.incomplete();assert.equal(applyTransformPlan(c.editor,p),false);assert.equal(c.all().length,2);assert.equal(c.stats().rollbacks,1);
  });
  it('rejects invalid, coincident, excessive, and overflowing transformations',()=>{
    const c=canvas([shape('a')]);
    for(const options of [scale({x:0}),scale({x:NaN}),move({copies:201}),move({copies:0.5}),move({x:Infinity})])assert.throws(()=>prepareTransformPlan(c.editor,options),/invalid/);
    assert.throws(()=>prepareTransformPlan(c.editor,move({x:0,y:0,copies:1})),/coincident/);
    assert.throws(()=>prepareTransformPlan(c.editor,scale({x:1,y:1,copies:1})),/coincident/);
    assert.throws(()=>prepareTransformPlan(c.editor,scale({copies:50})),/bounds/);
    c.editor.options.maxShapesPerPage=1;assert.throws(()=>prepareTransformPlan(c.editor,move({copies:1})),/limit/);
  });
});
