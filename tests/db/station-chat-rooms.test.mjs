import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';

test('all workstation rooms can receive a handoff before first use, including after reapplying the migration', async () => {
  const db = new PGlite();
  const migration = name => readFile(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8');
  try {
    await db.exec(`
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid';
      CREATE TABLE draft_orders(id uuid PRIMARY KEY);
      CREATE TABLE profiles(id uuid PRIMARY KEY);
      CREATE TABLE chat_messages(id uuid PRIMARY KEY, created_at timestamptz);
    `);
    await db.exec(await migration('20260501000001_chat_rooms.sql'));
    await db.exec("INSERT INTO chat_rooms(id,name,kind,station) VALUES ('station-qc','Existing QC room','station','QC')");
    const seed = await migration('20261126000001_station_chat_rooms.sql');
    await db.exec(seed);
    await db.exec(seed);
    const {rows} = await db.query("SELECT id, name FROM chat_rooms WHERE id LIKE 'station-%'");
    assert.equal(rows.length,14);
    assert.equal(rows.find(row=>row.id==='station-qc').name,'Existing QC room');
    for (const room of ['station-film_coating','station-logistics']) {
      await db.query('INSERT INTO chat_messages(id,room_id) VALUES (gen_random_uuid(),$1)',[room]);
    }
  } finally { await db.close(); }
});
