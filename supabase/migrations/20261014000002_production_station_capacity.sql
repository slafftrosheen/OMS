-- OMS-R21 production station capacity, deliberately separate from loading_day capacity.
-- Deploy before /api/production/capacity and /production/planner.
BEGIN;

CREATE TABLE IF NOT EXISTS public.production_station_capacity (
  station TEXT PRIMARY KEY CHECK (station IN (
    'CAD','CNC','EDGE','ASSEMBLY','PAINT','PACKAGING','DELIVERY',
    'SANDING','BENDING','WELDING','FILM_COATING','GLUEING','QC','LOGISTICS'
  )),
  workers INTEGER NOT NULL CHECK (workers BETWEEN 0 AND 40),
  hours_per_worker NUMERIC(4,2) NOT NULL CHECK (hours_per_worker BETWEEN 0.25 AND 16),
  efficiency_percent INTEGER NOT NULL CHECK (efficiency_percent BETWEEN 25 AND 100),
  workdays INTEGER[] NOT NULL CHECK (
    cardinality(workdays) BETWEEN 1 AND 7 AND
    workdays <@ ARRAY[1,2,3,4,5,6,7]
  ),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID NOT NULL REFERENCES auth.users(id)
);

COMMENT ON TABLE public.production_station_capacity IS
  'Operator-confirmed station staffing assumptions, NOT calendar bookings or loading capacity. Absent row means unconfigured.';
ALTER TABLE public.production_station_capacity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "production_capacity_read" ON public.production_station_capacity;
CREATE POLICY "production_capacity_read" ON public.production_station_capacity
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_active=TRUE
  ));

DROP POLICY IF EXISTS "production_capacity_manager_insert" ON public.production_station_capacity;
CREATE POLICY "production_capacity_manager_insert" ON public.production_station_capacity
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.is_active=TRUE
      AND p.role IN ('RD','Boss','HeadOfProduction')
  ));

DROP POLICY IF EXISTS "production_capacity_manager_update" ON public.production_station_capacity;
CREATE POLICY "production_capacity_manager_update" ON public.production_station_capacity
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.is_active=TRUE
      AND p.role IN ('RD','Boss','HeadOfProduction')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.is_active=TRUE
      AND p.role IN ('RD','Boss','HeadOfProduction')
  ));

CREATE OR REPLACE FUNCTION public.oms_stamp_production_capacity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
  END IF;
  IF TG_OP='UPDATE' AND NEW.station IS DISTINCT FROM OLD.station THEN
    RAISE EXCEPTION 'Station key cannot change' USING ERRCODE='22023';
  END IF;
  NEW.updated_at=clock_timestamp();
  NEW.updated_by=auth.uid();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS oms_stamp_production_capacity ON public.production_station_capacity;
CREATE TRIGGER oms_stamp_production_capacity
  BEFORE INSERT OR UPDATE ON public.production_station_capacity
  FOR EACH ROW EXECUTE FUNCTION public.oms_stamp_production_capacity();

REVOKE ALL ON public.production_station_capacity FROM PUBLIC, anon;
GRANT SELECT,INSERT,UPDATE ON public.production_station_capacity TO authenticated;
-- Never grant DELETE: resets need an explicit reviewed workflow.
COMMIT;
