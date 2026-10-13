import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { File as NodeFile } from 'node:buffer';
import {
  canonicalToolkitAsset, isSupportedToolkitAsset, placeToolkitAsset, importToolkitFiles
} from '../../src/lib/components/canvas/toolkit-media-import';
import { toolkitUploadReadiness, signatureMatches } from '../../src/lib/server/toolkit/assets';

const read = (file: string) => readFileSync(file, 'utf8');
const board = '152f8b54-b90a-438a-8427-71a96299b7b3';
const id = 'a9796329-77f6-435b-8b89-3e4dabd137c7';
const metadata = { id, fileName: 'proof.pdf', mime: 'application/pdf', bytes: 8,
  url: '/api/toolkit/assets/evil/other' };

describe('OMS-R11 end-to-end upload readiness and recovery contracts', () => {
  it('fixes the previously invalid migration function quoting and retains private Storage/RLS', () => {
    const sql = read('supabase/migrations/20261009000005_toolkit_shared_canvases_private_conversations.sql');
    expect(sql).not.toMatch(/AS \$(?!\$)\n/);
    expect(sql).not.toMatch(/^\$;$/m);
    expect((sql.match(/AS \$\$/g) || []).length).toBe(4);
    expect(sql).toContain("VALUES ('toolkit-assets', 'toolkit-assets', false, 26214400");
    expect(sql).toContain("CREATE POLICY toolkit_asset_storage_insert");
    expect(sql).toContain("CREATE POLICY toolkit_assets_write");
    expect(sql).toContain("GRANT SELECT,INSERT,DELETE ON public.toolkit_assets TO authenticated");
  });

  it('routes all /api requests to OMS and sets runtime limit for Docker and systemd example', () => {
    const compose = read('docker-compose.yml');
    expect(compose).toContain('BODY_SIZE_LIMIT=${BODY_SIZE_LIMIT:-32M}');
    const nginx = read('nginx.conf');
    expect(nginx).toContain('client_max_body_size 32m');
    expect(nginx).toContain('proxy_pass http://oms_app');
    expect(nginx).not.toContain('proxy_pass http://backend/');
    expect(read('.env.example')).toContain('BODY_SIZE_LIMIT=32M');
    expect(toolkitUploadReadiness('32M').ready).toBe(true);
    expect(toolkitUploadReadiness(undefined).ready).toBe(false);
  });

  it('uses exact local project IDs, never remote URL strings from upload acknowledgements', () => {
    const data = canonicalToolkitAsset(board, metadata);
    expect(data.url).toBe(`/api/toolkit/assets/${board}/${id}`);
    expect(() => canonicalToolkitAsset('not-uuid', metadata)).toThrow();
    expect(() => canonicalToolkitAsset(board, { ...metadata, id: '../other' })).toThrow();
    expect(() => canonicalToolkitAsset(board, { ...metadata, mime: 'text/html' })).toThrow();
    expect(() => canonicalToolkitAsset(board, { ...metadata, bytes: 30_000_000 })).toThrow();
    expect(isSupportedToolkitAsset({ name: 'bad.svg', type: 'image/svg+xml' })).toBe(false);
    expect(isSupportedToolkitAsset({ name: 'photo.webp', type: '' })).toBe(true);
    expect(signatureMatches('application/pdf', new TextEncoder().encode('%PDF-1.7'))).toBe(true);
  });

  it('re-attaches recovered PDF as a persistent, privacy-scoped document shape', () => {
    const created: unknown[] = [];
    const editor = { getViewportPageBounds: () => ({ center: { x: 500, y: 300 } }),
      createShape: (shape: unknown) => created.push(shape) };
    const result = placeToolkitAsset(editor, board, metadata);
    expect(result.url).toBe(`/api/toolkit/assets/${board}/${id}`);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ type: 'document', x: 300, y: 150,
      props: { kind: 'pdf', status: 'ready', fileId: id, pdfPage: 1, url: result.url } });
  });

  it('preflights once per upload batch and records each successful stored object', async () => {
    const original = globalThis.fetch;
    let checks = 0, uploads = 0;
    const created: unknown[] = [];
    globalThis.fetch = (async (_input: RequestInfo | URL, opts?: RequestInit) => {
      if (!opts?.method) {
        checks++;
        return new Response(JSON.stringify({ ready: true }), { status: 200 });
      }
      expect((opts.body as FormData).get('file')).toBeInstanceOf(Blob);
      uploads++;
      return new Response(JSON.stringify({
        ...metadata, id: uploads === 1 ? id : 'b9796329-77f6-435b-8b89-3e4dabd137c7'
      }), { status: 201 });
    }) as typeof fetch;
    try {
      const editor = { getViewportPageBounds: () => ({ center: { x: 200, y: 200 } }),
        createShape: (shape: unknown) => created.push(shape) };
      const file = new NodeFile(['%PDF-1.7'], 'proof.pdf', { type: 'application/pdf' }) as unknown as File;
      const result = await importToolkitFiles(editor, board, [file, file]);
      expect(checks).toBe(1);
      expect(uploads).toBe(2);
      expect(result.imported).toBe(2);
      expect(result.stored).toHaveLength(2);
      expect(result.errors).toEqual([]);
      expect(created).toHaveLength(2);
    } finally { globalThis.fetch = original; }
  });

  it('retains a recoverable asset if Canvas createShape fails after upload', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async (_input: RequestInfo | URL, opts?: RequestInit) =>
      new Response(JSON.stringify(opts?.method ? metadata : { ready: true }),
        { status: opts?.method ? 201 : 200 })) as typeof fetch;
    try {
      const editor = { getViewportPageBounds: () => ({ center: { x: 0, y: 0 } }),
        createShape: () => { throw new Error('Canvas unavailable'); } };
      const file = new NodeFile(['%PDF-1.7'], 'proof.pdf',
        { type: 'application/pdf' }) as unknown as File;
      const result = await importToolkitFiles(editor, board, [file]);
      expect(result.stored).toHaveLength(1);
      expect(result.imported).toBe(0);
      expect(result.errors.join(' ')).toContain('Use Saved files');
    } finally { globalThis.fetch = original; }
  });

  it('checks authentication and board ownership before file library and binary responses', () => {
    const upload = read('src/routes/api/toolkit/assets/[board]/+server.ts');
    const download = read('src/routes/api/toolkit/assets/[board]/[asset]/+server.ts');
    const library = read('src/routes/api/toolkit/assets/[board]/library/+server.ts');
    expect(upload).toContain("from('toolkit_assets').insert");
    expect(upload).toContain('signatureMatches(mime, buffer.subarray(0, 16))');
    expect(library).toContain('requireToolkitManager(locals.user)');
    expect(library).toContain(".eq('canvas_id', params.board)");
    expect(library).not.toContain('storage_path,');
    expect(download).toContain('requireToolkitManager(locals.user)');
    expect(download).toContain(".eq('canvas_id', params.board)");
    expect(download).toContain("'Cache-Control': 'private, no-store'");
    expect(download).toContain('blob.size !== row.bytes');
  });

  it('exposes a manual recovery library in the UI, rather than losing upload on snapshot failure', () => {
    const ui = read('src/routes/toolkit/canvas/+page.svelte');
    expect(ui).toContain('async function loadSavedFiles(id: string)');
    expect(ui).toContain('function reattachSavedFile(file: ToolkitStoredAsset)');
    expect(ui).toContain('placeToolkitAsset(editor, boardId, file)');
    expect(ui).toContain('if (boardId === id) await loadSavedFiles(id);');
    expect(ui).toContain("tr('canvas.savedFileAttached')");
    const script = read('scripts/smoke-toolkit-upload.sh');
    expect(script).toContain('sha256sum');
    expect(script).toContain('$base/library');
    expect(script).toContain('anonymous_code');
  });
});
