-- =====================================================
-- Migration 009: Helper Functions & Views
-- Description: Utility functions and views for orders
-- Dependencies: All previous migrations
-- =====================================================

-- View: Order Summary with current status
CREATE OR REPLACE VIEW order_summary AS
SELECT
  o.id,
  o.po_number,
  o.title,
  o.client,
  o.due_date,
  o.loading_date,
  o.status,
  o.priority,
  o.is_rd,
  o.badges,
  o.created_at,
  o.updated_at,
  -- Count stages by state
  COUNT(CASE WHEN os.state = 'COMPLETED' THEN 1 END) as completed_stages,
  COUNT(CASE WHEN os.state = 'IN_PROGRESS' THEN 1 END) as in_progress_stages,
  COUNT(CASE WHEN os.state = 'BLOCKED' THEN 1 END) as blocked_stages,
  COUNT(CASE WHEN os.state = 'REWORK' THEN 1 END) as rework_stages,
  COUNT(os.id) as total_stages,
  -- Overall progress percentage
  ROUND((COUNT(CASE WHEN os.state = 'COMPLETED' THEN 1 END)::numeric /
         NULLIF(COUNT(os.id), 0)) * 100, 2) as progress_percentage,
  -- Days until due
  (o.due_date - CURRENT_DATE) as days_until_due,
  -- Rework count
  (SELECT COUNT(*) FROM rework_cycles WHERE order_id = o.id) as total_rework_count,
  -- Current station (first non-completed stage)
  (SELECT station FROM order_stages
   WHERE order_id = o.id AND state NOT IN ('COMPLETED', 'NOT_STARTED')
   ORDER BY
     CASE state
       WHEN 'IN_PROGRESS' THEN 1
       WHEN 'BLOCKED' THEN 2
       WHEN 'REWORK' THEN 3
       WHEN 'QUEUED' THEN 4
     END
   LIMIT 1) as current_station,
  -- Assignee count
  (SELECT COUNT(DISTINCT user_id) FROM order_assignees WHERE order_id = o.id) as assignee_count
FROM orders o
LEFT JOIN order_stages os ON o.id = os.order_id
GROUP BY o.id;

COMMENT ON VIEW order_summary IS 'Comprehensive order overview with calculated fields';

-- View: Orders at risk (behind schedule or blocked)
CREATE OR REPLACE VIEW orders_at_risk AS
SELECT
  os.*,
  CASE
    WHEN os.blocked_stages > 0 THEN 'BLOCKED'
    WHEN os.days_until_due < 2 AND os.progress_percentage < 90 THEN 'DUE_SOON'
    WHEN os.days_until_due < 0 THEN 'OVERDUE'
    WHEN os.rework_stages > 0 THEN 'REWORK_NEEDED'
    ELSE 'OTHER'
  END as risk_reason
FROM order_summary os
WHERE
  os.status = 'active'
  AND (
    os.blocked_stages > 0
    OR os.days_until_due < 3
    OR os.rework_stages > 0
  )
ORDER BY
  CASE
    WHEN os.days_until_due < 0 THEN 1
    WHEN os.blocked_stages > 0 THEN 2
    WHEN os.days_until_due < 2 THEN 3
    ELSE 4
  END,
  os.days_until_due;

COMMENT ON VIEW orders_at_risk IS 'Orders requiring immediate attention';

-- Function: Get order timeline
CREATE OR REPLACE FUNCTION get_order_timeline(p_order_id UUID)
RETURNS TABLE (
  timestamp TIMESTAMPTZ,
  event_type TEXT,
  description TEXT,
  actor TEXT,
  details JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    created_at as timestamp,
    activity_type as event_type,
    description,
    user_name as actor,
    new_value as details
  FROM order_activity_log
  WHERE order_id = p_order_id
  ORDER BY created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Search orders with full-text search
CREATE OR REPLACE FUNCTION search_orders(
  p_search_query TEXT,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  po_number TEXT,
  title TEXT,
  client TEXT,
  rank REAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.id,
    o.po_number,
    o.title,
    o.client,
    ts_rank(
      to_tsvector('english',
        coalesce(o.po_number, '') || ' ' ||
        coalesce(o.title, '') || ' ' ||
        coalesce(o.client, '')
      ),
      plainto_tsquery('english', p_search_query)
    ) as rank
  FROM orders o
  WHERE to_tsvector('english',
    coalesce(o.po_number, '') || ' ' ||
    coalesce(o.title, '') || ' ' ||
    coalesce(o.client, '')
  ) @@ plainto_tsquery('english', p_search_query)
  ORDER BY rank DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Get station workload
CREATE OR REPLACE FUNCTION get_station_workload(p_station station_type)
RETURNS TABLE (
  status TEXT,
  count BIGINT,
  avg_hours NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    os.state::TEXT as status,
    COUNT(*) as count,
    AVG(os.actual_hours) as avg_hours
  FROM order_stages os
  JOIN orders o ON o.id = os.order_id
  WHERE os.station = p_station
    AND o.status = 'active'
  GROUP BY os.state
  ORDER BY
    CASE os.state
      WHEN 'BLOCKED' THEN 1
      WHEN 'REWORK' THEN 2
      WHEN 'IN_PROGRESS' THEN 3
      WHEN 'QUEUED' THEN 4
      WHEN 'NOT_STARTED' THEN 5
      ELSE 6
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_station_workload IS 'Get current workload breakdown for a station';
