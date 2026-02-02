-- =====================================================
-- PERFORMANCE OPTIMIZATION: Index Creation
-- =====================================================
-- This file creates performance indexes for the database.
--
-- Note: CONCURRENTLY keyword has been removed as Supabase migrations
-- run inside transaction blocks. For production databases with large
-- tables, consider running these indexes manually with CONCURRENTLY
-- directly via psql to avoid locking tables during index creation.
--
-- To run manually with CONCURRENTLY (outside transaction):
-- psql "postgresql://postgres:[YOUR-PASSWORD]@[YOUR-HOST]:5432/postgres" -c "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_name ON table(column);"

-- Draft Orders performance indexes
CREATE INDEX IF NOT EXISTS idx_draft_orders_status_priority
    ON draft_orders(status, priority DESC) WHERE status != 'completed';

CREATE INDEX IF NOT EXISTS idx_draft_orders_due_date
    ON draft_orders(due_date) WHERE due_date IS NOT NULL AND status != 'completed';

CREATE INDEX IF NOT EXISTS idx_draft_orders_created_at
    ON draft_orders(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_draft_orders_client
    ON draft_orders(client) WHERE client IS NOT NULL;

-- Materials performance
CREATE INDEX IF NOT EXISTS idx_materials_category
    ON materials(category);

-- Inventory performance
-- Note: This index helps with queries filtering items by min_quantity threshold
-- For actual low stock queries, you may need to join with inventory_stock table
CREATE INDEX IF NOT EXISTS idx_inventory_min_quantity
    ON inventory_items(min_quantity)
    WHERE min_quantity > 0;

-- Notifications performance
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
    ON notifications(user_id, created_at DESC) WHERE is_read = false;
