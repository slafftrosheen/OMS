-- =====================================================
-- PERFORMANCE OPTIMIZATION INDEXES
-- =====================================================

-- Orders performance indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_status_priority
    ON orders(status, priority DESC) WHERE status != 'completed';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_due_date
    ON orders(due_date) WHERE due_date IS NOT NULL AND status != 'completed';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_assigned_user
    ON orders(assigned_to, status) WHERE assigned_to IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_created_at
    ON orders(created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_customer
    ON orders(customer) WHERE customer IS NOT NULL;

-- Order stages performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_stages_order_status
    ON order_stages(order_id, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_stages_station
    ON order_stages(station, status);

-- Materials performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_materials_order
    ON order_materials(order_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_materials_category
    ON materials(category, type);

-- Inventory performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_inventory_low_stock
    ON inventory_items(quantity, reorder_point)
    WHERE quantity <= reorder_point;

-- Notifications performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_user_unread
    ON notifications(user_id, created_at DESC) WHERE read = false;

-- Materialized view for dashboard analytics
CREATE MATERIALIZED VIEW IF NOT EXISTS order_analytics_daily AS
SELECT
    DATE(created_at) as date,
    status,
    COUNT(*) as order_count,
    AVG(priority) as avg_priority,
    AVG(progress) as avg_progress
FROM orders
GROUP BY DATE(created_at), status;

CREATE UNIQUE INDEX ON order_analytics_daily(date, status);

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
