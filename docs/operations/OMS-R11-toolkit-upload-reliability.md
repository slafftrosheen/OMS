# OMS-R11 — Canvas upload readiness and verified file round-trip

This pass fixes source-level blockers and adds recovery tools. It does not
change the advertised 25 MiB upload limit or relax the private bucket policy.

## Verified repository defects corrected

1. **R06 SQL migration was syntactically invalid**: three PL/pgSQL functions
   used an isolated `AS $` and closing `$;` instead of PostgreSQL's
   `AS $$ ... $$;` dollar-quoted bodies. Corrected at
   `supabase/migrations/20261009000005_toolkit_shared_canvases_private_conversations.sql`.
   A database where R06 has not applied must run the *repaired* migration
   before uploading. If the live database previously applied a manually
   repaired variant, **do not blindly re-run its migration** or delete Storage
   buckets; inspect the migration history and existing data first.
2. **Docker app lacked `BODY_SIZE_LIMIT`**: `docker-compose.yml` now passes
   `BODY_SIZE_LIMIT=${BODY_SIZE_LIMIT:-32M}` to the adapter-node container.
   Systemd production remains separate and must set this in its actual loaded
   environment. Editing `.env.example` alone will never change the service.
3. **Reference Nginx routes pointed OMS `/api/*` at an obsolete backend**:
   `nginx.conf` now routes *all* OMS routes, including
   `/api/toolkit/assets/*`, to the SvelteKit application at
   `127.0.0.1:3000`, with `client_max_body_size 32m` and upload-appropriate
   timeouts. It is a reference for the host-based systemd deployment, not an
   assertion that production Nginx is currently using this file. If the
   deployment uses Traefik, Cloudflare Tunnel or another proxy, review its
   own active routes and body limits.

## Upload implementation

- File input and drag/drop share one private authenticated API.
- A readiness GET checks the SvelteKit ceiling, Storage bucket SELECT/list
  access and the metadata table. **Readiness does not prove INSERT permission**;
  the live smoke test below verifies a real upload.
- Readiness runs once per batch instead of on every image/PDF.
- Browser validates 1 byte–25 MiB and PNG/JPEG/WebP/GIF/PDF. The server checks
  permissions, project existence, MIME and actual file magic.
- POST writes a unique private path `{board UUID}/{asset UUID}`, then inserts
  metadata under Supabase RLS. On metadata failure, it attempts to clean up
  the Storage object and now logs a failure of that cleanup.
- Supabase Storage HTTP 413, 403/401 and 404 map to actionable (but
  non-secret) error messages rather than an undifferentiated 503.
- Browser accepts only UUID/allowed-MIME/bounded-size server metadata and
  reconstructs the canonical authenticated URL itself. It never trusts an
  arbitrary URL from an upload response.
- Source file bytes never enter the tldraw JSON snapshot; file shapes contain
  references. Authenticated download checks board and file IDs and rejects
  mismatched Storage/blob sizes. Download responses use private no-store
  caching, appropriate content type, nosniff and frame restrictions.
- A successful Storage write is tracked even if tldraw shape creation fails.
  The new manager-only `GET /api/toolkit/assets/{board}/library` returns the
  newest 100 registered files, not Storage paths. Canvas **Saved files** lets
  a manager reattach an orphan without uploading it again. A current-page
  duplicate attachment is blocked.
- Normal uploaded media can be previewed up to 25 MiB; the separate R10
  OpenRouter analysis endpoint retains its 8 MiB-image / 12 MiB-PDF limits.

## Database prerequisites (read-only inspection)

Run these on your existing, authorized PostgreSQL instance after checking
the migration history. Do not recreate the bucket or the table by hand unless
you have first reconciled the migration state and backups:

```sql
SELECT id, public, file_size_limit, allowed_mime_types
FROM storage.buckets WHERE id = 'toolkit-assets';

SELECT to_regclass('public.toolkit_assets');

SELECT schemaname, tablename, policyname, cmd
FROM pg_policies
WHERE (schemaname = 'public' AND tablename = 'toolkit_assets')
   OR (schemaname = 'storage' AND tablename = 'objects'
       AND policyname LIKE 'toolkit_asset_%')
ORDER BY schemaname, tablename, policyname;
```

Expect a **private** `toolkit-assets` bucket with
`file_size_limit=26214400` and PNG/JPEG/WebP/GIF/PDF MIME restrictions, a
metadata table `public.toolkit_assets`, SELECT/INSERT/DELETE policies for
authenticated managers, and a working `public.is_admin()` role contract.
The global self-hosted Storage size limit must be **at least 25 MiB**.
The repository's local Supabase config sets 50 MiB, but **that is not proof
that the independent live Supabase Docker stack uses the same setting**.

## Service/proxy validation

Check the actual installed systemd unit and the loaded setting:

```bash
sudo systemctl cat reclame-oms.service
# Identify MainPID for this service; inspect only the upload setting, not
# the rest of the process environment (which may include credentials).
pid="$(systemctl show -p MainPID --value reclame-oms.service)"
sudo cat "/proc/$pid/environ" | tr '\\0' '\\n' | grep '^BODY_SIZE_LIMIT='
```

The output should show `BODY_SIZE_LIMIT=32M`. If not, set it in the active
systemd environment file or override, reload/restart according to the
deployment procedure, and recheck. Run `nginx -T` or equivalent only if
Nginx is actually used. Check the running proxy's route to SvelteKit and
its accepted body size.

## Live upload smoke test

A unit test or `GET ready:true` alone **cannot certify upload behavior**.
For an authorized staging/disposable Canvas project, run:

```bash
OMS_BASE_URL="https://your-oms-host" \
OMS_BOARD_ID="<disposable-project-uuid>" \
OMS_COOKIE_JAR="/secure/local/auth-cookie-jar.txt" \
OMS_TEST_FILE="/path/to/test-image.png" \
bash scripts/smoke-toolkit-upload.sh
```

The script uses an authenticated, local curl cookie file. Do not paste or
share authentication cookies. It checks the readiness GET, sends a real
multipart POST, retrieves the asset using the authenticated binary route,
compares **SHA-256 checksums**, confirms the project library lists the item,
and confirms anonymous access receives 401/403. The test file deliberately
remains in the disposable project so it can be reattached and previewed;
remove the disposable project afterward. Run with a small image/PDF first,
then repeat with 6 MiB, 10 MiB and a 24 MiB PDF to exercise the complete
limit/proxy/Storage chain.

Supabase currently recommends **TUS resumable uploads for files above
6 MiB** on unreliable networks:
<https://supabase.com/docs/guides/storage/uploads/resumable-uploads>.
The existing upload implementation uses standard server-mediated upload,
which is permitted for 25 MiB but is not resumable. If tests show
intermittent large-file connection resets despite correct limits and routes,
TUS should be planned as a separate, authenticated implementation; this
pass does not claim to implement TUS.

## Automated tests / browser acceptance

```bash
npm run check
npx vitest run tests/unit/oms-r11-toolkit-upload.test.ts
npx vitest run tests/unit/oms-r06-toolkit-media.test.ts tests/unit/oms-r07-toolkit.test.ts tests/unit/oms-r10-multimodal.test.ts
npm run build
```

In the browser, sign in as RD, Boss or HeadOfProduction. Upload through the
file picker and through drag/drop, preview an image and a multi-page PDF,
save, reload, and confirm file references remain usable. Simulate a failed
Canvas save (or create a file that was uploaded but not attached) and use
**Saved files → Attach** to recover. Test corrupted PNG/PDF signatures,
unsupported file types, oversized files, a viewer without manager rights,
and an unauthenticated download. Reopen on a second manager account to
confirm the intended team-shared access. If a 502/reset persists, correlate
the timestamp across systemd, proxy, Supabase Storage and PostgREST logs.

**Status:** Repository corrections and tests committed to `main`; no
access to the live OMS service, authenticated cookies or its Docker stack
was available to execute the acceptance script here. Live functionality
must not be described as verified until that script and browser matrix pass.
