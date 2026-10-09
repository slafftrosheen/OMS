# OMS-R00 — Security, deployment and recovery baseline (2026-10-09)

This document records the **repository-side** fixes, not evidence of a production restore or a live RLS audit. Deployed topology: SvelteKit systemd `reclame-oms.service` under `/opt/reclame-oms` on port 3000; separate 15-container Supabase Docker Compose stack at `/opt/supabase/docker` with `docker-compose.yml` + `docker-compose.pg17.yml` (PostgreSQL 17 override). Both sit on the private Tailscale network. Do not restart Supabase for frontend/API-only changes.

## Critical — Git was tracking a root .env

The root `.env` existed in the **public repository's Git tree** despite `.gitignore`. R00 deletes it from current `main` and excludes it from Docker build context. **The contents remain available in old commits and are NOT rotated or purged by this change.**

Before the first `git pull` containing R00 on the OMS host, preserve the production environment **outside** the working tree: Git may remove the old tracked `.env` on pull, or refuse a pull when its contents differ. This contradicts the previous deployment report's assumption that the file was never committed.

```bash
cd /opt/reclame-oms
sudo install -d -m 700 /root/oms-r00
sudo cp -p .env /root/oms-r00/oms.env.prepull
sudo chmod 600 /root/oms-r00/oms.env.prepull
git pull --ff-only origin main
# If pull conflicts with modified .env, resolve safely; never run git reset --hard.
if [ ! -s .env ]; then sudo cp -p /root/oms-r00/oms.env.prepull .env; fi
sudo chmod 600 .env
git ls-files --error-unmatch -- .env >/dev/null 2>&1 && echo 'ERROR: still tracked' || echo 'OK: untracked'
```

Preserve the runtime owner's ability to read the file (the `cp -p` example retains ownership). Avoid committing any value from the original file or logging it. Inventory **all** credentials that might have been present in historical Git data and rotate active ones: Supabase `service_role`/anon signing context, PostgreSQL user credentials, session secrets, SMTP keys, OpenRouter keys and any other app/provider tokens. Supabase JWT-secret rotation invalidates multiple services and sessions; coordinate server-side changes and maintenance windows. A separate destructive Git history rewrite would need explicit planning; **rotation is required regardless**.

## Authorization boundary

- The hook verifies the auth identity via `supabase.auth.getUser()` before treating a cookie session as authenticated.
- Fifteen identified request handlers now use `locals.supabase` rather than an unscoped module-global client. The module-global compatibility client is forced to anon credentials.
- Explicit `service_role` clients remain only for privileged, role-checked workflows (such as Vault settings). All user-facing queries must respect RLS and appropriate per-action authorization.

**Not proven by the repository edit:** the live PostgreSQL RLS policies and permissions for each role. Exercise RD, Boss, HeadOfProduction, StationHead, Operator, plus unauthenticated access; verify ownership and cross-user denial. Some previously service-role-backed operations may now surface missing RLS grants. Fix those policies/contracts explicitly; do **not** revert to a globally privileged user-data client. Assess 2026-10-08 chat read/typing table policies before exposing them more broadly.

## Readiness, liveness and diagnostics

- `/api/healthz` returns HTTP 200 if the Node process handles requests; intentionally no DB/Auth/provider probes.
- `/api/health` requires DB and Auth readiness. OpenRouter being unconfigured results in `status: degraded` but still HTTP 200 so order management is not classified as down. Underlying error messages are no longer returned to unauthenticated callers.
- `/api/ai/health` remains separately responsible for AI diagnostics.

After an approved **app-only** deployment:
```bash
systemctl is-active reclame-oms.service
curl -fsS http://127.0.0.1:3000/api/healthz
curl -fsS http://127.0.0.1:3000/api/health
journalctl -u reclame-oms.service -n 80 --no-pager
bash scripts/ops/r00-preflight.sh
```
The installed systemd unit reportedly drains a previous Node process for up to ~90 seconds. Never restart the Supabase Docker stack to compensate for application drain.

## Backups and recovery — operator verification required

The report identifies live PostgreSQL at `/opt/supabase/docker/volumes/db/data`, Supabase Storage at `/opt/supabase/docker/volumes/storage`, named `db-config` for key material, and an offsite Tailnet NAS target. **No successful recent backup, NAS integrity check, storage-object restore or restore rehearsal has been independently verified.**

`scripts/backup.sh` currently backs up **only PostgreSQL SQL data**, encrypting with AES-256-CBC/PBKDF2 for backward compatibility. This format has **no authenticated integrity guarantee**. R00 ensures an unconfigured scheduled invocation fails (not a green no-op), sends the passphrase via an environment lookup rather than a process argument, avoids overwriting the remote final file in place, and quotes the audit-history location.

Before relying on it, verify that the backup scheduler injects `BACKUP_REMOTE_PATH`, `BACKUP_KEY` and `DATABASE_URL` securely, and that the job alerts on nonzero exit, produces a nonempty archive, and sends it to the NAS. Keep the symmetric key separately backed up and access-controlled. Do not put secrets on command lines, tickets, or Git.

### Non-destructive restore rehearsal

1. Check the backup timestamp, SQL archive size, NAS destination, and offsite retention. Confirm the encrypted file can be read and the passphrase is available.
2. On a safe machine, **without writing to production**, test decryption/compression with `openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_KEY -in backup.sql.gz.enc | gzip -t` (run with `set -o pipefail`). This is not a logical restore test.
3. Restore the SQL into a **disposable isolated PostgreSQL 17 environment** and verify table counts, sample orders, relations, functions and roles. Do not restore against live `supabase-db`.
4. Independently back up and restore-test Storage objects, Supabase auth/configuration, relevant volumes, Vault/encryption keys and Compose overrides. Reconcile a sample `files` row to the actual storage object.
5. Record restore duration, maximum acceptable data-loss window (RPO) and recovery time (RTO). Confirm NAS access for the designated backup account.

## Release gates (no GitHub Actions)

`npm ci`; `npm run test`; `npm run check`; `npm run build`; `git diff --check`; then an app-only restart and authenticated role smoke tests. The October 9 deployment report recorded **101 passing tests, one existing VoiceInput diagnostic, and a successful build** for c83dc53. R00's new code has **not** been tested on the live server. Never apply migrations automatically, and never touch the Supabase containers on an app-only release.

Known next phase: OMS-R01 reconciles export joins, station-log RPC, loading-capacity RPC and remaining production/API contracts.
