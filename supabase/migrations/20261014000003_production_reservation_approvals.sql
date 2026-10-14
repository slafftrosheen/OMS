-- OMS-R22: controlled, conflict-safe production reservations. Requires R21 capacity migration.
BEGIN;
CREATE TABLE IF NOT EXISTS public.production_reservations (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 draft_order_id UUID NOT NULL REFERENCES public.draft_orders(id) ON DELETE CASCADE,
 station TEXT NOT NULL REFERENCES public.production_station_capacity(station),
 work_date DATE NOT NULL,
 hours NUMERIC(6,2) NOT NULL CHECK (hours>0 AND hours<=999.99),
 status TEXT NOT NULL DEFAULT 'PROPOSED'
   CHECK (status IN ('PROPOSED','APPROVED','CANCELLED')),
 note TEXT NOT NULL DEFAULT '' CHECK (length(note)<=500),
 created_by UUID NOT NULL REFERENCES auth.users(id),
 approved_by UUID REFERENCES auth.users(id),
 cancelled_by UUID REFERENCES auth.users(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 approved_at TIMESTAMPTZ,
 cancelled_at TIMESTAMPTZ,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX IF NOT EXISTS production_reservations_active_stage_date
 ON public.production_reservations(draft_order_id,station,work_date)
 WHERE status IN ('PROPOSED','APPROVED');
CREATE INDEX IF NOT EXISTS production_reservations_approved_day
 ON public.production_reservations(station,work_date) WHERE status='APPROVED';
CREATE INDEX IF NOT EXISTS production_reservations_order
 ON public.production_reservations(draft_order_id,station);
ALTER TABLE public.production_reservations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS production_reservations_select ON public.production_reservations;
CREATE POLICY production_reservations_select ON public.production_reservations
 FOR SELECT TO authenticated
 USING (
  EXISTS (SELECT 1 FROM public.profiles p
    WHERE p.id=auth.uid() AND p.is_active=TRUE)
  AND EXISTS (SELECT 1 FROM public.draft_orders o
    WHERE o.id=production_reservations.draft_order_id)
 );
-- No table writes are granted to authenticated: only the audited RPC may mutate.
REVOKE ALL ON public.production_reservations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.production_reservations TO authenticated;

CREATE OR REPLACE FUNCTION public.oms_manage_production_reservation(
 p_action TEXT,
 p_reservation_id UUID DEFAULT NULL,
 p_order_id UUID DEFAULT NULL,
 p_station TEXT DEFAULT NULL,
 p_work_date DATE DEFAULT NULL,
 p_hours NUMERIC DEFAULT NULL,
 p_note TEXT DEFAULT NULL,
 p_expected_updated_at TIMESTAMPTZ DEFAULT NULL
) RETURNS public.production_reservations
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE
 v_actor UUID:=auth.uid();
 v_role TEXT;
 v_row public.production_reservations%ROWTYPE;
 v_cap public.production_station_capacity%ROWTYPE;
 v_stage public.order_stages%ROWTYPE;
 v_order public.draft_orders%ROWTYPE;
 v_station TEXT;
 v_date DATE;
 v_hours NUMERIC;
 v_booked NUMERIC;
 v_stage_booked NUMERIC;
 v_weekday INTEGER;
 v_chain TEXT[]:=ARRAY['CAD','CNC','EDGE','ASSEMBLY','PAINT','PACKAGING','DELIVERY'];
 v_position INTEGER;
BEGIN
 SELECT role::text INTO v_role FROM public.profiles
 WHERE id=v_actor AND is_active=TRUE;
 IF v_actor IS NULL OR v_role IS NULL OR v_role NOT IN ('RD','Boss','HeadOfProduction') THEN
  RAISE EXCEPTION 'Production manager role required' USING ERRCODE='42501';
 END IF;
 IF p_action NOT IN ('propose','approve','cancel') THEN
  RAISE EXCEPTION 'Unsupported reservation action' USING ERRCODE='22023';
 END IF;
 IF p_action='propose' THEN
  IF p_reservation_id IS NOT NULL OR p_expected_updated_at IS NOT NULL
    OR p_order_id IS NULL OR p_station IS NULL OR p_work_date IS NULL
    OR p_hours IS NULL OR p_hours<=0 OR p_hours>999.99
    OR round(p_hours,2)<>p_hours OR length(COALESCE(p_note,''))>500 THEN
   RAISE EXCEPTION 'Invalid proposed reservation' USING ERRCODE='22023';
  END IF;
  v_station=upper(p_station);v_date=p_work_date;v_hours=p_hours;
 ELSE
  IF p_reservation_id IS NULL OR p_expected_updated_at IS NULL
    OR p_order_id IS NOT NULL OR p_station IS NOT NULL
    OR p_work_date IS NOT NULL OR p_hours IS NOT NULL OR p_note IS NOT NULL THEN
   RAISE EXCEPTION 'Reservation ID and revision required; proposal fields not allowed' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_row FROM public.production_reservations WHERE id=p_reservation_id;
  IF NOT FOUND THEN
   RAISE EXCEPTION 'Reservation not found' USING ERRCODE='P0002';
  END IF;
  v_station=v_row.station;v_date=v_row.work_date;v_hours=v_row.hours;
 END IF;
 -- This row lock serializes all approval / cancellation / capacity-profile changes
 -- for a station. Capacity and reservations have no other authenticated write route.
 SELECT * INTO v_cap FROM public.production_station_capacity
 WHERE station=v_station FOR UPDATE;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'Station capacity is not configured' USING ERRCODE='P0001';
 END IF;
 IF p_action<>'propose' THEN
  SELECT * INTO v_row FROM public.production_reservations
    WHERE id=p_reservation_id FOR UPDATE;
  IF NOT FOUND OR v_row.updated_at IS DISTINCT FROM p_expected_updated_at THEN
   RAISE EXCEPTION 'Reservation changed; reload first' USING ERRCODE='P0001';
  END IF;
  IF v_row.status='CANCELLED' OR
    (p_action='approve' AND v_row.status<>'PROPOSED') THEN
   RAISE EXCEPTION 'Invalid reservation transition' USING ERRCODE='P0001';
  END IF;
 END IF;
 IF p_action='cancel' THEN
  UPDATE public.production_reservations SET status='CANCELLED',
   cancelled_by=v_actor,cancelled_at=clock_timestamp(),
   updated_at=clock_timestamp()
   WHERE id=v_row.id RETURNING * INTO v_row;
  RETURN v_row;
 END IF;
 IF v_date<(now() AT TIME ZONE 'Europe/Riga')::date THEN
  RAISE EXCEPTION 'Cannot reserve a past production day' USING ERRCODE='P0001';
 END IF;
 v_weekday=extract(isodow from v_date)::integer;
 IF NOT (v_weekday=ANY(v_cap.workdays)) OR v_cap.workers=0 THEN
  RAISE EXCEPTION 'Station is unavailable on this day' USING ERRCODE='P0001';
 END IF;
 SELECT * INTO v_stage FROM public.order_stages
 WHERE draft_order_id=CASE WHEN p_action='propose' THEN p_order_id ELSE v_row.draft_order_id END
   AND station::text=v_station FOR UPDATE;
 IF NOT FOUND OR v_stage.state::text NOT IN ('NOT_STARTED','QUEUED','IN_PROGRESS') THEN
  RAISE EXCEPTION 'Stage is not available for production scheduling' USING ERRCODE='P0001';
 END IF;
 SELECT * INTO v_order FROM public.draft_orders WHERE id=v_stage.draft_order_id;
 IF NOT FOUND OR v_order.status::text NOT IN ('CONFIRMED','IN_PRODUCTION') THEN
  RAISE EXCEPTION 'Order must be confirmed and active' USING ERRCODE='P0001';
 END IF;
 IF v_stage.estimated_hours IS NULL OR v_stage.estimated_hours<=0 THEN
  RAISE EXCEPTION 'Estimated hours required before reserving' USING ERRCODE='P0001';
 END IF;
 IF p_action='propose' THEN
  SELECT COALESCE(sum(hours),0) INTO v_stage_booked
  FROM public.production_reservations
  WHERE draft_order_id=p_order_id AND station=v_station
    AND status IN ('PROPOSED','APPROVED');
  IF v_stage_booked+v_hours>v_stage.estimated_hours THEN
   RAISE EXCEPTION 'Reservation exceeds stage estimate' USING ERRCODE='P0001';
  END IF;
  INSERT INTO public.production_reservations
   (draft_order_id,station,work_date,hours,note,created_by)
  VALUES (p_order_id,v_station,v_date,v_hours,COALESCE(p_note,''),v_actor)
  RETURNING * INTO v_row;
  RETURN v_row;
 END IF;
 -- Approval is an explicit commitment. Future workflow stages may only be
 -- PROPOSED; upstream standard stages must be COMPLETED before approval.
 IF v_stage.state::text NOT IN ('QUEUED','IN_PROGRESS') THEN
  RAISE EXCEPTION 'Stage must be queued or in progress before approval' USING ERRCODE='P0001';
 END IF;
 v_position=array_position(v_chain,v_station);
 IF v_position IS NOT NULL AND v_position>1 AND EXISTS (
  SELECT 1 FROM unnest(v_chain[1:v_position-1]) predecessor
  WHERE NOT EXISTS (
   SELECT 1 FROM public.order_stages previous
   WHERE previous.draft_order_id=v_stage.draft_order_id
     AND previous.station::text=predecessor
     AND previous.state::text='COMPLETED'
  )
 ) THEN
  RAISE EXCEPTION 'Prerequisite production stage is not completed' USING ERRCODE='P0001';
 END IF;
 SELECT COALESCE(sum(hours),0) INTO v_stage_booked
 FROM public.production_reservations
 WHERE draft_order_id=v_row.draft_order_id AND station=v_station
   AND status='APPROVED';
 IF v_stage_booked+v_row.hours>v_stage.estimated_hours THEN
  RAISE EXCEPTION 'Approved hours exceed stage estimate' USING ERRCODE='P0001';
 END IF;
 SELECT COALESCE(sum(hours),0) INTO v_booked
 FROM public.production_reservations
 WHERE station=v_station AND work_date=v_date AND status='APPROVED';
 IF v_booked+v_row.hours >
   round(v_cap.workers*v_cap.hours_per_worker*v_cap.efficiency_percent/100.0,2) THEN
  RAISE EXCEPTION 'Daily station capacity conflict' USING ERRCODE='P0001';
 END IF;
 UPDATE public.production_reservations SET status='APPROVED',
  approved_by=v_actor,approved_at=clock_timestamp(),updated_at=clock_timestamp()
 WHERE id=v_row.id RETURNING * INTO v_row;
 RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.oms_manage_production_reservation(
 TEXT,UUID,UUID,TEXT,DATE,NUMERIC,TEXT,TIMESTAMPTZ) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.oms_manage_production_reservation(
 TEXT,UUID,UUID,TEXT,DATE,NUMERIC,TEXT,TIMESTAMPTZ) TO authenticated;

-- Capacity settings may not be reduced below existing future APPROVED bookings.
CREATE OR REPLACE FUNCTION public.oms_guard_capacity_bookings()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_daily RECORD; v_max NUMERIC;
BEGIN
 v_max=round(NEW.workers*NEW.hours_per_worker*NEW.efficiency_percent/100.0,2);
 FOR v_daily IN SELECT work_date, sum(hours) AS booked
  FROM public.production_reservations
  WHERE station=NEW.station AND status='APPROVED'
   AND work_date >=(now() AT TIME ZONE 'Europe/Riga')::date
  GROUP BY work_date
 LOOP
  IF NOT (extract(isodow FROM v_daily.work_date)::integer=ANY(NEW.workdays))
    OR v_daily.booked>v_max THEN
   RAISE EXCEPTION 'Approved production reservations exceed new capacity; cancel or reschedule first'
     USING ERRCODE='P0001';
  END IF;
 END LOOP;
 RETURN NEW;
END;$$;
DROP TRIGGER IF EXISTS oms_guard_capacity_bookings ON public.production_station_capacity;
CREATE TRIGGER oms_guard_capacity_bookings
 BEFORE UPDATE ON public.production_station_capacity
 FOR EACH ROW EXECUTE FUNCTION public.oms_guard_capacity_bookings();

-- Mark future reservations cancelled when the underlying stage finishes.
CREATE OR REPLACE FUNCTION public.oms_cancel_completed_stage_reservations()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.state::text='COMPLETED' AND OLD.state::text<>'COMPLETED' THEN
  UPDATE public.production_reservations SET status='CANCELLED',
   cancelled_by=auth.uid(),cancelled_at=clock_timestamp(),
   updated_at=clock_timestamp()
  WHERE draft_order_id=NEW.draft_order_id AND station=NEW.station::text
   AND work_date >= (now() AT TIME ZONE 'Europe/Riga')::date
   AND status IN ('PROPOSED','APPROVED');
 END IF;
 RETURN NEW;
END;$$;
DROP TRIGGER IF EXISTS oms_cancel_completed_stage_reservations ON public.order_stages;
CREATE TRIGGER oms_cancel_completed_stage_reservations
 AFTER UPDATE OF state ON public.order_stages FOR EACH ROW
 EXECUTE FUNCTION public.oms_cancel_completed_stage_reservations();
COMMIT;
