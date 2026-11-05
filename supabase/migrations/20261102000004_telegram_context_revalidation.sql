-- Revalidate aggregate results before inference/delivery; prompts do not consume AI cooldown.
BEGIN;
CREATE TABLE oms_telegram_private.context_queries (
 reply_id uuid NOT NULL REFERENCES public.telegram_bot_replies(id) ON DELETE CASCADE,
 source text NOT NULL,mode text NOT NULL,filters jsonb NOT NULL,group_field text NOT NULL,result_hash text NOT NULL,
 PRIMARY KEY(reply_id,source,mode,filters,group_field)
);
CREATE OR REPLACE FUNCTION public.telegram_bot_read_context(p_id uuid,p_claim_token uuid,p_source text,p_mode text DEFAULT 'rows',
 p_filters jsonb DEFAULT '[]',p_group text DEFAULT NULL,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.telegram_bot_replies%ROWTYPE; result jsonb; spec jsonb; item jsonb;
 old_claims text:=current_setting('request.jwt.claims',true); old_sub text:=current_setting('request.jwt.claim.sub',true);
 old_role text:=current_setting('request.jwt.claim.role',true);
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
 IF public.telegram_bot_reply_payload(p_id,p_claim_token) IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO r FROM public.telegram_bot_replies WHERE id=p_id AND claim_token=p_claim_token AND status='processing' AND command='ask'
   AND coalesce((payload->>'personalAiAllowed')::boolean,false) AND NOT coalesce((payload->>'personalAiDisabled')::boolean,false);
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.openrouter_system_policy WHERE singleton AND enabled) THEN RETURN NULL; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',r.user_id,'role','authenticated')::text,true);
 PERFORM set_config('request.jwt.claim.sub',r.user_id::text,true);
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
 result:=oms_telegram_private.read_source(p_source,p_mode,p_filters,p_group,p_offset);
 PERFORM set_config('request.jwt.claims',coalesce(old_claims,''),true);
 PERFORM set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);
 PERFORM set_config('request.jwt.claim.role',coalesce(old_role,''),true);
 IF p_mode IN ('count','summary') THEN
   INSERT INTO oms_telegram_private.context_queries(reply_id,source,mode,filters,group_field,result_hash)
     VALUES(p_id,p_source,p_mode,p_filters,coalesce(p_group,''),md5((result-'observedAt')::text))
     ON CONFLICT(reply_id,source,mode,filters,group_field) DO UPDATE SET result_hash=EXCLUDED.result_hash;
 END IF;
 -- Persist only identity dependencies; do not duplicate private message bodies.
 spec:=oms_telegram_private.sources()->p_source;
 FOR item IN SELECT value FROM jsonb_array_elements(coalesce(result->'rows','[]')) LOOP
   INSERT INTO oms_telegram_private.context_reads VALUES(p_id,p_source,item->>(spec->>'key')) ON CONFLICT DO NOTHING;
 END LOOP;
 IF public.telegram_bot_reply_payload(p_id,p_claim_token) IS NULL THEN RETURN NULL; END IF;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.telegram_bot_context_current(p_id uuid,p_claim_token uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid; dep record; valid boolean:=true;
 observed jsonb;
 old_claims text:=current_setting('request.jwt.claims',true); old_sub text:=current_setting('request.jwt.claim.sub',true);
 old_role text:=current_setting('request.jwt.claim.role',true);
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
 IF public.telegram_bot_reply_payload_before_context(p_id,p_claim_token) IS NULL THEN RETURN false; END IF;
 SELECT user_id INTO uid FROM public.telegram_bot_replies WHERE id=p_id AND claim_token=p_claim_token AND status='processing';
 IF uid IS NULL THEN RETURN false; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
 PERFORM set_config('request.jwt.claim.sub',uid::text,true);
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
 FOR dep IN SELECT source,array_agg(record_key) AS keys FROM oms_telegram_private.context_reads WHERE reply_id=p_id GROUP BY source LOOP
   IF NOT oms_telegram_private.records_visible(dep.source,dep.keys) THEN valid:=false; EXIT; END IF;
 END LOOP;
 IF valid THEN
  FOR dep IN SELECT * FROM oms_telegram_private.context_queries WHERE reply_id=p_id LOOP
   observed:=oms_telegram_private.read_source(dep.source,dep.mode,dep.filters,dep.group_field,0);
   IF md5((observed-'observedAt')::text) IS DISTINCT FROM dep.result_hash THEN valid:=false; EXIT; END IF;
  END LOOP;
 END IF;
 PERFORM set_config('request.jwt.claims',coalesce(old_claims,''),true);
 PERFORM set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);
 PERFORM set_config('request.jwt.claim.role',coalesce(old_role,''),true);
 RETURN valid;
END $$;
CREATE OR REPLACE FUNCTION oms_telegram_private.clear_context_reads() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.status IN ('sent','failed','cancelled') THEN
  DELETE FROM oms_telegram_private.context_reads WHERE reply_id=NEW.id;
  DELETE FROM oms_telegram_private.context_queries WHERE reply_id=NEW.id;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.process_telegram_bot_command(p_update_id bigint,p_message_at timestamptz,p_command text,
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
  IF v_prompt THEN UPDATE public.telegram_webhook_state SET last_ai_at=NULL WHERE chat_id=p_chat_id; END IF;
  v_reply:=public.process_telegram_bot_command_before_sessions(p_update_id,p_message_at,
    CASE WHEN p_command='ask_followup' THEN 'ask' ELSE p_command END,p_chat_id,p_telegram_user_id,p_argument);
  IF v_prompt THEN UPDATE public.telegram_webhook_state SET last_ai_at=v_last_ai WHERE chat_id=p_chat_id; END IF;
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
SELECT pg_notify('pgrst','reload schema');
COMMIT;
