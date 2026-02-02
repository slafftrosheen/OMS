-- =====================================================
-- PERFORMANCE OPTIMIZATION INDEXES (Simplified for existing schema)
-- =====================================================

-- Note: This migration has been simplified to work with the existing schema.
-- The original referenced tables that don't exist:
-- - orders (should be draft_orders)
-- - order_stages, order_materials (don't exist)

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

-- Materialized view for dashboard analytics
CREATE MATERIALIZED VIEW IF NOT EXISTS order_analytics_daily AS
SELECT
    DATE(created_at) as date,
    status,
    COUNT(*) as order_count,
    COUNT(DISTINCT client) as unique_clients
FROM draft_orders
GROUP BY DATE(created_at), status;

CREATE UNIQUE INDEX IF NOT EXISTS idx_order_analytics_daily_date_status 
    ON order_analytics_daily(date, status);

-- Refresh function
CREATE OR REPLACE FUNCTION refresh_analytics()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY order_analytics_daily;
END;
$$;

-- Auto-refresh using pg_cron (if available)
-- SELECT cron.schedule('refresh-analytics', '0 */6 * * *', 'SELECT refresh_analytics()');
