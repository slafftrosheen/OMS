-- OMS-R41. Apply after the unified-materials inventory schema and R40.
-- Manual stock changes are manager-authorized, idempotent and atomic.
-- No changes to the canonical R02/R38 stage-consumption RPC.
BEGIN;

ALTER TABLE public.inventory_movements
 ADD COLUMN IF NOT EXISTS request_id UUID,
 ADD COLUMN IF NOT EXISTS stock_before INTEGER,
 ADD COLUMN IF NOT EXISTS stock_after INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS inventory_movements_request_id_unique
 ON public.inventory_movements(request_id) WHERE request_id IS NOT NULL;

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

 SELECT * INTO v_movement FROM public.inventory_movements
 WHERE request_id=p_request_id;
 IF FOUND THEN
   IF v_movement.material_id IS DISTINCT FROM p_material_id OR
      v_movement.performed_by IS DISTINCT FROM v_actor OR
      v_movement.movement_type IS DISTINCT FROM
        CASE v_kind WHEN 'ADJUST' THEN 'adjustment' ELSE lower(v_kind) END OR
      (v_kind<>'ADJUST' AND v_movement.quantity IS DISTINCT FROM p_quantity) OR
      (v_kind='ADJUST' AND v_movement.stock_after IS DISTINCT FROM p_quantity) THEN
     RAISE EXCEPTION 'Inventory movement request ID already used for different input'
       USING ERRCODE='P0001';
   END IF;
   RETURN jsonb_build_object('id',v_movement.id,'materialId',p_material_id,
     'kind',v_movement.movement_type,'qty',v_movement.quantity,
     'unit',v_unit,'by',v_actor,'newStock',v_movement.stock_after,
     'at',v_movement.created_at,'idempotent',TRUE);
 END IF;
 v_stock_after:=CASE v_kind
   WHEN 'IN' THEN v_stock_before+p_quantity
   WHEN 'OUT' THEN v_stock_before-p_quantity
   ELSE p_quantity END;
 IF v_stock_after<0 OR v_stock_after>2147483647 THEN
   RAISE EXCEPTION 'Insufficient stock or quantity exceeds inventory limit'
     USING ERRCODE='P0001';
 END IF;
 IF v_kind='ADJUST' AND v_stock_after=v_stock_before THEN
   RAISE EXCEPTION 'Adjustment would not change stock' USING ERRCODE='22023';
 END IF;
 v_delta:=CASE v_kind WHEN 'ADJUST' THEN abs(v_stock_after-v_stock_before)
   ELSE p_quantity END;

 UPDATE public.materials SET stock=v_stock_after,updated_at=clock_timestamp()
 WHERE id=p_material_id;
 INSERT INTO public.inventory_movements (
   material_id,movement_type,quantity,reference_type,reference_id,
   performed_by,notes,request_id,stock_before,stock_after
 ) VALUES (
   p_material_id,
   CASE v_kind WHEN 'ADJUST' THEN 'adjustment' ELSE lower(v_kind) END,
   v_delta,'manual',NULL,v_actor,
   CASE WHEN v_kind='ADJUST'
     THEN 'Adjustment '||v_stock_before||' -> '||v_stock_after||': '||btrim(p_note)
     ELSE nullif(btrim(coalesce(p_note,'')),'') END,
   p_request_id,v_stock_before,v_stock_after
 ) RETURNING * INTO v_movement;

 RETURN jsonb_build_object('id',v_movement.id,'materialId',p_material_id,
   'kind',v_movement.movement_type,'qty',v_movement.quantity,
   'unit',v_unit,'sku',v_sku,'name',v_material_name,'by',v_actor,
   'newStock',v_stock_after,'at',v_movement.created_at,
   'idempotent',FALSE);
END;
$$;

-- Authenticated users must not bypass this atomic manager-only manual write
-- via direct inventory movement INSERT. SECURITY DEFINER station completion
-- remains a separate, canonical inventory path for production operators.
DROP POLICY IF EXISTS "Authenticated users can record movements"
 ON public.inventory_movements;
REVOKE INSERT,UPDATE,DELETE ON public.inventory_movements FROM authenticated,anon;
REVOKE ALL ON FUNCTION public.oms_record_manual_inventory_movement(
 UUID,UUID,TEXT,INTEGER,TEXT) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.oms_record_manual_inventory_movement(
 UUID,UUID,TEXT,INTEGER,TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
