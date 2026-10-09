-- OMS-R02 — atomic confirmation + initial production rows.
-- Must be applied before deploying R02 SvelteKit application.
CREATE OR REPLACE FUNCTION public.confirm_order_with_stages(
 p_order_id UUID, p_po_number TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE
 v_actor UUID := auth.uid();
 v_role TEXT;
 v_status TEXT;
 v_existing_po TEXT;
 v_final_po TEXT;
 v_station TEXT;
 v_position INTEGER;
 v_stations TEXT[] := ARRAY['CAD','CNC','EDGE','ASSEMBLY','PAINT','PACKAGING','DELIVERY'];
BEGIN
 IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 SELECT role INTO v_role FROM public.profiles WHERE id=v_actor;
 IF v_role IS NULL OR v_role NOT IN ('RD','Boss','HeadOfProduction') THEN
    RAISE EXCEPTION 'Management confirmation permission required' USING ERRCODE='42501';
 END IF;
 SELECT status,po_number INTO v_status,v_existing_po FROM public.draft_orders
     WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
 IF v_status IN ('CONFIRMED','IN_PRODUCTION','READY_TO_LOAD','DISPATCHED','ARCHIVED') THEN
   IF p_po_number IS NOT NULL AND p_po_number <> v_existing_po THEN
      RAISE EXCEPTION 'Cannot change confirmed PO';
   END IF;
   RETURN jsonb_build_object('ok',true,'idempotent',true,'status',v_status,'poNumber',v_existing_po);
 END IF;
 IF v_status NOT IN ('DRAFT','draft','PENDING_REVIEW') THEN
   RAISE EXCEPTION 'Only a draft or pending-review order can be confirmed';
 END IF;
 v_final_po := coalesce(nullif(trim(p_po_number),''),v_existing_po);
 IF v_final_po IS NULL OR v_final_po !~ '^[A-Za-z0-9_./-]{1,16}$' THEN
   RAISE EXCEPTION 'A valid PO number (1-16 characters) is required';
 END IF;
 IF v_final_po IS DISTINCT FROM v_existing_po AND v_role <> 'Boss' THEN
   RAISE EXCEPTION 'Only Boss can assign/change PO';
 END IF;

 -- One PostgreSQL transaction: never publish CONFIRMED with missing stages.
 FOR v_position IN 1..array_length(v_stations,1) LOOP
   v_station := v_stations[v_position];
   INSERT INTO public.order_stages(draft_order_id,station,state)
     VALUES(p_order_id,v_station,CASE WHEN v_position=1 THEN 'QUEUED' ELSE 'NOT_STARTED' END)
     ON CONFLICT(draft_order_id,station) DO NOTHING;
 END LOOP;
 UPDATE public.draft_orders
   SET po_number=v_final_po,status='CONFIRMED',confirmed_at=now(),
       confirmed_by=v_actor,updated_by=v_actor,updated_at=now()
   WHERE id=p_order_id;
 RETURN jsonb_build_object('ok',true,'status','CONFIRMED',
      'poNumber',v_final_po,'firstStage','CAD','idempotent',false);
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_order_with_stages(UUID,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_order_with_stages(UUID,TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.confirm_order_with_stages(UUID,TEXT) TO authenticated;
