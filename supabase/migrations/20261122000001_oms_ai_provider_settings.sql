-- R&D chooses the company inference provider. NULL preserves the deployment defaults.
ALTER TABLE public.openrouter_system_policy
  ADD COLUMN IF NOT EXISTS active_provider text CHECK (active_provider IN ('openrouter', 'openai')),
  ADD COLUMN IF NOT EXISTS openai_text_model text CHECK (openai_text_model ~ '^[A-Za-z0-9][A-Za-z0-9._-]{2,149}$'),
  ADD COLUMN IF NOT EXISTS openai_vision_model text CHECK (openai_vision_model ~ '^[A-Za-z0-9][A-Za-z0-9._-]{2,149}$');

CREATE OR REPLACE FUNCTION public.get_oms_openai_api_key()
RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets
  WHERE name = 'reclame_oms_openai_api_key' LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.set_oms_ai_provider(
  p_provider text, p_text_model text, p_vision_model text,
  p_api_key text, p_remove_key boolean
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  existing_id uuid;
BEGIN
  IF p_provider IS NULL OR p_provider NOT IN ('openrouter', 'openai')
     OR p_text_model IS NULL OR p_text_model !~ '^[A-Za-z0-9][A-Za-z0-9._-]{2,149}$'
     OR p_vision_model IS NULL OR p_vision_model !~ '^[A-Za-z0-9][A-Za-z0-9._-]{2,149}$'
     OR p_remove_key IS NULL
     OR (p_api_key IS NOT NULL AND (p_remove_key OR length(p_api_key) > 512 OR p_api_key !~ '^sk-[A-Za-z0-9_-]+$')) THEN
    RAISE EXCEPTION 'Invalid AI provider configuration';
  END IF;

  -- Lock the singleton before mutating its Vault secret to serialize concurrent rotations.
  UPDATE public.openrouter_system_policy
  SET active_provider = p_provider, openai_text_model = p_text_model, openai_vision_model = p_vision_model
  WHERE singleton = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'AI provider policy missing'; END IF;

  IF p_remove_key THEN
    DELETE FROM vault.secrets WHERE name = 'reclame_oms_openai_api_key';
  ELSIF p_api_key IS NOT NULL THEN
    SELECT id INTO existing_id FROM vault.secrets WHERE name = 'reclame_oms_openai_api_key' LIMIT 1;
    IF existing_id IS NULL THEN
      PERFORM vault.create_secret(p_api_key, 'reclame_oms_openai_api_key', 'OpenAI API key managed by R&D', NULL);
    ELSE
      PERFORM vault.update_secret(existing_id, p_api_key, 'reclame_oms_openai_api_key', 'OpenAI API key managed by R&D', NULL);
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_oms_openai_api_key() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_oms_ai_provider(text,text,text,text,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_oms_openai_api_key() TO service_role;
GRANT EXECUTE ON FUNCTION public.set_oms_ai_provider(text,text,text,text,boolean) TO service_role;
SELECT pg_notify('pgrst', 'reload schema');
