-- =================================================================
-- 20260425000006: ANALYTICS VIEWS
-- =================================================================
-- Read-only views the API expects to query for dashboards / search.
-- =================================================================

-- order_summary: alias of ordersummary using snake_case naming used by callers.
CREATE OR REPLACE VIEW public.order_summary AS
SELECT * FROM public.ordersummary;
GRANT SELECT ON public.order_summary TO authenticated, anon;
COMMENT ON VIEW public.order_summary IS 'snake_case alias of ordersummary for the search/global API.';

-- order_trends: weekly counts per status, last 12 weeks.
CREATE OR REPLACE VIEW public.order_trends AS
SELECT
    date_trunc('week', o.created_at)::date AS week_start,
    o.status,
    COUNT(*)                                AS order_count,
    COUNT(*) FILTER (WHERE o.is_rd)         AS rd_count,
    AVG(EXTRACT(EPOCH FROM (o.updated_at - o.created_at)) / 86400.0) AS avg_age_days
  FROM public.draft_orders o
 WHERE o.created_at >= now() - interval '12 weeks'
 GROUP BY 1, 2
 ORDER BY 1 DESC, 2;
GRANT SELECT ON public.order_trends TO authenticated;

-- orders_at_risk: due date approaching but not on track.
CREATE OR REPLACE VIEW public.orders_at_risk AS
SELECT
    o.id,
    o.po_number,
    o.client,
    o.title,
    o.due_date,
    o.loading_date,
    o.priority,
    s.computed_status,
    s.progress_percentage,
    s.current_station,
    (o.due_date - CURRENT_DATE)::int AS days_to_due,
    CASE
        WHEN o.due_date < CURRENT_DATE THEN 'overdue'
        WHEN o.due_date <= CURRENT_DATE + interval '2 days' AND s.progress_percentage < 80 THEN 'critical'
        WHEN o.due_date <= CURRENT_DATE + interval '5 days' AND s.progress_percentage < 50 THEN 'warning'
        ELSE 'watch'
    END AS risk_level
  FROM public.draft_orders o
  JOIN public.ordersummary s ON s.id = o.id
 WHERE o.status NOT IN ('completed', 'cancelled', 'archived')
   AND o.due_date IS NOT NULL
   AND (
        o.due_date < CURRENT_DATE
     OR (o.due_date <= CURRENT_DATE + interval '5 days' AND s.progress_percentage < 80)
   );
GRANT SELECT ON public.orders_at_risk TO authenticated;

-- loading_capacity_overview: per-day used / max / remaining.
CREATE OR REPLACE VIEW public.loading_capacity_overview AS
SELECT
    ld.date,
    ld.max_capacity,
    ld.is_blocked,
    COALESCE(used.used_count, 0) AS used_count,
    GREATEST(ld.max_capacity - COALESCE(used.used_count, 0), 0) AS remaining_capacity,
    CASE
        WHEN ld.is_blocked THEN 'blocked'
        WHEN COALESCE(used.used_count, 0) >= ld.max_capacity THEN 'full'
        WHEN COALESCE(used.used_count, 0) >= ld.max_capacity * 0.8 THEN 'tight'
        ELSE 'open'
    END AS state
  FROM public.loading_days ld
  LEFT JOIN (
       SELECT le.date, COUNT(DISTINCT lep.order_id)::int AS used_count
         FROM public.calendar_events le
         JOIN public.loading_event_pos lep ON lep.loading_event_id = le.id
        WHERE le.kind = 'loading'
        GROUP BY le.date
  ) used ON used.date = ld.date;
GRANT SELECT ON public.loading_capacity_overview TO authenticated;

-- realtime_kpis: dashboard headline numbers.
CREATE OR REPLACE VIEW public.realtime_kpis AS
SELECT
    (SELECT COUNT(*) FROM public.draft_orders WHERE status NOT IN ('completed','cancelled'))    AS open_orders,
    (SELECT COUNT(*) FROM public.draft_orders WHERE status = 'completed' AND updated_at > now() - interval '7 days') AS completed_7d,
    (SELECT COUNT(*) FROM public.orders_at_risk)                                                AS at_risk_orders,
    (SELECT COUNT(*) FROM public.order_stages WHERE state = 'BLOCKED')                          AS blocked_stages,
    (SELECT COUNT(*) FROM public.rework_cycles WHERE resolved_at IS NULL)                       AS open_rework,
    (SELECT COUNT(*) FROM public.change_requests WHERE status = 'pending')                      AS pending_change_requests,
    now()                                                                                       AS as_of;
GRANT SELECT ON public.realtime_kpis TO authenticated;

-- station_performance: aggregate per-station throughput.
CREATE OR REPLACE VIEW public.station_performance AS
SELECT
    s.station,
    COUNT(*) FILTER (WHERE s.state = 'COMPLETED' AND s.completed_at > now() - interval '30 days') AS completed_30d,
    COUNT(*) FILTER (WHERE s.state = 'IN_PROGRESS')                                                AS in_progress,
    COUNT(*) FILTER (WHERE s.state = 'BLOCKED')                                                    AS blocked,
    COUNT(*) FILTER (WHERE s.state = 'REWORK')                                                     AS rework,
    AVG(s.actual_hours) FILTER (WHERE s.state = 'COMPLETED' AND s.actual_hours IS NOT NULL)        AS avg_actual_hours,
    AVG(EXTRACT(EPOCH FROM (s.completed_at - s.started_at)) / 3600.0)
        FILTER (WHERE s.completed_at IS NOT NULL AND s.started_at IS NOT NULL)                     AS avg_wall_hours
  FROM public.order_stages s
 GROUP BY s.station;
GRANT SELECT ON public.station_performance TO authenticated;

-- station_timeline: recent activity per station for the live dashboard.
CREATE OR REPLACE VIEW public.station_timeline AS
SELECT
    sl.station,
    sl.action,
    sl.details,
    sl.created_at,
    p.full_name AS user_name,
    p.username
  FROM public.station_logs sl
  LEFT JOIN public.profiles p ON p.id = sl.user_id
 ORDER BY sl.created_at DESC;
GRANT SELECT ON public.station_timeline TO authenticated;

COMMENT ON VIEW public.order_trends             IS 'Weekly order counts per status, last 12 weeks.';
COMMENT ON VIEW public.orders_at_risk           IS 'Orders that are overdue or close to due with low progress.';
COMMENT ON VIEW public.loading_capacity_overview IS 'Loading-day capacity utilization with state tag (open/tight/full/blocked).';
COMMENT ON VIEW public.realtime_kpis            IS 'Headline numbers for the operations dashboard.';
COMMENT ON VIEW public.station_performance      IS '30-day throughput, blocked, rework, average hours per station.';
COMMENT ON VIEW public.station_timeline         IS 'Recent station log entries with the operator''s name attached.';
