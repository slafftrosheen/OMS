-- OMS-R12: atomic draft/form/profile saves on the canonical draft_orders row.
-- This is an additive migration; never copy files when confirming a draft.
BEGIN;

CREATE OR REPLACE FUNCTION public.oms_create_draft_form(
 p_fields JSONB, p_profiles JSONB DEFAULT '[]'::jsonb, p_status TEXT DEFAULT 'PENDING_REVIEW'
) RETURNS public.draft_orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
 v_actor UUID := auth.uid(); v_role TEXT; v_order public.draft_orders;
 v_profile JSONB; v_pos INTEGER := 0;
BEGIN
 IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 SELECT role INTO v_role FROM public.profiles WHERE id = v_actor AND is_active = TRUE;
 IF v_role NOT IN ('RD','Boss','HeadOfProduction') OR v_role IS NULL THEN
  RAISE EXCEPTION 'Not permitted to create draft orders' USING ERRCODE='42501';
 END IF;
 IF p_status NOT IN ('DRAFT','PENDING_REVIEW') THEN RAISE EXCEPTION 'Invalid initial status'; END IF;
 IF jsonb_typeof(p_fields) <> 'object' OR jsonb_typeof(p_profiles) <> 'array'
    OR jsonb_array_length(p_profiles) > 100 THEN RAISE EXCEPTION 'Invalid order form'; END IF;
 IF COALESCE(length(trim(p_fields->>'client')),0) NOT BETWEEN 1 AND 200 OR
    p_fields->>'due_date' IS NULL THEN RAISE EXCEPTION 'Client and deadline required'; END IF;
 INSERT INTO public.draft_orders(
  client, title, due_date, loading_date, priority, status, notes,
  delivery_preset_id, delivery_address, delivery_contact, delivery_phone,
  is_rd, rd_notes, badges, created_by, updated_by
 ) VALUES (
  p_fields->>'client', COALESCE(nullif(p_fields->>'title',''),p_fields->>'client'),
  (p_fields->>'due_date')::date, (p_fields->>'loading_date')::date,
  COALESCE(p_fields->>'priority','NORMAL'), p_status, p_fields->>'notes',
  (p_fields->>'delivery_preset_id')::uuid, p_fields->>'delivery_address',
  p_fields->>'delivery_contact', p_fields->>'delivery_phone',
  COALESCE((p_fields->>'is_rd')::boolean,FALSE), p_fields->>'rd_notes',
  COALESCE(p_fields->'badges','{}'::jsonb), v_actor, v_actor
 ) RETURNING * INTO v_order;
 FOR v_profile IN SELECT value FROM jsonb_array_elements(p_profiles) LOOP
  INSERT INTO public.order_profiles(
   draft_order_id,profile_template_id,quantity1,quantity2,quantity3,quantity4,
   configuration,notes,order_index
  ) VALUES (
   v_order.id,(v_profile->>'profile_template_id')::uuid,
   COALESCE((v_profile->>'quantity1')::integer,1),
   COALESCE((v_profile->>'quantity2')::integer,0),
   COALESCE((v_profile->>'quantity3')::integer,0),
   COALESCE((v_profile->>'quantity4')::integer,0),
   COALESCE(v_profile->'configuration','{}'::jsonb),
   v_profile->>'notes',v_pos
  );
  v_pos := v_pos + 1;
 END LOOP;
 RETURN v_order;
END;
$$;

CREATE OR REPLACE FUNCTION public.oms_update_draft_form(
 p_order_id UUID, p_fields JSONB, p_profiles JSONB DEFAULT NULL
) RETURNS public.draft_orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
 v_actor UUID := auth.uid(); v_role TEXT; v_order public.draft_orders;
 v_profile JSONB; v_pos INTEGER := 0;
BEGIN
 IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 SELECT role INTO v_role FROM public.profiles WHERE id=v_actor AND is_active=TRUE;
 SELECT * INTO v_order FROM public.draft_orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Order not found' USING ERRCODE='P0002'; END IF;
 IF v_order.status NOT IN ('DRAFT','draft','PENDING_REVIEW') THEN
  RAISE EXCEPTION 'Use manager metadata endpoint for confirmed orders' USING ERRCODE='42501';
 END IF;
 IF v_actor IS DISTINCT FROM v_order.created_by AND
    v_role NOT IN ('RD','Boss','HeadOfProduction') THEN
  RAISE EXCEPTION 'Not allowed to edit draft order' USING ERRCODE='42501';
 END IF;
 IF jsonb_typeof(p_fields) <> 'object' OR
    (p_profiles IS NOT NULL AND (jsonb_typeof(p_profiles) <> 'array'
      OR jsonb_array_length(p_profiles)>100)) THEN RAISE EXCEPTION 'Invalid order form'; END IF;
 IF p_fields ? 'status' OR p_fields ? 'po_number' OR p_fields ? 'confirmed_at'
    OR p_fields ? 'created_by' THEN RAISE EXCEPTION 'Lifecycle columns are managed separately'; END IF;
 UPDATE public.draft_orders SET
  client=COALESCE(p_fields->>'client', client),
  title=COALESCE(p_fields->>'title',title),
  due_date=CASE WHEN p_fields ? 'due_date' THEN (p_fields->>'due_date')::date ELSE due_date END,
  loading_date=CASE WHEN p_fields ? 'loading_date' THEN (p_fields->>'loading_date')::date ELSE loading_date END,
  priority=COALESCE(p_fields->>'priority',priority),
  notes=CASE WHEN p_fields ? 'notes' THEN p_fields->>'notes' ELSE notes END,
  delivery_preset_id=CASE WHEN p_fields ? 'delivery_preset_id'
   THEN (p_fields->>'delivery_preset_id')::uuid ELSE delivery_preset_id END,
  delivery_address=CASE WHEN p_fields ? 'delivery_address' THEN p_fields->>'delivery_address' ELSE delivery_address END,
  delivery_contact=CASE WHEN p_fields ? 'delivery_contact' THEN p_fields->>'delivery_contact' ELSE delivery_contact END,
  delivery_phone=CASE WHEN p_fields ? 'delivery_phone' THEN p_fields->>'delivery_phone' ELSE delivery_phone END,
  is_rd=COALESCE((p_fields->>'is_rd')::boolean,is_rd),
  rd_notes=CASE WHEN p_fields ? 'rd_notes' THEN p_fields->>'rd_notes' ELSE rd_notes END,
  badges=COALESCE(p_fields->'badges',badges),
  updated_by=v_actor, updated_at=now()
 WHERE id=p_order_id RETURNING * INTO v_order;
 IF p_profiles IS NOT NULL THEN
  DELETE FROM public.order_profiles WHERE draft_order_id=p_order_id;
  FOR v_profile IN SELECT value FROM jsonb_array_elements(p_profiles) LOOP
   INSERT INTO public.order_profiles(
    draft_order_id,profile_template_id,quantity1,quantity2,quantity3,quantity4,
    configuration,notes,order_index
   ) VALUES (
    p_order_id,(v_profile->>'profile_template_id')::uuid,
    COALESCE((v_profile->>'quantity1')::integer,1),
    COALESCE((v_profile->>'quantity2')::integer,0),
    COALESCE((v_profile->>'quantity3')::integer,0),
    COALESCE((v_profile->>'quantity4')::integer,0),
    COALESCE(v_profile->'configuration','{}'::jsonb),v_profile->>'notes',v_pos
   );
   v_pos:=v_pos+1;
  END LOOP;
 END IF;
 RETURN v_order;
END;
$$;

REVOKE ALL ON FUNCTION public.oms_create_draft_form(JSONB,JSONB,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.oms_update_draft_form(UUID,JSONB,JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.oms_create_draft_form(JSONB,JSONB,TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.oms_update_draft_form(UUID,JSONB,JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.oms_create_draft_form(JSONB,JSONB,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.oms_update_draft_form(UUID,JSONB,JSONB) TO authenticated;
COMMIT;
