-- Keep production file destinations and Canvas placement in the same transaction.
BEGIN;

CREATE OR REPLACE FUNCTION public.oms_canvas_file_pockets(
  p_snapshot JSONB, p_strict BOOLEAN DEFAULT TRUE, p_use_frames BOOLEAN DEFAULT TRUE
) RETURNS JSONB
LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp
AS $$
DECLARE
  v_store JSONB := COALESCE(p_snapshot #> '{document,store}',p_snapshot->'store','{}'::jsonb);
  v_document JSONB;
  v_parent JSONB;
  v_file TEXT;
  v_pocket TEXT;
  v_depth INTEGER;
  v_result JSONB := '{}'::jsonb;
BEGIN
  IF jsonb_typeof(v_store) IS DISTINCT FROM 'object' THEN
    IF p_strict THEN
      RAISE EXCEPTION 'Invalid Canvas record store' USING ERRCODE='22023';
    END IF;
    RETURN v_result;
  END IF;
  FOR v_document IN SELECT value FROM jsonb_each(v_store) LOOP
    IF v_document->>'type' IS DISTINCT FROM 'document' THEN CONTINUE; END IF;
    v_file := v_document #>> '{props,fileId}';
    IF v_file IS NULL OR v_file='' THEN CONTINUE; END IF;
    IF v_file !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      IF p_strict THEN
        RAISE EXCEPTION 'Canvas file is not saved yet' USING ERRCODE='22023';
      END IF;
      CONTINUE;
    END IF;
    v_file := lower(v_file);
    v_pocket := NULL;
    v_parent := CASE WHEN p_use_frames THEN v_store->(v_document->>'parentId') ELSE NULL END;
    FOR v_depth IN 1..32 LOOP
      EXIT WHEN v_parent IS NULL;
      IF v_parent->>'type'='frame' THEN
        v_pocket := CASE
          WHEN v_parent #>> '{meta,omsFilePocket}' IN ('laser','cnc','bender','visuals')
            THEN v_parent #>> '{meta,omsFilePocket}'
          ELSE CASE v_parent #>> '{props,name}'
            WHEN 'Laser (DXF)' THEN 'laser'
            WHEN 'CNC Routing' THEN 'cnc'
            WHEN 'Bender' THEN 'bender'
            WHEN 'Visuals (PDF/Rasters)' THEN 'visuals'
          END
        END;
        EXIT WHEN v_pocket IS NOT NULL;
      END IF;
      v_parent := v_store->(v_parent->>'parentId');
    END LOOP;
    IF v_pocket IS NULL AND v_document #>> '{meta,omsFilePocket}' IN ('laser','cnc','bender','visuals') THEN
      v_pocket := v_document #>> '{meta,omsFilePocket}';
    END IF;
    IF v_pocket IS NULL THEN CONTINUE; END IF;
    IF v_result ? v_file AND v_result->>v_file IS DISTINCT FROM v_pocket THEN
      IF p_strict THEN
        RAISE EXCEPTION 'A Canvas file appears in different production pockets' USING ERRCODE='P0001';
      END IF;
      -- Historical duplicate cards have no unambiguous source destination.
      -- Keep that ambiguity instead of letting JSON iteration order pick one.
      v_result := v_result || jsonb_build_object(v_file,NULL);
      CONTINUE;
    END IF;
    v_result := v_result || jsonb_build_object(v_file,v_pocket);
  END LOOP;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.oms_canvas_file_pockets(JSONB,BOOLEAN,BOOLEAN) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.oms_sync_canvas_file_pockets()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_before JSONB;
  v_after JSONB;
  v_recorded JSONB;
  v_old_store JSONB;
  v_new_store JSONB;
  v_previous_files JSONB;
  v_surviving_files JSONB;
  v_origin TEXT;
  v_current TEXT;
  v_actor UUID := auth.uid();
  v_role TEXT;
  v_entry RECORD;
  v_changed BOOLEAN := FALSE;
BEGIN
  IF OLD.canvas_state IS NOT DISTINCT FROM NEW.canvas_state THEN RETURN NEW; END IF;
  v_before := public.oms_canvas_file_pockets(OLD.canvas_state,FALSE,TRUE);
  v_after := public.oms_canvas_file_pockets(NEW.canvas_state,TRUE,TRUE);
  v_recorded := public.oms_canvas_file_pockets(NEW.canvas_state,FALSE,FALSE);
  v_old_store := COALESCE(OLD.canvas_state #> '{document,store}',OLD.canvas_state->'store','{}'::jsonb);
  v_new_store := COALESCE(NEW.canvas_state #> '{document,store}',NEW.canvas_state->'store','{}'::jsonb);
  IF jsonb_typeof(v_old_store) IS DISTINCT FROM 'object' THEN v_old_store := '{}'::jsonb; END IF;
  IF jsonb_typeof(v_new_store) IS DISTINCT FROM 'object' THEN v_new_store := '{}'::jsonb; END IF;
  SELECT COALESCE(jsonb_object_agg(lower(value #>> '{props,fileId}'),TRUE),'{}'::jsonb)
    INTO v_previous_files FROM jsonb_each(v_old_store)
    WHERE value->>'type'='document' AND value #>> '{props,fileId}' IS NOT NULL;
  SELECT COALESCE(jsonb_object_agg(lower(n.value #>> '{props,fileId}'),TRUE),'{}'::jsonb)
    INTO v_surviving_files
    FROM jsonb_each(v_old_store) o JOIN jsonb_each(v_new_store) n ON n.key=o.key
    WHERE o.value->>'type'='document' AND n.value->>'type'='document'
      AND lower(o.value #>> '{props,fileId}')=lower(n.value #>> '{props,fileId}');
  FOR v_entry IN SELECT key,value FROM jsonb_each_text(v_after) ORDER BY key LOOP
    -- A surviving card changing parent is an edit. Replacing a snapshot is
    -- not an instruction to reclassify all of its attachment references.
    -- A newly attached file uses its seeded card's original pocket metadata,
    -- including uploads moved before their first Canvas save.
    v_origin := CASE WHEN v_surviving_files ? v_entry.key THEN v_before->>v_entry.key
      WHEN NOT (v_previous_files ? v_entry.key) THEN v_recorded->>v_entry.key END;
    IF v_origin IS NULL OR v_origin=v_entry.value THEN CONTINUE; END IF;
    v_changed := TRUE;
    EXIT;
  END LOOP;
  IF NOT v_changed THEN RETURN NEW; END IF;

  SELECT role INTO v_role FROM public.profiles WHERE id=v_actor AND is_active=TRUE;
  IF v_actor IS NULL OR v_role IS NULL OR
    COALESCE(OLD.status::text,'') NOT IN ('DRAFT','draft','PENDING_REVIEW') OR
    COALESCE(NEW.status::text,'') NOT IN ('DRAFT','draft','PENDING_REVIEW') OR
    (v_role NOT IN ('RD','Boss','HeadOfProduction') AND OLD.created_by IS DISTINCT FROM v_actor) THEN
    RAISE EXCEPTION 'Only authorized draft editors can move production files' USING ERRCODE='42501';
  END IF;

  FOR v_entry IN SELECT key,value FROM jsonb_each_text(v_after) ORDER BY key LOOP
    v_origin := CASE WHEN v_surviving_files ? v_entry.key THEN v_before->>v_entry.key
      WHEN NOT (v_previous_files ? v_entry.key) THEN v_recorded->>v_entry.key END;
    IF v_origin IS NULL OR v_origin=v_entry.value THEN CONTINUE; END IF;
    -- The parent order row is already locked by the revision-checked UPDATE.
    -- Stable file order and row locks serialize competing classification/deletion.
    SELECT CASE
      WHEN lower(file_type) IN ('laser','laser_cutting') THEN 'laser'
      WHEN lower(file_type) IN ('cnc','cnc_frezer','cnc_routing') THEN 'cnc'
      WHEN lower(file_type)='bender' THEN 'bender'
      ELSE 'visuals'
    END INTO v_current FROM public.order_files
      WHERE draft_order_id=NEW.id AND file_id=v_entry.key::uuid FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Canvas attachment changed; reload the order files' USING ERRCODE='P0001';
    END IF;
    IF v_current IS DISTINCT FROM v_origin AND v_current IS DISTINCT FROM v_entry.value THEN
      RAISE EXCEPTION 'Canvas file category changed; reload the order files' USING ERRCODE='P0001';
    END IF;
    UPDATE public.order_files SET file_type=v_entry.value
      WHERE draft_order_id=NEW.id AND file_id=v_entry.key::uuid
      AND file_type IS DISTINCT FROM v_entry.value;
  END LOOP;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.oms_sync_canvas_file_pockets() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS sync_canvas_file_pockets ON public.draft_orders;
CREATE TRIGGER sync_canvas_file_pockets
  AFTER UPDATE OF canvas_state ON public.draft_orders
  FOR EACH ROW EXECUTE FUNCTION public.oms_sync_canvas_file_pockets();

COMMIT;
