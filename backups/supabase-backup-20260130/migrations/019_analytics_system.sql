/**
 * Analytics System Migration
 * Metrics, KPIs, dashboard configurations, and materialized views
 */

-- Dashboard configurations table
CREATE TABLE IF NOT EXISTS dashboard_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- User
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Dashboard details
  name TEXT NOT NULL,
  description TEXT,
  
  -- Layout configuration
  layout JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  -- Widget configurations
  widgets JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  -- Settings
  refresh_interval INTEGER DEFAULT 30, -- seconds
  is_default BOOLEAN DEFAULT false,
  is_public BOOLEAN DEFAULT false,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

-- Analytics snapshots table (for historical data)
CREATE TABLE IF NOT EXISTS analytics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Snapshot details
  snapshot_date DATE NOT NULL,
  snapshot_type TEXT NOT NULL CHECK (
    snapshot_type IN ('daily', 'weekly', 'monthly', 'custom')
  ),
  
  -- Metrics data
  metrics JSONB NOT NULL,
  
  -- Context
  filters JSONB,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(snapshot_date, snapshot_type)
);

-- Custom metrics table
CREATE TABLE IF NOT EXISTS custom_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- User
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Metric details
  name TEXT NOT NULL,
  description TEXT,
  metric_type TEXT NOT NULL CHECK (
    metric_type IN ('count', 'sum', 'avg', 'min', 'max', 'custom_query')
  ),
  
  -- Configuration
  source_table TEXT NOT NULL,
  calculation JSONB NOT NULL,
  filters JSONB,
  
  -- Display
  display_format TEXT DEFAULT 'number',
  unit TEXT,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_dashboard_configs_user ON dashboard_configs(user_id);
CREATE INDEX idx_dashboard_configs_default ON dashboard_configs(is_default) WHERE is_default = true;
CREATE INDEX idx_analytics_snapshots_date ON analytics_snapshots(snapshot_date DESC);
CREATE INDEX idx_analytics_snapshots_type ON analytics_snapshots(snapshot_type);
CREATE INDEX idx_custom_metrics_user ON custom_metrics(user_id);
CREATE INDEX idx_custom_metrics_active ON custom_metrics(is_active) WHERE is_active = true;

-- RLS Policies
ALTER TABLE dashboard_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own and public dashboards"
  ON dashboard_configs FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR is_public = true);

CREATE POLICY "Users can manage own dashboards"
  ON dashboard_configs FOR ALL
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can view analytics snapshots"
  ON analytics_snapshots FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can create snapshots"
  ON analytics_snapshots FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Users can view own custom metrics"
  ON custom_metrics FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can manage own custom metrics"
  ON custom_metrics FOR ALL
  TO authenticated
  USING (user_id = auth.uid());

-- Materialized view for order metrics
CREATE MATERIALIZED VIEW IF NOT EXISTS order_metrics_daily AS
SELECT 
  DATE(created_at) as date,
  COUNT(*) as total_orders,
  COUNT(*) FILTER (WHERE status = 'draft') as draft_orders,
  COUNT(*) FILTER (WHERE status = 'in-progress') as in_progress_orders,
  COUNT(*) FILTER (WHERE status = 'ready') as ready_orders,
  COUNT(*) FILTER (WHERE status = 'loaded') as loaded_orders,
  COUNT(*) FILTER (WHERE status = 'completed') as completed_orders,
  COUNT(*) FILTER (WHERE status = 'on-hold') as on_hold_orders,
  COUNT(DISTINCT client) as unique_clients,
  COUNT(DISTINCT loading_day_id) as loading_days_used,
  AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 3600)::NUMERIC(10, 2) as avg_completion_hours
FROM draft_orders
WHERE created_at >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- Create indexes on materialized view
CREATE UNIQUE INDEX idx_order_metrics_daily_date ON order_metrics_daily(date);

-- Materialized view for station metrics
CREATE MATERIALIZED VIEW IF NOT EXISTS station_metrics_daily AS
SELECT 
  DATE(created_at) as date,
  station,
  COUNT(*) as total_logs,
  COUNT(*) FILTER (WHERE log_type = 'stage_change') as stage_changes,
  COUNT(*) FILTER (WHERE is_issue = true) as issues_reported,
  COUNT(*) FILTER (WHERE is_issue = true AND issue_resolved = true) as issues_resolved,
  AVG(quality_score) FILTER (WHERE quality_score IS NOT NULL) as avg_quality_score,
  AVG(duration_minutes) FILTER (WHERE duration_minutes IS NOT NULL) as avg_duration_minutes,
  COUNT(DISTINCT order_id) as orders_processed
FROM station_logs
WHERE created_at >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY DATE(created_at), station
ORDER BY date DESC, station;

CREATE UNIQUE INDEX idx_station_metrics_daily_date_station ON station_metrics_daily(date, station);

-- Function to refresh materialized views
CREATE OR REPLACE FUNCTION refresh_analytics_views()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY order_metrics_daily;
  REFRESH MATERIALIZED VIEW CONCURRENTLY station_metrics_daily;
END;
$$;

-- View for real-time KPIs
CREATE OR REPLACE VIEW realtime_kpis AS
SELECT
  -- Orders
  (SELECT COUNT(*) FROM draft_orders) as total_orders,
  (SELECT COUNT(*) FROM draft_orders WHERE status = 'in-progress') as active_orders,
  (SELECT COUNT(*) FROM draft_orders WHERE created_at >= CURRENT_DATE) as orders_today,
  (SELECT COUNT(*) FROM draft_orders WHERE created_at >= DATE_TRUNC('week', CURRENT_DATE)) as orders_this_week,
  (SELECT COUNT(*) FROM draft_orders WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE)) as orders_this_month,
  
  -- Completion metrics
  (SELECT COUNT(*) FROM draft_orders WHERE status = 'completed' AND updated_at >= CURRENT_DATE) as completed_today,
  (SELECT AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 3600)::NUMERIC(10, 2) 
   FROM draft_orders 
   WHERE status = 'completed' AND updated_at >= CURRENT_DATE - INTERVAL '7 days') as avg_completion_hours_week,
  
  -- Station metrics
  (SELECT COUNT(*) FROM station_logs WHERE created_at >= CURRENT_DATE) as station_activities_today,
  (SELECT COUNT(*) FROM station_logs WHERE is_issue = true AND issue_resolved = false) as open_issues,
  (SELECT AVG(quality_score)::NUMERIC(3, 2) FROM station_logs WHERE quality_score IS NOT NULL AND created_at >= CURRENT_DATE - INTERVAL '7 days') as avg_quality_score_week,
  
  -- Loading metrics
  (SELECT COUNT(*) FROM loading_days WHERE date >= CURRENT_DATE AND date <= CURRENT_DATE + INTERVAL '7 days') as upcoming_loading_days,
  (SELECT SUM(current_capacity) FROM loading_days WHERE date >= CURRENT_DATE AND date <= CURRENT_DATE + INTERVAL '7 days') as upcoming_capacity_used,
  (SELECT SUM(max_capacity) FROM loading_days WHERE date >= CURRENT_DATE AND date <= CURRENT_DATE + INTERVAL '7 days') as upcoming_capacity_total,
  
  -- Client metrics
  (SELECT COUNT(DISTINCT client) FROM draft_orders WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE)) as unique_clients_month,
  
  -- Photo/attachment metrics
  (SELECT COUNT(*) FROM station_attachment WHERE uploaded_at >= CURRENT_DATE) as photos_uploaded_today,
  
  -- User activity
  (SELECT COUNT(*) FROM auth.users WHERE last_sign_in_at >= CURRENT_DATE) as active_users_today;

-- View for order trends
CREATE OR REPLACE VIEW order_trends AS
SELECT 
  date,
  total_orders,
  completed_orders,
  draft_orders,
  in_progress_orders,
  on_hold_orders,
  unique_clients,
  avg_completion_hours,
  LAG(total_orders) OVER (ORDER BY date) as prev_day_total,
  (total_orders - LAG(total_orders) OVER (ORDER BY date)) as daily_change
FROM order_metrics_daily
ORDER BY date DESC
LIMIT 30;

-- View for station performance
CREATE OR REPLACE VIEW station_performance AS
SELECT 
  station,
  SUM(total_logs) as total_logs,
  SUM(stage_changes) as total_stage_changes,
  SUM(issues_reported) as total_issues,
  SUM(issues_resolved) as total_resolved,
  AVG(avg_quality_score)::NUMERIC(3, 2) as overall_quality_score,
  AVG(avg_duration_minutes)::NUMERIC(10, 2) as overall_avg_duration,
  SUM(orders_processed) as total_orders_processed,
  CASE 
    WHEN SUM(issues_reported) > 0 
    THEN (SUM(issues_resolved)::FLOAT / SUM(issues_reported)::FLOAT * 100)::NUMERIC(5, 2)
    ELSE 100
  END as resolution_rate
FROM station_metrics_daily
WHERE date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY station
ORDER BY total_orders_processed DESC;

-- Function to calculate metric value
CREATE OR REPLACE FUNCTION calculate_custom_metric(
  p_metric_id UUID
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_metric RECORD;
  v_query TEXT;
  v_result NUMERIC;
BEGIN
  -- Get metric configuration
  SELECT * INTO v_metric
  FROM custom_metrics
  WHERE id = p_metric_id AND is_active = true;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Metric not found or inactive';
  END IF;
  
  -- Build and execute query based on metric type
  CASE v_metric.metric_type
    WHEN 'count' THEN
      v_query := format('SELECT COUNT(*) FROM %I', v_metric.source_table);
    WHEN 'sum' THEN
      v_query := format('SELECT SUM(%I) FROM %I', 
        v_metric.calculation->>'column', v_metric.source_table);
    WHEN 'avg' THEN
      v_query := format('SELECT AVG(%I) FROM %I', 
        v_metric.calculation->>'column', v_metric.source_table);
    WHEN 'min' THEN
      v_query := format('SELECT MIN(%I) FROM %I', 
        v_metric.calculation->>'column', v_metric.source_table);
    WHEN 'max' THEN
      v_query := format('SELECT MAX(%I) FROM %I', 
        v_metric.calculation->>'column', v_metric.source_table);
    WHEN 'custom_query' THEN
      v_query := v_metric.calculation->>'query';
  END CASE;
  
  -- Apply filters if present
  IF v_metric.filters IS NOT NULL THEN
    -- Add WHERE clauses from filters
    -- Simplified version - expand based on needs
    v_query := v_query || ' WHERE 1=1';
  END IF;
  
  EXECUTE v_query INTO v_result;
  
  RETURN COALESCE(v_result, 0);
END;
$$;

-- Function to create daily snapshot
CREATE OR REPLACE FUNCTION create_daily_snapshot()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO analytics_snapshots (snapshot_date, snapshot_type, metrics)
  SELECT 
    CURRENT_DATE,
    'daily',
    jsonb_build_object(
      'orders', jsonb_build_object(
        'total', (SELECT total_orders FROM realtime_kpis),
        'completed', (SELECT completed_today FROM realtime_kpis),
        'active', (SELECT active_orders FROM realtime_kpis)
      ),
      'stations', jsonb_build_object(
        'activities', (SELECT station_activities_today FROM realtime_kpis),
        'open_issues', (SELECT open_issues FROM realtime_kpis),
        'quality_score', (SELECT avg_quality_score_week FROM realtime_kpis)
      ),
      'loading', jsonb_build_object(
        'upcoming_days', (SELECT upcoming_loading_days FROM realtime_kpis),
        'capacity_used', (SELECT upcoming_capacity_used FROM realtime_kpis),
        'capacity_total', (SELECT upcoming_capacity_total FROM realtime_kpis)
      )
    )
  ON CONFLICT (snapshot_date, snapshot_type) 
  DO UPDATE SET metrics = EXCLUDED.metrics;
  
  -- Refresh materialized views
  PERFORM refresh_analytics_views();
END;
$$;

COMMENT ON TABLE dashboard_configs IS 'User dashboard configurations and layouts';
COMMENT ON TABLE analytics_snapshots IS 'Historical analytics data snapshots';
COMMENT ON TABLE custom_metrics IS 'User-defined custom metrics';
COMMENT ON MATERIALIZED VIEW order_metrics_daily IS 'Daily order metrics (refresh periodically)';
COMMENT ON MATERIALIZED VIEW station_metrics_daily IS 'Daily station metrics (refresh periodically)';
COMMENT ON VIEW realtime_kpis IS 'Real-time key performance indicators';
COMMENT ON VIEW order_trends IS 'Order trends over last 30 days';
COMMENT ON VIEW station_performance IS 'Station performance metrics';
COMMENT ON FUNCTION refresh_analytics_views IS 'Refresh all analytics materialized views';
COMMENT ON FUNCTION calculate_custom_metric IS 'Calculate value for custom metric';
COMMENT ON FUNCTION create_daily_snapshot IS 'Create daily analytics snapshot';