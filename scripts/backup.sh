#!/usr/bin/env bash
# =================================================================
# scripts/backup.sh — encrypted nightly Postgres dump to the Tailnet NAS
# =================================================================
# Usage:  scripts/backup.sh                  (run via cron once configured)
#         BACKUP_REMOTE_PATH= scripts/backup.sh   (force-disable; default)
#
# An unconfigured scheduled backup MUST fail, so monitoring can detect
# missing protection rather than reporting a misleading success.
#
# Q12b: backups land on a separate Tailnet NAS host.
# Phase 3.11 of the audit-driven cleanup.
# =================================================================
set -euo pipefail
umask 077

LOG_PREFIX="[oms-backup $(date -u +%FT%TZ)]"
log() { printf "%s %s\n" "$LOG_PREFIX" "$*"; }

if [[ -z "${BACKUP_REMOTE_PATH:-}" ]] || [[ -z "${BACKUP_KEY:-}" ]]; then
    log "ERROR: BACKUP_REMOTE_PATH and BACKUP_KEY required; no backup was produced."
    exit 2
fi

: "${DATABASE_URL:?DATABASE_URL is required to run a backup}"

DATE_TAG="$(date -u +%Y%m%dT%H%M%SZ)"
WORK_DIR="$(mktemp -d -t oms-backup-XXXXXXXX)"
trap 'rm -rf "$WORK_DIR"' EXIT

DUMP_PATH="$WORK_DIR/oms-${DATE_TAG}.sql.gz.enc"

log "Starting pg_dump → ${DUMP_PATH}"
pg_dump "$DATABASE_URL" \
    | gzip -9 \
    | openssl enc -aes-256-cbc -salt -pbkdf2 -pass env:BACKUP_KEY \
    > "$DUMP_PATH"

SIZE_BYTES=$(stat -c %s "$DUMP_PATH" 2>/dev/null || stat -f %z "$DUMP_PATH")
log "Dump size: ${SIZE_BYTES} bytes"

log "Pushing to ${BACKUP_REMOTE_PATH}"
rsync -av --delay-updates "$DUMP_PATH" "${BACKUP_REMOTE_PATH%/}/"

# Best-effort audit entry, with psql variable quoting (not string interpolation).
if command -v psql >/dev/null 2>&1; then
    if psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
        -v backup_location="${BACKUP_REMOTE_PATH%/}/$(basename "$DUMP_PATH")" \
        -v backup_size="$SIZE_BYTES" >/dev/null <<'SQL'
INSERT INTO public.backup_history (status, location, size_bytes, completed_at, note)
VALUES ('success', :'backup_location', :backup_size, now(), 'scripts/backup.sh');
SQL
    then
        log "Logged to backup_history."
    else
        log "WARNING: backup copied but audit-history write failed."
    fi
else
    log "psql not installed — skipping backup_history insert."
fi

log "Done."
