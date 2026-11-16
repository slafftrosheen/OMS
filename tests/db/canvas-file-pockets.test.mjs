import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

const migration=new URL('../../supabase/migrations/20261116000001_canvas_file_pockets.sql',import.meta.url);
const user='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';
const order='33333333-3333-4333-8333-333333333333';
const fileA='44444444-4444-4444-8444-444444444444';
const fileB='55555555-5555-4555-8555-555555555555';
const revision='2026-11-16T10:00:00Z';
const nextRevision='2026-11-16T10:00:01Z';
function snapshot(pocket='cnc',secondPocket,recorded='cnc'){
 const store={
  'shape:cnc':{id:'shape:cnc',type:'frame',props:{name:'CNC Routing'}},
  'shape:bender':{id:'shape:bender',type:'frame',meta:{omsFilePocket:'bender'}},
  'shape:laser':{id:'shape:laser',type:'frame',meta:{omsFilePocket:'laser'}},
  'shape:a':{id:'shape:a',type:'document',parentId:'shape:'+pocket,
   meta:{omsFilePocket:recorded},props:{fileId:fileA}}
 };
 if(secondPocket)store['shape:b']={id:'shape:b',type:'document',parentId:'shape:'+secondPocket,
  meta:{omsFilePocket:'cnc'},props:{fileId:fileB}};
 return {document:{store}};
}
async function fixture(){
 const db=new PGlite();
 await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE TABLE profiles(id uuid PRIMARY KEY,role text,is_active boolean);
 INSERT INTO profiles VALUES ('${user}','Operator',true),('${other}','Operator',true);
 CREATE TYPE order_status AS ENUM ('DRAFT','PENDING_REVIEW','CONFIRMED');
 CREATE TABLE draft_orders(id uuid PRIMARY KEY,status order_status,created_by uuid,updated_at timestamptz,canvas_state jsonb);
 CREATE TABLE order_files(draft_order_id uuid,file_id uuid,file_type text,PRIMARY KEY(draft_order_id,file_id));
 INSERT INTO draft_orders VALUES ('${order}','DRAFT','${user}','${revision}',NULL);
 INSERT INTO order_files VALUES ('${order}','${fileA}','cnc'),('${order}','${fileB}','cnc');
 GRANT USAGE ON SCHEMA auth TO authenticated;
 GRANT SELECT ON profiles,order_files,draft_orders TO authenticated;
 GRANT UPDATE ON draft_orders TO authenticated;`);
 await db.exec(await readFile(migration,'utf8'));
 await db.exec(`SET ROLE authenticated; SET request.jwt.claim.sub='${user}';`);
 return db;
}
const save=(db,value,expected=revision,next=nextRevision)=>db.query(
 'UPDATE draft_orders SET canvas_state=$1,updated_at=$2 WHERE id=$3 AND updated_at=$4 RETURNING id',
 [JSON.stringify(value),next,order,expected]);
const state=async db=>(await db.query('SELECT canvas_state,updated_at::text FROM draft_orders')).rows[0];
const categories=async db=>(await db.query('SELECT file_id,file_type FROM order_files ORDER BY file_id')).rows;

test('initial seed preserves categories; first-save and subsequent moves synchronize atomically',async()=>{
 const db=await fixture();
 try{
  await save(db,snapshot());
  assert.equal((await categories(db))[0].file_type,'cnc');
  assert.equal((await save(db,snapshot('bender'),nextRevision,'2026-11-16T10:00:02Z')).rows.length,1);
  assert.equal((await categories(db))[0].file_type,'bender');
  assert.equal((await state(db)).canvas_state.document.store['shape:a'].parentId,'shape:bender');
  assert.equal((await save(db,snapshot('laser'),nextRevision)).rows.length,0);
  assert.equal((await categories(db))[0].file_type,'bender');
  await db.exec('RESET ROLE;');
  await db.query('UPDATE draft_orders SET canvas_state=NULL,updated_at=$1',[revision]);
  await db.query("UPDATE order_files SET file_type='cnc'");
  await db.exec('SET ROLE authenticated;');
  await save(db,snapshot('bender'));
  assert.equal((await categories(db))[0].file_type,'bender');
 }finally{await db.close();}
});

test('a seed or unrelated geometry save cannot overwrite an independently changed file category',async()=>{
 const db=await fixture();
 try{
  await db.exec("RESET ROLE; UPDATE order_files SET file_type='laser'; SET ROLE authenticated;");
  await save(db,snapshot());
  assert.equal((await categories(db))[0].file_type,'laser');
  const initial=await state(db);
  const moving=snapshot('bender');
  await assert.rejects(save(db,moving,nextRevision),/category changed/);
  assert.deepEqual(await state(db),initial);
  assert.equal((await categories(db))[0].file_type,'laser');
 }finally{await db.close();}
});

test('conflicting duplicate cards and missing file links roll back all category and canvas changes',async()=>{
 const db=await fixture();
 try{
  await save(db,snapshot('cnc','cnc'));
  const before=await state(db);
  const duplicate=snapshot('bender','cnc');
  duplicate.document.store['shape:copy']={...duplicate.document.store['shape:a'],
   id:'shape:copy',parentId:'shape:laser'};
  await assert.rejects(save(db,duplicate,nextRevision),/different production pockets/);
  assert.deepEqual(await state(db),before);
  assert.equal((await categories(db))[0].file_type,'cnc');
  await db.exec(`RESET ROLE; DELETE FROM order_files WHERE file_id='${fileB}'; SET ROLE authenticated;`);
  await assert.rejects(save(db,snapshot('bender','bender'),nextRevision),/attachment changed/);
  assert.equal((await categories(db))[0].file_type,'cnc');
  assert.deepEqual(await state(db),before);
 }finally{await db.close();}
});

test('snapshot replacement and ambiguous historical duplicates do not silently reclassify files',async()=>{
 const db=await fixture();
 try{
  await save(db,snapshot());
  const replacement=snapshot('bender');
  replacement.document.store['shape:replacement']={...replacement.document.store['shape:a'],id:'shape:replacement'};
  delete replacement.document.store['shape:a'];
  await save(db,replacement,nextRevision,'2026-11-16T10:00:02Z');
  assert.equal((await categories(db))[0].file_type,'cnc');

  const historical=snapshot();
  historical.document.store['shape:copy']={...historical.document.store['shape:a'],id:'shape:copy',parentId:'shape:bender'};
  await db.exec('RESET ROLE; ALTER TABLE draft_orders DISABLE TRIGGER sync_canvas_file_pockets;');
  await db.query('UPDATE draft_orders SET canvas_state=$1,updated_at=$2',[JSON.stringify(historical),revision]);
  await db.exec('ALTER TABLE draft_orders ENABLE TRIGGER sync_canvas_file_pockets; SET ROLE authenticated;');
  await save(db,snapshot('bender'));
  assert.equal((await categories(db))[0].file_type,'cnc');
 }finally{await db.close();}
});

test('a newly attached card can move before its first save on an existing canvas',async()=>{
 const db=await fixture();
 try{
  await save(db,snapshot());
  await save(db,snapshot('cnc','bender'),nextRevision,'2026-11-16T10:00:02Z');
  const files=await categories(db);
  assert.equal(files[0].file_type,'cnc');
  assert.equal(files[1].file_type,'bender');
 }finally{await db.close();}
});

test('nested groups and legacy frame names resolve; matching duplicate cards and explicit rollback are safe',async()=>{
 const db=await fixture();
 try{
  const original=snapshot();
  original.document.store['shape:copy']={...original.document.store['shape:a'],id:'shape:copy'};
  await save(db,original);
  const moved=snapshot('bender');
  // Copied cards can retain different historical metadata while sharing
  // the same unambiguous current destination.
  moved.document.store['shape:copy']={...moved.document.store['shape:a'],
   id:'shape:copy',meta:{omsFilePocket:'bender'}};
  moved.document.store['shape:group']={id:'shape:group',type:'group',parentId:'shape:bender'};
  moved.document.store['shape:a'].parentId='shape:group';
  await db.exec('BEGIN;');
  await save(db,moved,nextRevision,'2026-11-16T10:00:02Z');
  assert.equal((await categories(db))[0].file_type,'bender');
  await db.exec('ROLLBACK;');
  assert.equal((await categories(db))[0].file_type,'cnc');
  assert.deepEqual((await state(db)).canvas_state,original);
 }finally{await db.close();}
});

test('file rerouting requires an active authorized editor and draft lifecycle',async()=>{
 const db=await fixture();
 try{
  await save(db,snapshot());
  await db.exec(`SET request.jwt.claim.sub='${other}';`);
  await assert.rejects(save(db,snapshot('bender'),nextRevision),/authorized draft editors/);
  await db.exec(`RESET ROLE; UPDATE profiles SET role='HeadOfProduction' WHERE id='${other}'; SET ROLE authenticated;`);
  await save(db,snapshot('bender'),nextRevision,'2026-11-16T10:00:02Z');
  await db.exec(`RESET ROLE; UPDATE draft_orders SET status='CONFIRMED'; SET ROLE authenticated;`);
  await assert.rejects(save(db,snapshot('laser'),'2026-11-16T10:00:02Z'),/authorized draft editors/);
  await db.exec(`RESET ROLE; UPDATE draft_orders SET status=NULL; SET ROLE authenticated;`);
  await assert.rejects(save(db,snapshot('laser'),'2026-11-16T10:00:02Z'),/authorized draft editors/);
  await db.exec(`RESET ROLE; UPDATE draft_orders SET status='DRAFT'; UPDATE profiles SET is_active=false WHERE id='${other}'; SET ROLE authenticated;`);
  await assert.rejects(save(db,snapshot('laser'),'2026-11-16T10:00:02Z'),/authorized draft editors/);
  assert.equal((await categories(db))[0].file_type,'bender');
 }finally{await db.close();}
});
