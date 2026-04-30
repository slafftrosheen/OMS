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

# --- runner: docker exec preferred when supabase-db container is up ---------
# Detect whether to run psql via `docker exec supabase-db` or via the host
# DATABASE_URL. Docker is preferred because the official Supabase compose
# stack does not always expose postgres on a host port.
_use_docker=0
if command -v docker >/dev/null 2>&1 \
   && docker ps --format '{{.Names}}' 2>/dev/null | grep -qx 'supabase-db'; then
    _use_docker=1
fi

# Run a single SQL statement and capture stdout. Args after first are passed
# to psql (e.g. -At for tuples-only output).
_psql_exec() {
    local sql=$1; shift
    if [ "$_use_docker" = "1" ]; then
        printf '%s\n' "$sql" \
            | docker exec -i supabase-db psql -U supabase_admin -d postgres "$@" -v ON_ERROR_STOP=1 -q
    else
        psql "$DATABASE_URL" "$@" -v ON_ERROR_STOP=1 -q -c "$sql"
    fi
}

# Pipe a heredoc / file into psql.
_psql_file() {
    local file=$1
    if [ "$_use_docker" = "1" ]; then
        docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q < "$file"
    else
        psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$file"
    fi
}

_psql_stdin() {
    if [ "$_use_docker" = "1" ]; then
        docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q
    else
        psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q
    fi
}

# --- list -------------------------------------------------------------------
list_migrations() {
    echo "Local migration files:"
    ls -1 supabase/migrations/ 2>/dev/null || echo "  (none)"

    if [ "$_use_docker" = "1" ] || [ -n "$DATABASE_URL" ]; then
        echo ""
        local source
        if [ "$_use_docker" = "1" ]; then source="docker:supabase-db"; else source="$DATABASE_URL"; fi
        echo "Applied migrations (from $source):"
        _psql_exec "SELECT version FROM supabase_migrations.schema_migrations ORDER BY version" -At \
            2>/dev/null || echo "  (tracking table not yet created — first push will create it)"
    fi
}

# --- push (self-hosted) -----------------------------------------------------
push_self_hosted() {
    if [ "$_use_docker" = "1" ]; then
        echo "Pushing migrations to self-hosted Supabase (via docker exec supabase-db)..."
    else
        if ! command -v psql >/dev/null 2>&1; then
            echo "Error: psql not installed. On Debian: sudo apt install -y postgresql-client" >&2
            echo "       (Or start the supabase-db docker container so the script can use 'docker exec'.)" >&2
            exit 1
        fi
        # Warn if DATABASE_URL points to an external IP — Docker binds postgres
        # only on the Pi5 loopback (127.0.0.1:54322), so DATABASE_URL must use
        # localhost / 127.0.0.1.
        case "$DATABASE_URL" in
            *@localhost:*|*@127.0.0.1:*) : ;;  # OK
            *@[0-9]*:[0-9]*)
                echo "⚠️  Warning: DATABASE_URL contains an external IP address." >&2
                echo "   Docker maps postgres on the Pi5's loopback only." >&2
                echo "   Use: DATABASE_URL=postgresql://postgres:<pw>@localhost:54322/postgres" >&2
                echo "" >&2
                ;;
        esac
        echo "Pushing migrations to self-hosted Supabase ($DATABASE_URL)..."
    fi

    # 1. Ensure the tracking table exists (idempotent)
    _psql_stdin <<'SQL'
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
        already=$(_psql_exec \
            "SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='$version'" \
            -At 2>/dev/null || true)

        if [ "$already" = "1" ]; then
            echo "  ✓ $version  (already applied)"
            skipped=$((skipped + 1))
            continue
        fi

        echo "  → $version  applying $f"
        _psql_file "$f"
        _psql_exec \
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
    if [ "$_use_docker" = "1" ] || [ -n "$DATABASE_URL" ]; then
        push_self_hosted
    elif [ -n "$SUPABASE_PROJECT_ID" ] && [ -n "$SUPABASE_DB_PASSWORD" ]; then
        push_cloud
    else
        cat >&2 <<EOF
Error: no migration target configured.

  Self-hosted (this project's default), pick ONE of:
    a) Run on the Pi5 host where the supabase-db container is up
       (the script will auto-detect and use 'docker exec'), OR
    b) Set DATABASE_URL in .env, e.g.
         DATABASE_URL=postgresql://postgres:<pw>@localhost:54322/postgres

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
