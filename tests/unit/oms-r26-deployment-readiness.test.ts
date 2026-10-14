import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const read=(path:string)=>readFileSync(path,'utf8');
describe('OMS-R26 deployment readiness and read-only smoke',()=>{
 it('guards production board pagination and stage identity',()=>{
   const code=read('src/routes/api/production/board/+server.ts');
   expect(code).toContain("{count:'exact'}");
   expect(code).toContain('orderTotal!==count');
   expect(code).toContain('seenOrders.has(row.id)');
   expect(code).toContain('seenStages.has(key)');
   expect(code).toContain('.range(0,STAGE_ID_CHUNK*14)');
 });
 it('guards production performance pages against silent shifts',()=>{
   const code=read('src/routes/api/production/performance/+server.ts');
   expect(code).toContain("activeTotal!==count");
   expect(code).toContain("completedTotal!==count");
   expect(code).toContain("orders.has(order.id)");
   expect(code).toContain("completed.has(key)");
   expect(code).toContain('completed.size!==completedTotal');
 });
 it('provides a non-mutating SQL prerequisite check',()=>{
   const sql=read('scripts/ops/oms-r26-production-preflight.sql');
   expect(sql).toContain('BEGIN TRANSACTION READ ONLY');
   expect(sql).toContain("to_regclass(item)");
   expect(sql).toContain("to_regprocedure(item)");
   expect(sql).toContain("has_table_privilege('authenticated'");
   expect(sql).toContain("has_function_privilege('anon'");
   expect(sql).toContain('ROLLBACK;');
   expect(sql).not.toContain('CREATE TABLE');
   expect(sql).not.toContain('GRANT EXECUTE ON');
 });
 it('never echoes a credential-bearing postgres URL',()=>{
   const script=read('scripts/supabase-migrate.sh');
   expect(script).not.toContain('source="$DATABASE_URL"');
   expect(script).not.toContain('($DATABASE_URL)...');
   expect(script).toContain('production_preflight()');
   expect(script).toContain('preflight) production_preflight');
   const pkg=JSON.parse(read('package.json'));
   expect(pkg.scripts['supabase:preflight']).toContain('supabase-migrate.sh preflight');
 });
 it('uses only GET and requires a staging session for HTTP probes',()=>{
   const script=read('scripts/ops/oms-r26-staging-smoke.mjs');
   expect(script).toContain('OMS_STAGING_COOKIE');
   expect(script).toContain("method:'GET'");
   expect(script).toContain("if(r.status!==401)");
   expect(script).toContain('AbortSignal.timeout(20000)');
   expect(script).not.toContain("method:'POST'");
   expect(script).not.toContain('console.log(cookie)');
 });
});
