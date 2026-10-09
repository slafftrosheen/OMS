-- OMS-R02 — serialize loading assignments under loading_days row lock.
-- MUST BE APPLIED BEFORE app-only R02 deploy. No destructive DDL.
CREATE OR REPLACE FUNCTION public.assign_order_loading_day(
  p_day_id UUID, p_order_id UUID, p_action TEXT DEFAULT 'assign'
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_role TEXT;
  v_date DATE;
  v_max INTEGER;
  v_blocked BOOLEAN;
  v_state TEXT;
  v_current_date DATE;
  v_event UUID;
  v_existing UUID;
  v_used INTEGER;
  v_pending TEXT[];
  v_station TEXT;
  v_status TEXT;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  SELECT role INTO v_role FROM public.profiles WHERE id=v_actor;
  IF v_role IS NULL OR v_role NOT IN ('RD','Boss','HeadOfProduction') THEN
    RAISE EXCEPTION 'Management role required' USING ERRCODE='42501';
  END IF;
  IF p_action NOT IN ('assign','unassign') OR p_action IS NULL THEN RAISE EXCEPTION 'Invalid loading action'; END IF;
  SELECT date,max_capacity,is_blocked INTO v_date,v_max,v_blocked
    FROM public.loading_days WHERE id=p_day_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Loading day not found'; END IF;
  SELECT status,loading_date INTO v_state,v_current_date
    FROM public.draft_orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;

  IF p_action='unassign' THEN
    IF v_state <> 'READY_TO_LOAD' OR v_current_date IS DISTINCT FROM v_date THEN
      RAISE EXCEPTION 'Order is not assigned to this loading day';
    END IF;
    DELETE FROM public.loading_event_pos
      WHERE draft_order_id=p_order_id AND loading_event_id IN
        (SELECT id FROM public.calendar_events WHERE kind='loading' AND date=v_date);
    UPDATE public.draft_orders SET status='IN_PRODUCTION', loading_date=NULL,
           updated_by=v_actor,updated_at=now() WHERE id=p_order_id;
    RETURN jsonb_build_object('ok',true,'status','IN_PRODUCTION','date',v_date);
  END IF;

  IF v_state NOT IN ('IN_PRODUCTION','READY_TO_LOAD') THEN
    RAISE EXCEPTION 'Order is not ready for loading';
  END IF;
  IF v_state='READY_TO_LOAD' AND v_current_date IS DISTINCT FROM v_date THEN
    RAISE EXCEPTION 'Unassign previous loading day first';
  END IF;
  IF v_blocked THEN RAISE EXCEPTION 'Loading day is blocked'; END IF;

  -- Six standard production stations + configured QC must be complete.
  SELECT array_agg(required.station) INTO v_pending FROM (
    SELECT unnest(ARRAY['CAD','CNC','EDGE','ASSEMBLY','PAINT','PACKAGING']) AS station
    UNION SELECT 'QC' WHERE EXISTS (
      SELECT 1 FROM public.order_stages WHERE draft_order_id=p_order_id AND station='QC'
    )
  ) required WHERE NOT EXISTS (
    SELECT 1 FROM public.order_stages s WHERE s.draft_order_id=p_order_id
      AND s.station=required.station AND s.state='COMPLETED'
  );
  IF coalesce(array_length(v_pending,1),0)>0 THEN
    RAISE EXCEPTION 'Incomplete production stages: %',array_to_string(v_pending,', ');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.order_stages s WHERE s.draft_order_id=p_order_id
      AND s.state IN ('BLOCKED','REWORK')
  ) THEN RAISE EXCEPTION 'Blocked/rework station remains'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.rework_cycles WHERE order_id=p_order_id AND resolved_at IS NULL
  ) THEN RAISE EXCEPTION 'Open rework cycles remain'; END IF;

  IF v_state='READY_TO_LOAD' AND v_current_date=v_date THEN
    -- Only report idempotency if the junction link truly exists.
    IF EXISTS (
      SELECT 1 FROM public.loading_event_pos lep
      JOIN public.calendar_events ce ON ce.id=lep.loading_event_id
      WHERE lep.draft_order_id=p_order_id AND ce.kind='loading' AND ce.date=v_date
    ) THEN
      RETURN jsonb_build_object('ok',true,'idempotent',true,'status',v_state,'date',v_date);
    END IF;
    -- Legacy broken READY_TO_LOAD rows without a link fall through to repair
    -- the association subject to capacity and blocked-day checks.
  END IF;
  SELECT count(DISTINCT lep.draft_order_id) INTO v_used
    FROM public.loading_event_pos lep JOIN public.calendar_events ev
      ON ev.id=lep.loading_event_id
    WHERE ev.kind='loading' AND ev.date=v_date;
  IF v_used>=coalesce(v_max,10) THEN RAISE EXCEPTION 'Loading day capacity is full'; END IF;

  SELECT id INTO v_event FROM public.calendar_events
    WHERE kind='loading' AND date=v_date ORDER BY created_at,id LIMIT 1;
  IF v_event IS NULL THEN
    INSERT INTO public.calendar_events(kind,date,title,created_by)
      VALUES('loading',v_date,'Loading '||v_date::text,v_actor)
      RETURNING id INTO v_event;
  END IF;
  INSERT INTO public.loading_events(id) VALUES(v_event) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.loading_event_pos(loading_event_id,draft_order_id)
    VALUES(v_event,p_order_id) ON CONFLICT(loading_event_id,draft_order_id) DO NOTHING;
  UPDATE public.draft_orders SET status='READY_TO_LOAD',loading_date=v_date,
      updated_by=v_actor,updated_at=now() WHERE id=p_order_id;
  RETURN jsonb_build_object('ok',true,'status','READY_TO_LOAD','date',v_date,'loadingEventId',v_event);
END;
$$;

REVOKE ALL ON FUNCTION public.assign_order_loading_day(UUID,UUID,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assign_order_loading_day(UUID,UUID,TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.assign_order_loading_day(UUID,UUID,TEXT) TO authenticated;
