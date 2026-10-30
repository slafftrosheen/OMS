import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {fetchAllOrderFiles,fetchOrderFilePage,fetchOrderFilesCount,orderFilePageUrl} from '../../src/lib/order/order-files-client';

const read=(path:string)=>readFileSync(path,'utf8');
const records=Array.from({length:237},(_,i)=>({id:`file-${i}`,mimeType:'application/pdf'}));
function mockFetch(rows=records,overrideTotal?:number): typeof fetch {
  return (async (input:RequestInfo|URL)=>{
    const params=new URL(String(input),'https://localhost').searchParams;
    const offset=Number(params.get('offset')),limit=Number(params.get('limit'));
    return new Response(JSON.stringify(rows.slice(offset,offset+limit)),{
      headers:{'X-Total-Count':String(overrideTotal??rows.length)}
    });
  }) as typeof fetch;
}
describe('OMS-R18 canonical attachment pagination',()=>{
  it('preserves plain-array response compatibility while validating exact totals',async()=>{
    const result=await fetchOrderFilePage('order-1',50,50,mockFetch());
    expect(result.total).toBe(237);
    expect(result.files).toHaveLength(50);
    expect(result.files[0].id).toBe('file-50');
    expect(await fetchOrderFilesCount('order-1',mockFetch())).toBe(237);
  });
  it('loads all pages, including files beyond both historical limits',async()=>{
    const all=await fetchAllOrderFiles('order-1',mockFetch());
    expect(all).toHaveLength(237);
    expect(all[236].id).toBe('file-236');
  });
  it('rejects missing counts and inconsistent page totals',async()=>{
    const noHeader=(async()=>new Response('[]')) as typeof fetch;
    await expect(fetchOrderFilePage('id',0,50,noHeader)).rejects.toThrow('exact count');
    await expect(fetchAllOrderFiles('id',mockFetch(records,999))).rejects.toThrow();
    expect(()=>orderFilePageUrl('id',-1,50)).toThrow();
    expect(()=>orderFilePageUrl('id',0,101)).toThrow();
  });
  it('counts RLS-visible junction links, not one arbitrary capped page',()=>{
    const api=read('src/routes/api/files/+server.ts');
    expect(api).toContain("{ count: 'exact' }");
    expect(api).toContain("'X-Total-Count': String(count)");
    expect(api).toContain("'Cache-Control': 'private, no-store'");
    expect(api).toContain(".order('id', { ascending: false })");
  });
  it('uses shared pagination everywhere that displays order file choices and counts',()=>{
    for(const p of ['src/lib/order/RevisionIntelligence.svelte',
      'src/lib/order/OrderIntakeAssistant.svelte'])
      expect(read(p)).toContain('fetchAllOrderFiles');
    expect(read('src/lib/order/OrderFiles.svelte')).toContain('loadFiles(false)');
    expect(read('src/routes/orders/[id]/edit/+page.svelte')).toContain('fetchOrderFilesCount(id)');
    expect(read('src/routes/orders/[id]/+page.svelte')).toContain('fetchOrderFilesCount(requestedId)');
    expect(read('src/routes/orders/[id]/edit/+page.ts')).not.toContain('const filesRes');
  });
  it('updates local views only after successful mutation and retains error feedback',()=>{
    const panel=read('src/lib/order/OrderFiles.svelte');
    expect(panel).toContain('announceOrderFilesChanged(id)');
    expect(panel).toContain('onChanged?.()');
    expect(panel).toContain('if (failed.length) fileError');
    expect(panel).toContain('if (version !== requestVersion || id !== orderId) return');
  });
  it('preserves delete errors across a reconciliation refresh and rejects inconsistent next pages',()=>{
    const panel=read('src/lib/order/OrderFiles.svelte');
    expect(panel).toContain('if (deletionError) fileError = deletionError');
    expect(panel).toContain('if (!reset && files.length < result.total && !result.files.length)');
    expect(panel).toContain('if (!reset && result.files.some(f => files.some');
  });
  it('localizes all newly exposed file operations',()=>{
    for(const lang of ['en','ru','lv']){
      const translations=JSON.parse(read(`src/locales/${lang}.json`)).orderFiles;
      expect(Object.keys(translations).length).toBe(11);
      expect(translations.loadMore.length).toBeGreaterThan(5);
    }
  });
});
