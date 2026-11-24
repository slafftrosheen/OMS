import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const actor = '11111111-1111-4111-8111-111111111111';
const colleague = '22222222-2222-4222-8222-222222222222';
const order = '33333333-3333-4333-8333-333333333333';
const otherOrder = '44444444-4444-4444-8444-444444444444';
const file = '55555555-5555-8555-8555-555555555555';
const retry = '66666666-6666-8666-8666-666666666666';
const digest = 'a'.repeat(64);
const migration = new URL('../../supabase/migrations/20261123000001_canvas_export_retries.sql', import.meta.url);

test('generated exports return the original attachment and commit the file and link together under caller permissions', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE authenticated;
      CREATE ROLE anon;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      CREATE TABLE profiles (id uuid PRIMARY KEY, role text, is_active boolean);
      CREATE TABLE draft_orders (id uuid PRIMARY KEY, status text, created_by uuid REFERENCES profiles);
      CREATE TABLE files (id uuid PRIMARY KEY, filename text, original_name text, filepath text, mimetype text, size bigint, uploaded_by uuid, metadata jsonb);
      CREATE TABLE order_files (draft_order_id uuid REFERENCES draft_orders, file_id uuid REFERENCES files, file_type text, display_name text, PRIMARY KEY(draft_order_id, file_id));
      INSERT INTO profiles VALUES ('${actor}', 'Manager', TRUE), ('${colleague}', 'Manager', TRUE);
      INSERT INTO draft_orders VALUES ('${order}', 'DRAFT', '${actor}'), ('${otherOrder}', 'DRAFT', '${actor}');
      ALTER TABLE files ENABLE ROW LEVEL SECURITY;
      ALTER TABLE order_files ENABLE ROW LEVEL SECURITY;
      CREATE POLICY owner_files ON files TO authenticated USING (uploaded_by = auth.uid()) WITH CHECK (uploaded_by = auth.uid());
      CREATE POLICY permitted_order ON order_files TO authenticated USING (draft_order_id = '${order}') WITH CHECK (draft_order_id = '${order}');
      GRANT USAGE ON SCHEMA auth TO authenticated;
      GRANT SELECT ON profiles, draft_orders TO authenticated;
      GRANT SELECT, INSERT ON files, order_files TO authenticated;
    `);
    await db.exec(await readFile(migration, 'utf8'));
    await db.exec(`SET ROLE authenticated; SET request.jwt.claim.sub = '${actor}';`);
    const path = (attempt, orderId = order) => `orders/${orderId}/${actor}/${attempt}-panel.eps`;
    const register = async ({ orderId = order, fileId = file, storageKey = path(file), fingerprint = digest,
      pocket = 'laser', mime = 'application/postscript' } = {}) => (await db.query(
      'SELECT public.register_canvas_export($1,$2,$3,$4,$5,$6,$7,$8,$9) AS file',
      [orderId, fileId, pocket, 'panel.eps', 'panel.eps', storageKey, 2048, mime, fingerprint]
    )).rows[0].file;
    const saved = await register();
    assert.equal(saved.id, file);
    assert.equal(saved.filepath, path(file));
    assert.equal(saved.file_type, 'laser');
    assert.equal(saved.mimetype, 'application/postscript');
    assert.deepEqual(await register({ storageKey: path(retry) }), saved);
    await assert.rejects(register({ storageKey: path(retry), fingerprint: 'b'.repeat(64) }), { code: '23505' });
    await assert.rejects(register({ pocket: 'cnc' }), { code: '23505' });
    await assert.rejects(register({ mime: 'text/html' }), { code: '22023' });
    await assert.rejects(register({ storageKey: `${path(retry)}//other.eps` }), { code: '22023' });
    await assert.rejects(register({ orderId: otherOrder, fileId: retry, storageKey: path(retry, otherOrder) }), { code: '42501' });
    assert.deepEqual((await db.query('SELECT id FROM files')).rows, [{ id: file }]);
    assert.deepEqual((await db.query('SELECT file_id FROM order_files')).rows, [{ file_id: file }]);

    await db.exec(`SET request.jwt.claim.sub = '${colleague}';`);
    await assert.rejects(register({ storageKey: path(retry).replace(actor, colleague) }), { code: '42501' });
    await db.exec(`RESET ROLE; UPDATE draft_orders SET status='CONFIRMED' WHERE id='${order}';`);
    await db.exec(`SET ROLE authenticated; SET request.jwt.claim.sub = '${actor}';`);
    await assert.rejects(register(), { code: '42501' });
    await db.exec('RESET ROLE; SET ROLE anon;');
    await assert.rejects(register(), { code: '42501' });
  } finally { await db.close(); }
});
