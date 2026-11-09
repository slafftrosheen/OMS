import {createRequire} from 'node:module';
import {dirname,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Worker} from 'node:worker_threads';
import {error} from '@sveltejs/kit';

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
  if(pdf.numPages>10)throw new Error('Use a PDF with at most 10 pages; split larger drawings before analysis.');
  const parts:Array<Record<string,unknown>>=[];
  let total=0;
  for(let pageNumber=1;pageNumber<=pdf.numPages;pageNumber++){
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
  parentPort!.postMessage({parts});
 }finally{await task.destroy();}
}

export async function renderIntakePdf(bytes:Uint8Array,signal:AbortSignal):Promise<Array<Record<string,unknown>>>{
 signal.throwIfAborted();
 const require=createRequire(import.meta.url);
 const root=dirname(require.resolve('pdfjs-dist/package.json',{paths:[process.cwd()]}));
 const worker=new Worker(`(${renderInWorker.toString()})()`,{eval:true,
  workerData:{bytes,root,pdfModule:pathToFileURL(join(root,'legacy/build/pdf.mjs')).href},
  resourceLimits:{maxOldGenerationSizeMb:256}});
 return new Promise((resolve,reject)=>{
  let settled=false;
  const finish=(failure?:unknown,parts?:Array<Record<string,unknown>>)=>{
   if(settled)return;settled=true;clearTimeout(timer);signal.removeEventListener('abort',abort);
   void worker.terminate();
   if(failure)reject(failure);else resolve(parts!);
  };
  const fail=(status:number,message:string)=>{try{error(status,message);}catch(err){finish(err);}};
  const abort=()=>fail(499,'PDF analysis canceled');
  const timer=setTimeout(()=>fail(422,'PDF rendering timed out. Split the drawing or export a smaller PDF.'),30_000);
  worker.once('message',({parts})=>finish(undefined,parts));
  worker.once('error',()=>fail(422,'Could not read this PDF. Use an unlocked PDF with at most 10 pages.'));
  worker.once('exit',()=>{if(!settled)fail(422,'PDF rendering stopped before all pages were read.');});
  signal.addEventListener('abort',abort,{once:true});
  if(signal.aborted)abort();
 });
}
