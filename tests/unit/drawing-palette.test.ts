import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import type { TLShape } from '@tldraw/tldraw';
import { cadPalettePatch } from '../../src/lib/components/canvas/drawing-palette';
import { VECTOR_DEFAULT_PAINT } from '../../src/lib/components/canvas/cad-paint';

const gradient = {type:'linear',matrix:[1,0,0,1,0,0],start:[0,0],end:[80,0],r0:0,r1:1,stops:[{offset:0,color:'#112233'},{offset:1,color:'#abcdef'}]};
const node=(x:number,y:number)=>({x,y,inX:0,inY:0,outX:0,outY:0,mode:'corner'});
function shape(type:string,props:Record<string,unknown>):TLShape {
  return {id:'shape:palette',type,x:0,y:0,rotation:0,opacity:1,isLocked:false,parentId:'page:test',index:'a1',
    props:{color:'black',...props},meta:{omsObjectName:'Plate',productionTag:'cut',omsVectorPaint:{
      ...VECTOR_DEFAULT_PAINT,fill:'#113355',stroke:'#aabbcc',dash:[],gradient,
    }}} as unknown as TLShape;
}
const ellipse=()=>shape('cad-ellipse',{w:80,h:40});
const path=(closed:boolean)=>shape('cad-path',{points:[{x:0,y:0},{x:80,y:0},{x:80,y:40}],closed});
const curve=(closed:boolean)=>shape('cad-bezier',{contours:[{closed,nodes:[node(0,0),node(80,0),node(80,40)]}]});
const paint=(patch:ReturnType<typeof cadPalettePatch>)=>patch!.meta.omsVectorPaint as any;
describe('CAD palette fill and outline semantics',()=>{
  it('fills closed CAD types without changing their outline or source geometry',()=>{
    for(const original of [ellipse(),path(true),curve(true)]){
      const before=structuredClone(original),patch=cadPalettePatch(original,'#ff2200','fill');
      assert.equal(paint(patch).fill,'#ff2200');assert.equal(paint(patch).stroke,'#aabbcc');
      assert.equal(paint(patch).gradient,undefined);assert.ok('productionTag' in patch!.meta);assert.equal(patch!.meta.productionTag,'cut');
      assert.deepEqual(original,before);assert.equal(Object.hasOwn(patch!,'props'),false);
    }
  });
  it('right-click preserves gradient and fill while recolouring outline',()=>{
    const patch=cadPalettePatch(ellipse(),'#00aa55','stroke');
    assert.equal(paint(patch).stroke,'#00aa55');assert.equal(paint(patch).fill,'#113355');
    assert.deepEqual(paint(patch).gradient,gradient);
  });
  it('open CAD geometry uses outline and retains latent fill',()=>{
    for(const original of [path(false),curve(false),shape('cad-arc',{radius:50,startAngle:0,endAngle:120})]){
      const patch=cadPalettePatch(original,'#ff9900','fill');
      assert.equal(paint(patch).stroke,'#ff9900');assert.equal(paint(patch).fill,'#113355');
      assert.deepEqual(paint(patch).gradient,gradient);
    }
  });
  it('mixed closed/open compounds use outline colour',()=>{
    const compound=curve(true) as any;
    compound.props.contours.push({closed:false,nodes:[node(10,5),node(30,20)]});
    const patch=cadPalettePatch(compound,'#1122ff','fill');
    assert.equal(paint(patch).stroke,'#1122ff');assert.deepEqual(paint(patch).gradient,gradient);
  });
  it('leaves native shapes and legacy invalid arcs to native styling',()=>{
    assert.equal(cadPalettePatch(shape('text',{text:'OMS'}),'#ff0000','fill'),undefined);
    assert.equal(cadPalettePatch(shape('cad-arc',{radius:50,startAngle:90,endAngle:90}),'#ff0000','stroke'),undefined);
  });
  it('clears obsolete material settings only for a solid fill',()=>{
    const original=ellipse();
    original.meta.omsMaterialTexture={mode:'tile',rotation:30};
    assert.equal(cadPalettePatch(original,'#334455','fill')!.meta.omsMaterialTexture,null);
    assert.deepEqual(cadPalettePatch(original,'#334455','stroke')!.meta.omsMaterialTexture,original.meta.omsMaterialTexture);
  });
  it('rejects invalid colour metadata atomically',()=>{
    const original=ellipse(),before=structuredClone(original);
    assert.equal(cadPalettePatch(original,'url(unsafe)','fill'),undefined);assert.deepEqual(original,before);
  });
});
