-- Private-server receiver. No inbound public route, raw updates or credentials are stored here.
-- Apply after the three 20261022 Telegram migrations. Existing webhook settings are unchanged.
BEGIN;

ALTER TABLE public.telegram_system_settings ADD CONSTRAINT telegram_connection_mode_valid
  CHECK (NOT (options ? 'connectionMode') OR coalesce(options->>'connectionMode' IN ('polling','webhook'),false));
ALTER TABLE public.telegram_system_settings ADD CONSTRAINT telegram_poll_wait_valid
  CHECK (NOT (options ? 'pollingTimeoutSeconds') OR coalesce(
    jsonb_typeof(options->'pollingTimeoutSeconds')='number'
    AND (options->>'pollingTimeoutSeconds')::numeric BETWEEN 10 AND 50
    AND (options->>'pollingTimeoutSeconds')::numeric=trunc((options->>'pollingTimeoutSeconds')::numeric),false));

CREATE TABLE public.telegram_receiver_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  bot_id text NOT NULL,
  token_hash text NOT NULL CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  settings_revision timestamptz NOT NULL,
  mode text NOT NULL CHECK (mode IN ('polling','webhook')),
  lease_token uuid,
  lease_until timestamptz,
  next_offset bigint CHECK (next_offset BETWEEN 0 AND 9007199254740991),
  prepared_revision timestamptz,
  prepared_token_hash text,
  last_poll_at timestamptz,
  last_update_at timestamptz,
  failures integer NOT NULL DEFAULT 0 CHECK (failures BETWEEN 0 AND 12),
  retry_at timestamptz,
  last_error text CHECK (last_error IN ('database_unavailable','migration_required','invalid_credentials','bot_mismatch',
    'receiver_conflict','rate_limited','transport_error','invalid_response'))
);
ALTER TABLE public.telegram_receiver_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.telegram_receiver_state FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.telegram_receiver_state TO service_role;

-- Remember an existing bot before its first polling run, so switching bot identity
-- cannot inherit the previous bot's per-chat replay counters.
INSERT INTO public.telegram_receiver_state(singleton,bot_id,token_hash,settings_revision,mode)
SELECT true,split_part(v.decrypted_secret,':',1),encode(sha256(convert_to(v.decrypted_secret,'UTF8')),'hex'),
  s.updated_at,coalesce(s.options->>'connectionMode','webhook')
FROM public.telegram_system_settings s
JOIN vault.decrypted_secrets v ON v.name='reclame_oms_telegram_bot_token'
WHERE s.singleton AND v.decrypted_secret ~ '^[0-9]+:[A-Za-z0-9_-]{20,}$'
ON CONFLICT(singleton) DO NOTHING;

-- Lock order is always settings -> receiver -> the existing per-user command locks.
-- Use clock_timestamp for leases: a slow transaction must not renew an expired lease.
CREATE FUNCTION public.telegram_receiver_current(p_lease_token uuid,p_mode text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_state public.telegram_receiver_state%ROWTYPE; v_options jsonb; v_revision timestamptz; v_token text;
BEGIN
  IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  IF p_lease_token IS NULL THEN RETURN false; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('telegram:settings',0));
  SELECT * INTO v_state FROM public.telegram_receiver_state WHERE singleton FOR UPDATE;
  IF NOT FOUND OR v_state.lease_token IS DISTINCT FROM p_lease_token OR v_state.lease_until IS NULL
    OR v_state.lease_until<=clock_timestamp() THEN RETURN false; END IF;
  SELECT options,updated_at INTO v_options,v_revision FROM public.telegram_system_settings WHERE singleton;
  IF NOT FOUND OR v_revision IS DISTINCT FROM v_state.settings_revision
    OR coalesce(v_options->>'connectionMode','webhook') IS DISTINCT FROM v_state.mode
    OR (p_mode IS NOT NULL AND p_mode IS DISTINCT FROM v_state.mode)
    OR (v_state.mode='polling' AND NOT coalesce((v_options->>'enabled')::boolean,false)) THEN RETURN false; END IF;
  SELECT decrypted_secret INTO v_token FROM vault.decrypted_secrets WHERE name='reclame_oms_telegram_bot_token' LIMIT 1;
  RETURN v_token IS NOT NULL AND encode(sha256(convert_to(v_token,'UTF8')),'hex')=v_state.token_hash;
END $$;

CREATE FUNCTION public.claim_telegram_receiver(p_revision timestamptz,p_token_hash text,p_mode text,p_lease_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_options jsonb; v_revision timestamptz; v_token text; v_bot_id text; v_state public.telegram_receiver_state%ROWTYPE;
BEGIN
  IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  IF p_revision IS NULL OR p_lease_token IS NULL OR p_mode IS NULL OR p_mode NOT IN ('polling','webhook')
    OR p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN RETURN NULL; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('telegram:settings',0));
  SELECT options,updated_at INTO v_options,v_revision FROM public.telegram_system_settings WHERE singleton;
  IF NOT FOUND OR v_revision IS DISTINCT FROM p_revision OR coalesce(v_options->>'connectionMode','webhook')<>p_mode
    OR (p_mode='polling' AND NOT coalesce((v_options->>'enabled')::boolean,false)) THEN RETURN NULL; END IF;
  SELECT decrypted_secret INTO v_token FROM vault.decrypted_secrets WHERE name='reclame_oms_telegram_bot_token' LIMIT 1;
  IF v_token IS NULL OR v_token !~ '^[0-9]+:[A-Za-z0-9_-]{20,}$'
    OR encode(sha256(convert_to(v_token,'UTF8')),'hex')<>p_token_hash THEN RETURN NULL; END IF;
  v_bot_id:=split_part(v_token,':',1);
  SELECT * INTO v_state FROM public.telegram_receiver_state WHERE singleton FOR UPDATE;
  -- Never steal an active lease, even after a configuration change. Its heartbeat
  -- will abort the old HTTP request; a crashed process expires within 90 seconds.
  IF FOUND AND v_state.lease_token IS NOT NULL AND v_state.lease_until>clock_timestamp() THEN RETURN NULL; END IF;
  IF v_state.bot_id=v_bot_id AND v_state.token_hash=p_token_hash AND v_state.settings_revision=p_revision
    AND v_state.retry_at>clock_timestamp() THEN RETURN NULL; END IF;
  IF v_state.bot_id IS DISTINCT FROM v_bot_id THEN
    -- Account links are already revoked by set_telegram_settings on bot changes.
    -- Update IDs are scoped to a bot, not a human's private chat identifier.
    IF v_state.bot_id IS NOT NULL THEN DELETE FROM public.telegram_webhook_state; END IF;
    v_state.next_offset:=NULL; v_state.last_update_at:=NULL; v_state.last_poll_at:=NULL;
    v_state.prepared_revision:=NULL; v_state.prepared_token_hash:=NULL;
  END IF;
  IF v_state.settings_revision IS DISTINCT FROM p_revision OR v_state.token_hash IS DISTINCT FROM p_token_hash THEN
    v_state.failures:=0; v_state.retry_at:=NULL; v_state.last_error:=NULL;
  END IF;
  -- Telegram may randomize update IDs after a week without incoming updates.
  -- Omit offset in this case; never use a negative offset or drop_pending_updates.
  IF v_state.last_update_at<clock_timestamp()-interval '7 days' THEN v_state.next_offset:=NULL; END IF;
  INSERT INTO public.telegram_receiver_state(singleton,bot_id,token_hash,settings_revision,mode,lease_token,lease_until,
    next_offset,prepared_revision,prepared_token_hash,last_poll_at,last_update_at,failures,retry_at,last_error)
  VALUES(true,v_bot_id,p_token_hash,p_revision,p_mode,p_lease_token,clock_timestamp()+interval '90 seconds',
    v_state.next_offset,v_state.prepared_revision,v_state.prepared_token_hash,v_state.last_poll_at,v_state.last_update_at,
    coalesce(v_state.failures,0),v_state.retry_at,v_state.last_error)
  ON CONFLICT(singleton) DO UPDATE SET bot_id=EXCLUDED.bot_id,token_hash=EXCLUDED.token_hash,settings_revision=EXCLUDED.settings_revision,
    mode=EXCLUDED.mode,lease_token=EXCLUDED.lease_token,lease_until=EXCLUDED.lease_until,next_offset=EXCLUDED.next_offset,
    prepared_revision=EXCLUDED.prepared_revision,prepared_token_hash=EXCLUDED.prepared_token_hash,last_poll_at=EXCLUDED.last_poll_at,
    last_update_at=EXCLUDED.last_update_at,failures=EXCLUDED.failures,retry_at=EXCLUDED.retry_at,last_error=EXCLUDED.last_error;
  RETURN jsonb_build_object('token',p_lease_token,'offset',v_state.next_offset,
    'prepared',coalesce(v_state.prepared_revision=p_revision AND v_state.prepared_token_hash=p_token_hash,false),
    'failures',coalesce(v_state.failures,0));
END $$;

CREATE FUNCTION public.renew_telegram_receiver(p_lease_token uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT public.telegram_receiver_current(p_lease_token) THEN RETURN false; END IF;
  UPDATE public.telegram_receiver_state SET lease_until=clock_timestamp()+interval '90 seconds' WHERE singleton;
  RETURN true;
END $$;

CREATE FUNCTION public.prepare_telegram_receiver(p_lease_token uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT public.telegram_receiver_current(p_lease_token,'polling') THEN RETURN false; END IF;
  UPDATE public.telegram_receiver_state SET prepared_revision=settings_revision,prepared_token_hash=token_hash WHERE singleton;
  RETURN true;
END $$;

CREATE FUNCTION public.process_telegram_polled_update(p_lease_token uuid,p_update_id bigint,p_message_at timestamptz,
  p_action text DEFAULT NULL,p_command text DEFAULT NULL,p_chat_id text DEFAULT NULL,p_telegram_user_id text DEFAULT NULL,
  p_argument text DEFAULT '',p_token_hash text DEFAULT NULL,p_username text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_offset bigint; v_reply uuid;
BEGIN
  IF NOT public.telegram_receiver_current(p_lease_token,'polling') THEN RETURN jsonb_build_object('accepted',false); END IF;
  IF p_update_id IS NULL OR p_update_id<0 OR p_update_id>=9007199254740991 THEN
    RAISE EXCEPTION 'Invalid update identifier' USING ERRCODE='22023'; END IF;
  SELECT next_offset INTO v_offset FROM public.telegram_receiver_state WHERE singleton;
  IF v_offset IS NOT NULL AND p_update_id<v_offset THEN
    RETURN jsonb_build_object('accepted',true,'nextOffset',v_offset); END IF;
  -- No duplicate authorization model: both transports call these exact routines.
  IF p_action='command' THEN
    v_reply:=public.process_telegram_bot_command(p_update_id,p_message_at,p_command,p_chat_id,p_telegram_user_id,p_argument);
  ELSIF p_action IN ('connect','disconnect') THEN
    PERFORM public.process_telegram_update(p_update_id=>p_update_id,p_message_at=>p_message_at,p_command=>p_action,
      p_chat_id=>p_chat_id,p_telegram_user_id=>p_telegram_user_id,p_token_hash=>p_token_hash,p_username=>p_username);
  ELSIF p_action IS NOT NULL THEN
    RAISE EXCEPTION 'Invalid update action' USING ERRCODE='22023';
  END IF;
  UPDATE public.telegram_receiver_state SET next_offset=p_update_id+1,last_update_at=clock_timestamp() WHERE singleton;
  RETURN jsonb_build_object('accepted',true,'nextOffset',p_update_id+1,'replyId',v_reply);
END $$;

CREATE FUNCTION public.record_telegram_receiver_poll(p_lease_token uuid,p_error text DEFAULT NULL,p_retry_seconds integer DEFAULT 0)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT public.telegram_receiver_current(p_lease_token,'polling') THEN RETURN false; END IF;
  IF p_error IS NULL THEN
    UPDATE public.telegram_receiver_state SET last_poll_at=clock_timestamp(),failures=0,last_error=NULL,retry_at=NULL WHERE singleton;
  ELSE
    IF p_error NOT IN ('database_unavailable','migration_required','invalid_credentials','bot_mismatch','receiver_conflict',
      'rate_limited','transport_error','invalid_response') THEN RAISE EXCEPTION 'Invalid diagnostic' USING ERRCODE='22023'; END IF;
    UPDATE public.telegram_receiver_state SET failures=least(failures+1,12),last_error=p_error,
      retry_at=clock_timestamp()+make_interval(secs=>greatest(1,least(coalesce(p_retry_seconds,5),86400))) WHERE singleton;
  END IF;
  RETURN true;
END $$;

CREATE FUNCTION public.release_telegram_receiver(p_lease_token uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  -- Release even if settings changed; never release a successor's lease.
  UPDATE public.telegram_receiver_state SET lease_token=NULL,lease_until=NULL WHERE singleton AND lease_token=p_lease_token;
  RETURN FOUND;
END $$;

CREATE FUNCTION public.telegram_receiver_status() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_state public.telegram_receiver_state%ROWTYPE; v_options jsonb; v_revision timestamptz; v_status text;
BEGIN
  IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  SELECT options,updated_at INTO v_options,v_revision FROM public.telegram_system_settings WHERE singleton;
  SELECT * INTO v_state FROM public.telegram_receiver_state WHERE singleton;
  v_status:=CASE
    WHEN NOT coalesce((v_options->>'enabled')::boolean,false) THEN 'disabled'
    WHEN coalesce(v_options->>'connectionMode','webhook')='webhook' THEN 'webhook'
    WHEN v_state.settings_revision IS DISTINCT FROM v_revision THEN 'waiting'
    WHEN v_state.retry_at>clock_timestamp() THEN 'backoff'
    WHEN v_state.lease_token IS NOT NULL AND v_state.lease_until>clock_timestamp() THEN 'polling'
    ELSE 'waiting' END;
  RETURN jsonb_build_object('available',true,'state',v_status,'lastPollAt',v_state.last_poll_at,'lastUpdateAt',v_state.last_update_at,
    'lastError',CASE WHEN v_state.settings_revision=v_revision THEN v_state.last_error ELSE NULL END,
    'retryAt',CASE WHEN v_state.settings_revision=v_revision THEN v_state.retry_at ELSE NULL END);
END $$;

REVOKE ALL ON FUNCTION public.telegram_receiver_current(uuid,text),public.claim_telegram_receiver(timestamptz,text,text,uuid),
  public.renew_telegram_receiver(uuid),public.prepare_telegram_receiver(uuid),
  public.process_telegram_polled_update(uuid,bigint,timestamptz,text,text,text,text,text,text,text),
  public.record_telegram_receiver_poll(uuid,text,integer),public.release_telegram_receiver(uuid),public.telegram_receiver_status()
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.telegram_receiver_current(uuid,text),public.claim_telegram_receiver(timestamptz,text,text,uuid),
  public.renew_telegram_receiver(uuid),public.prepare_telegram_receiver(uuid),
  public.process_telegram_polled_update(uuid,bigint,timestamptz,text,text,text,text,text,text,text),
  public.record_telegram_receiver_poll(uuid,text,integer),public.release_telegram_receiver(uuid),public.telegram_receiver_status()
  TO service_role;
SELECT pg_notify('pgrst','reload schema');
COMMIT;
