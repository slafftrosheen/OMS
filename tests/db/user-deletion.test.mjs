import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migration = new URL('../../supabase/migrations/20261125000001_permanent_user_deletion.sql', import.meta.url);
const admin = '11111111-1111-4111-8111-111111111111';
const worker = '22222222-2222-4222-8222-222222222222';

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE SCHEMA storage;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text UNIQUE);
    CREATE TABLE auth.identities(user_id uuid REFERENCES auth.users ON DELETE CASCADE);
    CREATE TABLE auth.sessions(user_id uuid REFERENCES auth.users ON DELETE CASCADE);
    CREATE TABLE auth.refresh_tokens(user_id varchar(255));
    CREATE TABLE auth.flow_state(user_id uuid, linking_target_id uuid);
    CREATE TABLE profiles(id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
      username text UNIQUE, role text, is_active boolean);
    CREATE TABLE user_preferences(user_id uuid REFERENCES profiles ON DELETE CASCADE);
    CREATE TABLE user_stations(user_id uuid REFERENCES profiles ON DELETE CASCADE);
    CREATE TABLE draft_orders(id int PRIMARY KEY, created_by uuid REFERENCES profiles, title text);
    CREATE TABLE change_requests(id int PRIMARY KEY, requested_by uuid NOT NULL REFERENCES profiles);
    CREATE TABLE production_reservations(id int PRIMARY KEY, created_by uuid NOT NULL REFERENCES auth.users);
    CREATE TABLE toolkit_assets(id int PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users);
    CREATE TABLE workforce_work_entries(id int PRIMARY KEY, user_id uuid NOT NULL REFERENCES profiles ON DELETE RESTRICT);
    CREATE TABLE workforce_absences(id int PRIMARY KEY, user_id uuid NOT NULL REFERENCES profiles ON DELETE RESTRICT);
    CREATE TABLE workforce_audit_log(subject_user_id uuid REFERENCES profiles ON DELETE SET NULL, action text);
    CREATE FUNCTION record_workforce_deletion() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      INSERT INTO workforce_audit_log VALUES(OLD.user_id, 'DELETE'); RETURN OLD; END $$;
    CREATE TRIGGER workforce_audit AFTER DELETE ON workforce_work_entries FOR EACH ROW EXECUTE FUNCTION record_workforce_deletion();
    CREATE TABLE storage.objects(id int PRIMARY KEY, owner uuid, owner_id text, name text);
    CREATE TABLE storage.buckets(id text PRIMARY KEY, owner uuid, owner_id text);
    CREATE TABLE unrelated(id int PRIMARY KEY, order_id int REFERENCES draft_orders);
    INSERT INTO auth.users VALUES ('${admin}','admin@example.test'),('${worker}','worker@example.test');
    INSERT INTO profiles VALUES ('${admin}','admin','RD',true),('${worker}','worker','Operator',false);
    INSERT INTO auth.identities VALUES ('${worker}'); INSERT INTO auth.sessions VALUES ('${worker}');
    INSERT INTO auth.refresh_tokens VALUES ('${worker}');
    INSERT INTO auth.flow_state VALUES ('${worker}',NULL),(NULL,'${worker}');
    INSERT INTO user_preferences VALUES ('${worker}'); INSERT INTO user_stations VALUES ('${worker}');
    INSERT INTO draft_orders VALUES (1,'${worker}','Keep this order');
    INSERT INTO change_requests VALUES (1,'${worker}');
    INSERT INTO production_reservations VALUES (1,'${worker}'); INSERT INTO toolkit_assets VALUES (1,'${worker}');
    INSERT INTO workforce_work_entries VALUES (1,'${worker}'); INSERT INTO workforce_absences VALUES (1,'${worker}');
    INSERT INTO storage.objects VALUES (1,'${worker}','${worker}','keep-shared-file.pdf');
    INSERT INTO storage.buckets VALUES ('shared','${worker}','${worker}');
    INSERT INTO unrelated VALUES(1,1);
    SET request.jwt.claim.role='service_role';
  `);
  // Missing migration represents the original schema for the initial red run.
  const sql = await readFile(migration, 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error; });
  await db.exec(sql);
  return { db, sql };
}

test('permanent deletion frees email and username, removes sessions and personal rows, and retains shared history', async () => {
  const { db, sql } = await fixture();
  try {
    await db.query('SELECT oms_delete_user($1,$2)', [worker, admin]);
    for (const table of ['auth.users','profiles','auth.identities','auth.sessions','auth.refresh_tokens','auth.flow_state','user_preferences','user_stations','workforce_work_entries','workforce_absences']) {
      const column = ['auth.users','profiles'].includes(table) ? 'id' : 'user_id';
      assert.equal((await db.query(`SELECT * FROM ${table} WHERE ${column}=$1`, [worker])).rows.length, 0, table);
    }
    assert.equal((await db.query('SELECT * FROM auth.flow_state')).rows.length, 0);
    assert.deepEqual((await db.query('SELECT title,created_by FROM draft_orders')).rows, [{ title: 'Keep this order', created_by: null }]);
    for (const [table, column] of [['change_requests','requested_by'],['production_reservations','created_by'],['toolkit_assets','user_id'],['workforce_audit_log','subject_user_id']]) {
      assert.equal((await db.query(`SELECT ${column} FROM ${table}`)).rows[0][column], null, table);
    }
    assert.deepEqual((await db.query('SELECT name,owner,owner_id FROM storage.objects')).rows, [{ name:'keep-shared-file.pdf',owner:null,owner_id:null }]);
    assert.deepEqual((await db.query('SELECT owner,owner_id FROM storage.buckets')).rows, [{ owner:null,owner_id:null }]);
    await db.exec(`INSERT INTO auth.users VALUES ('${worker}','worker@example.test');
      INSERT INTO profiles VALUES ('${worker}','worker','Operator',true);`);
    await db.exec(sql); // Safe to apply again; unrelated FK stays restrictive.
    await assert.rejects(db.exec('DELETE FROM draft_orders WHERE id=1'), /foreign key/);
  } finally { await db.close(); }
});

test('deletion checks the active admin, rejects self-deletion, and denies direct browser RPC access', async () => {
  const { db } = await fixture();
  try {
    await assert.rejects(db.query('SELECT oms_delete_user($1,$2)', [admin, admin]), /own account/i);
    await assert.rejects(db.query('SELECT oms_delete_user($1,$2)', [admin, worker]), /admin/i);
    await db.exec(`UPDATE profiles SET is_active=false WHERE id='${admin}';`);
    await assert.rejects(db.query('SELECT oms_delete_user($1,$2)', [worker, admin]), /admin/i);
    await db.exec('SET ROLE authenticated');
    await assert.rejects(db.query('SELECT oms_delete_user($1,$2)', [worker, admin]), /permission denied/);
    await db.exec('RESET ROLE; SET ROLE anon');
    await assert.rejects(db.query('SELECT oms_delete_user($1,$2)', [worker, admin]), /permission denied/);
    await db.exec('RESET ROLE');
    assert.equal((await db.query('SELECT count(*) AS total FROM auth.users')).rows[0].total, 2);
  } finally { await db.close(); }
});

test('a database deletion failure rolls back personal cleanup and storage ownership together', async () => {
  const { db } = await fixture();
  try {
    await db.exec(`CREATE TABLE deletion_blocker(user_id uuid REFERENCES auth.users);
      INSERT INTO deletion_blocker VALUES('${worker}');`);
    await assert.rejects(db.query('SELECT oms_delete_user($1,$2)', [worker, admin]), /foreign key/);
    assert.equal((await db.query('SELECT count(*) AS total FROM workforce_work_entries')).rows[0].total, 1);
    assert.equal((await db.query('SELECT count(*) AS total FROM auth.sessions')).rows[0].total, 1);
    assert.equal((await db.query('SELECT count(*) AS total FROM workforce_audit_log')).rows[0].total, 0);
    assert.equal((await db.query('SELECT owner_id FROM storage.objects')).rows[0].owner_id, worker);
    assert.equal((await db.query('SELECT created_by FROM draft_orders')).rows[0].created_by, worker);
  } finally { await db.close(); }
});

test('Boss and Head of Production can delete accounts and a missing account returns false', async () => {
  const { db } = await fixture();
  try {
    for (const role of ['Boss', 'HeadOfProduction']) {
      await db.query('UPDATE profiles SET role=$1 WHERE id=$2', [role, admin]);
      assert.equal((await db.query('SELECT oms_delete_user($1,$2) AS deleted', [worker, admin])).rows[0].deleted, true);
      assert.equal((await db.query('SELECT oms_delete_user($1,$2) AS deleted', [worker, admin])).rows[0].deleted, false);
      await db.exec(`INSERT INTO auth.users VALUES ('${worker}','worker@example.test');
        INSERT INTO profiles VALUES ('${worker}','worker','Operator',true);`);
    }
  } finally { await db.close(); }
});
