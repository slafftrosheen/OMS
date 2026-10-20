# OMS order attachment HTTP 503 — operational diagnosis

The New Order flow saves **draft_orders first**, then uploads each attachment to the private Supabase Storage bucket `files`, inserts a row into `public.files`, and links it via `public.order_files`. The order stays **DRAFT** when any file fails. Once the issue is corrected, choose **Save** on the same open draft; do not start a duplicate order. Successful attachments are skipped on retry.

The browser console's `POST /api/files/upload 503` alone does not identify the failure. The server has multiple separate 503 branches and must not silently store files on public URLs or bypass bucket RLS.

## Immediate inspection on the OMS host (no deploy needed)

Check the **actual running process's** upload limit without printing any other environment variables or credentials:

```sh
pid="$(systemctl show -p MainPID --value reclame-oms.service)"
sudo cat "/proc/$pid/environ" | tr '\\0' '\\n' | grep '^BODY_SIZE_LIMIT=' || echo "BODY_SIZE_LIMIT is missing from the running process"
```

For files up to 25 MiB, the configured OMS process must have at least 26 MiB of multipart room; `BODY_SIZE_LIMIT=32M` is the documented setting. It must exist in the environment **of the process started by systemd**. The example configuration and Docker variables do not change host systemd settings.

Check recent logs after reproducing an upload failure. Keep full logs on the host and redact customer metadata before sharing:

```sh
sudo journalctl -u reclame-oms.service --since "15 minutes ago" --no-pager \
  | grep -E 'Order Storage upload failed|Order attachment registration failed|Order database unavailable|File upload error|body size|request body'
```

If `BODY_SIZE_LIMIT` is wrong, correct it in the private live systemd environment or private `.env` only after confirming the active unit and its `EnvironmentFile`, and **restart only the OMS service**. Do not commit private `.env` and do not restart Supabase unnecessarily.

## New authenticated read-only diagnostic

After building and deploying this change, while signed in as RD/Boss/HeadOfProduction, inspect:

```js
fetch('/api/files/upload', { cache: 'no-store' })
  .then(async response => console.log(response.status, await response.json()));
```

This returns only sanitized readiness metadata:
- OMS adapter request-size ceiling and its recommended setting;
- Whether `files` Storage bucket permits a list/read with current user credentials;
- Whether `files` and `order_files` metadata tables permit a minimal read.

**Readability is not write verification.** This diagnostic does not attempt uploads and does not prove INSERT policy. A real small file still needs to be uploaded, linked, and retrieved through the authenticated download endpoint.

The upload POST now separates Supabase 413 (size), 401/403 (Storage write policy), 404 (bucket missing), metadata INSERT, and order-file link INSERT errors instead of returning the same message for everything. The New Order UI reads the SvelteKit `message` response, includes the reason and HTTP status, and preserves its saved UUID for retry.

## If the limit is correct

Review prerequisites without mutating production data:

```sql
SELECT id, public, file_size_limit, allowed_mime_types
FROM storage.buckets WHERE id = 'files';

SELECT schemaname, tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND (qual LIKE '%files%' OR with_check LIKE '%files%')
ORDER BY policyname;

SELECT to_regclass('public.files') AS file_metadata,
       to_regclass('public.order_files') AS order_links;
```

Also check global self-hosted Supabase Storage upload-size settings and Storage logs if 413/503 originates there. Database migrations are *not* applied by git checkout, building, or restarting the app. Review migration history and database backup before changing bucket policies.

## Separate analytics error

The console's `GET /api/analytics?type=trends&period=30 500` is unrelated to attachment POST. It reads `order_trends` and may fail due to missing DB view, permission or another database issue. Inspect the corresponding `[Analytics API] Error:` line from the OMS service journal. Do not conflate it with Storage health, and do not synthesize replacement KPI data.

## Verification status

Committed source and translation files were reviewed. No live server, Supabase, build, CI or runtime tests were run by this change.
