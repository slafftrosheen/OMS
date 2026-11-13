import {createTLStore, defaultShapeUtils, createShapeId, type TLShapeId} from '@tldraw/tldraw';
import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fixture } from '../helpers/cad-editor';
import { prepareDrawingFont, loadDrawingFont, drawingFontBytes, validDrawingFont, applySelectedDrawingFont, drawingFontValue, drawingFontInUse, removeDrawingFont, readDrawingFonts, uploadDrawingFont, setNextDrawingFont, getNextDrawingFont, preloadSnapshotDrawingFonts, getLoadedDrawingFont } from '../../src/lib/components/canvas/drawing-fonts';
import { DrawingTextShapeUtil, installDrawingTextUtil } from '../../src/lib/components/canvas/shapes/DrawingTextShape';
import { editDrawingText } from '../../src/lib/components/canvas/workbench-operations';
const textId='shape:text' as TLShapeId;
const raw = readFileSync('static/tldraw/2.4.6/fonts/IBMPlexSans-Medium.woff2');
const file = { name: 'Custom.woff2', size: raw.length, arrayBuffer: async () => Uint8Array.from(raw).buffer } as File;
function setup() {
  const f=fixture(); let doc:any={meta:{keep:'yes'}},next='draw';
  f.editor.getDocumentSettings=()=>doc;
  f.editor.updateDocumentSettings=(patch:any)=>doc={...doc,...patch};
  f.editor.store={allRecords:()=>[...f.shapes.values()].map(s=>({...s,typeName:'shape'})),getStoreSnapshot:()=>({store:{doc,...Object.fromEntries(f.shapes)}})};
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
});
