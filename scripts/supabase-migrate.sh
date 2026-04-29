#!/bin/bash
# Manage Supabase migrations against a self-hosted Postgres or Supabase Cloud.
#
# Self-hosted (default):  reads DATABASE_URL from .env and applies pending
#                         migrations via psql, tracking them in
#                         supabase_migrations.schema_migrations (the same
#                         table the Supabase CLI uses).
# Cloud:                  set SUPABASE_PROJECT_ID + SUPABASE_DB_PASSWORD to
#                         use `supabase db push` instead.

set -e

# Safely extract only the three variables this script needs from .env.
# We cannot `source .env` because Supabase's .env has values with unquoted
# spaces (e.g. STUDIO_DEFAULT_ORGANIZATION=Reclame Fabriek) which bash
# interprets as "set var=Reclame, then execute Fabriek" — causing errors.
_load_env_var() {
    local key=$1
    # Skip if already set in the calling environment
    [ -n "${!key}" ] && return
    if [ -f .env ]; then
        local raw
        raw=$(grep -E "^${key}=" .env | tail -1)
        [ -z "$raw" ] && return
        local val="${raw#*=}"
        # Strip surrounding single or double quotes
        val="${val%\'}"  ; val="${val#\'}"
        val="${val%\"}"  ; val="${val#\"}"
        export "$key=$val"
    fi
}

_load_env_var DATABASE_URL
_load_env_var SUPABASE_PROJECT_ID
_load_env_var SUPABASE_DB_PASSWORD

# --- create -----------------------------------------------------------------
create_migration() {
    if [ $# -eq 0 ]; then
        echo "Usage: $0 create <migration_name>"
        exit 1
    fi

    local migration_name=$1
    local timestamp
    timestamp=$(date +%Y%m%d%H%M%S)
    local filename="${timestamp}_${migration_name}.sql"

    mkdir -p supabase/migrations
    cat > "supabase/migrations/$filename" <<EOF
-- Migration: $migration_name
-- Description: Add your migration SQL here

-- UP
-- Add your migration SQL statements here


-- DOWN (optional)
-- Add rollback statements here if needed
EOF
    echo "Created supabase/migrations/$filename"
}

# --- list -------------------------------------------------------------------
list_migrations() {
    echo "Local migration files:"
    ls -1 supabase/migrations/ 2>/dev/null || echo "  (none)"

    if [ -n "$DATABASE_URL" ]; then
        echo ""
        echo "Applied migrations (from $DATABASE_URL):"
        psql "$DATABASE_URL" -At -c \
            "SELECT version FROM supabase_migrations.schema_migrations ORDER BY version" \
            2>/dev/null || echo "  (tracking table not yet created — first push will create it)"
    fi
}

# --- push (self-hosted) -----------------------------------------------------
push_self_hosted() {
    if ! command -v psql >/dev/null 2>&1; then
        echo "Error: psql not installed. On Debian: sudo apt install -y postgresql-client" >&2
        exit 1
    fi

    echo "Pushing migrations to self-hosted Supabase ($DATABASE_URL)..."

    # 1. Ensure the tracking table exists (idempotent)
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
    version    text PRIMARY KEY,
    inserted_at timestamptz NOT NULL DEFAULT now()
);
SQL

    # 2. Apply each pending migration in version order
    local applied=0
    local skipped=0
    for f in $(ls supabase/migrations/*.sql 2>/dev/null | sort); do
        local base
        base=$(basename "$f" .sql)
        local version="${base%%_*}"

        local already
        already=$(psql "$DATABASE_URL" -At -c \
            "SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='$version'")

        if [ "$already" = "1" ]; then
            echo "  ✓ $version  (already applied)"
            skipped=$((skipped + 1))
            continue
        fi

        echo "  → $version  applying $f"
        psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$f"
        psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -c \
            "INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('$version')"
        applied=$((applied + 1))
    done

    echo ""
    echo "Done. $applied applied, $skipped already up-to-date."
}

# --- push (cloud) -----------------------------------------------------------
push_cloud() {
    echo "Pushing migrations to Supabase Cloud (project $SUPABASE_PROJECT_ID)..."
    supabase link --project-ref "$SUPABASE_PROJECT_ID"
    supabase db remote set --password "$SUPABASE_DB_PASSWORD"
    supabase db push
    echo "Migrations pushed to Supabase Cloud."
}

# --- push dispatcher --------------------------------------------------------
push_to_remote() {
    if [ -n "$DATABASE_URL" ]; then
        push_self_hosted
    elif [ -n "$SUPABASE_PROJECT_ID" ] && [ -n "$SUPABASE_DB_PASSWORD" ]; then
        push_cloud
    else
        cat >&2 <<EOF
Error: no migration target configured.

  Self-hosted (this project's default):
    Set DATABASE_URL in .env, e.g.
      DATABASE_URL=postgresql://postgres:<pw>@<pi5-ip>:54322/postgres

  Supabase Cloud (only if you're not self-hosting):
    Set SUPABASE_PROJECT_ID and SUPABASE_DB_PASSWORD in the environment.
EOF
        exit 1
    fi
}

# --- main -------------------------------------------------------------------
case "${1:-}" in
    create) create_migration "$2" ;;
    list)   list_migrations ;;
    push)   push_to_remote ;;
    *)
        cat <<EOF
Usage: $0 {create|list|push}
  create <name>  Create a new timestamped migration file in supabase/migrations
  list           List local migrations and which have been applied
  push           Apply pending migrations to the configured database
EOF
        exit 1
        ;;
esac
