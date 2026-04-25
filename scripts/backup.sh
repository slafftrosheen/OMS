#!/usr/bin/env bash
# =================================================================
# scripts/backup.sh — encrypted nightly Postgres dump to the Tailnet NAS
# =================================================================
# Usage:  scripts/backup.sh                  (run via cron once configured)
#         BACKUP_REMOTE_PATH= scripts/backup.sh   (force-disable; default)
#
# The script is INTENTIONALLY IDLE until the operator fills in:
#
#   BACKUP_REMOTE_PATH    rsync-style target on the Tailnet NAS
#                          e.g. backup@reclame-nas:/mnt/oms-backups
#   BACKUP_KEY            symmetric key used by `openssl enc -aes-256-cbc`.
#                          A 32-byte hex string (e.g. `openssl rand -hex 32`).
#
# Both come from the operator's secrets store.  The script prints what it
# would do and exits 0 if either is missing, so cron does not error out
# during the gap between deploy and configuration.
#
# Q12b: backups land on a separate Tailnet NAS host.
# Phase 3.11 of the audit-driven cleanup.
# =================================================================
set -euo pipefail

LOG_PREFIX="[oms-backup $(date -u +%FT%TZ)]"
log() { printf "%s %s\n" "$LOG_PREFIX" "$*"; }

if [[ -z "${BACKUP_REMOTE_PATH:-}" ]] || [[ -z "${BACKUP_KEY:-}" ]]; then
    log "Backup is idle. Set BACKUP_REMOTE_PATH and BACKUP_KEY to enable."
    log "  BACKUP_REMOTE_PATH=${BACKUP_REMOTE_PATH:-<unset>}"
    log "  BACKUP_KEY=$([[ -n "${BACKUP_KEY:-}" ]] && echo set || echo unset)"
    exit 0
fi

: "${DATABASE_URL:?DATABASE_URL is required to run a backup}"

DATE_TAG="$(date -u +%Y%m%dT%H%M%SZ)"
WORK_DIR="$(mktemp -d -t oms-backup-XXXXXXXX)"
trap 'rm -rf "$WORK_DIR"' EXIT

DUMP_PATH="$WORK_DIR/oms-${DATE_TAG}.sql.gz.enc"

log "Starting pg_dump → ${DUMP_PATH}"
pg_dump "$DATABASE_URL" \
    | gzip -9 \
    | openssl enc -aes-256-cbc -salt -pbkdf2 -pass "pass:${BACKUP_KEY}" \
    > "$DUMP_PATH"

SIZE_BYTES=$(stat -c %s "$DUMP_PATH" 2>/dev/null || stat -f %z "$DUMP_PATH")
log "Dump size: ${SIZE_BYTES} bytes"

log "Pushing to ${BACKUP_REMOTE_PATH}"
rsync -av --partial --inplace --info=progress2 "$DUMP_PATH" "${BACKUP_REMOTE_PATH%/}/"

# Best-effort audit row in backup_history.  Requires `psql` on the host.
if command -v psql >/dev/null 2>&1; then
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<SQL
INSERT INTO public.backup_history (status, location, size_bytes, completed_at, note)
VALUES ('success', '${BACKUP_REMOTE_PATH%/}/$(basename "$DUMP_PATH")',
        ${SIZE_BYTES}, now(), 'scripts/backup.sh');
SQL
    log "Logged to backup_history."
else
    log "psql not on PATH — skipping backup_history insert."
fi

log "Done."
