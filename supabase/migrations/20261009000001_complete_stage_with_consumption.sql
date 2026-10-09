-- OMS-R02 — transaction-safe station completion (UNAPPLIED until operator deploy).
-- Rollback-ready: CREATE FUNCTION + EXECUTE grants; no table changes.
-- Must deploy SQL BEFORE publishing the application version that invokes this RPC.
CREATE OR REPLACE FUNCTION public.complete_stage_with_consumption(
    p_order_id UUID,
    p_station TEXT,
    p_items JSONB DEFAULT '[]'::jsonb,
    p_skipped BOOLEAN DEFAULT FALSE,
    p_skip_reason TEXT DEFAULT NULL,
    p_actual_hours NUMERIC DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor UUID := auth.uid();
    v_role TEXT;
    v_order_status TEXT;
    v_stage_state TEXT;
    v_stock NUMERIC;
    v_item JSONB;
    v_item_id UUID;
    v_quantity INTEGER;
    v_seen UUID[] := '{}';
    v_consumed JSONB := '{"consumed":0,"low_stock":[]}'::jsonb;
    v_stations TEXT[] := ARRAY['CAD','CNC','EDGE','ASSEMBLY','PAINT','PACKAGING','DELIVERY'];
    v_index INTEGER;
    v_next TEXT;
BEGIN
    IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
    SELECT role INTO v_role FROM public.profiles WHERE id = v_actor;
    IF v_role NOT IN ('RD','Boss','HeadOfProduction','StationHead','Operator') OR v_role IS NULL THEN
        RAISE EXCEPTION 'Not authorized to complete a stage' USING ERRCODE='42501';
    END IF;
    p_station := upper(trim(p_station));
    IF p_station NOT IN ('CAD','CNC','EDGE','ASSEMBLY','PAINT','PACKAGING','DELIVERY',
                         'SANDING','BENDING','WELDING','FILM_COATING','GLUEING','QC','LOGISTICS') THEN
        RAISE EXCEPTION 'Unknown station';
    END IF;
    IF v_role IN ('StationHead','Operator') AND NOT EXISTS (
        SELECT 1 FROM public.user_stations
        WHERE user_id = v_actor AND upper(station_id) = p_station
    ) THEN
        RAISE EXCEPTION 'Station assignment required' USING ERRCODE='42501';
    END IF;
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
        RAISE EXCEPTION 'items must be an array';
    END IF;
    IF p_skipped AND jsonb_array_length(p_items) <> 0 THEN
        RAISE EXCEPTION 'Cannot skip and consume together';
    END IF;
    IF p_skipped AND nullif(trim(coalesce(p_skip_reason,'')), '') IS NULL THEN
        RAISE EXCEPTION 'Skipping materials requires a reason';
    END IF;
    IF NOT p_skipped AND jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Declare materials or explicitly skip with a reason';
    END IF;
    IF p_actual_hours IS NOT NULL AND p_actual_hours < 0 THEN
        RAISE EXCEPTION 'Actual hours cannot be negative';
    END IF;

    -- Lock order and stage, serializing dispatch/loading and duplicate stage completion.
    SELECT status INTO v_order_status FROM public.draft_orders
        WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND OR v_order_status NOT IN ('CONFIRMED','IN_PRODUCTION') THEN
        RAISE EXCEPTION 'Order is not in production';
    END IF;
    SELECT state INTO v_stage_state FROM public.order_stages
        WHERE draft_order_id = p_order_id AND station = p_station FOR UPDATE;
    IF NOT FOUND OR v_stage_state NOT IN ('IN_PROGRESS','REWORK') THEN
        RAISE EXCEPTION 'Stage must be IN_PROGRESS or REWORK (already completed or unavailable)';
    END IF;

    -- Validate ALL consumption lines before the existing deduction RPC runs.
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
        IF jsonb_typeof(v_item) <> 'object' OR (v_item->>'item_id') IS NULL
            OR (v_item->>'quantity') IS NULL THEN
            RAISE EXCEPTION 'Invalid material line';
        END IF;
        v_item_id := (v_item->>'item_id')::UUID;
        v_quantity := (v_item->>'quantity')::INTEGER;
        IF v_quantity <= 0 OR v_item_id = ANY(v_seen) THEN
            RAISE EXCEPTION 'Duplicate item or invalid quantity';
        END IF;
        v_seen := array_append(v_seen, v_item_id);
        SELECT stock INTO v_stock FROM public.inventory_items WHERE id = v_item_id FOR UPDATE;
        IF NOT FOUND OR v_stock < v_quantity THEN
            RAISE EXCEPTION 'Material missing or insufficient stock';
        END IF;
    END LOOP;

    IF NOT p_skipped THEN
        v_consumed := public.consume_materials_for_order(p_order_id, p_station, p_items, v_actor);
    END IF;
    UPDATE public.order_stages
       SET state='COMPLETED',
           completed_at=now(),
           actual_hours=coalesce(p_actual_hours, actual_hours),
           notes=coalesce(p_notes, notes),
           consumption_skipped=p_skipped,
           consumption_skipped_reason=CASE WHEN p_skipped THEN p_skip_reason ELSE NULL END,
           updated_at=now()
     WHERE draft_order_id=p_order_id AND station=p_station;
    IF v_order_status='CONFIRMED' THEN
        UPDATE public.draft_orders
           SET status='IN_PRODUCTION', updated_by=v_actor, updated_at=now()
         WHERE id=p_order_id;
    END IF;

    v_index := array_position(v_stations,p_station);
    IF v_index IS NOT NULL AND v_index < array_length(v_stations,1) THEN
        v_next := v_stations[v_index+1];
        IF NOT EXISTS (SELECT 1 FROM public.order_stages
                       WHERE draft_order_id=p_order_id AND station=v_next) THEN
            RAISE EXCEPTION 'Next production stage missing';
        END IF;
        UPDATE public.order_stages SET state='QUEUED', updated_at=now()
          WHERE draft_order_id=p_order_id AND station=v_next AND state='NOT_STARTED';
    END IF;
    RETURN jsonb_build_object('ok',true,'consumed',coalesce((v_consumed->>'consumed')::INTEGER,0),
           'low_stock',coalesce(v_consumed->'low_stock','[]'::jsonb),
           'next_station',v_next,'skipped',p_skipped);
END;
$$;

REVOKE ALL ON FUNCTION public.complete_stage_with_consumption(
    UUID,TEXT,JSONB,BOOLEAN,TEXT,NUMERIC,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_stage_with_consumption(
    UUID,TEXT,JSONB,BOOLEAN,TEXT,NUMERIC,TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.complete_stage_with_consumption(
    UUID,TEXT,JSONB,BOOLEAN,TEXT,NUMERIC,TEXT) TO authenticated;

-- Old RPC accepts caller-controlled p_actor and is SECURITY DEFINER.
-- No API uses it after R02. Prevent direct inventory impersonation/deduction.
REVOKE ALL ON FUNCTION public.consume_materials_for_order(UUID,TEXT,JSONB,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_materials_for_order(UUID,TEXT,JSONB,UUID) FROM anon;
REVOKE ALL ON FUNCTION public.consume_materials_for_order(UUID,TEXT,JSONB,UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.consume_materials_for_order(UUID,TEXT,JSONB,UUID) TO service_role;
