-- supabase/002_deactivate_user_rpc.sql
CREATE OR REPLACE FUNCTION deactivate_user_and_log(
  user_id_to_deactivate UUID,
  deactivated_by_username TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Deactivate the user
  UPDATE auth.users
  SET raw_user_meta_data = raw_user_meta_data || '{"is_active": false}'
  WHERE id = user_id_to_deactivate;

  -- Invalidate all sessions for the user
  DELETE FROM auth.sessions
  WHERE user_id = user_id_to_deactivate;

  -- Log the audit event
  INSERT INTO public.audit_log (username, action, entity_type, entity_id)
  VALUES (deactivated_by_username, 'USER_DEACTIVATED', 'user', user_id_to_deactivate);
END;
$$;
