import {createRequire} from 'node:module';
import {dirname,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Worker} from 'node:worker_threads';
import {error} from '@sveltejs/kit';
import {parsePdfPageRange,type PdfPageRange,type PdfPageScope} from '$lib/pdf/page-range';

export interface PdfPageImages { parts:Array<Record<string,unknown>>; pages:PdfPageScope }

// Run parsing/rendering outside the request thread. Termination bounds malformed
// PDFs as well as cancellation; no document data or page images touch disk.
async function renderInWorker(){
 const {parentPort,workerData}=await import('node:worker_threads');
 const {getDocument}=await import(workerData.pdfModule);
 const task=getDocument({data:new Uint8Array(workerData.bytes),isEvalSupported:false,
  useSystemFonts:false,stopAtErrors:true,verbosity:0,
  cMapUrl:workerData.root+'/cmaps/',cMapPacked:true,
  standardFontDataUrl:workerData.root+'/standard_fonts/'});
 try{
  const pdf=await task.promise;
  const start=workerData.range?.start??1;
  const end=workerData.range?.end??pdf.numPages;
  if(end>pdf.numPages)throw new Error('PDF_PAGE_RANGE');
  if(end-start+1>10)throw new Error('PDF_PAGE_LIMIT');
  const parts:Array<Record<string,unknown>>=[];
  let total=0;
  for(let pageNumber=start;pageNumber<=end;pageNumber++){
   const page=await pdf.getPage(pageNumber);
   const natural=page.getViewport({scale:1});
   const viewport=page.getViewport({scale:2400/Math.max(natural.width,natural.height)});
   const surface=pdf.canvasFactory.create(Math.ceil(viewport.width),Math.ceil(viewport.height));
   try{
    await page.render({canvasContext:surface.context,viewport,background:'rgb(255,255,255)'}).promise;
    const image=surface.canvas.toBuffer('image/png');total+=image.length;
    if(total>24*1024*1024)throw new Error('Rendered PDF is too large; split the drawing before analysis.');
    parts.push({type:'text',text:`Source PDF page ${pageNumber} of ${pdf.numPages}`},
     {type:'image_url',image_url:{url:'data:image/png;base64,'+image.toString('base64')}});
   }finally{pdf.canvasFactory.destroy(surface);page.cleanup();}
  }
  parentPort!.postMessage({parts,pages:{start,end,total:pdf.numPages}});
 }finally{await task.destroy();}
}

export async function renderPdfPageSource(bytes:Uint8Array,signal:AbortSignal,requestedPages?:PdfPageRange):Promise<PdfPageImages>{
 signal.throwIfAborted();
 let range:PdfPageRange|undefined;
 try{range=parsePdfPageRange(requestedPages,10);}catch{throw error(422,'Visual analysis supports at most 10 pages per range. Choose valid whole page numbers.');}
 const require=createRequire(import.meta.url);
 const root=dirname(require.resolve('pdfjs-dist/package.json',{paths:[process.cwd()]}));
 const worker=new Worker(`(${renderInWorker.toString()})()`,{eval:true,
  workerData:{bytes,root,range,pdfModule:pathToFileURL(join(root,'legacy/build/pdf.mjs')).href},
  resourceLimits:{maxOldGenerationSizeMb:256}});
 return new Promise((resolve,reject)=>{
  let settled=false;
  const finish=(failure?:unknown,result?:PdfPageImages)=>{
   if(settled)return;settled=true;clearTimeout(timer);signal.removeEventListener('abort',abort);
   void worker.terminate();
   if(failure)reject(failure);else resolve(result!);
  };
  const fail=(status:number,message:string)=>{try{error(status,message);}catch(err){finish(err);}};
  const abort=()=>fail(499,'PDF analysis canceled');
  const timer=setTimeout(()=>fail(422,'PDF rendering timed out. Split the drawing or export a smaller PDF.'),30_000);
  worker.once('message',result=>finish(undefined,result));
  worker.once('error',err=>fail(422,err instanceof Error && err.message==='PDF_PAGE_RANGE'
   ?'The selected page range is outside this PDF. Check the page count.'
   :err instanceof Error && err.message==='PDF_PAGE_LIMIT'
    ?'Visual analysis supports at most 10 pages at a time. Choose a page range to analyze a larger PDF.'
    :'Could not read this PDF. Use an unlocked PDF with at most 10 pages per analysis.'));
  worker.once('exit',()=>{if(!settled)fail(422,'PDF rendering stopped before all pages were read.');});
  signal.addEventListener('abort',abort,{once:true});
  if(signal.aborted)abort();
 });
}

/** Preserve the existing order-intake contract: no page selection means every page. */
export async function renderIntakePdf(bytes:Uint8Array,signal:AbortSignal):Promise<Array<Record<string,unknown>>>{
 return (await renderPdfPageSource(bytes,signal)).parts;
}
