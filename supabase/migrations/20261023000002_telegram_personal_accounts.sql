-- Two-sided linking, personal delivery controls and claim-scoped read-only AI.
-- Apply AFTER 20261023000001_telegram_polling.sql. Existing connections are retained.
BEGIN;

CREATE TABLE public.telegram_personal_preferences (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  notification_categories text[] NOT NULL DEFAULT ARRAY['ORDER','CHAT','INVENTORY','SYSTEM']::text[]
    CHECK (cardinality(notification_categories)<=4 AND notification_categories <@ ARRAY['ORDER','CHAT','INVENTORY','SYSTEM']::text[]
      AND array_position(notification_categories,NULL) IS NULL),
  preview_mode text NOT NULL DEFAULT 'full' CHECK (preview_mode IN ('full','private')),
  ai_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.telegram_personal_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.telegram_personal_preferences FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.telegram_personal_preferences TO service_role;

ALTER TABLE public.telegram_link_tokens
  ADD COLUMN request_id uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN candidate_chat_id text,
  ADD COLUMN candidate_user_id text,
  ADD COLUMN candidate_username text,
  ADD COLUMN candidate_at timestamptz,
  ADD CONSTRAINT telegram_link_candidate_valid CHECK (
    (candidate_chat_id IS NULL AND candidate_user_id IS NULL AND candidate_username IS NULL AND candidate_at IS NULL)
    OR (candidate_chat_id IS NOT NULL AND candidate_chat_id ~ '^[1-9][0-9]{0,15}$'
      AND candidate_user_id IS NOT NULL AND candidate_user_id=candidate_chat_id AND candidate_at IS NOT NULL
      AND (candidate_username IS NULL OR candidate_username ~ '^[A-Za-z0-9_]{1,32}$')));
CREATE UNIQUE INDEX telegram_link_request_id ON public.telegram_link_tokens(request_id);
CREATE INDEX telegram_link_candidate_chat ON public.telegram_link_tokens(candidate_chat_id) WHERE candidate_chat_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.prepare_telegram_link(p_user_id uuid,p_token_hash text)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_until timestamptz:=now()+interval '10 minutes';
BEGIN
  IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Invalid token digest' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user_id AND is_active=true) THEN RAISE EXCEPTION 'Active user required' USING ERRCODE='42501'; END IF;
  IF EXISTS(SELECT 1 FROM public.telegram_connections WHERE user_id=p_user_id) THEN RAISE EXCEPTION 'already_linked' USING ERRCODE='P0001'; END IF;
  IF EXISTS(SELECT 1 FROM public.telegram_link_tokens WHERE user_id=p_user_id AND created_at>now()-interval '30 seconds') THEN
    RAISE EXCEPTION 'link_rate_limited' USING ERRCODE='P0001'; END IF;
  INSERT INTO public.telegram_link_tokens(user_id,token_hash,expires_at) VALUES(p_user_id,p_token_hash,v_until)
  ON CONFLICT(user_id) DO UPDATE SET token_hash=EXCLUDED.token_hash,expires_at=EXCLUDED.expires_at,created_at=now(),
    request_id=gen_random_uuid(),candidate_chat_id=NULL,candidate_user_id=NULL,candidate_username=NULL,candidate_at=NULL;
  RETURN v_until;
END $$;

-- A /start bearer link may nominate a Telegram identity, never grant access by itself.
-- Both webhook and polling continue to invoke this existing shared entry point.
CREATE OR REPLACE FUNCTION public.consume_telegram_link(p_token_hash text,p_chat_id text,p_telegram_user_id text,p_username text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_user_id uuid;
BEGIN
  IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  IF p_chat_id IS NULL OR p_chat_id !~ '^[1-9][0-9]{0,15}$' OR p_telegram_user_id IS DISTINCT FROM p_chat_id
    OR (p_username IS NOT NULL AND p_username !~ '^[A-Za-z0-9_]{1,32}$') THEN RETURN false; END IF;
  SELECT user_id INTO v_user_id FROM public.telegram_link_tokens WHERE token_hash=p_token_hash AND expires_at>now();
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('telegram:'||p_chat_id,0));
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::text,0));
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=v_user_id AND is_active=true)
    OR EXISTS(SELECT 1 FROM public.telegram_connections WHERE user_id=v_user_id OR chat_id=p_chat_id) THEN RETURN false; END IF;
  UPDATE public.telegram_link_tokens SET candidate_chat_id=p_chat_id,candidate_user_id=p_telegram_user_id,
    candidate_username=p_username,candidate_at=coalesce(candidate_at,now())
    WHERE user_id=v_user_id AND token_hash=p_token_hash AND expires_at>now()
      AND (candidate_chat_id IS NULL OR candidate_chat_id=p_chat_id);
  RETURN FOUND;
END $$;

-- Only the active OMS session's account ID is passed by the application route.
CREATE FUNCTION public.confirm_telegram_link(p_user_id uuid,p_request_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_link public.telegram_link_tokens%ROWTYPE;
BEGIN
  IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_link FROM public.telegram_link_tokens WHERE user_id=p_user_id AND request_id=p_request_id AND expires_at>now();
  IF NOT FOUND OR v_link.candidate_chat_id IS NULL THEN RETURN false; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('telegram:'||v_link.candidate_chat_id,0));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
  SELECT * INTO v_link FROM public.telegram_link_tokens WHERE user_id=p_user_id AND request_id=p_request_id AND expires_at>now() FOR UPDATE;
  IF NOT FOUND OR v_link.candidate_chat_id IS NULL
    OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user_id AND is_active=true)
    OR EXISTS(SELECT 1 FROM public.telegram_connections WHERE user_id=p_user_id OR chat_id=v_link.candidate_chat_id) THEN RETURN false; END IF;
  UPDATE public.telegram_deliveries SET status='cancelled',completed_at=now(),claim_token=NULL,locked_at=NULL
    WHERE user_id=p_user_id AND status IN ('pending','processing');
  UPDATE public.telegram_bot_replies SET status='cancelled',payload='{}',order_ids='{}',completed_at=now(),claim_token=NULL,locked_at=NULL
    WHERE user_id=p_user_id AND status IN ('pending','processing');
  INSERT INTO public.telegram_connections(user_id,chat_id,telegram_user_id,username,enabled)
    VALUES(p_user_id,v_link.candidate_chat_id,v_link.candidate_user_id,v_link.candidate_username,true);
  DELETE FROM public.telegram_link_tokens WHERE user_id=p_user_id AND request_id=p_request_id;
  RETURN true;
END $$;

-- /stop must also cancel an unconfirmed handshake. It never disconnects an
-- unrelated account by accepting an arbitrary user ID from Telegram text.
ALTER FUNCTION public.disconnect_telegram(uuid,text) RENAME TO disconnect_telegram_before_personal;
REVOKE ALL ON FUNCTION public.disconnect_telegram_before_personal(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.disconnect_telegram(p_user_id uuid DEFAULT NULL,p_chat_id text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_user_id uuid; v_ok boolean;
BEGIN
  IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  IF (p_user_id IS NULL)=(p_chat_id IS NULL) THEN RETURN false; END IF;
  IF p_chat_id IS NOT NULL THEN
    IF p_chat_id !~ '^[1-9][0-9]{0,15}$' THEN RETURN false; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('telegram:'||p_chat_id,0));
    FOR v_user_id IN SELECT user_id FROM (
      SELECT user_id FROM public.telegram_link_tokens WHERE candidate_chat_id=p_chat_id
      UNION SELECT user_id FROM public.telegram_connections WHERE chat_id=p_chat_id
    ) affected ORDER BY user_id LOOP
      PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::text,0));
    END LOOP;
    DELETE FROM public.telegram_link_tokens WHERE candidate_chat_id=p_chat_id;
    SELECT user_id INTO v_user_id FROM public.telegram_connections WHERE chat_id=p_chat_id;
  ELSE v_user_id:=p_user_id;
  END IF;
  IF v_user_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::text,0));
    UPDATE public.telegram_bot_replies SET status='cancelled',payload='{}',order_ids='{}',completed_at=now(),claim_token=NULL,locked_at=NULL
      WHERE user_id=v_user_id AND status IN ('pending','processing');
  END IF;
  v_ok:=public.disconnect_telegram_before_personal(p_user_id,p_chat_id);
  RETURN v_ok;
END $$;

CREATE FUNCTION public.telegram_notification_category(p_type text,p_source text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT CASE WHEN p_source='inventory' OR p_type ~* '^(inventory|low_stock)' THEN 'INVENTORY'
    WHEN p_source='chat' OR p_type ~* '^(chat|message|mention)' THEN 'CHAT'
    WHEN p_source IN ('order','stage') OR p_type ~* '^(order|station|stage|loading|rework|assignment|consumption)' THEN 'ORDER'
    ELSE 'SYSTEM' END;
$$;
CREATE OR REPLACE FUNCTION public.telegram_notification_allowed(p_type text,p_source text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_options jsonb;
BEGIN
  SELECT options INTO v_options FROM public.telegram_system_settings WHERE singleton;
  IF NOT FOUND THEN RETURN true; END IF;
  RETURN coalesce((v_options->>'enabled')::boolean,false)
    AND coalesce(v_options->'notificationCategories','["ORDER","CHAT","INVENTORY","SYSTEM"]'::jsonb)
      ? public.telegram_notification_category(p_type,p_source);
END $$;

CREATE FUNCTION public.telegram_notification_for_account(p_notification_id uuid,p_user_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_note public.notifications%ROWTYPE; v_categories text[]; v_role text;
BEGIN
  IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  SELECT n.* INTO v_note FROM public.notifications n WHERE n.id=p_notification_id AND n.user_id=p_user_id;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT role INTO v_role FROM public.profiles WHERE id=p_user_id AND is_active=true;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT notification_categories INTO v_categories FROM public.telegram_personal_preferences WHERE user_id=p_user_id;
  IF NOT (public.telegram_notification_category(v_note.notification_type,v_note.source_type)=ANY(
    coalesce(v_categories,ARRAY['ORDER','CHAT','INVENTORY','SYSTEM']::text[]))) THEN RETURN false; END IF;
  -- A previously delivered in-app event is not continuing authorization for a
  -- private order after a role or creator/visibility change.
  IF v_note.source_type='order' AND v_note.source_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.draft_orders o WHERE o.id=v_note.source_id
      AND public.telegram_order_visible(o.status,o.created_by,p_user_id,v_role)) THEN RETURN false; END IF;
  RETURN true;
END $$;

ALTER FUNCTION public.enqueue_telegram_notifications(uuid[]) RENAME TO enqueue_telegram_notifications_before_personal;
REVOKE ALL ON FUNCTION public.enqueue_telegram_notifications_before_personal(uuid[]) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.enqueue_telegram_notifications(p_notification_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_ids uuid[];
BEGIN
  IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  SELECT coalesce(array_agg(n.id),'{}'::uuid[]) INTO v_ids FROM public.notifications n
    WHERE n.id=ANY(p_notification_ids) AND public.telegram_notification_for_account(n.id,n.user_id);
  RETURN public.enqueue_telegram_notifications_before_personal(v_ids);
END $$;

ALTER FUNCTION public.telegram_delivery_payload(uuid,uuid) RENAME TO telegram_delivery_payload_before_personal;
REVOKE ALL ON FUNCTION public.telegram_delivery_payload_before_personal(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.telegram_delivery_payload(p_id uuid,p_claim_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_payload jsonb; v_user_id uuid; v_notification_id uuid; v_preview text; v_locale text;
BEGIN
  IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  v_payload:=public.telegram_delivery_payload_before_personal(p_id,p_claim_token);
  IF v_payload IS NULL THEN RETURN NULL; END IF;
  SELECT user_id,notification_id INTO v_user_id,v_notification_id FROM public.telegram_deliveries WHERE id=p_id AND claim_token=p_claim_token;
  IF NOT FOUND OR NOT public.telegram_notification_for_account(v_notification_id,v_user_id) THEN RETURN NULL; END IF;
  SELECT preview_mode INTO v_preview FROM public.telegram_personal_preferences WHERE user_id=v_user_id;
  IF v_preview='private' THEN
    SELECT locale INTO v_locale FROM public.user_preferences WHERE user_id=v_user_id;
    v_payload:=jsonb_set(v_payload,'{notification}',jsonb_build_object('id',v_notification_id,
      'title',CASE v_locale WHEN 'ru' THEN 'Новое уведомление OMS' WHEN 'lv' THEN 'Jauns OMS paziņojums' ELSE 'New OMS notification' END,
      'message',NULL,'link',v_payload#>'{notification,link}'));
  END IF;
  RETURN v_payload;
END $$;

CREATE FUNCTION public.set_telegram_personal_preferences(p_user_id uuid,p_categories text[],p_preview_mode text,p_ai_enabled boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_categories text[];
BEGIN
  IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  IF p_categories IS NULL OR cardinality(p_categories)>4 OR array_position(p_categories,NULL) IS NOT NULL
    OR NOT (p_categories <@ ARRAY['ORDER','CHAT','INVENTORY','SYSTEM']::text[]) OR p_preview_mode IS NULL
    OR p_preview_mode NOT IN ('full','private') OR p_ai_enabled IS NULL THEN RAISE EXCEPTION 'Invalid preferences' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user_id AND is_active=true) THEN RETURN false; END IF;
  SELECT coalesce(array_agg(x ORDER BY ord),'{}'::text[]) INTO v_categories
    FROM unnest(ARRAY['ORDER','CHAT','INVENTORY','SYSTEM']::text[]) WITH ORDINALITY AS choices(x,ord) WHERE x=ANY(p_categories);
  INSERT INTO public.telegram_personal_preferences(user_id,notification_categories,preview_mode,ai_enabled)
    VALUES(p_user_id,v_categories,p_preview_mode,p_ai_enabled)
    ON CONFLICT(user_id) DO UPDATE SET notification_categories=EXCLUDED.notification_categories,preview_mode=EXCLUDED.preview_mode,
      ai_enabled=EXCLUDED.ai_enabled,updated_at=now();
  UPDATE public.telegram_deliveries d SET status='cancelled',completed_at=now(),claim_token=NULL,locked_at=NULL
    WHERE d.user_id=p_user_id AND d.status IN ('pending','processing','failed')
      AND NOT public.telegram_notification_for_account(d.notification_id,p_user_id);
  IF NOT p_ai_enabled THEN
    UPDATE public.telegram_bot_replies SET status='cancelled',payload='{}',order_ids='{}',completed_at=now(),claim_token=NULL,locked_at=NULL
      WHERE user_id=p_user_id AND command='ask' AND status IN ('pending','processing');
  END IF;
  RETURN true;
END $$;

CREATE FUNCTION public.telegram_account_status(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_connection public.telegram_connections%ROWTYPE; v_pending public.telegram_link_tokens%ROWTYPE;
  v_preferences public.telegram_personal_preferences%ROWTYPE;
BEGIN
  IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user_id AND is_active=true) THEN RETURN NULL; END IF;
  SELECT * INTO v_connection FROM public.telegram_connections WHERE user_id=p_user_id;
  SELECT * INTO v_pending FROM public.telegram_link_tokens WHERE user_id=p_user_id AND expires_at>now();
  SELECT * INTO v_preferences FROM public.telegram_personal_preferences WHERE user_id=p_user_id;
  RETURN jsonb_build_object('accountId',p_user_id,'connected',v_connection.user_id IS NOT NULL,'enabled',coalesce(v_connection.enabled,false),
    'username',v_connection.username,'telegramUserId',v_connection.telegram_user_id,'linkedAt',v_connection.linked_at,'pendingUntil',v_pending.expires_at,
    'pendingApproval',CASE WHEN v_pending.candidate_chat_id IS NOT NULL THEN jsonb_build_object('requestId',v_pending.request_id,
      'telegramUserId',v_pending.candidate_user_id,'username',v_pending.candidate_username,'expiresAt',v_pending.expires_at) ELSE NULL END,
    'preferences',jsonb_build_object('notificationCategories',coalesce(v_preferences.notification_categories,ARRAY['ORDER','CHAT','INVENTORY','SYSTEM']::text[]),
      'previewMode',coalesce(v_preferences.preview_mode,'full'),'aiEnabled',coalesce(v_preferences.ai_enabled,false)));
END $$;

-- Keep the original command authorization/replay transaction, then strip AI
-- context before persistence when personal consent is absent.
ALTER FUNCTION public.process_telegram_bot_command(bigint,timestamptz,text,text,text,text) RENAME TO process_telegram_bot_command_before_personal;
REVOKE ALL ON FUNCTION public.process_telegram_bot_command_before_personal(bigint,timestamptz,text,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.process_telegram_bot_command(p_update_id bigint,p_message_at timestamptz,p_command text,
  p_chat_id text,p_telegram_user_id text,p_argument text DEFAULT '')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_reply uuid;
BEGIN
  IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  v_reply:=public.process_telegram_bot_command_before_personal(p_update_id,p_message_at,p_command,p_chat_id,p_telegram_user_id,p_argument);
  IF v_reply IS NOT NULL AND p_command='ask' THEN
    UPDATE public.telegram_bot_replies r SET payload=jsonb_build_object('kind','ask','locale',r.payload->>'locale','personalAiDisabled',true),order_ids='{}'
      WHERE r.id=v_reply AND NOT EXISTS(SELECT 1 FROM public.telegram_personal_preferences p WHERE p.user_id=r.user_id AND p.ai_enabled);
    UPDATE public.telegram_bot_replies r SET payload=r.payload||jsonb_build_object('personalAiAllowed',true)
      WHERE r.id=v_reply AND EXISTS(SELECT 1 FROM public.telegram_personal_preferences p WHERE p.user_id=r.user_id AND p.ai_enabled);
  END IF;
  RETURN v_reply;
END $$;

ALTER FUNCTION public.telegram_bot_reply_payload(uuid,uuid) RENAME TO telegram_bot_reply_payload_before_personal;
REVOKE ALL ON FUNCTION public.telegram_bot_reply_payload_before_personal(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.telegram_bot_reply_payload(p_id uuid,p_claim_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_payload jsonb;
BEGIN
  IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  v_payload:=public.telegram_bot_reply_payload_before_personal(p_id,p_claim_token);
  IF v_payload IS NULL THEN RETURN NULL; END IF;
  IF EXISTS(SELECT 1 FROM public.telegram_bot_replies r WHERE r.id=p_id AND r.command='ask'
    AND NOT coalesce((r.payload->>'personalAiDisabled')::boolean,false)
    AND (NOT coalesce((r.payload->>'personalAiAllowed')::boolean,false)
      OR NOT EXISTS(SELECT 1 FROM public.telegram_personal_preferences p WHERE p.user_id=r.user_id AND p.ai_enabled))) THEN RETURN NULL; END IF;
  RETURN v_payload;
END $$;

-- Preserve consent provenance when replacing a question/context with its rendered reply.
CREATE OR REPLACE FUNCTION public.prepare_telegram_bot_reply(p_id uuid,p_claim_token uuid,p_text text,p_keyboard jsonb DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  IF p_text IS NULL OR length(p_text)=0 OR length(p_text)>4000 OR length(coalesce(p_keyboard::text,''))>6000 THEN RETURN false; END IF;
  UPDATE public.telegram_bot_replies SET payload=jsonb_build_object('kind',command,'locale',payload->>'locale','rendered',p_text,'keyboard',p_keyboard,
      'personalAiDisabled',coalesce((payload->>'personalAiDisabled')::boolean,false),
      'personalAiAllowed',coalesce((payload->>'personalAiAllowed')::boolean,false))
    WHERE id=p_id AND claim_token=p_claim_token AND status='processing' AND locked_at>=now()-interval '2 minutes';
  RETURN FOUND;
END $$;

-- No account ID, SQL string, table name or arbitrary limit is accepted from the model.
CREATE FUNCTION public.telegram_bot_search_orders(p_id uuid,p_claim_token uuid,p_query text DEFAULT '',
  p_due_from date DEFAULT NULL,p_due_until date DEFAULT NULL,p_include_closed boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_reply public.telegram_bot_replies%ROWTYPE; v_rows jsonb; v_ids uuid[]; v_payload jsonb;
BEGIN
  IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  IF p_query IS NULL OR length(p_query)>120 OR p_include_closed IS NULL OR (p_due_from IS NOT NULL AND p_due_until IS NOT NULL
    AND (p_due_from>p_due_until OR p_due_until-p_due_from>90)) THEN RAISE EXCEPTION 'Invalid search' USING ERRCODE='22023'; END IF;
  v_payload:=public.telegram_bot_reply_payload(p_id,p_claim_token);
  IF v_payload IS NULL OR coalesce((v_payload#>>'{payload,personalAiDisabled}')::boolean,false) THEN RETURN NULL; END IF;
  SELECT * INTO v_reply FROM public.telegram_bot_replies WHERE id=p_id AND claim_token=p_claim_token AND status='processing' AND command='ask' FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb),coalesce(array_agg(q.id),'{}'::uuid[]) INTO v_rows,v_ids FROM (
    SELECT o.id,o.po_number,left(o.title,180) AS title,left(o.client,120) AS client,o.status,o.priority,o.due_date,o.loading_date
    FROM public.draft_orders o WHERE public.telegram_order_visible(o.status,o.created_by,v_reply.user_id,v_reply.actor_role)
      AND (p_include_closed OR o.status NOT IN ('DISPATCHED','ARCHIVED','CANCELLED','VOIDED','REJECTED','DONE','COMPLETED'))
      AND (p_query='' OR position(lower(p_query) IN lower(o.id::text||' '||coalesce(o.po_number,'')||' '||coalesce(o.title,'')||' '||coalesce(o.client,'')))>0)
      AND (p_due_from IS NULL OR o.due_date>=p_due_from) AND (p_due_until IS NULL OR o.due_date<=p_due_until)
    ORDER BY o.due_date ASC NULLS LAST,o.id LIMIT 11
  ) q;
  -- Persist authorization dependencies before returning any extra context to AI.
  UPDATE public.telegram_bot_replies SET order_ids=(SELECT ARRAY(SELECT DISTINCT id FROM unnest(v_reply.order_ids||v_ids) AS x(id)))
    WHERE id=p_id AND claim_token=p_claim_token AND status='processing';
  IF cardinality((SELECT order_ids FROM public.telegram_bot_replies WHERE id=p_id))>50 THEN RAISE EXCEPTION 'Search budget exceeded' USING ERRCODE='22023'; END IF;
  IF public.telegram_bot_reply_payload(p_id,p_claim_token) IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('orders',(SELECT coalesce(jsonb_agg(value),'[]'::jsonb) FROM jsonb_array_elements(v_rows) WITH ORDINALITY AS x(value,ord) WHERE ord<=10),
    'truncated',jsonb_array_length(v_rows)>10,'limit',10);
END $$;

REVOKE ALL ON FUNCTION public.confirm_telegram_link(uuid,uuid),public.disconnect_telegram(uuid,text),
  public.telegram_notification_category(text,text),public.telegram_notification_for_account(uuid,uuid),public.enqueue_telegram_notifications(uuid[]),
  public.telegram_delivery_payload(uuid,uuid),public.set_telegram_personal_preferences(uuid,text[],text,boolean),public.telegram_account_status(uuid),
  public.process_telegram_bot_command(bigint,timestamptz,text,text,text,text),public.telegram_bot_reply_payload(uuid,uuid),
  public.telegram_bot_search_orders(uuid,uuid,text,date,date,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_telegram_link(uuid,uuid),public.disconnect_telegram(uuid,text),
  public.telegram_notification_category(text,text),public.telegram_notification_for_account(uuid,uuid),public.enqueue_telegram_notifications(uuid[]),
  public.telegram_delivery_payload(uuid,uuid),public.set_telegram_personal_preferences(uuid,text[],text,boolean),public.telegram_account_status(uuid),
  public.process_telegram_bot_command(bigint,timestamptz,text,text,text,text),public.telegram_bot_reply_payload(uuid,uuid),
  public.telegram_bot_search_orders(uuid,uuid,text,date,date,boolean) TO service_role;
SELECT pg_notify('pgrst','reload schema');
COMMIT;
