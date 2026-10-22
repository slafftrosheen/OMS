import { describe, it, expect } from 'vitest';
import { File as NodeFile } from 'node:buffer';
import { canvasLinkDescriptor, canvasLinkShapeProps, normalizeCanvasMediaUrl, safeCanvasDocumentUrl } from '../../src/lib/components/canvas/toolkit-media-url';
import { toolkitFileMime } from '../../src/lib/components/canvas/toolkit-media-types';
import { canonicalToolkitAsset, importToolkitFiles, placeToolkitAsset } from '../../src/lib/components/canvas/toolkit-media-import';
import { parseCanvasLinkMetadata, resolvePreviewTarget } from '../../src/lib/server/toolkit/link-preview';
import { signatureMatches, toolkitByteRange, validatedToolkitFile } from '../../src/lib/server/toolkit/assets';
import { GET, HEAD } from '../../src/routes/api/toolkit/assets/[board]/[asset]/+server';

const board = '152f8b54-b90a-438a-8427-71a96299b7b3';
const assetId = 'a9796329-77f6-435b-8b89-3e4dabd137c7';

describe('Canvas link and embedded media policy', () => {
  it('rejects active schemes, credentials, private literals and intranet names', () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,evil', 'https://user:pass@example.com',
      'http://localhost', 'http://127.0.0.1', 'http://0x7f000001', 'http://[::1]',
      'https://server.internal', 'http://server.tail.ts.net', 'https://example.com:4443',
      'https://example.com\n/x']) expect(normalizeCanvasMediaUrl(url)).toBeNull();
    expect(normalizeCanvasMediaUrl(' https://example.com/path?q=hello#section ')).toBe('https://example.com/path?q=hello#section');
  });
  it('derives bounded provider embeds and never trusts a supplied iframe source', () => {
    const id = 'dQw4w9WgXcQ';
    for (const url of [`https://youtu.be/${id}`, `https://www.youtube.com/watch?v=${id}`,
      `https://youtube.com/shorts/${id}`, `https://youtube.com/embed/${id}`]) {
      expect(canvasLinkDescriptor(url)?.embedUrl).toBe(`https://www.youtube-nocookie.com/embed/${id}?rel=0`);
    }
    expect(canvasLinkDescriptor('https://youtube.com.evil.example/watch?v=' + id)?.kind).toBe('link');
    expect(canvasLinkDescriptor('https://youtube.com/watch?v=invalid')?.kind).toBe('link');
    expect(canvasLinkDescriptor('https://vimeo.com/123456789/abcdef0123')?.embedUrl)
      .toBe('https://player.vimeo.com/video/123456789?dnt=1&h=abcdef0123');
    const props = canvasLinkShapeProps('https://youtu.be/' + id, { title: 'Preview', embedUrl: 'javascript:evil' } as any);
    expect(props?.embedUrl).toBe(`https://www.youtube-nocookie.com/embed/${id}?rel=0`);
  });
  it('classifies real direct media and creates usable fallback website cards', () => {
    const kinds = { mp4:'video', webm:'video', mp3:'audio', wav:'audio', ogg:'audio', m4a:'audio', pdf:'pdf', png:'image' };
    for (const [extension, kind] of Object.entries(kinds)) {
      expect(canvasLinkDescriptor(`https://cdn.example.com/asset.${extension}?signed=1`)?.kind).toBe(kind);
    }
    const card = canvasLinkShapeProps('https://example.com/article', { title: 'A useful article',
      description: 'Details', image: 'javascript:alert(1)' });
    expect(card).toMatchObject({ kind:'link', title:'A useful article', description:'Details', previewImage:'', siteName:'example.com' });
    expect(canvasLinkShapeProps('https://localhost/private')).toBeNull();
    expect(safeCanvasDocumentUrl(`/api/toolkit/assets/${board}/${assetId}`)).toBe(`/api/toolkit/assets/${board}/${assetId}`);
    expect(safeCanvasDocumentUrl(`/api/files/${assetId}/download`)).toBe(`/api/files/${assetId}/download`);
    expect(safeCanvasDocumentUrl('//localhost/admin')).toBeNull();
  });
  it('extracts metadata as plain text and safe URLs, without retaining arbitrary HTML', () => {
    const metadata = parseCanvasLinkMetadata(`<html><title>Fallback</title>
      <meta property="og:title" content="Title &amp; more"><meta name="description" content="A useful article">
      <meta property="og:image" content="/cover.jpg"><script>alert('evil')</script></html>`, 'https://example.com/articles/one');
    expect(metadata).toEqual({ title:'Title & more', description:'A useful article', siteName:'example.com', image:'https://example.com/cover.jpg' });
    expect(parseCanvasLinkMetadata('<meta property="og:image" content="javascript:evil">', 'https://example.com').image).toBeUndefined();
  });
  it('rejects private and mixed DNS answers before any preview request', async () => {
    for (const address of ['127.0.0.1','10.2.3.4','100.64.1.2','169.254.169.254','::1','fc00::1','2001:db8::1']) {
      await expect(resolvePreviewTarget('https://example.com', async () => [{ address, family:address.includes(':') ? 6 : 4 }])).rejects.toThrow();
    }
    await expect(resolvePreviewTarget('https://example.com', async () => [
      { address:'93.184.215.14', family:4 }, { address:'192.168.1.1', family:4 }
    ])).rejects.toThrow();
    const target = await resolvePreviewTarget('https://example.com', async () => [{ address:'93.184.215.14', family:4 }]);
    expect(target.address).toEqual({ address:'93.184.215.14', family:4 });
  });
});

describe('Canvas persistent video and audio', () => {
  it('uses matching signatures and conservative browser MIME aliases', () => {
    const ascii = (text: string) => new TextEncoder().encode(text);
    expect(signatureMatches('video/mp4', ascii('0000ftypisom0000'))).toBe(true);
    expect(signatureMatches('audio/mp4', ascii('0000ftypM4A 0000'))).toBe(true);
    expect(signatureMatches('video/webm', new Uint8Array([0x1a,0x45,0xdf,0xa3]))).toBe(true);
    expect(signatureMatches('audio/mpeg', ascii('ID3'))).toBe(true);
    expect(signatureMatches('audio/wav', ascii('RIFF0000WAVE'))).toBe(true);
    expect(signatureMatches('audio/ogg', ascii('OggS'))).toBe(true);
    for (const mime of ['video/mp4','video/webm','audio/mpeg','audio/wav','audio/ogg']) {
      expect(signatureMatches(mime, ascii('<html>not media'))).toBe(false);
    }
    expect(toolkitFileMime({ name:'voice.wav', type:'audio/x-wav' })).toBe('audio/wav');
    expect(toolkitFileMime({ name:'movie.mp4', type:'text/html' })).toBe('text/html');
    expect(validatedToolkitFile(new NodeFile(['ID3'], 'voice.mp3', {type:'audio/mpeg'}) as unknown as File).mime).toBe('audio/mpeg');
  });
  it('persists uploaded media metadata and places playable private references', async () => {
    const original = globalThis.fetch;
    const shapes: any[] = [];
    const metadata = { id:assetId, fileName:'movie.mp4', mime:'video/mp4', bytes:16, url:'https://untrusted.example/other' };
    let uploaded = false;
    globalThis.fetch = (async (_input: any, options: any = {}) => {
      if (options.method === 'POST') uploaded = true;
      return new Response(JSON.stringify(options.method === 'POST' ? metadata : { ready:true }));
    }) as typeof fetch;
    try {
      const result = await importToolkitFiles({ createShape:(shape: any) => shapes.push(shape) }, board,
        [new NodeFile(['0000ftypisom0000'], 'movie.mp4', {type:'video/mp4'}) as unknown as File]);
      expect(uploaded).toBe(true); expect(result.imported).toBe(1);
      expect(shapes[0].props).toMatchObject({ kind:'video', fileId:assetId, url:`/api/toolkit/assets/${board}/${assetId}` });
      placeToolkitAsset({ createShape:(shape: any) => shapes.push(shape) }, board,
        { ...metadata, mime:'audio/mpeg', fileName:'voice.mp3' });
      expect(shapes[1].props).toMatchObject({ kind:'audio', h:180 });
      expect(canonicalToolkitAsset(board, metadata).url).toBe(`/api/toolkit/assets/${board}/${assetId}`);
    } finally { globalThis.fetch = original; }
  });
});

describe('Authenticated byte ranges for media seeking', () => {
  it('normalizes single/suffix ranges and rejects malformed or unsatisfiable requests', () => {
    expect(toolkitByteRange(null, 10)).toBeNull();
    expect(toolkitByteRange('bytes=2-5', 10)).toEqual({ start:2,end:5 });
    expect(toolkitByteRange('bytes=6-', 10)).toEqual({ start:6,end:9 });
    expect(toolkitByteRange('bytes=-3', 10)).toEqual({ start:7,end:9 });
    expect(toolkitByteRange('bytes=5-99', 10)).toEqual({ start:5,end:9 });
    for (const value of ['bytes=10-','bytes=4-2','bytes=-0','bytes=','bytes=0-1,3-4','items=1-2']) {
      expect(toolkitByteRange(value, 10)).toBe(false);
    }
  });
  it('serves authorized media ranges, rejects invalid ranges, and handles HEAD without downloading', async () => {
    let downloads = 0;
    const query: any = { select:() => query, eq:() => query, maybeSingle:async () => ({ data:{ bytes:10, mime_type:'video/mp4', file_name:'movie.mp4', storage_path:'private' }, error:null }) };
    const event: any = { params:{board,asset:assetId}, request:new Request('https://oms.example/api/media', {headers:{range:'bytes=2-5'}}),
      locals:{user:{id:'manager',role:'RD'},supabase:{from:() => query,storage:{from:() => ({download:async () => { downloads++; return {data:new Blob(['0123456789']),error:null}; }})}}} };
    const response = await GET(event);
    expect(response.status).toBe(206); expect(response.headers.get('content-range')).toBe('bytes 2-5/10');
    expect(await response.text()).toBe('2345');
    event.request = new Request('https://oms.example/api/media', {headers:{range:'bytes=20-'}});
    expect((await GET(event)).status).toBe(416); expect(downloads).toBe(1);
    expect((await HEAD(event)).headers.get('content-length')).toBe('10'); expect(downloads).toBe(1);
    event.locals.user = {id:'operator',role:'Operator'};
    await expect(GET(event)).rejects.toMatchObject({status:403});
  });
  it('serves Russian and Latvian filenames with valid ASCII headers and a lossless UTF-8 filename', async () => {
    let filename = '';
    const content = '%PDF-1.7';
    const query: any = { select:() => query, eq:() => query, maybeSingle:async () => ({
      data:{bytes:content.length,mime_type:'application/pdf',file_name:filename,storage_path:'private'},error:null
    }) };
    const event: any = {params:{board,asset:assetId},request:new Request('https://oms.example/api/media'),
      locals:{user:{id:'manager',role:'RD'},supabase:{from:() => query,storage:{from:() => ({download:async () => ({data:new Blob([content]),error:null})})}}}};
    for (const name of ['чертёж 01.pdf', 'Izkārtne – Rīga.pdf']) {
      filename = name;
      const response = await GET(event);
      expect(response.status).toBe(200);
      const disposition = response.headers.get('content-disposition')!;
      expect(/^[\x20-\x7e]+$/.test(disposition)).toBe(true);
      expect(decodeURIComponent(disposition.split("filename*=UTF-8''")[1])).toBe(name);
      expect(await response.text()).toBe(content);
    }
  });
});
