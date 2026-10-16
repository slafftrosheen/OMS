-- OMS-R38: revision-bound production completion and truthful next-station handoff.
-- Apply after 20261009000001_complete_stage_with_consumption.sql and
-- 20261009000003_atomic_rework.sql. No table changes or form changes.
BEGIN;

CREATE OR REPLACE FUNCTION public.complete_stage_with_consumption(
  p_order_id UUID,
  p_station TEXT,
  p_items JSONB,
  p_skipped BOOLEAN,
  p_skip_reason TEXT,
  p_actual_hours NUMERIC,
  p_notes TEXT,
  p_expected_updated_at TIMESTAMPTZ
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE
  v_actor UUID:=auth.uid();
  v_role TEXT;
  v_order_status TEXT;
  v_stage_state TEXT;
  v_stage_updated_at TIMESTAMPTZ;
  v_station TEXT:=upper(trim(p_station));
  v_chain TEXT[]:=ARRAY['CAD','CNC','EDGE','ASSEMBLY','PAINT','PACKAGING','DELIVERY'];
  v_index INTEGER;
  v_next TEXT;
  v_next_before TEXT;
  v_next_after TEXT;
  v_result JSONB;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
  END IF;
  SELECT role INTO v_role FROM public.profiles
    WHERE id=v_actor AND is_active=TRUE;
  IF v_role IS NULL OR v_role NOT IN ('RD','Boss','HeadOfProduction','StationHead','Operator') THEN
    RAISE EXCEPTION 'Station permission required' USING ERRCODE='42501';
  END IF;
  IF v_station IS NULL OR v_station NOT IN (
    'CAD','CNC','EDGE','ASSEMBLY','PAINT','PACKAGING','DELIVERY',
    'SANDING','BENDING','WELDING','FILM_COATING','GLUEING','QC','LOGISTICS'
  ) THEN
    RAISE EXCEPTION 'Unknown station' USING ERRCODE='22023';
  END IF;
  IF v_role IN ('StationHead','Operator') AND NOT EXISTS (
    SELECT 1 FROM public.user_stations
    WHERE user_id=v_actor AND upper(station_id)=v_station
  ) THEN
    RAISE EXCEPTION 'Station assignment required' USING ERRCODE='42501';
  END IF;
  IF p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'Stage revision required' USING ERRCODE='22023';
  END IF;
  -- Preserve existing lock order used by stage-completion and rework RPCs.
  SELECT status INTO v_order_status FROM public.draft_orders
    WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found' USING ERRCODE='P0002'; END IF;
  IF v_order_status NOT IN ('CONFIRMED','IN_PRODUCTION') THEN
    RAISE EXCEPTION 'Order is not in production' USING ERRCODE='P0001';
  END IF;
  SELECT state,updated_at INTO v_stage_state,v_stage_updated_at
    FROM public.order_stages
    WHERE draft_order_id=p_order_id AND station=v_station FOR UPDATE;
  IF NOT FOUND OR v_stage_updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'Stage changed; reload production packet and station queue'
      USING ERRCODE='P0001';
  END IF;
  -- Rework must be resolved via the existing audited rework RPC first.
  IF v_stage_state <> 'IN_PROGRESS' OR EXISTS (
    SELECT 1 FROM public.rework_cycles
    WHERE order_id=p_order_id AND station=v_station AND resolved_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Stage is not ready to complete; resolve rework or block first'
      USING ERRCODE='P0001';
  END IF;

  v_index:=array_position(v_chain,v_station);
  IF v_index IS NOT NULL AND v_index<array_length(v_chain,1) THEN
    v_next:=v_chain[v_index+1];
    SELECT state INTO v_next_before FROM public.order_stages
      WHERE draft_order_id=p_order_id AND station=v_next FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Next production stage missing' USING ERRCODE='P0001';
    END IF;
  END IF;

  -- Existing R02 RPC remains the canonical atomic material consumption,
  -- stage completion, low-stock and next-stage update implementation.
  SELECT public.complete_stage_with_consumption(
    p_order_id,v_station,p_items,p_skipped,p_skip_reason,p_actual_hours,p_notes
  ) INTO v_result;
  IF coalesce((v_result->>'ok')::BOOLEAN,FALSE) IS NOT TRUE THEN
    RAISE EXCEPTION 'Stage completion returned no result' USING ERRCODE='P0001';
  END IF;
  IF v_next IS NOT NULL THEN
    SELECT state INTO v_next_after FROM public.order_stages
      WHERE draft_order_id=p_order_id AND station=v_next;
  END IF;

  -- A pre-existing QUEUED/BLOCKED/REWORK/COMPLETED next stage is never
  -- announced as a NEW handoff merely because this stage completed.
  RETURN v_result || jsonb_build_object(
    'next_station',v_next,
    'handoff_queued',coalesce(
      v_next_before='NOT_STARTED' AND v_next_after='QUEUED',FALSE
    )
  );
END;
$$;

-- All browser calls must supply the stage revision. Internal owner-owned
-- 7-argument implementation stays callable from the guarded security-definer
-- overload and service_role, not directly by authenticated users.
REVOKE ALL ON FUNCTION public.complete_stage_with_consumption(
  UUID,TEXT,JSONB,BOOLEAN,TEXT,NUMERIC,TEXT
) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_stage_with_consumption(
  UUID,TEXT,JSONB,BOOLEAN,TEXT,NUMERIC,TEXT
) TO service_role;
REVOKE ALL ON FUNCTION public.complete_stage_with_consumption(
  UUID,TEXT,JSONB,BOOLEAN,TEXT,NUMERIC,TEXT,TIMESTAMPTZ
) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.complete_stage_with_consumption(
  UUID,TEXT,JSONB,BOOLEAN,TEXT,NUMERIC,TEXT,TIMESTAMPTZ
) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
