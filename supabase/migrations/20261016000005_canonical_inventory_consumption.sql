-- OMS-R42: materials is the single canonical on-hand balance.
-- Existing legacy inventory_items IDs are accepted as aliases, not a second
-- authority. Divergent balances halt consumption until a manager performs
-- an explicit physical-count ADJUST with reason and audit provenance.
-- Apply after R38 and R41. No automatic historical stock correction.
BEGIN;
ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS legacy_stock_before INTEGER;

-- Canonical inventory movement; accepts canonical material UUIDs and
-- a legacy inventory_items UUID solely as an alias. Checks BOTH balances.
CREATE OR REPLACE FUNCTION public.consume_materials_for_order(
 p_order_id UUID,p_station TEXT,p_items JSONB,p_actor UUID
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE
 v_line JSONB;
 v_id UUID;
 v_material_id UUID;
 v_legacy_id UUID;
 v_legacy_stock INTEGER;
 v_legacy_count INTEGER;
 v_stock INTEGER;
 v_after INTEGER;
 v_min INTEGER;
 v_quantity INTEGER;
 v_sku TEXT;
 v_name TEXT;
 v_note TEXT;
 v_low JSONB:='[]'::jsonb;
 v_consumed INTEGER:=0;
 v_seen_materials UUID[]:='{}';
BEGIN
 IF p_items IS NULL OR jsonb_typeof(p_items)<>'array' THEN
   RAISE EXCEPTION 'Material lines must be an array' USING ERRCODE='22023';
 END IF;
 FOR v_line IN SELECT value FROM jsonb_array_elements(p_items) LOOP
   v_id:=(v_line->>'item_id')::UUID;
   v_quantity:=(v_line->>'quantity')::INTEGER;
   IF v_id IS NULL OR v_quantity IS NULL OR v_quantity<1 THEN
     RAISE EXCEPTION 'Invalid material or quantity' USING ERRCODE='22023';
   END IF;
   v_note:=nullif(btrim(coalesce(v_line->>'notes','')),'');
   SELECT id INTO v_material_id FROM public.materials WHERE id=v_id;
   IF NOT FOUND THEN
     SELECT material_id INTO v_material_id FROM public.inventory_items WHERE id=v_id;
   END IF;
   IF v_material_id IS NULL THEN
     RAISE EXCEPTION 'Unmapped stock item' USING ERRCODE='P0001';
   END IF;
   IF v_material_id=ANY(v_seen_materials) THEN
     RAISE EXCEPTION 'Duplicate canonical material through different aliases'
       USING ERRCODE='P0001';
   END IF;
   v_seen_materials:=array_append(v_seen_materials,v_material_id);
   SELECT stock,coalesce(min_stock,0),sku,name_en
     INTO v_stock,v_min,v_sku,v_name
     FROM public.materials WHERE id=v_material_id FOR UPDATE;
   IF NOT FOUND OR v_stock IS NULL OR v_stock<v_quantity THEN
     RAISE EXCEPTION 'Insufficient canonical stock' USING ERRCODE='P0001';
   END IF;
   SELECT count(*) INTO v_legacy_count FROM public.inventory_items
     WHERE material_id=v_material_id;
   IF v_legacy_count>1 THEN
     RAISE EXCEPTION 'Ambiguous legacy inventory mapping' USING ERRCODE='P0001';
   END IF;
   v_legacy_id:=NULL;
   v_legacy_stock:=NULL;
   IF v_legacy_count=1 THEN
     SELECT id,stock INTO v_legacy_id,v_legacy_stock
       FROM public.inventory_items WHERE material_id=v_material_id FOR UPDATE;
     IF v_legacy_stock IS DISTINCT FROM v_stock THEN
       RAISE EXCEPTION 'Inventory balances disagree; management reconciliation needed'
         USING ERRCODE='P0001';
     END IF;
   END IF;
   v_after:=v_stock-v_quantity;
   UPDATE public.materials SET stock=v_after,updated_at=clock_timestamp()
     WHERE id=v_material_id;
   IF v_legacy_id IS NOT NULL THEN
     UPDATE public.inventory_items SET stock=v_after,updated_at=clock_timestamp()
       WHERE id=v_legacy_id;
   END IF;
   INSERT INTO public.inventory_movements(
     material_id,item_id,movement_type,quantity,reference_id,reference_type,
     performed_by,notes,stock_before,stock_after,legacy_stock_before
   ) VALUES (
     v_material_id,v_legacy_id,'out',v_quantity,p_order_id,'order',p_actor,
     'station='||upper(btrim(p_station))||
       CASE WHEN v_note IS NULL THEN '' ELSE '; '||v_note END,
     v_stock,v_after,v_legacy_stock
   );
   v_consumed:=v_consumed+1;
   IF v_after<v_min THEN
     v_low:=v_low||jsonb_build_object(
       'item_id',v_material_id,'sku',v_sku,'name',v_name,
       'stock',v_after,'min_stock',v_min
     );
   END IF;
 END LOOP;
 RETURN jsonb_build_object('consumed',v_consumed,'low_stock',v_low);
END;
$$;

-- R38's versioned eight-argument RPC still calls this seven-argument
-- implementation under its own stage-revision and rework lock.
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
    v_material_id UUID;
    v_legacy_stock INTEGER;
    v_legacy_count INTEGER;
    v_seen_materials UUID[]:='{}';
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
        -- The shop-floor selector uses canonical materials IDs. Old clients
        -- may still supply inventory_items IDs: resolve them as aliases only.
        SELECT id INTO v_material_id FROM public.materials WHERE id=v_item_id;
        IF NOT FOUND THEN
          SELECT material_id INTO v_material_id
          FROM public.inventory_items WHERE id=v_item_id;
        END IF;
        IF v_material_id IS NULL THEN
          RAISE EXCEPTION 'Material is unmapped; check inventory consistency'
            USING ERRCODE='P0001';
        END IF;
        IF v_material_id=ANY(v_seen_materials) THEN
          RAISE EXCEPTION 'Same canonical material declared more than once'
            USING ERRCODE='P0001';
        END IF;
        v_seen_materials:=array_append(v_seen_materials,v_material_id);
        SELECT stock INTO v_stock FROM public.materials
          WHERE id=v_material_id FOR UPDATE;
        IF NOT FOUND OR v_stock IS NULL OR v_stock<v_quantity THEN
          RAISE EXCEPTION 'Canonical stock insufficient or unavailable'
            USING ERRCODE='P0001';
        END IF;
        SELECT count(*) INTO v_legacy_count FROM public.inventory_items
          WHERE material_id=v_material_id;
        IF v_legacy_count>1 THEN
          RAISE EXCEPTION 'Duplicate legacy mappings require management review'
            USING ERRCODE='P0001';
        END IF;
        IF v_legacy_count=1 THEN
          SELECT stock INTO v_legacy_stock FROM public.inventory_items
            WHERE material_id=v_material_id FOR UPDATE;
          IF v_legacy_stock IS DISTINCT FROM v_stock THEN
            RAISE EXCEPTION 'Legacy and canonical stock differ; manager reconciliation required'
              USING ERRCODE='P0001';
          END IF;
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

-- Manual manager movement: lock canonical first, then legacy mirror. Ordinary
-- IN/OUT require parity; an explicit ADJUST with a reason may reconcile them.
CREATE OR REPLACE FUNCTION public.oms_record_manual_inventory_movement(
 p_request_id UUID, p_material_id UUID, p_kind TEXT, p_quantity INTEGER,
 p_note TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE
 v_actor UUID:=auth.uid();
 v_role TEXT;
 v_kind TEXT:=upper(btrim(coalesce(p_kind,'')));
 v_stock_before INTEGER;
 v_stock_after INTEGER;
 v_movement public.inventory_movements%ROWTYPE;
 v_unit TEXT;
 v_material_name TEXT;
 v_sku TEXT;
 v_delta INTEGER;
 v_legacy_id UUID;
 v_legacy_stock INTEGER;
 v_legacy_count INTEGER;
BEGIN
 SELECT p.role::text INTO v_role FROM public.profiles p
 WHERE p.id=v_actor AND p.is_active=TRUE;
 IF v_actor IS NULL OR v_role IS NULL OR
    v_role NOT IN ('RD','Boss','HeadOfProduction') THEN
   RAISE EXCEPTION 'Inventory manager role required' USING ERRCODE='42501';
 END IF;
 IF p_request_id IS NULL OR p_material_id IS NULL OR v_kind NOT IN ('IN','OUT','ADJUST')
   OR p_quantity IS NULL OR p_quantity<0 OR p_quantity>100000000
   OR (v_kind<>'ADJUST' AND p_quantity=0)
   OR length(coalesce(p_note,''))>1000
   OR (v_kind='ADJUST' AND nullif(btrim(coalesce(p_note,'')),'') IS NULL) THEN
   RAISE EXCEPTION 'Invalid manual inventory movement or adjustment reason'
     USING ERRCODE='22023';
 END IF;

 -- Serialize changes to the same material, including duplicate request IDs.
 SELECT stock,unit,sku,name_en INTO v_stock_before,v_unit,v_sku,v_material_name
 FROM public.materials WHERE id=p_material_id FOR UPDATE;
 IF NOT FOUND THEN
   RAISE EXCEPTION 'Material no longer exists' USING ERRCODE='P0002';
 END IF;
 IF v_stock_before IS NULL OR v_stock_before<0 THEN
   RAISE EXCEPTION 'Material stock is invalid; reconcile before adjustments'
     USING ERRCODE='P0001';
 END IF;
 SELECT count(*) INTO v_legacy_count FROM public.inventory_items
   WHERE material_id=p_material_id;
 IF v_legacy_count>1 THEN
   RAISE EXCEPTION 'Duplicate legacy item mapping; inspect before adjusting'
     USING ERRCODE='P0001';
 END IF;
 IF v_legacy_count=1 THEN
   SELECT id,stock INTO v_legacy_id,v_legacy_stock
     FROM public.inventory_items WHERE material_id=p_material_id FOR UPDATE;
   IF v_legacy_stock IS NULL OR v_legacy_stock<0 THEN
     RAISE EXCEPTION 'Legacy stock invalid; inspect before adjusting'
       USING ERRCODE='P0001';
   END IF;
 END IF;

 SELECT * INTO v_movement FROM public.inventory_movements
 WHERE request_id=p_request_id;
 IF FOUND THEN
   IF v_movement.material_id IS DISTINCT FROM p_material_id OR
      v_movement.performed_by IS DISTINCT FROM v_actor OR
      v_movement.movement_type IS DISTINCT FROM
        (CASE v_kind WHEN 'ADJUST' THEN 'adjustment' ELSE lower(v_kind) END) OR
      (v_kind<>'ADJUST' AND v_movement.quantity IS DISTINCT FROM p_quantity) OR
      (v_kind='ADJUST' AND v_movement.stock_after IS DISTINCT FROM p_quantity) OR
      (v_movement.notes IS DISTINCT FROM
         CASE v_kind WHEN 'ADJUST' THEN
           'Adjustment '||v_movement.stock_before||' -> '||v_movement.stock_after||
             ': '||btrim(coalesce(p_note,''))
         ELSE nullif(btrim(coalesce(p_note,'')),'') END) THEN
     RAISE EXCEPTION 'Inventory movement request ID already used for different input'
       USING ERRCODE='P0001';
   END IF;
   RETURN jsonb_build_object('id',v_movement.id,'materialId',p_material_id,
     'kind',v_movement.movement_type,'qty',v_movement.quantity,
     'unit',v_unit,'by',v_actor,'newStock',v_stock_before,
     'recordedStockAfter',v_movement.stock_after,
     'at',v_movement.created_at,'idempotent',TRUE);
 END IF;
 v_stock_after:=CASE v_kind
   WHEN 'IN' THEN v_stock_before+p_quantity
   WHEN 'OUT' THEN v_stock_before-p_quantity
   ELSE p_quantity END;
 IF v_kind<>'ADJUST' AND v_legacy_id IS NOT NULL AND
    v_legacy_stock IS DISTINCT FROM v_stock_before THEN
   RAISE EXCEPTION 'Legacy balance differs; use manager physical-count adjustment'
     USING ERRCODE='P0001';
 END IF;
 IF v_stock_after<0 OR v_stock_after>2147483647 THEN
   RAISE EXCEPTION 'Insufficient stock or quantity exceeds inventory limit'
     USING ERRCODE='P0001';
 END IF;
 IF v_kind='ADJUST' AND v_stock_after=v_stock_before AND
    (v_legacy_id IS NULL OR v_legacy_stock=v_stock_after) THEN
   RAISE EXCEPTION 'Adjustment would not change stock' USING ERRCODE='22023';
 END IF;
 v_delta:=CASE v_kind WHEN 'ADJUST' THEN abs(v_stock_after-v_stock_before)
   ELSE p_quantity END;

 UPDATE public.materials SET stock=v_stock_after,updated_at=clock_timestamp()
 WHERE id=p_material_id;
 IF v_legacy_id IS NOT NULL THEN
   UPDATE public.inventory_items SET stock=v_stock_after,updated_at=clock_timestamp()
     WHERE id=v_legacy_id;
 END IF;
 INSERT INTO public.inventory_movements (
   material_id,item_id,movement_type,quantity,reference_type,reference_id,
   performed_by,notes,request_id,stock_before,stock_after,legacy_stock_before
 ) VALUES (
   p_material_id,v_legacy_id,
   CASE v_kind WHEN 'ADJUST' THEN 'adjustment' ELSE lower(v_kind) END,
   v_delta,'manual',NULL,v_actor,
   CASE WHEN v_kind='ADJUST'
     THEN 'Adjustment '||v_stock_before||' -> '||v_stock_after||': '||btrim(p_note)
     ELSE nullif(btrim(coalesce(p_note,'')),'') END,
   p_request_id,v_stock_before,v_stock_after,v_legacy_stock
 ) RETURNING * INTO v_movement;

 RETURN jsonb_build_object('id',v_movement.id,'materialId',p_material_id,
   'kind',v_movement.movement_type,'qty',v_movement.quantity,
   'unit',v_unit,'sku',v_sku,'name',v_material_name,'by',v_actor,
   'newStock',v_stock_after,'legacyStockBefore',v_legacy_stock,
   'at',v_movement.created_at,
   'idempotent',FALSE);
END;
$$;

-- For an explicit manager physical count on an out-of-sync material, require
-- both balances observed in the diagnostic page. Lock in the same order as
-- the canonical manual movement: materials, then the linked legacy row.
CREATE OR REPLACE FUNCTION public.oms_reconcile_inventory_stock(
 p_request_id UUID,p_material_id UUID,p_new_stock INTEGER,
 p_expected_canonical_stock INTEGER,p_expected_legacy_stock INTEGER,
 p_reason TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE
 v_actor UUID:=auth.uid();
 v_role TEXT;
 v_canonical INTEGER;
 v_legacy INTEGER;
 v_count INTEGER;
 v_existing public.inventory_movements%ROWTYPE;
 v_receipt JSONB;
BEGIN
 SELECT role INTO v_role FROM public.profiles
   WHERE id=v_actor AND is_active=TRUE;
 IF v_actor IS NULL OR v_role IS NULL OR
   v_role NOT IN ('RD','Boss','HeadOfProduction') THEN
   RAISE EXCEPTION 'Inventory management permission required' USING ERRCODE='42501';
 END IF;
 IF p_request_id IS NULL OR p_material_id IS NULL OR
   p_new_stock IS NULL OR p_new_stock<0 OR p_new_stock>100000000 OR
   p_expected_canonical_stock IS NULL OR p_expected_legacy_stock IS NULL OR
   length(btrim(coalesce(p_reason,'')))<10 OR length(p_reason)>1000 THEN
   RAISE EXCEPTION 'Valid physical count and reason required' USING ERRCODE='22023';
 END IF;
 -- If the network lost a completed receipt, replay exactly the same
 -- idempotency UUID via the original audited RPC, never re-adjust the stock.
 SELECT * INTO v_existing FROM public.inventory_movements
   WHERE request_id=p_request_id;
 IF FOUND THEN
   RETURN public.oms_record_manual_inventory_movement(
     p_request_id,p_material_id,'ADJUST',p_new_stock,p_reason
   );
 END IF;
 SELECT stock INTO v_canonical FROM public.materials
   WHERE id=p_material_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Material missing' USING ERRCODE='P0002'; END IF;
 SELECT count(*) INTO v_count FROM public.inventory_items
   WHERE material_id=p_material_id;
 IF v_count<>1 THEN
   RAISE EXCEPTION 'A unique legacy alias is required to reconcile'
     USING ERRCODE='P0001';
 END IF;
 SELECT stock INTO v_legacy FROM public.inventory_items
   WHERE material_id=p_material_id FOR UPDATE;
 IF v_canonical IS DISTINCT FROM p_expected_canonical_stock OR
    v_legacy IS DISTINCT FROM p_expected_legacy_stock THEN
   RAISE EXCEPTION 'Stock changed since review; refresh physical-count decision'
     USING ERRCODE='P0001';
 END IF;
 SELECT public.oms_record_manual_inventory_movement(
   p_request_id,p_material_id,'ADJUST',p_new_stock,p_reason
 ) INTO v_receipt;
 RETURN v_receipt;
END;
$$;
REVOKE ALL ON FUNCTION public.oms_reconcile_inventory_stock(
 UUID,UUID,INTEGER,INTEGER,INTEGER,TEXT
) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.oms_reconcile_inventory_stock(
 UUID,UUID,INTEGER,INTEGER,INTEGER,TEXT
) TO authenticated;

-- Earlier station summary split_part(notes,'=',2) incorrectly treated
-- custom order notes as workstation codes. Only a strict station prefix
-- on new movement notes qualifies; historical ambiguous notes stay UNKNOWN.
CREATE OR REPLACE VIEW public.station_consumption_summary AS
 SELECT
  m.reference_id AS order_id,
  coalesce(substring(m.notes from '^station=([A-Z_]+)(?:;|$)'),'unknown') AS station,
  m.item_id,
  coalesce(ii.sku,ma.sku) AS sku,
  coalesce(ii.name,ma.name_en,ma.code) AS name,
  sum(m.quantity) AS total_quantity,
  min(m.created_at) AS first_logged_at,
  max(m.created_at) AS last_logged_at
 FROM public.inventory_movements m
 LEFT JOIN public.inventory_items ii ON ii.id=m.item_id
 LEFT JOIN public.materials ma ON ma.id=m.material_id
 WHERE m.reference_type='order' AND m.movement_type='out'
 GROUP BY m.reference_id,station,m.item_id,ii.sku,ii.name,ma.sku,ma.name_en,ma.code;

-- Keep direct authenticated execution of the unversioned completion and
-- caller-controlled actor deduction forbidden. R38 eight-arg RPC remains
-- the only browser-accessible completion path.
REVOKE ALL ON FUNCTION public.complete_stage_with_consumption(
 UUID,TEXT,JSONB,BOOLEAN,TEXT,NUMERIC,TEXT
) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.consume_materials_for_order(
 UUID,TEXT,JSONB,UUID
) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.consume_materials_for_order(UUID,TEXT,JSONB,UUID)
 TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_stage_with_consumption(
 UUID,TEXT,JSONB,BOOLEAN,TEXT,NUMERIC,TEXT
) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
