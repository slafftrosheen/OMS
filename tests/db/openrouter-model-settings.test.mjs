import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('model migration preserves sharing policy and keeps model changes restricted to the server role',async()=>{
  const db=new PGlite();
  try{
    await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE TABLE profiles(id uuid PRIMARY KEY);');
    await db.exec(await readFile(new URL('../../supabase/migrations/20261102000001_openrouter_global_policy.sql',import.meta.url),'utf8'));
    await db.exec('UPDATE openrouter_system_policy SET enabled=true;');
    await db.exec(await readFile(new URL('../../supabase/migrations/20261109000001_openrouter_model_settings.sql',import.meta.url),'utf8'));
    assert.deepEqual((await db.query('SELECT enabled,text_model,vision_model FROM openrouter_system_policy')).rows,[{enabled:true,text_model:null,vision_model:null}]);
    await db.exec('SET ROLE authenticated;');
    await assert.rejects(db.query('SELECT vision_model FROM openrouter_system_policy'),/permission denied/);
    await assert.rejects(db.query("UPDATE openrouter_system_policy SET vision_model='intruder/model'"),/permission denied/);
    await db.exec('RESET ROLE; SET ROLE service_role;');
    // The production Supabase service role has BYPASSRLS; preserve that fixture contract.
    await db.exec('RESET ROLE; ALTER ROLE service_role BYPASSRLS; SET ROLE service_role;');
    await db.exec("UPDATE openrouter_system_policy SET text_model='router/text',vision_model='vision/compatible:free';");
    assert.equal((await db.query('SELECT vision_model FROM openrouter_system_policy')).rows[0].vision_model,'vision/compatible:free');
    await assert.rejects(db.query("UPDATE openrouter_system_policy SET vision_model='https://untrusted.test/model'"),/check constraint/);
    await db.exec('RESET ROLE;');
    assert.equal((await db.query('SELECT enabled FROM openrouter_system_policy')).rows[0].enabled,true);
  }finally{await db.close();}
});
