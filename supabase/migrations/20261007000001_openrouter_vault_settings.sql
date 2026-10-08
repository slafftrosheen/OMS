-- Store the system-wide OpenRouter API credential in Supabase Vault.
-- Public RPC wrappers are executable only by service_role, so Vault does not
-- need to be added to PostgREST's exposed schemas.
CREATE OR REPLACE FUNCTION public.get_openrouter_api_key()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT decrypted_secret
  FROM vault.decrypted_secrets
  WHERE name = 'reclame_oms_openrouter_api_key'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.set_openrouter_api_key(p_api_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  existing_id uuid;
BEGIN
  IF p_api_key IS NULL OR length(btrim(p_api_key)) = 0 OR length(p_api_key) > 512 OR p_api_key ~ '\s' THEN
    RAISE EXCEPTION 'Invalid OpenRouter API key';
  END IF;

  SELECT id INTO existing_id
  FROM vault.secrets
  WHERE name = 'reclame_oms_openrouter_api_key'
  LIMIT 1;

  IF existing_id IS NULL THEN
    PERFORM vault.create_secret(
      p_api_key,
      'reclame_oms_openrouter_api_key',
      'System-wide OpenRouter API key managed by R&D',
      NULL
    );
  ELSE
    PERFORM vault.update_secret(
      existing_id,
      p_api_key,
      'reclame_oms_openrouter_api_key',
      'System-wide OpenRouter API key managed by R&D',
      NULL
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_openrouter_api_key()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  DELETE FROM vault.secrets WHERE name = 'reclame_oms_openrouter_api_key';
$$;

REVOKE ALL ON FUNCTION public.get_openrouter_api_key() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_openrouter_api_key(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_openrouter_api_key() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_openrouter_api_key() TO service_role;
GRANT EXECUTE ON FUNCTION public.set_openrouter_api_key(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_openrouter_api_key() TO service_role;

SELECT pg_notify('pgrst', 'reload schema');
COMMENT ON FUNCTION public.get_openrouter_api_key() IS 'Server-only Vault lookup; execute via service_role only.';
COMMENT ON FUNCTION public.set_openrouter_api_key(text) IS 'Server-only encrypted Vault update; application enforces RD role.';
COMMENT ON FUNCTION public.delete_openrouter_api_key() IS 'Server-only Vault removal; application enforces RD role.';

-- Apply from the project migration runner. Do not add Vault to exposed API schemas.
-- Test RBAC using service_role and ensure anon/authenticated execution is denied.
