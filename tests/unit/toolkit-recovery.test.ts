import { describe, expect, it } from 'vitest';
import { recoverToolkitCanvas } from '../../src/lib/server/toolkit/recovery';
import { POST } from '../../src/routes/api/ai/canvas/[id]/recover/+server';
import { DELETE } from '../../src/routes/api/ai/canvas/+server';
import { GET } from '../../src/routes/api/toolkit/assets/[board]/[asset]/+server';

const source = '152f8b54-b90a-438a-8427-71a96299b7b3';
const other = '252f8b54-b90a-438a-8427-71a96299b7b3';
const first = 'a9796329-77f6-435b-8b89-3e4dabd137c7';
const second = 'b9796329-77f6-435b-8b89-3e4dabd137c7';
const unused = 'c9796329-77f6-435b-8b89-3e4dabd137c7';
const url = (id: string, board = source) => `/api/toolkit/assets/${board}/${id}`;

function fixture() {
  const boards: any[] = [{ id: source, title: 'Source', revision: 8, payload: { original: true }, shared: true }];
  const assets = [first, second, unused].map(id => ({ id, canvas_id: source,
    user_id: 'original-owner', file_name: `${id}.pdf`, mime_type: 'application/pdf',
    bytes: 8, storage_path: `${source}/${id}` }));
  const objects = new Map(assets.map(asset => [asset.storage_path, new TextEncoder().encode('%PDF-1.7')]));
  const state: any = { boards, assets, objects, copies: [], removals: [], queries: [],
    copyOverride: null, failBoard: false, failMetadata: false, hideSource: false };
  const bucket = {
    copy: async (from: string, to: string) => {
      state.copies.push({ from, to });
      if (state.copyOverride) return state.copyOverride(from, to);
      const bytes = objects.get(from);
      if (!bytes) return { data: null, error: { message: 'Missing object' } };
      objects.set(to, bytes.slice());
      return { data: { path: to }, error: null };
    },
    remove: async (paths: string[]) => {
      state.removals.push([...paths]); paths.forEach(path => objects.delete(path));
      return { data: [], error: null };
    },
    download: async (path: string) => ({ data: objects.has(path) ? new Blob([objects.get(path)!]) : null, error: null })
  };
  const db: any = {
    storage: { from: (name: string) => { expect(name).toBe('toolkit-assets'); return bucket; } },
    from: (table: string) => {
      let operation = 'select', values: any, filters: Array<(row: any) => boolean> = [];
      const query: any = {
        select: () => query,
        eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return query; },
        in: (key: string, value: unknown[]) => { filters.push(row => value.includes(row[key])); return query; },
        insert: (value: any) => { operation = 'insert'; values = value; return query; },
        delete: () => { operation = 'delete'; return query; },
        maybeSingle: async () => { const result = await execute(); return { ...result, data: result.data?.[0] ?? null }; },
        single: async () => { const result = await execute(); return { ...result, data: result.data?.[0] ?? null }; },
        then: (resolve: any, reject: any) => execute().then(resolve, reject)
      };
      const execute = async () => {
        state.queries.push({ table, operation });
        const rows = table === 'canvas_documents' ? boards : assets;
        const matches = rows.filter(row => filters.every(filter => filter(row)));
        if (operation === 'insert') {
          const added = (Array.isArray(values) ? values : [values]).map(row => ({ revision: 0, ...row }));
          rows.push(...added);
          // A lost acknowledgement can occur after the actual write. Recovery
          // must compensate this case as well as an ordinary rejected insert.
          if ((table === 'canvas_documents' && state.failBoard) || (table === 'toolkit_assets' && state.failMetadata)) {
            return { data: null, error: { code: 'TEST_FAILURE' } };
          }
          return { data: added, error: null };
        }
        if (operation === 'delete') {
          for (const row of matches) {
            rows.splice(rows.indexOf(row), 1);
            if (table === 'canvas_documents') {
              for (let index = assets.length - 1; index >= 0; index--) {
                if (assets[index].canvas_id === row.id) assets.splice(index, 1);
              }
            }
          }
          return { data: matches, error: null };
        }
        return { data: table === 'canvas_documents' && state.hideSource ? [] : matches, error: null };
      };
      return query;
    }
  };
  return { state, locals: { user: { id: 'recovering-manager', role: 'RD' }, supabase: db } as any };
}

const input = () => ({ title: 'Recovered canvas', payload: { version: 1, snapshot: { store: {
  'shape:document': { id: 'shape:document', type: 'document', props: { fileId: first, url: url(first), title: first } },
  'shape:material': { id: 'shape:material', type: 'material', props: { textureUrl: url(first) } },
  'asset:image': { id: 'asset:image', type: 'image', props: { src: `${url(second)}?download=1` } },
  'shape:order': { id: 'shape:order', type: 'document', props: { fileId: unused, url: `/api/files/${unused}/download` } },
  'shape:link': { id: 'shape:link', type: 'document', props: { url: 'https://example.com/video.mp4' } }
} } } });

describe('Independent Toolkit recovery copies', () => {
  it('copies only referenced source assets, remaps every use, and survives source deletion', async () => {
    const { locals, state } = fixture(); const original = input();
    const response = await POST({ locals, params: { id: source }, request: new Request('https://oms.example/recover', {
      method: 'POST', body: JSON.stringify(original)
    }) } as any);
    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const result = await response.json();
    expect(result.copiedAssets).toBe(2);
    expect(result.canvas.shared).toBe(true); expect(result.canvas.revision).toBe(0);
    const copied = state.boards.find((row: any) => row.id === result.canvas.id);
    const store = copied.payload.snapshot.store;
    const document = store['shape:document'].props;
    expect(document.fileId).not.toBe(first); expect(document.title).toBe(first);
    expect(document.url).toBe(url(document.fileId, copied.id));
    expect(store['shape:material'].props.textureUrl).toBe(document.url);
    expect(store['asset:image'].props.src).not.toBe(`${url(second)}?download=1`);
    expect(store['asset:image'].props.src.endsWith('?download=1')).toBe(true);
    expect(store['shape:order']).toEqual(original.payload.snapshot.store['shape:order']);
    expect(store['shape:link']).toEqual(original.payload.snapshot.store['shape:link']);
    expect(original).toEqual(input());
    expect(state.copies.map((copy: any) => copy.from).sort()).toEqual([`${source}/${first}`, `${source}/${second}`]);
    const newAssets = state.assets.filter((row: any) => row.canvas_id === copied.id);
    expect(newAssets).toHaveLength(2);
    expect(newAssets.every((row: any) => row.user_id === locals.user.id && row.storage_path === `${copied.id}/${row.id}`)).toBe(true);
    await DELETE({ locals, url: new URL(`https://oms.example/api/ai/canvas?id=${source}`) } as any);
    expect(state.objects.has(`${source}/${first}`)).toBe(false);
    const file = await GET({ locals, params: { board: copied.id, asset: document.fileId },
      request: new Request('https://oms.example/file') } as any);
    expect(await file.text()).toBe('%PDF-1.7');
  });

  it('requires a management identity and a visible source before reading or copying media', async () => {
    for (const user of [null, { id: 'operator', role: 'Operator' }]) {
      const { locals, state } = fixture(); locals.user = user;
      await expect(recoverToolkitCanvas(locals, source, input())).rejects.toMatchObject({ status: user ? 403 : 401 });
      expect(state.queries).toEqual([]); expect(state.copies).toEqual([]);
    }
    const { locals, state } = fixture(); state.hideSource = true;
    await expect(recoverToolkitCanvas(locals, source, input())).rejects.toMatchObject({ status: 404 });
    expect(state.copies).toEqual([]);
    expect(state.queries.every((query: any) => query.table === 'canvas_documents')).toBe(true);
  });

  it('rejects missing, cross-board, inconsistent and invalid-storage references without copying', async () => {
    for (const change of [
      (body: any) => { body.payload.snapshot.store['shape:document'].props.fileId = unused; },
      (body: any) => { body.payload.snapshot.store['shape:material'].props.textureUrl = url(first, other); },
      (_body: any, state: any) => { state.assets.splice(0, 1); },
      (_body: any, state: any) => { state.assets[0].storage_path = `${other}/${first}`; }
    ]) {
      const { locals, state } = fixture(); const body = input(); change(body, state);
      await expect(recoverToolkitCanvas(locals, source, body)).rejects.toThrow();
      expect(state.copies).toEqual([]); expect(state.boards).toHaveLength(1);
    }
  });

  it('waits for every in-flight copy before cleaning a partially failed batch', async () => {
    const { locals, state } = fixture(); let finishCopy!: () => void;
    state.copyOverride = (from: string, to: string) => from.endsWith(first)
      ? Promise.resolve({ data: null, error: { message: 'Copy failed' } })
      : new Promise(resolve => { finishCopy = () => {
          state.objects.set(to, state.objects.get(from).slice());
          resolve({ data: { path: to }, error: null });
        }; });
    const pending = recoverToolkitCanvas(locals, source, input());
    for (let index = 0; index < 10 && !finishCopy; index++) await Promise.resolve();
    expect(state.removals).toEqual([]); finishCopy();
    await expect(pending).rejects.toMatchObject({ status: 503 });
    expect(state.removals[0]).toHaveLength(2);
    expect([...state.objects.keys()].every(path => path.startsWith(`${source}/`))).toBe(true);
    expect(state.boards).toHaveLength(1); expect(state.assets).toHaveLength(3);
  });

  it('compensates a lost board or asset-write acknowledgement without touching the original', async () => {
    for (const failure of ['failBoard', 'failMetadata']) {
      const { locals, state } = fixture(); state[failure] = true;
      await expect(recoverToolkitCanvas(locals, source, input())).rejects.toMatchObject({ status: 503 });
      expect(state.boards).toEqual([{ id: source, title: 'Source', revision: 8, payload: { original: true }, shared: true }]);
      expect(state.assets).toHaveLength(3); expect(state.objects.size).toBe(3);
      expect(state.removals[0]).toHaveLength(2);
    }
  });

  it('recovers a drawing-only snapshot without asset writes and preserves the supplied drawing', async () => {
    const { locals, state } = fixture();
    const body = { title: 'Drawing', payload: { version: 1, snapshot: { shapes: [{ type: 'draw', props: { segments: [] } }] } } };
    const result = await recoverToolkitCanvas(locals, source, body);
    expect(result.copiedAssets).toBe(0); expect(state.copies).toEqual([]);
    expect(state.boards[1].payload).toEqual(body.payload);
    expect(state.assets).toHaveLength(3);
  });

  it('bounds copy counts and rejects private conversation content in shared snapshots', async () => {
    const { locals, state } = fixture();
    const urls = Array.from({ length: 101 }, (_, index) => url(`${String(index).padStart(8, '0')}-77f6-435b-8b89-3e4dabd137c7`));
    await expect(recoverToolkitCanvas(locals, source, { title: 'Many', payload: { urls } })).rejects.toMatchObject({ status: 413 });
    await expect(recoverToolkitCanvas(locals, source, { title: 'Private', payload: { messages: ['secret'] } })).rejects.toMatchObject({ status: 400 });
    expect(state.copies).toEqual([]);
  });
});
