-- =====================================================
-- Migration 010: Analytics Helper Functions
-- Description: SQL functions for analytics dashboard
-- Dependencies: All previous migrations
-- =====================================================

-- Function: Get order statistics
CREATE OR REPLACE FUNCTION get_order_statistics(p_date_from DATE)
RETURNS TABLE (
  total_orders BIGINT,
  active_orders BIGINT,
  completed_orders BIGINT,
  avg_completion_days NUMERIC,
  total_rework BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_orders,
    COUNT(*) FILTER (WHERE status = 'active')::BIGINT as active_orders,
    COUNT(*) FILTER (WHERE status = 'completed')::BIGINT as completed_orders,
    AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 86400) FILTER (WHERE status = 'completed') as avg_completion_days,
    (SELECT COUNT(*)::BIGINT FROM rework_cycles WHERE created_at >= p_date_from) as total_rework
  FROM orders
  WHERE created_at >= p_date_from;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_order_statistics TO authenticated;

COMMENT ON FUNCTION get_order_statistics IS 'Get aggregate order statistics for analytics';
