import {describe,it,expect} from 'vitest';
import {jsPDF} from 'jspdf';
import {renderIntakePdf} from '../../src/lib/server/order/intake-pdf';

describe('PDF page images for the existing vision model',()=>{
 it('renders every page with page labels and real PNG data',async()=>{
  const pdf=new jsPDF();pdf.text('Drawing 1200 x 500 mm',20,20);pdf.addPage();pdf.text('Delivery',20,20);
  const parts=await renderIntakePdf(new Uint8Array(pdf.output('arraybuffer')),new AbortController().signal);
  expect(parts).toHaveLength(4);
  expect(parts[0]).toEqual({type:'text',text:'Source PDF page 1 of 2'});
  expect(parts[2]).toEqual({type:'text',text:'Source PDF page 2 of 2'});
  expect((parts[1].image_url as any).url.startsWith('data:image/png;base64,iVBOR')).toBe(true);
 });
 it('rejects malformed and oversized page counts instead of sending partial drawings',async()=>{
  const pdf=new jsPDF();for(let i=1;i<11;i++)pdf.addPage();
  for(const bytes of [new Uint8Array(pdf.output('arraybuffer')),new TextEncoder().encode('%PDF-1.7 broken')]){
   let status=0;try{await renderIntakePdf(bytes,new AbortController().signal);}catch(err:any){status=err.status;}
   expect(status).toBe(422);
  }
 });
 it('does not start rendering a canceled request',async()=>{
  const controller=new AbortController();controller.abort();
  let failed=false;try{await renderIntakePdf(new Uint8Array(),controller.signal);}catch{failed=true;}
  expect(failed).toBe(true);
 });
});
