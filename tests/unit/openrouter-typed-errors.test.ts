import {describe,it,expect} from 'vitest';
import {openRouterCompleteWithMetadata,OpenRouterHttpError} from '../../src/lib/server/ai/openrouter';

const config={apiKey:'private-api-key',baseUrl:'https://openrouter.ai/api/v1',defaultModel:'test/model',visionModel:'test/vision',timeoutMs:10000};
const messages=[{role:'user' as const,content:'Private document'}];
const complete=(fetcher:typeof fetch)=>openRouterCompleteWithMetadata(messages,{},config,fetcher);
async function failure(fetcher:typeof fetch){
  try{await complete(fetcher);}catch(error){return error as OpenRouterHttpError;}
  throw new Error('Expected a provider failure');
}

describe('OpenRouter typed failures',()=>{
  it('retains only allowlisted metadata from HTTP failures and never the private body',async()=>{
    const caught=await failure(async()=>Response.json({error:{code:400,message:'private-api-key Private document',
      metadata:{error_type:'context_length_exceeded',raw:'Private document',provider_name:'private-provider'}}},{status:400}));
    expect(caught instanceof OpenRouterHttpError).toBe(true);
    expect(caught.statusCode).toBe(400);
    expect(caught.errorType).toBe('context_length_exceeded');
    expect(JSON.stringify(caught)).not.toContain('Private document');
    expect(JSON.stringify(caught)).not.toContain('private-api-key');
    expect(JSON.stringify(caught)).not.toContain('private-provider');
    expect(caught.message).not.toContain('Private document');
  });
  it('does not repeat an input, authentication or policy failure even in a transient HTTP envelope',async()=>{
    for(const type of ['context_length_exceeded','authentication','payment_required','invalid_image','content_policy_violation','rate_limit_exceeded']){
      let calls=0;
      const caught=await failure(async()=>{calls++;return Response.json({error:{code:502,metadata:{error_type:type}}},{status:502});});
      expect(caught.errorType).toBe(type);
      expect(calls).toBe(1);
    }
  });
  it('recognizes typed errors in HTTP 200 completion choices without accepting partial output',async()=>{
    const caught=await failure(async()=>Response.json({choices:[{message:{content:'partial'},finish_reason:'error',
      error:{code:400,metadata:{error_type:'invalid_image'}}}]}));
    expect(caught.statusCode).toBe(400);
    expect(caught.errorType).toBe('invalid_image');
  });
  it('treats content-filter completions as declined instead of successful partial data',async()=>{
    let calls=0;
    const caught=await failure(async()=>{calls++;return Response.json({choices:[{
      message:{content:'{"proposals":[]}'},finish_reason:'content_filter'}]});});
    expect(caught.statusCode).toBe(403);
    expect(caught.errorType).toBe('content_policy_violation');
    expect(calls).toBe(1);
  });
  it('discards unknown metadata codes instead of turning private text into diagnostic fields',async()=>{
    const caught=await failure(async()=>Response.json({error:{code:400,metadata:{error_type:'private-api-key'}}},{status:400}));
    expect(caught.errorType).toBe(null);
    expect(JSON.stringify(caught)).not.toContain('private-api-key');
  });
  it('caps non-success response reads and cancels an oversized provider body',async()=>{
    let cancelled=false,reads=0;
    const caught=await failure(async()=>new Response(new ReadableStream<Uint8Array>({
      pull(controller){reads++;controller.enqueue(new Uint8Array(65537));},
      cancel(){cancelled=true;}
    }),{status:413}));
    expect(caught.statusCode).toBe(413);
    expect(caught.errorType).toBe(null);
    expect(cancelled).toBe(true);
    expect(reads).toBeLessThanOrEqual(2);
  });
  it('keeps HTTP status and cooldown on a non-JSON gateway failure',async()=>{
    const caught=await failure(async()=>new Response('<html>Gateway unavailable</html>',{status:503,headers:{'Retry-After':'30'}}));
    expect(caught.statusCode).toBe(503);
    expect(caught.retryAfterSeconds).toBe(30);
    expect(caught.errorType).toBe(null);
  });
  it('still retries an explicitly transient provider failure once',async()=>{
    let calls=0;
    const result=await complete(async()=>++calls===1
      ? Response.json({error:{code:503,metadata:{error_type:'provider_overloaded'}}},{status:503,headers:{'Retry-After':'1'}})
      : Response.json({choices:[{message:{content:'Completed'}}]}));
    expect(result.text).toBe('Completed');
    expect(calls).toBe(2);
  });
  it('retries transient image delivery failures, but does not retry a rejected image request',async()=>{
    let calls=0;
    const result=await complete(async()=>++calls===1
      ? Response.json({error:{code:502,metadata:{error_type:'image_download_failed'}}},{status:502,headers:{'Retry-After':'1'}})
      : Response.json({choices:[{message:{content:'Completed'}}]}));
    expect(result.text).toBe('Completed');
    expect(calls).toBe(2);
    calls=0;
    const caught=await failure(async()=>{calls++;return Response.json({error:{code:400,metadata:{error_type:'image_download_failed'}}},{status:400});});
    expect(caught.errorType).toBe('image_download_failed');
    expect(calls).toBe(1);
  });
});
