-- Menu /ask prompts for a subsequent question without treating all chat as AI input.
BEGIN;
CREATE TABLE public.telegram_ask_sessions (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  connection_version uuid NOT NULL,
  actor_role text NOT NULL,
  settings_revision timestamptz NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '5 minutes'
);
ALTER TABLE public.telegram_ask_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.telegram_ask_sessions FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION public.process_telegram_bot_command(bigint,timestamptz,text,text,text,text)
  RENAME TO process_telegram_bot_command_before_sessions;
REVOKE ALL ON FUNCTION public.process_telegram_bot_command_before_sessions(bigint,timestamptz,text,text,text,text)
  FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.process_telegram_bot_command(p_update_id bigint,p_message_at timestamptz,p_command text,
  p_chat_id text,p_telegram_user_id text,p_argument text DEFAULT '')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.telegram_connections%ROWTYPE; v_role text; v_reply uuid; v_last_ai timestamptz;
  v_revision timestamptz; v_prompt boolean:=p_command='ask' AND p_argument='';
BEGIN
  IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  SELECT * INTO c FROM public.telegram_connections WHERE chat_id=p_chat_id AND telegram_user_id=p_telegram_user_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  -- Keep the same chat -> account lock order as the existing command processor.
  PERFORM pg_advisory_xact_lock(hashtextextended('telegram:'||p_chat_id,0));
  PERFORM pg_advisory_xact_lock(hashtextextended(c.user_id::text,0));
  SELECT role INTO v_role FROM public.profiles WHERE id=c.user_id AND is_active;
  SELECT updated_at INTO v_revision FROM public.telegram_system_settings WHERE singleton;
  IF p_command='ask_followup' THEN
    IF p_argument IS NULL OR length(trim(p_argument))=0 OR NOT EXISTS (
      SELECT 1 FROM public.telegram_ask_sessions s WHERE s.user_id=c.user_id
        AND s.connection_version=c.version AND s.actor_role=v_role AND s.settings_revision=v_revision
        AND s.expires_at>now() AND p_message_at>=s.opened_at-interval '1 second'
    ) THEN RETURN NULL; END IF;
  END IF;
  SELECT last_ai_at INTO v_last_ai FROM public.telegram_webhook_state WHERE chat_id=p_chat_id;
  v_reply:=public.process_telegram_bot_command_before_sessions(p_update_id,p_message_at,
    CASE WHEN p_command='ask_followup' THEN 'ask' ELSE p_command END,p_chat_id,p_telegram_user_id,p_argument);
  IF v_reply IS NULL THEN RETURN NULL; END IF;
  DELETE FROM public.telegram_ask_sessions WHERE user_id=c.user_id;
  IF v_prompt THEN
    -- A prompt does not invoke AI or consume the per-minute inference allowance.
    UPDATE public.telegram_webhook_state SET last_ai_at=v_last_ai WHERE chat_id=p_chat_id;
    UPDATE public.telegram_bot_replies SET payload=jsonb_build_object('kind','ask_prompt','locale',payload->>'locale',
      'personalAiAllowed',payload->'personalAiAllowed','personalAiDisabled',payload->'personalAiDisabled'),order_ids='{}'
      WHERE id=v_reply;
    INSERT INTO public.telegram_ask_sessions(user_id,connection_version,actor_role,settings_revision)
      VALUES(c.user_id,c.version,v_role,v_revision);
  END IF;
  RETURN v_reply;
END $$;
REVOKE ALL ON FUNCTION public.process_telegram_bot_command(bigint,timestamptz,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.process_telegram_bot_command(bigint,timestamptz,text,text,text,text) TO service_role;
SELECT pg_notify('pgrst','reload schema');
COMMIT;
