/** Private-file acceptance: validates the exact real inputs, never calls AI. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import parsePdf from 'pdf-parse/lib/pdf-parse.js';
const directory=process.env.OMS_PRODUCTION_PDF_DIR||'.local/production-pdfs';
const {cases}=JSON.parse(await readFile('tests/fixtures/production-intake/examples.json','utf8'));
for(const c of cases)test(`real PDF input: ${c.id}`,async context=>{
 let bytes;
 try{bytes=await readFile(join(directory,c.fileName));}
 catch(err){
  if(err.code==='ENOENT'&&!process.env.OMS_PRODUCTION_PDF_DIR){context.skip('Private example PDFs are not installed');return;}
  throw err;
 }
 assert.equal(createHash('sha256').update(bytes).digest('hex'),c.sha256);
 assert.ok(bytes.length<12*1024*1024);
 const parsed=await parsePdf(bytes);
 assert.equal(parsed.numpages,1);
 assert.ok(parsed.text.trim().length<300,'Example needs a visual/native PDF or OCR route, not text extraction alone');
});
