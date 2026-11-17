import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { TLShapeId } from '@tldraw/tldraw';
import { applyDrawingTextReplacement, prepareDrawingTextSearch, replaceDrawingTextLiteral } from '../../src/lib/components/canvas/drawing-find-replace';
import { prepareDrawingFont, loadDrawingFont, type DrawingFont } from '../../src/lib/components/canvas/drawing-fonts';
const options = { query: 'Rīga', replacement: 'Daugavpils', matchCase: false, wholeWord: false, scope: 'page' as const };
function fixture() {
  const shapes = new Map<string, any>(), marks: any[] = [];
  let selected: string[] = [], page = 'page:one', readOnly = false;
  const editor: any = {
    fonts: [] as DrawingFont[], skip: null, remove: null, normalize: false, finalize: null, payload: 0, extraAfter: 0,
    getDocumentSettings: () => ({ meta: { omsFonts: editor.fonts } }),
    getCurrentPageId: () => page, getCurrentPageShapesSorted: () => [...shapes.values()].filter(shape => shape.pageId === page),
    getSelectedShapeIds: () => selected, getShape: (id: string) => shapes.get(id),
    getShapeAndDescendantIds(ids: string[]) { const all = new Set(ids); for (const id of all) for (const shape of shapes.values()) if (shape.parentId === id) all.add(shape.id); return all; },
    getInstanceState: () => ({ isReadonly: readOnly }),
    isShapeOrAncestorLocked(shape: any): boolean { return !!shape && (!!shape.isLocked || editor.isShapeOrAncestorLocked(shapes.get(shape.parentId))); },
    complete() { editor.finalize?.(); }, setCurrentTool() {}, run(fn: () => void) { fn(); },
    mark(id: string) { marks.push({ id, shapes: structuredClone([...shapes]), selected: [...selected] }); },
    bailToMark(id: string) { const index = marks.findIndex(mark => mark.id === id), mark = marks[index]; shapes.clear(); mark.shapes.forEach(([key,shape]: any) => shapes.set(key,shape)); selected = mark.selected; marks.splice(index); },
    store: { getStoreSnapshot() { return { store: Object.fromEntries(shapes), padding: 'x'.repeat(editor.payload + (marks.length ? editor.extraAfter : 0)) }; } },
    updateShapes(updates: any[]) { for (const update of updates) {
      if (update.id === editor.skip) continue;
      if (update.id === editor.remove) { shapes.delete(update.id); continue; }
      const shape = shapes.get(update.id);
      shapes.set(shape.id,{ ...shape, ...update, props: { ...shape.props, ...update.props, ...(editor.normalize ? { w: shape.props.w + 20 } : {}) },
        ...(editor.normalize ? { x: shape.x - 10 } : {}) });
    } },
  };
  function add(id: string, text = 'Rīga', type = 'text', parentId = page) {
    const shape = { id, type, typeName: 'shape', pageId: page, parentId, x: 100, y: 50, rotation: .4, opacity: .7, isLocked: false,
      meta: { omsObjectName: 'Label ' + id, omsTextLetterSpacing: 12, keep: { value: 1 } },
      props: { text, size: 'm', font: 'serif', textAlign: 'middle', scale: 1.5, w: 120, autoSize: true, color: 'red' } };
    shapes.set(id,shape); return shape;
  }
  return { editor, shapes, marks, add, select: (...ids: string[]) => { selected = ids; }, page: (value: string) => { page = value; }, readonly: (value: boolean) => { readOnly = value; } };
}
function plan(f: ReturnType<typeof fixture>, patch = {}) {
  const result = prepareDrawingTextSearch(f.editor,{ ...options,...patch });
  assert.equal(result.ok,true); return result.value;
}
describe('drawing text find and replace', () => {
  it('uses literal punctuation and literal replacement dollar sequences', () => {
    assert.deepEqual(replaceDrawingTextLiteral('A+B (A+B) a+b',{...options,query:'A+B',replacement:'$& $1 $$'}),{ text:'$& $1 $$ ($& $1 $$) $& $1 $$', occurrences:3 });
    assert.deepEqual(replaceDrawingTextLiteral('[x].*',{...options,query:'[x].*',replacement:''}),{text:'',occurrences:1});
  });
  it('matches Unicode case and whole-word boundaries without matching larger words or combining marks', () => {
    const source = 'Rīga RĪGA Rīgas _Rīga Rīga2 Rīga\u0301';
    assert.equal(replaceDrawingTextLiteral(source,{...options,wholeWord:true}).occurrences,2);
    assert.equal(replaceDrawingTextLiteral(source,{...options,wholeWord:true,matchCase:true}).occurrences,1);
    assert.equal(replaceDrawingTextLiteral('Москва МОСКВА Подмосковье',{...options,query:'москва',wholeWord:true}).occurrences,2);
    assert.equal(replaceDrawingTextLiteral('𐐀test test',{...options,query:'test',wholeWord:true}).occurrences,1);
  });
  it('searches only native page text and excludes form descendants and shape labels', () => {
    const f=fixture(); f.add('normal'); f.add('shape-label','Rīga','geo');
    f.add('form','Rīga','order-details'); f.add('embedded','Rīga','text','form');
    f.page('page:two'); f.add('other-page'); f.page('page:one');
    const result=plan(f); assert.deepEqual(result.matches.map(match=>match.id),['normal']); assert.equal(result.scanned,1); assert.equal(f.marks.length,0);
  });
  it('captures selected group scope and retains it after locating another result', () => {
    const f=fixture();f.add('g','','group');f.add('a','Rīga','text','g');f.add('b');f.select('g');
    const result=plan(f,{scope:'selection'}); f.select('b');
    assert.deepEqual(applyDrawingTextReplacement(f.editor,result),{ok:true,value:1});
    assert.equal(f.shapes.get('a').props.text,'Daugavpils');assert.equal(f.shapes.get('b').props.text,'Rīga');
  });
  it('replaces selected result objects in one undo step and preserves every unrelated field', () => {
    const f=fixture();f.add('a','Rīga Rīga');f.add('b');const before=structuredClone([...f.shapes]);
    const result=plan(f);assert.deepEqual(applyDrawingTextReplacement(f.editor,result,['a' as TLShapeId]),{ok:true,value:2});
    assert.deepEqual(f.shapes.get('a'),{...before[0][1],props:{...before[0][1].props,text:'Daugavpils Daugavpils'}});
    assert.deepEqual(f.shapes.get('b'),before[1][1]);assert.equal(f.marks.length,2);
    f.editor.bailToMark(f.marks[0].id);assert.deepEqual([...f.shapes],before);
  });
  it('allows native autosize anchoring and empty replacement without changing formatting', () => {
    const f=fixture();f.add('a');f.editor.normalize=true;
    assert.deepEqual(applyDrawingTextReplacement(f.editor,plan(f,{replacement:''})),{ok:true,value:1});
    assert.equal(f.shapes.get('a').props.text,'');assert.equal(f.shapes.get('a').props.w,140);assert.equal(f.shapes.get('a').x,90);
    assert.equal(f.shapes.get('a').props.font,'serif');assert.equal(f.shapes.get('a').meta.omsTextLetterSpacing,12);
  });
  it('shows locked results but refuses partial all-replacement; readonly search remains available', () => {
    const f=fixture();f.add('a');f.add('b').isLocked=true;const result=plan(f);
    assert.equal(result.matches[1].protected,true);assert.deepEqual(applyDrawingTextReplacement(f.editor,result),{ok:false,error:'protected'});
    assert.equal(f.shapes.get('a').props.text,'Rīga');assert.equal(f.marks.length,0);
    f.readonly(true);assert.equal(prepareDrawingTextSearch(f.editor,options).ok,true);assert.deepEqual(applyDrawingTextReplacement(f.editor,result,['a' as TLShapeId]),{ok:false,error:'protected'});
    f.readonly(false);assert.equal(applyDrawingTextReplacement(f.editor,result,['a' as TLShapeId]).ok,true);
  });
  it('rejects changed documents, page switches and finalizing an active text edit', () => {
    const f=fixture();f.add('a');let result=plan(f);f.add('b');
    assert.deepEqual(applyDrawingTextReplacement(f.editor,result),{ok:false,error:'stale'});
    result=plan(f);f.page('page:two');assert.deepEqual(applyDrawingTextReplacement(f.editor,result),{ok:false,error:'stale'});
    f.page('page:one');result=plan(f);f.editor.finalize=()=>{f.shapes.get('a').props.text='Changed';};
    assert.deepEqual(applyDrawingTextReplacement(f.editor,result),{ok:false,error:'stale'});assert.equal(f.marks.length,0);
  });
  it('rolls back all replacements if one update is skipped or a text object disappears', () => {
    for (const behavior of ['skip','remove']) {
      const f=fixture();f.add('a');f.add('b');const before=structuredClone([...f.shapes]);f.editor[behavior]='b';
      assert.deepEqual(applyDrawingTextReplacement(f.editor,plan(f)),{ok:false,error:'failed'});
      assert.deepEqual([...f.shapes],before);assert.equal(f.marks.length,0);
    }
  });
  it('checks custom fonts while preserving the loaded font reference and spacing', async () => {
    const bytes=readFileSync('static/tldraw/2.4.6/fonts/IBMPlexSans-Medium.woff2');
    const font=await prepareDrawingFont({name:'Custom.woff2',size:bytes.length,arrayBuffer:async()=>Uint8Array.from(bytes).buffer});
    const f=fixture();const shape:any=f.add('a');shape.meta.omsFontId=font.id;
    assert.deepEqual(applyDrawingTextReplacement(f.editor,plan(f)),{ok:false,error:'fontUnavailable'});
    f.editor.fonts=[font];await loadDrawingFont(font);
    assert.deepEqual(applyDrawingTextReplacement(f.editor,plan(f,{replacement:'\u{10ffff}'})),{ok:false,error:'fontUnavailable'});
    assert.equal(f.marks.length,0);assert.equal(f.shapes.get('a').props.text,'Rīga');
    assert.equal(applyDrawingTextReplacement(f.editor,plan(f)).ok,true);
    assert.equal(f.shapes.get('a').meta.omsFontId,font.id);assert.equal(f.shapes.get('a').meta.omsTextLetterSpacing,12);
  });
  it('bounds search/replacement work and never applies truncated results', () => {
    const f=fixture();f.add('a','Rīga '.repeat(1500));
    assert.deepEqual(prepareDrawingTextSearch(f.editor,options),{ok:false,error:'replacementLimit'});
    assert.deepEqual(prepareDrawingTextSearch(f.editor,{...options,query:''}),{ok:false,error:'queryRequired'});
    assert.deepEqual(prepareDrawingTextSearch(f.editor,{...options,scope:'selection'}),{ok:false,error:'selectionRequired'});
    const large=fixture();for(let i=0;i<501;i++)large.add('s'+i);
    assert.deepEqual(prepareDrawingTextSearch(large.editor,options),{ok:false,error:'searchLimit'});
    const long=fixture();for(let i=0;i<21;i++)long.add('s'+i,'x'.repeat(10000));
    assert.deepEqual(prepareDrawingTextSearch(long.editor,options),{ok:false,error:'searchLimit'});
  });
  it('guards save capacity and rolls back growth from native update side effects', () => {
    const f=fixture();f.add('a');f.editor.payload=1_850_000;
    assert.deepEqual(applyDrawingTextReplacement(f.editor,plan(f)),{ok:false,error:'saveLimit'});assert.equal(f.marks.length,0);
    f.editor.payload=0;f.editor.extraAfter=1_900_000;
    assert.deepEqual(applyDrawingTextReplacement(f.editor,plan(f)),{ok:false,error:'failed'});assert.equal(f.shapes.get('a').props.text,'Rīga');
  });
  it('rejects unknown targets and makes no undo mark for unchanged text', () => {
    const f=fixture();f.add('a');const result=plan(f,{replacement:'Rīga'});
    assert.deepEqual(applyDrawingTextReplacement(f.editor,result,['missing' as TLShapeId]),{ok:false,error:'targetsRequired'});
    assert.deepEqual(applyDrawingTextReplacement(f.editor,result),{ok:true,value:0});assert.equal(f.marks.length,0);
  });
});
