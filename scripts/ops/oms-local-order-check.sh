#!/bin/sh
# Intentionally pinned to the development stack. Never target production here.
set -eu
cd "$(dirname "$0")/../.."
{
 printf '\\set ON_ERROR_STOP on\nBEGIN;\n'
 for migration in supabase/migrations/20261105000001_audited_order_deletion.sql \
   supabase/migrations/20261105000002_order_realtime_publication.sql; do
  sed '/^BEGIN;$/d; /^COMMIT;$/d' "$migration"
 done
 sed '/^BEGIN;$/d; /^ROLLBACK;$/d' tests/integration/order-deletion.sql
 printf '\nROLLBACK;\n'
} | docker exec -i supabase_db_OMS psql -U postgres -d postgres -v ON_ERROR_STOP=1
docker exec -i supabase_db_OMS psql -U postgres -d postgres -v ON_ERROR_STOP=1 < tests/integration/order-flow.sql
