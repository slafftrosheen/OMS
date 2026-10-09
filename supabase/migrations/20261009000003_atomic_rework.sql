-- OMS-R02 — safe rework cycle mutations, including stage state.
-- Security-definer RPCs explicitly verify actor, station assignment and order state.
CREATE OR REPLACE FUNCTION public.open_order_rework(
 p_order_id UUID, p_station TEXT, p_reason TEXT, p_description TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE
 v_actor UUID := auth.uid();
 v_role TEXT;
 v_status TEXT;
 v_stage TEXT;
 v_rework UUID;
BEGIN
 IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 SELECT role INTO v_role FROM public.profiles WHERE id=v_actor;
 p_station:=upper(trim(p_station));
 IF v_role IS NULL OR v_role NOT IN ('RD','Boss','HeadOfProduction','StationHead','Operator')
    OR p_station NOT IN ('CAD','CNC','EDGE','ASSEMBLY','PAINT','PACKAGING','DELIVERY',
        'SANDING','BENDING','WELDING','FILM_COATING','GLUEING','QC','LOGISTICS') THEN
   RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
 END IF;
 IF v_role IN ('StationHead','Operator') AND NOT EXISTS(
   SELECT 1 FROM public.user_stations WHERE user_id=v_actor AND upper(station_id)=p_station
 ) THEN RAISE EXCEPTION 'Station assignment required' USING ERRCODE='42501'; END IF;
 IF nullif(trim(coalesce(p_description,'')),'') IS NULL
    OR nullif(trim(coalesce(p_reason,'')),'') IS NULL THEN RAISE EXCEPTION 'Reason and description required'; END IF;
 SELECT status INTO v_status FROM public.draft_orders WHERE id=p_order_id FOR UPDATE;
 IF v_status <> 'IN_PRODUCTION' THEN RAISE EXCEPTION 'Order not in production'; END IF;
 SELECT state INTO v_stage FROM public.order_stages
    WHERE draft_order_id=p_order_id AND station=p_station FOR UPDATE;
 IF v_stage NOT IN ('IN_PROGRESS','COMPLETED','BLOCKED') OR v_stage IS NULL THEN
    RAISE EXCEPTION 'Stage cannot enter rework';
 END IF;
 IF EXISTS (SELECT 1 FROM public.rework_cycles WHERE order_id=p_order_id
    AND station=p_station AND resolved_at IS NULL) THEN
    RAISE EXCEPTION 'Open rework already exists';
 END IF;
 INSERT INTO public.rework_cycles(order_id,station,reason,reported_by,notes)
   VALUES (p_order_id,p_station,p_reason,v_actor,p_description) RETURNING id INTO v_rework;
 UPDATE public.order_stages SET state='REWORK', completed_at=NULL, updated_at=now()
   WHERE draft_order_id=p_order_id AND station=p_station;
 RETURN jsonb_build_object('ok',true,'id',v_rework,'station',p_station,'state','REWORK');
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_order_rework(
 p_order_id UUID,p_rework_id UUID,p_resolution TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE
 v_actor UUID:=auth.uid();
 v_role TEXT;
 v_station TEXT;
 v_status TEXT;
BEGIN
 IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 SELECT role INTO v_role FROM public.profiles WHERE id=v_actor;
 IF v_role IS NULL OR v_role NOT IN ('RD','Boss','HeadOfProduction','StationHead','Operator') THEN
   RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
 END IF;
 IF nullif(trim(coalesce(p_resolution,'')),'') IS NULL THEN RAISE EXCEPTION 'Resolution required'; END IF;
 SELECT status INTO v_status FROM public.draft_orders WHERE id=p_order_id FOR UPDATE;
 IF v_status <> 'IN_PRODUCTION' THEN RAISE EXCEPTION 'Order not in production'; END IF;
 SELECT station INTO v_station FROM public.rework_cycles WHERE id=p_rework_id
   AND order_id=p_order_id AND resolved_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'No open rework for this order'; END IF;
 IF v_role IN ('StationHead','Operator') AND NOT EXISTS(
   SELECT 1 FROM public.user_stations WHERE user_id=v_actor AND upper(station_id)=upper(v_station)
 ) THEN RAISE EXCEPTION 'Station assignment required' USING ERRCODE='42501'; END IF;
 UPDATE public.rework_cycles SET resolved_at=now(), resolved_by=v_actor,
    notes=coalesce(notes,'')||E'\nResolution: '||p_resolution
   WHERE id=p_rework_id;
 IF NOT EXISTS (SELECT 1 FROM public.rework_cycles WHERE order_id=p_order_id
    AND station=v_station AND resolved_at IS NULL) THEN
   UPDATE public.order_stages SET state='IN_PROGRESS',started_at=coalesce(started_at,now()),
     updated_at=now() WHERE draft_order_id=p_order_id AND station=v_station AND state='REWORK';
 END IF;
 RETURN jsonb_build_object('ok',true,'id',p_rework_id,'station',v_station,'state','IN_PROGRESS');
END;
$$;

REVOKE ALL ON FUNCTION public.open_order_rework(UUID,TEXT,TEXT,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.open_order_rework(UUID,TEXT,TEXT,TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.open_order_rework(UUID,TEXT,TEXT,TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.resolve_order_rework(UUID,UUID,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_order_rework(UUID,UUID,TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.resolve_order_rework(UUID,UUID,TEXT) TO authenticated;
