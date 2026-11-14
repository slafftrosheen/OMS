<script lang="ts">
  import { onMount } from 'svelte';
  import { locale } from 'svelte-i18n';
  import { getSnapshot, loadSnapshot } from '@tldraw/tldraw';
  import TldrawWrapper from '../../src/lib/components/canvas/TldrawWrapper.svelte';
  import type { OrderSeed } from '../../src/lib/components/canvas/templates/DraftOrderTemplate';
  import { nodeAt } from '../../src/lib/components/canvas/cad-curves';
  import { VECTOR_DEFAULT_PAINT } from '../../src/lib/components/canvas/cad-paint';
  import { DEFAULT_CAD_SETTINGS } from '../../src/lib/components/canvas/cad-settings';
  import { readMaterialTexture, prepareMaterialTexture, applyMaterialTexture } from '../../src/lib/components/canvas/material-texture';
  const materialExample = new URLSearchParams(location.search).has('materials');
  const textExample = new URLSearchParams(location.search).has('text');
  const intersectionExample = new URLSearchParams(location.search).has('intersections');
  const bezierIntersectionExample = new URLSearchParams(location.search).has('bezier-intersections');
  const cubicPairExample = new URLSearchParams(location.search).has('cubic-pairs');
  const cubicConicExample = new URLSearchParams(location.search).has('cubic-conic');
  const order = new URLSearchParams(location.search).get('mode') === 'order';
  // Existing orders read authenticated attachments; new drafts keep local files.
  const persisted = new URLSearchParams(location.search).has('persisted');
  let seed = $state<OrderSeed>({ orderId: 'drawing-order', title: 'Production form', clientName: 'Test client', profiles: [{name:'Production profile',quantity:1,configuration:{profileName:'Test production profile'}}],attachments:[] });
  async function storeFile(file:File,pocket:import('../../src/lib/order/file-pockets').ProductionFilePocket='visuals'){
    const id=crypto.randomUUID(),url=URL.createObjectURL(file);
    seed={...seed,attachments:[...(seed.attachments??[]),{id,url,originalName:file.name,mimeType:file.type,file_type:pocket}]};
    return {id,url};
  }
  let editor: any;
  let readonly = $state(new URLSearchParams(location.search).has('readonly'));
  let theme = $state('LightVim');
  let workspaceWidth = $state('100%');
  let workspaceHeight = $state('calc(100dvh - 48px)');
  let saves = $state(0);
  let exampleStatus = $state('');
  function loadText() {
    if (!editor || readonly) return;
    editor.updatePage({id:editor.getCurrentPageId(),meta:{omsCad:DEFAULT_CAD_SETTINGS}});
    const samples = [
      {id:'shape:text-panel',type:'geo',x:-24,y:-24,props:{geo:'rectangle',w:520,h:232,fill:'none',dash:'solid',color:'grey'},meta:{omsObjectName:'Sample panel'}},
      {id:'shape:text-one',type:'text',x:0,y:0,props:{text:'REKLĀMA',font:'sans',size:'m',scale:2,textAlign:'start',autoSize:true,color:'blue'},meta:{omsObjectName:'Sign title'}},
      {id:'shape:text-two',type:'text',x:0,y:120,props:{text:'Rīga • 2026',font:'serif',size:'l',scale:1,textAlign:'middle',autoSize:false,w:360,color:'black'},meta:{omsObjectName:'Sign subtitle'}},
    ];
    for (const shape of samples) { if(editor.getShape(shape.id))editor.deleteShapes([shape.id]);editor.createShape(shape); }
    editor.setCurrentTool('select');editor.setSelectedShapes(['shape:text-one','shape:text-two']);editor.zoomToSelection();
    exampleStatus='Text example ready';
  }
  function loadSnapping() {
    if (!editor || readonly) return;
    editor.updatePage({id:editor.getCurrentPageId(),meta:{omsCad:DEFAULT_CAD_SETTINGS,omsCadSnap:{endpoints:true,midpoints:true,centers:true,quadrants:true,intersections:true,nearest:true,grid:false,tolerance:8}}});
    editor.user.updateUserPreferences({isSnapMode:true});
    const samples = [
      {id:'shape:snap-panel',type:'geo',x:0,y:0,props:{geo:'rectangle',w:240,h:120,fill:'none',dash:'solid',color:'blue'},meta:{omsObjectName:'Reference panel'}},
      {id:'shape:snap-horizontal',type:'cad-path',x:0,y:200,props:{points:[{x:0,y:0},{x:240,y:0}],closed:false,color:'black'},meta:{omsObjectName:'Horizontal guide'}},
      {id:'shape:snap-vertical',type:'cad-path',x:100,y:150,props:{points:[{x:0,y:0},{x:0,y:140}],closed:false,color:'black'},meta:{omsObjectName:'Vertical guide'}},
      {id:'shape:snap-circle',type:'cad-ellipse',x:320,y:160,props:{w:120,h:120,color:'blue'},meta:{omsObjectName:'Circular reference'}},
      {id:'shape:snap-curve',type:'cad-bezier',x:320,y:0,props:{contours:[{closed:false,nodes:[{...nodeAt({x:0,y:100}),outX:40,outY:-120},{...nodeAt({x:140,y:100}),inX:-40,inY:-120}]}]},meta:{omsObjectName:'Curve reference'}}
    ];
    for(const shape of samples){if(editor.getShape(shape.id))editor.deleteShapes([shape.id]);editor.createShape(shape);}
    editor.setSelectedShapes(samples.map(shape=>shape.id));editor.zoomToSelection();editor.selectNone();exampleStatus='Snapping example ready';
  }
  function loadIntersections() {
    if (!editor || readonly) return;
    editor.updatePage({id:editor.getCurrentPageId(),meta:{omsCad:DEFAULT_CAD_SETTINGS,omsCadSnap:{endpoints:false,midpoints:false,centers:false,quadrants:false,intersections:true,nearest:false,grid:false,tolerance:8}}});
    editor.user.updateUserPreferences({isSnapMode:true});
    const samples = [
      {id:'shape:intersection-a',type:'cad-ellipse',x:0,y:0,props:{w:200,h:200,color:'blue'},meta:{omsObjectName:'Circle A'}},
      {id:'shape:intersection-b',type:'cad-ellipse',x:120,y:0,props:{w:200,h:200,color:'blue'},meta:{omsObjectName:'Circle B'}},
      {id:'shape:intersection-ellipse',type:'cad-ellipse',x:360,y:40,props:{w:240,h:120,color:'blue'},meta:{omsObjectName:'Ellipse'}},
      {id:'shape:intersection-vertical',type:'cad-path',x:540,y:0,props:{points:[{x:0,y:0},{x:0,y:220}],closed:false,color:'black'},meta:{omsObjectName:'Ellipse crossing'}},
      {id:'shape:intersection-arc',type:'cad-arc',x:100,y:340,props:{radius:100,startAngle:0,endAngle:180,color:'blue'},meta:{omsObjectName:'Upper arc'}},
      {id:'shape:intersection-horizontal',type:'cad-path',x:0,y:280,props:{points:[{x:0,y:0},{x:220,y:0}],closed:false,color:'black'},meta:{omsObjectName:'Arc crossing'}}
    ];
    for(const shape of samples){if(editor.getShape(shape.id))editor.deleteShapes([shape.id]);editor.createShape(shape);}
    editor.setCurrentTool('select');editor.setSelectedShapes(samples.map(shape=>shape.id));editor.zoomToSelection();editor.selectNone();exampleStatus='Intersection example ready';
  }
  async function loadMaterials() {
    if (!editor || readonly) return;
    const rect = (x: number, y: number, w: number, h: number) => ({ closed: true, nodes: [{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}].map(nodeAt) });
    editor.updatePage({id:editor.getCurrentPageId(),meta:{omsCad:DEFAULT_CAD_SETTINGS}});
    for (const [i, name] of ['Grain source','Panel two','Panel three'].entries()) {
      const shape = {id:`shape:material-${i}`,type:'cad-bezier',x:i*320,y:0,rotation:i===2?.2:0,
        props:{contours:[rect(0,0,300,220),rect(70,55,160,110)],fillRule:'evenodd'},
        meta:{omsObjectName:name,omsVectorPaint:{...VECTOR_DEFAULT_PAINT,fill:'#e2e8f0'}}};
      if (editor.getShape(shape.id)) editor.deleteShapes([shape.id]);
      editor.createShape(shape);
    }
    const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;
    const ctx=canvas.getContext('2d')!;ctx.fillStyle='#bd8b53';ctx.fillRect(0,0,64,64);
    for (let y=0;y<64;y+=8) {ctx.fillStyle=y%16===0?'#71431e':'#d1a775';ctx.fillRect(0,y,64,3);}
    const blob=await new Promise<Blob>(resolve=>canvas.toBlob(blob=>resolve(blob!),'image/png'));
    editor.setSelectedShapes(['shape:material-0']);
    const draft=await readMaterialTexture(editor,new File([blob],'test-grain.png',{type:'image/png'}),new AbortController().signal);
    applyMaterialTexture(editor,prepareMaterialTexture(editor,draft,{mode:'tile',tileWidthMm:50,scale:100,angle:25,opacity:100}));
    editor.setSelectedShapes(['shape:material-0','shape:material-1','shape:material-2']);
    editor.zoomToSelection();exampleStatus='Material example ready';
  }
  function loadBezierIntersections() {
    if (!editor || readonly) return;
    editor.updatePage({id:editor.getCurrentPageId(),meta:{omsCad:DEFAULT_CAD_SETTINGS,omsCadSnap:{endpoints:false,midpoints:false,centers:false,quadrants:false,intersections:true,nearest:false,grid:false,tolerance:8}}});
    editor.user.updateUserPreferences({isSnapMode:true});
    const samples = [
      {id:'shape:bezier-crossings',type:'cad-bezier',x:0,y:80,props:{contours:[{closed:false,nodes:[{...nodeAt({x:0,y:-80}),outX:100,outY:220},{...nodeAt({x:300,y:80}),inX:-100,inY:-220}]}],color:'blue'},meta:{omsObjectName:'Three Bézier crossings'}},
      {id:'shape:bezier-guide',type:'cad-path',x:-20,y:80,props:{points:[{x:0,y:0},{x:340,y:0}],closed:false,color:'black'},meta:{omsObjectName:'Crossing guide'}},
      {id:'shape:bezier-contact',type:'cad-bezier',x:400,y:100,props:{contours:[{closed:false,nodes:[{...nodeAt({x:0,y:100}),outX:100,outY:-400/3},{...nodeAt({x:300,y:100}),inX:-100,inY:-400/3}]}],color:'blue'},meta:{omsObjectName:'Bézier tangent contact'}},
      {id:'shape:bezier-tangent',type:'cad-path',x:380,y:100,props:{points:[{x:0,y:0},{x:340,y:0}],closed:false,color:'black'},meta:{omsObjectName:'Tangent guide'}}
    ];
    for(const shape of samples){if(editor.getShape(shape.id))editor.deleteShapes([shape.id]);editor.createShape(shape);}
    editor.setCurrentTool('select');editor.setSelectedShapes(samples.map(shape=>shape.id));editor.zoomToSelection();editor.selectNone();exampleStatus='Bézier intersections ready';
  }
  function reloadDrawing() {
    if (!editor) return;
    const snapshot=JSON.parse(JSON.stringify(getSnapshot(editor.store)));
    loadSnapshot(editor.store,snapshot);exampleStatus='Drawing reloaded from JSON';
  }
  function loadCubicConics() {
    if (!editor || readonly) return;
    editor.updatePage({id:editor.getCurrentPageId(),meta:{omsCad:DEFAULT_CAD_SETTINGS,omsCadSnap:{endpoints:false,midpoints:false,centers:false,quadrants:false,intersections:true,nearest:false,grid:false,tolerance:8}}});
    editor.user.updateUserPreferences({isSnapMode:true});
    const cubic=(id:string,x:number,y:number,points:Array<{x:number;y:number}>,name:string)=>({id,type:'cad-bezier',x,y,props:{color:'blue',contours:[{closed:false,nodes:[{...nodeAt(points[0]),outX:points[1].x-points[0].x,outY:points[1].y-points[0].y},{...nodeAt(points[3]),inX:points[2].x-points[3].x,inY:points[2].y-points[3].y}]}]},meta:{omsObjectName:name}});
    const samples = [
      {id:'shape:conic-circle',type:'cad-ellipse',x:60,y:120,props:{w:160,h:160,color:'black'},meta:{omsObjectName:'Circle with six crossings'}},
      cubic('shape:conic-six',140,200,[{x:-40,y:-160},{x:-80/6,y:800},{x:80/6,y:-800},{x:40,y:160}],'Six original curve crossings'),
      {id:'shape:conic-ellipse',type:'cad-ellipse',x:400,y:100,props:{w:200,h:120,color:'black'},meta:{omsObjectName:'Ellipse crossing'}},
      cubic('shape:conic-parabola',500,160,[{x:-200,y:120},{x:-200/3,y:-40},{x:200/3,y:-40},{x:200,y:120}],'Parabola crossing ellipse'),
      {id:'shape:conic-arc',type:'cad-arc',x:520,y:420,props:{radius:60,startAngle:180,endAngle:360,color:'black'},meta:{omsObjectName:'Lower semicircle'}},
      cubic('shape:conic-touch',520,420,[{x:-60,y:120},{x:-20,y:40},{x:20,y:40},{x:60,y:120}],'Curve tangent contact')
    ];
    for(const shape of samples){if(editor.getShape(shape.id))editor.deleteShapes([shape.id]);editor.createShape(shape);}
    editor.setCurrentTool('select');editor.setSelectedShapes(samples.map(shape=>shape.id));editor.zoomToSelection();editor.selectNone();exampleStatus='Cubic/conic intersections ready';
  }
  function loadCubicPairs() {
    if (!editor || readonly) return;
    editor.updatePage({id:editor.getCurrentPageId(),meta:{omsCad:DEFAULT_CAD_SETTINGS,omsCadSnap:{endpoints:false,midpoints:false,centers:false,quadrants:false,intersections:true,nearest:false,grid:false,tolerance:8}}});
    editor.user.updateUserPreferences({isSnapMode:true});
    const cubic=(id:string,x:number,y:number,points:Array<{x:number;y:number}>,color:string,name:string)=>({id,type:'cad-bezier',x,y,props:{color,contours:[{closed:false,nodes:[{...nodeAt(points[0]),outX:points[1].x-points[0].x,outY:points[1].y-points[0].y},{...nodeAt(points[3]),inX:points[2].x-points[3].x,inY:points[2].y-points[3].y}]}]},meta:{omsObjectName:name}});
    const wave=[{x:-100,y:-100},{x:-100/3,y:500},{x:100/3,y:-500},{x:100,y:100}];
    const parabola=[0.37**2,0.37**2-0.74/3,0.37**2-1.48/3+1/3,0.37**2-0.74+1].map((y,i)=>({x:i*100,y:y*300}));
    const samples=[
      cubic('shape:pair-a',140,200,wave,'blue','Nine crossings — first curve'),
      cubic('shape:pair-b',140,200,wave.map(p=>({x:p.y,y:p.x})),'black','Nine crossings — second curve'),
      cubic('shape:pair-contact-a',400,200,parabola,'blue','Tangent pair — first curve'),
      cubic('shape:pair-contact-b',400,200,parabola.map(p=>({x:p.x,y:-p.y})),'black','Tangent pair — second curve')
    ];
    for(const shape of samples){if(editor.getShape(shape.id))editor.deleteShapes([shape.id]);editor.createShape(shape);}
    editor.setCurrentTool('select');editor.setSelectedShapes(samples.map(shape=>shape.id));editor.zoomToSelection();editor.selectNone();exampleStatus='Cubic pair intersections ready';
  }
  $effect(() => { document.documentElement.dataset.theme = theme; });
  onMount(() => {
    (window as any).__drawingFixture = {
      inspect: () => ({ shapes: editor?.getCurrentPageShapes(), selected: editor?.getSelectedShapeIds(), page: editor?.getCurrentPage(), readonly, saves }),
      roundTrip: () => { const snapshot = JSON.parse(JSON.stringify(getSnapshot(editor.store))); loadSnapshot(editor.store, snapshot); },
      emptyArea: () => { editor.setCamera({ x: -2400, y: 0, z: 1 }); },
    };
    return () => { delete (window as any).__drawingFixture; };
  });
</script>
<header>
  <button onclick={() => readonly = !readonly}>Toggle read only</button>
  {#if materialExample}<button onclick={loadMaterials}>Load material example</button>{/if}
  {#if textExample}<button onclick={loadSnapping} disabled={readonly}>Load snapping example</button>
    <button onclick={loadText}>Load text example</button>{/if}
  {#if intersectionExample}<button onclick={loadIntersections} disabled={readonly}>Load intersection example</button>{/if}
  {#if bezierIntersectionExample}<button onclick={loadBezierIntersections} disabled={readonly}>Load Bézier intersections</button>{/if}
  {#if cubicPairExample}<button onclick={loadCubicPairs} disabled={readonly}>Load cubic pair intersections</button>{/if}
  {#if cubicConicExample}<button onclick={loadCubicConics} disabled={readonly}>Load cubic/conic intersections</button>{/if}
  {#if materialExample || textExample || intersectionExample || bezierIntersectionExample || cubicConicExample || cubicPairExample}<button onclick={reloadDrawing}>Reload saved drawing</button><span role="status">{exampleStatus}</span>{/if}
  <label>Theme <select aria-label="Theme" bind:value={theme}><option>LightVim</option><option>DarkVim</option><option>HighContrastVim</option></select></label>
  <label>Language <select aria-label="Language" value={$locale} onchange={event => locale.set(event.currentTarget.value)}><option value="en">English</option><option value="ru">Русский</option><option value="lv">Latviešu</option></select></label>
  <label>Workspace <select aria-label="Workspace width" bind:value={workspaceWidth}><option value="100%">Full width</option><option value="880px">880 px</option><option value="580px">580 px</option><option value="520px">520 px</option><option value="390px">390 px</option></select></label>
  <label>Height <select aria-label="Workspace height" bind:value={workspaceHeight}><option value="calc(100dvh - 48px)">Full height</option><option value="420px">420 px</option></select></label>
</header>
<main style:width={workspaceWidth} style:height={workspaceHeight}><TldrawWrapper orderSeed={order ? seed : null} toolkitBoardId={order ? null : 'fixture-board'}
  onFilesUpload={order&&!persisted?async()=>{}:undefined} onStoreCanvasFile={order&&!persisted?storeFile:undefined}
  onReady={value => editor = value} toolkitReadOnly={readonly} onDocumentChange={() => saves++} /></main>
<style>
  header { display:flex;align-items:center;gap:12px;padding:8px;height:48px;box-sizing:border-box;background:var(--bg-1);color:var(--text);overflow-x:auto;white-space:nowrap; }
  header label { display:flex;align-items:center;gap:4px;font-size:12px; }
  header select { min-width:0;width:auto; }
  main { height:calc(100dvh - 48px);max-width:100%; }
</style>
