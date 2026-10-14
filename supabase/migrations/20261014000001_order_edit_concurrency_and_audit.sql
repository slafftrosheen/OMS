-- OMS-R17: requires R12 atomic draft form migration.
BEGIN;
-- Guard exact revision under the same order row lock as the R12 updater.
CREATE OR REPLACE FUNCTION public.oms_update_draft_form(
  p_order_id UUID, p_fields JSONB, p_profiles JSONB,
  p_expected_updated_at TIMESTAMPTZ
) RETURNS public.draft_orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_current public.draft_orders;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
  END IF;
  IF p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'Order revision required' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_current FROM public.draft_orders
    WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE='P0002';
  END IF;
  IF v_current.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'Order changed since it was opened' USING ERRCODE='P0001';
  END IF;
  -- R12 preserves role/status checks and atomic form/profile replacement.
  RETURN public.oms_update_draft_form(p_order_id,p_fields,p_profiles);
END;
$$;
REVOKE ALL ON FUNCTION public.oms_update_draft_form(UUID,JSONB,JSONB)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.oms_update_draft_form(UUID,JSONB,JSONB,TIMESTAMPTZ)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oms_update_draft_form(UUID,JSONB,JSONB,TIMESTAMPTZ)
  TO authenticated;

-- Client telemetry is tagged, bounded, and attributed by the database.
CREATE OR REPLACE FUNCTION public.oms_log_client_event(
  p_section TEXT, p_action TEXT, p_details TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_actor UUID := auth.uid(); v_name TEXT; v_event UUID;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
  END IF;
  SELECT username INTO v_name FROM public.profiles
    WHERE id=v_actor AND is_active=TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active user required' USING ERRCODE='42501';
  END IF;
  IF p_section IS NULL OR p_section !~ '^[a-zA-Z][a-zA-Z0-9._-]{0,63}$'
    OR p_action IS NULL OR p_action !~ '^[a-zA-Z][a-zA-Z0-9._-]{0,63}$'
    OR length(COALESCE(p_details,''))>1000 THEN
    RAISE EXCEPTION 'Invalid client event' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.audit_log(
    user_id,username,action,entity_type,entity_id,old_values,new_values
  ) VALUES (
    v_actor,v_name,'ui:'||p_action,'ui:'||p_section,
    NULL,NULL,jsonb_build_object('details',COALESCE(p_details,''))
  ) RETURNING id INTO v_event;
  RETURN v_event;
END;
$$;
-- Generic trusted audit rows must not be forged through a public RPC.
REVOKE ALL ON FUNCTION public.create_audit_log(TEXT,TEXT,UUID,JSONB,JSONB)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.oms_log_client_event(TEXT,TEXT,TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oms_log_client_event(TEXT,TEXT,TEXT)
  TO authenticated;
COMMIT;
