-- ============================================================================
-- 20260810000003_missing_analytics_columns.sql
-- Adds columns the analytics layer selects but that were never created:
--   * station_logs.metadata  (jsonb)  — used by AnalyticsService.getStationMetrics
--   * station_logs.order_id  (uuid)   — also selected by getStationMetrics;
--                                       FK to draft_orders, nullable (logs survive
--                                       order deletion)
--   * rework_cycles.time_impact (numeric) — used by AnalyticsService rework
--     aggregation; parallels the existing cost_impact numeric column.
-- Fixes runtime 42703 "column does not exist" errors on the analytics routes.
-- Idempotent.
-- ============================================================================

ALTER TABLE public.station_logs
  ADD COLUMN IF NOT EXISTS metadata JSONB,
  ADD COLUMN IF NOT EXISTS order_id UUID
    REFERENCES public.draft_orders(id) ON DELETE SET NULL;

ALTER TABLE public.rework_cycles
  ADD COLUMN IF NOT EXISTS time_impact NUMERIC;
