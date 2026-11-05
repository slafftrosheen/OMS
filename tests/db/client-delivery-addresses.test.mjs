import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const migration=new URL('../../supabase/migrations/20261105000003_client_delivery_addresses.sql',import.meta.url);
const user='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';
const order='33333333-3333-4333-8333-333333333333';
async function fixture(){
 const db=new PGlite();
 await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon;
 CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE TABLE profiles(id uuid PRIMARY KEY,role text,is_active boolean);
 INSERT INTO profiles VALUES ('${user}','Operator',true),('${other}','Operator',true);
 CREATE TABLE draft_orders(id uuid PRIMARY KEY,client text,delivery_address text,delivery_contact text,
 delivery_phone text,metadata jsonb DEFAULT '{}',created_by uuid,updated_by uuid,
 created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
 ALTER TABLE draft_orders ENABLE ROW LEVEL SECURITY;
 CREATE POLICY own_order ON draft_orders FOR SELECT TO authenticated USING(created_by=auth.uid());
 GRANT USAGE ON SCHEMA auth TO authenticated; GRANT SELECT ON profiles,draft_orders TO authenticated;
 INSERT INTO draft_orders(id,client,delivery_address,delivery_contact,created_by)
 VALUES ('${order}','Example BV','Teststraat 2, 1234 AB Teststad','Original contact','${user}');`);
 await db.exec(await readFile(migration,'utf8'));
 return db;
}
test('saved addresses deduplicate per client and retain raw contact history atomically',async()=>{
 const db=await fixture();
 try{
  assert.equal((await db.query('SELECT * FROM client_delivery_addresses')).rows.length,1);
  await db.exec(`UPDATE draft_orders SET client=' EXAMPLE   BV ',delivery_address=E'teststraat 2\n1234 AB Teststad',
    delivery_contact='New contact',updated_at=now()+interval '1 second' WHERE id='${order}';`);
  assert.equal((await db.query('SELECT * FROM client_delivery_addresses')).rows.length,1);
  const history=(await db.query('SELECT raw_address,contact FROM client_delivery_address_history ORDER BY used_at')).rows;
  assert.deepEqual(history.map(r=>r.contact),['Original contact','New contact']);
  assert.equal(history[1].raw_address,'teststraat 2\n1234 AB Teststad');
  await db.exec(`SET ROLE authenticated; SET request.jwt.claim.sub='${user}';`);
  const saved=(await db.query("SELECT * FROM oms_client_delivery_addresses('Example BV')")).rows;
  assert.equal(saved.length,1);
  assert.equal(saved[0].contact,'New contact');
  await db.exec('RESET ROLE;');
  await db.exec(`UPDATE draft_orders SET updated_at=now()+interval '2 seconds' WHERE id='${order}';`);
  assert.equal((await db.query('SELECT * FROM client_delivery_address_history')).rows.length,2);
  await db.exec(`BEGIN; UPDATE draft_orders SET delivery_address='Otherstraat 3',updated_at=now()+interval '3 seconds' WHERE id='${order}'; ROLLBACK;`);
  assert.equal((await db.query('SELECT * FROM client_delivery_addresses')).rows.length,1);
  await db.exec(`UPDATE draft_orders SET delivery_address='Teststraat 2A, 1234 AB Teststad',updated_at=now()+interval '4 seconds' WHERE id='${order}';`);
  assert.equal((await db.query('SELECT * FROM client_delivery_addresses')).rows.length,2);
  await db.exec(await readFile(migration,'utf8'));
  assert.equal((await db.query('SELECT * FROM client_delivery_address_history')).rows.length,3);
  await db.exec(`INSERT INTO draft_orders(id,client,delivery_address,created_by) VALUES
   ('44444444-4444-4444-8444-444444444444','Different client','Teststraat 2, 1234 AB Teststad','${user}');`);
  assert.equal((await db.query('SELECT * FROM client_delivery_addresses')).rows.length,3);
 }finally{await db.close();}
});
test('RLS hides addresses from other users and inactive accounts; history is read-only',async()=>{
 const db=await fixture();
 try{
  await db.exec(`SET ROLE authenticated; SET request.jwt.claim.sub='${other}';`);
  assert.equal((await db.query('SELECT * FROM client_delivery_addresses')).rows.length,0);
  assert.equal((await db.query('SELECT * FROM client_delivery_address_history')).rows.length,0);
  assert.equal((await db.query("SELECT * FROM oms_client_delivery_addresses('Example BV')")).rows.length,0);
  await db.exec(`SET request.jwt.claim.sub='${user}';`);
  assert.equal((await db.query('SELECT * FROM client_delivery_addresses')).rows.length,1);
  await assert.rejects(db.query('DELETE FROM client_delivery_address_history'),/permission denied/);
  await assert.rejects(db.query("SELECT oms_record_client_delivery_address(draft_orders, null, now()) FROM draft_orders"),/permission denied/);
  await db.exec(`RESET ROLE; UPDATE profiles SET is_active=false WHERE id='${user}'; SET ROLE authenticated;`);
  assert.equal((await db.query('SELECT * FROM client_delivery_addresses')).rows.length,0);
  await db.exec('RESET ROLE; SET ROLE anon;');
  await assert.rejects(db.query('SELECT * FROM client_delivery_addresses'),/permission denied/);
 }finally{await db.close();}
});
