-- =====================================================
-- PERFORMANCE OPTIMIZATION: Concurrent Index Creation
-- =====================================================
-- This file contains only CREATE INDEX CONCURRENTLY statements
-- and will be executed outside of a transaction block by Supabase.
--
-- Concurrent indexes allow the database to remain available for
-- writes during index creation, which is important for production.

-- Draft Orders performance indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_draft_orders_status_priority
    ON draft_orders(status, priority DESC) WHERE status != 'completed';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_draft_orders_due_date
    ON draft_orders(due_date) WHERE due_date IS NOT NULL AND status != 'completed';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_draft_orders_created_at
    ON draft_orders(created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_draft_orders_client
    ON draft_orders(client) WHERE client IS NOT NULL;

-- Materials performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_materials_category
    ON materials(category);

-- Inventory performance
-- Note: This index helps with queries filtering items by min_quantity threshold
-- For actual low stock queries, you may need to join with inventory_stock table
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_inventory_min_quantity
    ON inventory_items(min_quantity)
    WHERE min_quantity > 0;

-- Notifications performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_user_unread
    ON notifications(user_id, created_at DESC) WHERE is_read = false;
