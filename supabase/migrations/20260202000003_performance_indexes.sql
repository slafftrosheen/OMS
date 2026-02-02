-- =====================================================
-- PERFORMANCE OPTIMIZATION: Materialized View and Analytics
-- =====================================================

-- Note: This migration has been simplified to work with the existing schema.
-- Concurrent indexes have been moved to a separate migration file
-- to avoid transaction block issues.

-- Materialized view for dashboard analytics
CREATE MATERIALIZED VIEW IF NOT EXISTS order_analytics_daily AS
SELECT
    DATE(created_at) as date,
    status,
    COUNT(*) as order_count,
    COUNT(DISTINCT client) as unique_clients
FROM draft_orders
GROUP BY DATE(created_at), status;

-- Non-concurrent index on materialized view (runs in transaction)
CREATE UNIQUE INDEX IF NOT EXISTS idx_order_analytics_daily_date_status 
    ON order_analytics_daily(date, status);

-- Refresh function
-- Note: The function will use non-concurrent refresh initially
-- Once concurrent indexes are created in the next migration, 
-- it can use CONCURRENTLY
CREATE OR REPLACE FUNCTION refresh_analytics()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    REFRESH MATERIALIZED VIEW order_analytics_daily;
END;
$$;

-- Auto-refresh using pg_cron (if available)
-- SELECT cron.schedule('refresh-analytics', '0 */6 * * *', 'SELECT refresh_analytics()');
