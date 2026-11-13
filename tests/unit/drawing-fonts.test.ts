import {createTLStore, defaultShapeUtils, createShapeId, HistoryManager, type TLShapeId} from '@tldraw/tldraw';
import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fixture } from '../helpers/cad-editor';
import { prepareDrawingFont, loadDrawingFont, drawingFontBytes, validDrawingFont, applySelectedDrawingFont, drawingFontValue, drawingFontInUse, removeDrawingFont, readDrawingFonts, uploadDrawingFont, uploadDrawingFonts, exportDrawingFontSet, DrawingFontUploadError, setNextDrawingFont, getNextDrawingFont, preloadSnapshotDrawingFonts, getLoadedDrawingFont } from '../../src/lib/components/canvas/drawing-fonts';
import { DrawingTextShapeUtil, installDrawingTextUtil } from '../../src/lib/components/canvas/shapes/DrawingTextShape';
import { editDrawingText } from '../../src/lib/components/canvas/workbench-operations';
const textId='shape:text' as TLShapeId;
const raw = readFileSync('static/tldraw/2.4.6/fonts/IBMPlexSans-Medium.woff2');
const file = { name: 'Custom.woff2', size: raw.length, arrayBuffer: async () => Uint8Array.from(raw).buffer } as File;
const monoRaw = readFileSync('static/tldraw/2.4.6/fonts/IBMPlexMono-Medium.woff2');
const monoFile = { name: 'Mono.woff2', size: monoRaw.length, arrayBuffer: async () => Uint8Array.from(monoRaw).buffer } as File;
const fontSet = (content: string) => new File([content], 'Client-fonts.omsfonts', {type:'application/json'});
function setup() {
  const f=fixture(); let doc:any={id:'document:document',typeName:'document',meta:{keep:'yes'}},next='draw';
  f.editor.getDocumentSettings=()=>doc;
  f.editor.updateDocumentSettings=(patch:any)=>doc={...doc,...patch};
  f.editor.store={allRecords:()=>[...f.shapes.values()].map(s=>({...s,typeName:'shape'})),getStoreSnapshot:()=>({store:{doc,...Object.fromEntries(f.shapes)}}),put:(records:any[])=>{for(const record of records)f.editor.updateDocumentSettings(record);}};
  f.editor.getStyleForNextShape=()=>next;
  f.editor.setStyleForNextShapes=(_:any,value:string)=>next=value;
  f.editor.updateInstanceState=(patch:any)=>Object.assign(f.state,patch);
  f.editor.createShape({id:textId,type:'text',props:{text:'Rīga 123',font:'sans',size:'m',scale:1,w:200,autoSize:true,textAlign:'start',color:'black'}});
  f.editor.setSelectedShapes([textId]);
  return f;
}
describe('portable drawing fonts',()=>{
  it('reads the real face metadata and retains its exact bytes',async()=>{
    const font=await prepareDrawingFont(file);
    assert.match(font.id,/^omsfont-[a-f0-9]{64}$/);assert.match(font.name,/IBM Plex Sans/);
    assert.deepEqual(new Uint8Array(drawingFontBytes(font)),new Uint8Array(raw));assert.equal(validDrawingFont(font),true);
  });
  it('uploads on plain HTTP without Web Crypto and produces the same SHA-256 identity',async()=>{
    const original=Object.getOwnPropertyDescriptor(globalThis,'crypto');
    try {
      Object.defineProperty(globalThis,'crypto',{configurable:true,value:{}});
      const f=setup(),font=await uploadDrawingFont(f.editor,file);
      assert.equal(font.id,'omsfont-'+createHash('sha256').update(raw).digest('hex'));
      assert.equal(getLoadedDrawingFont(f.editor,font.id)?.record.data,font.data);
    } finally {
      if(original) Object.defineProperty(globalThis,'crypto',original);
      else Reflect.deleteProperty(globalThis,'crypto');
    }
  });
  it('rejects renamed non-fonts, font collections, excessive files and corrupt payloads',async()=>{
    for(const sample of [new Uint8Array([1,2,3,4]),new TextEncoder().encode('ttcfjunk')]){
      await assert.rejects(()=>prepareDrawingFont({name:'bad.ttf',size:sample.length,arrayBuffer:async()=>sample.buffer}),/font-invalid/);
    }
    await assert.rejects(()=>prepareDrawingFont({...file,name:'bad.svg'}),/font-invalid/);
    await assert.rejects(()=>prepareDrawingFont({...file,size:2*1024*1024}),/font-too-large/);
    const font=await prepareDrawingFont(file);await assert.rejects(()=>loadDrawingFont({...font,id:'omsfont-'+'0'.repeat(64)}),/font-invalid/);
    assert.equal(validDrawingFont({...font,bytes:1}),false);
  });
  it('deduplicates uploads and preserves document metadata',async()=>{
    const f=setup(),a=await uploadDrawingFont(f.editor,file),b=await uploadDrawingFont(f.editor,file);
    assert.equal(a.id,b.id);assert.equal(readDrawingFonts(f.editor).length,1);assert.equal(f.editor.getDocumentSettings().meta.keep,'yes');
  });
  it('applies a face without changing content and restores builtin fonts explicitly',async()=>{
    const f=setup(),font=await uploadDrawingFont(f.editor,file);
    assert.equal(applySelectedDrawingFont(f.editor,[textId],font.id),true);
    assert.equal(drawingFontValue(f.editor.getShape(textId)),font.id);
    assert.equal(f.editor.getShape(textId).props.text,'Rīga 123');
    assert.equal(applySelectedDrawingFont(f.editor,[textId],'sans'),true);
    assert.equal(drawingFontValue(f.editor.getShape(textId)),'sans');
  });
  it('rejects stale selections, locked objects, read-only and missing characters atomically',async()=>{
    const f=setup(),font=await uploadDrawingFont(f.editor,file);
    assert.equal(applySelectedDrawingFont(f.editor,['shape:gone' as TLShapeId],font.id),false);
    f.editor.updateShape({id:textId,isLocked:true});assert.equal(applySelectedDrawingFont(f.editor,[textId],font.id),false);
    f.editor.updateShape({id:textId,isLocked:false,props:{text:'\u{10ffff}'}});assert.equal(applySelectedDrawingFont(f.editor,[textId],font.id),false);
    f.state.isReadonly=true;assert.equal(applySelectedDrawingFont(f.editor,[textId],'serif'),false);
    await assert.rejects(()=>uploadDrawingFont(f.editor,file),/font-readonly/);
  });
  it('blocks removal of used fonts and keeps next defaults separate from selection',async()=>{
    const f=setup(),font=await uploadDrawingFont(f.editor,file);
    assert.equal(setNextDrawingFont(f.editor,font.id),true);assert.equal(getNextDrawingFont(f.editor),font.id);
    assert.equal(drawingFontValue(f.editor.getShape(textId)),'sans');assert.equal(removeDrawingFont(f.editor,font.id),false);
    setNextDrawingFont(f.editor,'mono');applySelectedDrawingFont(f.editor,[textId],font.id);
    assert.equal(drawingFontInUse(f.editor,font.id),true);assert.equal(removeDrawingFont(f.editor,font.id),false);
    applySelectedDrawingFont(f.editor,[textId],'sans');assert.equal(removeDrawingFont(f.editor,font.id),true);
  });
  it('rejects an upload that would exceed the existing document save budget',async()=>{
    const f=setup();f.editor.store.getStoreSnapshot=()=>({large:'x'.repeat(1_900_000)});
    await assert.rejects(()=>uploadDrawingFont(f.editor,file),/font-save-limit/);assert.equal(readDrawingFonts(f.editor).length,0);
  });
  it('restores fonts from a saved document and edits text using the stored face',async()=>{
    const f=setup(),font=await uploadDrawingFont(f.editor,file),saved=JSON.parse(JSON.stringify({document:{store:{doc:{typeName:'document',meta:f.editor.getDocumentSettings().meta}}}}));
    await preloadSnapshotDrawingFonts(saved);
    assert.equal(editDrawingText(f.editor,textId,{text:'Latvija',font:font.id,textAlign:'middle',autoSize:true,pointSize:36}),true);
    assert.equal(drawingFontValue(f.editor.getShape(textId)),font.id);assert.equal(f.editor.getShape(textId).props.text,'Latvija');
  });
  it('invalidates native geometry identities without changing serialized records',()=>{
    const store=createTLStore({shapeUtils:defaultShapeUtils});
    const id=createShapeId('font-refresh');
    const shape:any={id,typeName:'shape',type:'text',x:10,y:20,rotation:0,isLocked:false,opacity:1,index:'a1',parentId:'page:page',meta:{keep:true},props:{text:'Label',font:'sans',size:'m',scale:1,w:100,autoSize:true,textAlign:'start',color:'black'}};
    store.put([shape]);const before=store.get(id)!,serial=JSON.stringify(store.serialize());
    let history='';const editor:any={store,shapeUtils:{},run:(fn:()=>void,opts:any)=>{history=opts.history;fn();}};
    installDrawingTextUtil(editor);
    assert.notEqual((store.get(id) as any).props,(before as any).props);
    assert.equal(JSON.stringify(store.serialize()),serial);assert.equal(history,'ignore');
  });
  it('does not trust a cached font for corrupted saved bytes and repairs reuploads',async()=>{
    const f=setup(),font=await uploadDrawingFont(f.editor,file);
    const bad={...font,data:(font.data[0]==='A'?'B':'A')+font.data.slice(1)};
    f.editor.updateDocumentSettings({meta:{omsFonts:[bad]}});
    assert.equal(getLoadedDrawingFont(f.editor,font.id),undefined);
    await uploadDrawingFont(f.editor,file);
    assert.equal(getLoadedDrawingFont(f.editor,font.id)?.record.data,font.data);
  });
  it('uses uploaded font metrics and exports actual glyph paths, never fallback text',async()=>{
    const f=setup(),font=await uploadDrawingFont(f.editor,file);applySelectedDrawingFont(f.editor,[textId],font.id);
    let family='';f.editor.textMeasure={measureText:(_text:string,opts:any)=>{family=opts.fontFamily;return {w:120,h:32}},measureTextSpans:()=>[{text:'Rīga',box:{x:0,y:0}}]};
    const util=new DrawingTextShapeUtil(f.editor),shape=f.editor.getShape(textId);
    assert.deepEqual(util.getMinDimensions(shape),{width:121,height:32});assert.match(family,/^OMS_[a-f0-9]+$/);
    const svg=util.toSvg(shape,{isDarkMode:false} as any);assert.equal(svg.type,'path');assert.match(svg.props.d,/M/);
    f.editor.updateDocumentSettings({meta:{}});assert.throws(()=>util.toSvg(shape,{isDarkMode:false} as any),/font-missing/);
  });
  it('adds a font family in one change, deduplicating repeated input without touching text',async()=>{
    const f=setup(), before=JSON.stringify([...f.shapes.values()]);let writes=0;
    const update=f.editor.updateDocumentSettings;
    f.editor.updateDocumentSettings=(patch:any)=>{writes++;update(patch);};
    const result=await uploadDrawingFonts(f.editor,[file,monoFile,file]);
    assert.equal(result.added,2);assert.equal(result.reused,0);assert.equal(result.fonts.length,2);
    assert.equal(writes,1);assert.equal(f.marks.length,2);assert.equal(JSON.stringify([...f.shapes.values()]),before);
    assert.deepEqual(f.editor.getSelectedShapeIds(),[textId]);assert.equal(getNextDrawingFont(f.editor),'draw');
    assert.equal(f.editor.getDocumentSettings().meta.keep,'yes');
    f.editor.store.getStoreSnapshot=()=>({large:'x'.repeat(1_950_000)});
    const again=await uploadDrawingFonts(f.editor,[monoFile,file]);
    assert.equal(again.added,0);assert.equal(again.reused,2);assert.equal(writes,1);
  });
  it('rejects an entire batch with the failing filename, leaving document and undo history untouched',async()=>{
    const f=setup(), bad=new File(['not a font'],'Broken.ttf');
    await assert.rejects(()=>uploadDrawingFonts(f.editor,[file,bad,monoFile]),(error:any)=>{
      assert.ok(error instanceof DrawingFontUploadError);assert.equal(error.fileName,'Broken.ttf');assert.equal(error.message,'font-invalid');return true;
    });
    assert.equal(readDrawingFonts(f.editor).length,0);assert.equal(f.marks.length,0);
    await assert.rejects(()=>uploadDrawingFonts(f.editor,[]),/font-empty/);
    await assert.rejects(()=>uploadDrawingFonts(f.editor,Array(17).fill(file)),/font-files-limit/);
  });
  it('exports only font bytes and imports a reusable set into a different drawing',async()=>{
    const source=setup(),destination=setup();
    await uploadDrawingFonts(source.editor,[file,monoFile]);
    source.editor.updateDocumentSettings({meta:{...source.editor.getDocumentSettings().meta,orderSecret:'private client details'}});
    source.state.isReadonly=true;
    const content=await exportDrawingFontSet(source.editor), parsed=JSON.parse(content);
    assert.deepEqual(Object.keys(parsed),['format','version','fonts']);assert.equal(content.includes('private client details'),false);assert.equal(content.includes('Rīga 123'),false);
    assert.deepEqual(Object.keys(parsed.fonts[0]).sort(),['id','name','family','subfamily','data','bytes'].sort());
    const imported=await uploadDrawingFonts(destination.editor,[fontSet(content),file]);
    assert.equal(imported.added,2);assert.equal(imported.reused,0);
    assert.equal(readDrawingFonts(destination.editor).find(f=>f.id===parsed.fonts[0].id)!.data,parsed.fonts[0].data);
    assert.equal(applySelectedDrawingFont(destination.editor,[textId],parsed.fonts[0].id),true);
    const again=await uploadDrawingFonts(destination.editor,[fontSet(content)]);assert.equal(again.added,0);assert.equal(again.reused,2);
  });
  it('validates font-set schema, content identity, size and names rather than trusting imported metadata',async()=>{
    const f=setup();await uploadDrawingFont(f.editor,file);
    const exported=JSON.parse(await exportDrawingFontSet(f.editor));
    for(const bad of [{...exported,version:2},{...exported,format:'other'},{...exported,fonts:[]},{...exported,fonts:[...exported.fonts,...exported.fonts]}]) {
      await assert.rejects(()=>uploadDrawingFonts(setup().editor,[fontSet(JSON.stringify(bad))]),/font-set-invalid/);
    }
    await assert.rejects(()=>uploadDrawingFonts(setup().editor,[fontSet('x'.repeat(1_500_001))]),/font-set-invalid/);
    const corrupt=structuredClone(exported);corrupt.fonts[0].data=(corrupt.fonts[0].data[0]==='A'?'B':'A')+corrupt.fonts[0].data.slice(1);
    const target=setup();await assert.rejects(()=>uploadDrawingFonts(target.editor,[monoFile,fontSet(JSON.stringify(corrupt))]),/font-invalid/);
    assert.equal(readDrawingFonts(target.editor).length,0);
    exported.fonts[0].name='Fake font title';exported.fonts[0].clientSecret='not a font field';
    await uploadDrawingFonts(target.editor,[fontSet(JSON.stringify(exported))]);
    assert.match(readDrawingFonts(target.editor)[0].name,/IBM Plex Sans/);assert.equal((readDrawingFonts(target.editor)[0] as any).clientSecret,undefined);
    f.editor.updateDocumentSettings({meta:{omsFonts:corrupt.fonts}});
    await assert.rejects(()=>exportDrawingFontSet(f.editor),/font-invalid/);
    await assert.rejects(()=>exportDrawingFontSet(setup().editor),/font-empty/);
  });
  it('rechecks live permissions and total UTF-8 save size after async preparation',async()=>{
    const f=setup();
    const changesPermission={...file,arrayBuffer:async()=>{f.state.isReadonly=true;return file.arrayBuffer();}} as File;
    await assert.rejects(()=>uploadDrawingFonts(f.editor,[changesPermission,monoFile]),/font-readonly/);
    assert.equal(readDrawingFonts(f.editor).length,0);
    const oversized=setup();oversized.editor.store.getStoreSnapshot=()=>({text:'ā'.repeat(950000)});
    await assert.rejects(()=>uploadDrawingFonts(oversized.editor,[file,monoFile]),/font-save-limit/);
    assert.equal(readDrawingFonts(oversized.editor).length,0);assert.equal(oversized.marks.length,0);
  });
  it('merges concurrent imports against the live document without losing either face',async()=>{
    const f=setup();await Promise.all([uploadDrawingFonts(f.editor,[file]),uploadDrawingFonts(f.editor,[monoFile])]);
    assert.equal(readDrawingFonts(f.editor).length,2);assert.equal(new Set(readDrawingFonts(f.editor).map(font=>font.id)).size,2);
  });
  it('reuses a face added by a concurrent import instead of creating a second undo entry',async()=>{
    const f=setup();let writes=0;const update=f.editor.updateDocumentSettings;
    f.editor.updateDocumentSettings=(patch:any)=>{writes++;update(patch);};
    const results=await Promise.all([uploadDrawingFonts(f.editor,[file]),uploadDrawingFonts(f.editor,[file])]);
    assert.deepEqual(results.map(result=>result.added).sort(),[0,1]);
    assert.deepEqual(results.map(result=>result.reused).sort(),[0,1]);
    assert.equal(writes,1);assert.equal(readDrawingFonts(f.editor).length,1);
  });
  it('records batch import and removal in the real tldraw undo history',async()=>{
    const store=createTLStore({shapeUtils:defaultShapeUtils});
    store.put([{id:'document:document',typeName:'document',name:'Font test',gridSize:10,meta:{keep:'yes'}} as any]);
    const history=new HistoryManager({store}),state={isReadonly:false,meta:{}};
    const editor:any={store,getDocumentSettings:()=>store.get('document:document' as any),getInstanceState:()=>state,
      getStyleForNextShape:()=> 'draw',mark:history.mark.bind(history),run:history.batch,bailToMark:history.bailToMark,
      updateDocumentSettings:(patch:any)=>history.batch(()=>store.put([{...editor.getDocumentSettings(),...patch}]),{history:'ignore'})};
    try {
      const result=await uploadDrawingFonts(editor,[file,monoFile]);assert.equal(readDrawingFonts(editor).length,2);
      history.undo();assert.equal(readDrawingFonts(editor).length,0);assert.equal(editor.getDocumentSettings().meta.keep,'yes');
      history.redo();assert.equal(readDrawingFonts(editor).length,2);
      assert.equal(removeDrawingFont(editor,result.fonts[0].id),true);assert.equal(readDrawingFonts(editor).length,1);
      history.undo();assert.equal(readDrawingFonts(editor).length,2);
      history.redo();assert.equal(readDrawingFonts(editor).length,1);
    } finally {history.dispose();}
  });
});
