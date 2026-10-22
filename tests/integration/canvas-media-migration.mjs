/** Execute the exact media migration against isolated PostgreSQL/WASM.
 * OMS_PGLITE_MODULE points at a developer-installed @electric-sql/pglite module.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.OMS_PGLITE_MODULE;
if (!modulePath) throw new Error('Set OMS_PGLITE_MODULE to an installed @electric-sql/pglite entry point');
const { PGlite } = await import(pathToFileURL(modulePath).href);
const db = new PGlite();
let checks = 0;
try {
  await db.exec(`CREATE SCHEMA storage;
    CREATE TABLE storage.buckets(id text PRIMARY KEY, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    INSERT INTO storage.buckets VALUES('toolkit-assets',false,26214400,ARRAY['image/png','application/pdf']);
    CREATE TABLE public.toolkit_assets(id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      mime_type text NOT NULL CHECK(mime_type IN ('image/png','image/jpeg','image/webp','image/gif','application/pdf')),
      bytes bigint NOT NULL CHECK(bytes > 0 AND bytes <= 26214400));
    INSERT INTO public.toolkit_assets(mime_type,bytes) VALUES('image/png',100);`);
  const sql = await readFile(new URL('../../supabase/migrations/20261022000004_canvas_media.sql', import.meta.url),'utf8');
  await db.exec(sql); await db.exec(sql);
  for (const mime of ['video/mp4','video/webm','audio/mpeg','audio/wav','audio/ogg','audio/mp4']) {
    await db.query('INSERT INTO public.toolkit_assets(mime_type,bytes) VALUES($1,128)',[mime]); checks++;
  }
  for (const mime of ['text/html','image/svg+xml','application/javascript']) {
    await assert.rejects(() => db.query('INSERT INTO public.toolkit_assets(mime_type,bytes) VALUES($1,128)',[mime])); checks++;
  }
  await assert.rejects(() => db.query("INSERT INTO public.toolkit_assets(mime_type,bytes) VALUES('video/mp4',26214401)")); checks++;
  const bucket = (await db.query("SELECT * FROM storage.buckets WHERE id='toolkit-assets'")).rows[0];
  assert.equal(bucket.public,false); checks++;
  assert.equal(Number(bucket.file_size_limit),26214400); checks++;
  assert.ok(bucket.allowed_mime_types.includes('video/mp4') && bucket.allowed_mime_types.includes('audio/ogg')); checks++;
  assert.equal(Number((await db.query('SELECT count(*) AS total FROM public.toolkit_assets')).rows[0].total),7); checks++;
  console.log(`Canvas media migration: ${checks} PostgreSQL checks passed (including repeat application).`);
} finally { await db.close(); }
