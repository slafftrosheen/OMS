import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const user = '11111111-1111-4111-8111-111111111111';
const order = '22222222-2222-4222-8222-222222222222';
const otherOrder = '33333333-3333-4333-8333-333333333333';
const file = '44444444-4444-8444-8444-444444444444';
const second = '55555555-5555-8555-8555-555555555555';
const release = { reviewId: '66666666-6666-4666-8666-666666666666', revision: 'e'.repeat(64) };
const migration = new URL('../../supabase/migrations/20261122000003_canvas_dxf_releases.sql', import.meta.url);

test('DXF registration is replayable, honors caller policies and rolls back a denied attachment link', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE authenticated;
      CREATE ROLE anon;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      CREATE TABLE files (id uuid PRIMARY KEY, filename text, original_name text, filepath text, mimetype text, size bigint, uploaded_by uuid, metadata jsonb);
      CREATE TABLE order_files (draft_order_id uuid, file_id uuid REFERENCES files, file_type text, display_name text, PRIMARY KEY(draft_order_id, file_id));
      ALTER TABLE files ENABLE ROW LEVEL SECURITY;
      ALTER TABLE order_files ENABLE ROW LEVEL SECURITY;
      CREATE POLICY owner_files ON files TO authenticated USING (uploaded_by = auth.uid()) WITH CHECK (uploaded_by = auth.uid());
      CREATE POLICY permitted_order ON order_files TO authenticated USING (draft_order_id = '${order}') WITH CHECK (draft_order_id = '${order}');
      GRANT USAGE ON SCHEMA auth TO authenticated;
      GRANT SELECT, INSERT ON files, order_files TO authenticated;
    `);
    await db.exec(await readFile(migration, 'utf8'));
    await db.exec(`SET ROLE authenticated; SET request.jwt.claim.sub = '${user}';`);
    const key = (orderId, attempt) => `orders/${orderId}/${user}/${attempt}-panel.dxf`;
    const register = async (orderId, fileId, filepath, source = release) => (await db.query(
      'SELECT public.register_canvas_dxf_release($1,$2,$3,$4,$5,$6,$7,$8) AS file',
      [orderId, fileId, 'cnc', 'panel.dxf', 'panel.dxf', filepath, 1234, JSON.stringify(source)]
    )).rows[0].file;
    const saved = await register(order, file, key(order, file));
    const replay = await register(order, file, key(order, second));
    assert.equal(saved.id, file);
    assert.equal(saved.filepath, key(order, file));
    assert.equal(saved.file_type, 'cnc');
    assert.deepEqual(saved.metadata.canvas_dxf_release, release);
    assert.deepEqual(replay, saved);
    await assert.rejects(register(order, file, key(order, second), { ...release, revision: 'f'.repeat(64) }), { code: '23505' });
    await assert.rejects(register(otherOrder, second, key(otherOrder, second)), { code: '42501' });
    assert.deepEqual((await db.query('SELECT id FROM files')).rows, [{ id: file }]);
    assert.deepEqual((await db.query('SELECT file_id FROM order_files')).rows, [{ file_id: file }]);
    await db.exec('RESET ROLE; SET ROLE anon;');
    await assert.rejects(register(order, file, key(order, file)), { code: '42501' });
  } finally { await db.close(); }
});
