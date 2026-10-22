-- Private, linked-user bot commands. Mutations and replay fences are atomic;
-- responses use a durable outbox and do not re-execute commands on retry.
BEGIN;
ALTER TABLE public.telegram_webhook_state ADD COLUMN last_command_at timestamptz, ADD COLUMN last_ai_at timestamptz;
CREATE TABLE public.telegram_bot_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  connection_version uuid NOT NULL,
  actor_role text NOT NULL,
  command text NOT NULL,
  payload jsonb NOT NULL,
  order_ids uuid[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','sent','failed','cancelled')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  claim_token uuid,
  locked_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX telegram_bot_replies_pending ON public.telegram_bot_replies(next_attempt_at) WHERE status IN ('pending','processing');
ALTER TABLE public.telegram_bot_replies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.telegram_bot_replies FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.telegram_bot_replies TO service_role;

-- Mirrors is_draft_visible_to_user without impersonating a JWT or granting the
-- bot a general-purpose service-role query surface.
CREATE FUNCTION public.telegram_order_visible(p_status text,p_created_by uuid,p_user_id uuid,p_role text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT p_user_id IS NOT NULL AND coalesce(p_status NOT IN ('DRAFT','PENDING_REVIEW','draft') OR p_created_by=p_user_id OR p_role IN ('RD','Boss','HeadOfProduction'),false);
$$;

CREATE FUNCTION public.process_telegram_bot_command(p_update_id bigint,p_message_at timestamptz,p_command text,
  p_chat_id text,p_telegram_user_id text,p_argument text DEFAULT '')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_connection public.telegram_connections%ROWTYPE; v_previous public.telegram_webhook_state%ROWTYPE;
  v_role text; v_locale text; v_options jsonb; v_date date; v_timezone text; v_payload jsonb;
  v_orders jsonb := '[]'; v_events jsonb := '[]'; v_notifications jsonb := '[]'; v_order_ids uuid[] := '{}'; v_reply uuid; v_count integer;
BEGIN
  IF coalesce(auth.role(),'') <> 'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  IF p_update_id IS NULL OR p_update_id<0 OR p_message_at IS NULL OR p_message_at>now()+interval '5 minutes' OR p_message_at<now()-interval '24 hours'
    OR p_chat_id IS NULL OR p_chat_id !~ '^[1-9][0-9]{0,15}$' OR p_telegram_user_id IS DISTINCT FROM p_chat_id
    OR p_command IS NULL OR p_command NOT IN ('help','today','orders','order','notifications','read','pause','resume','ask')
    OR p_argument IS NULL OR length(p_argument)>1000 THEN RETURN NULL; END IF;
  SELECT options INTO v_options FROM public.telegram_system_settings WHERE singleton;
  IF v_options IS NOT NULL AND (NOT coalesce((v_options->>'enabled')::boolean,false) OR NOT coalesce((v_options->>'commandsEnabled')::boolean,true)
    OR NOT coalesce(v_options->'commands','["help","today","orders","order","notifications","read","pause","resume","ask"]'::jsonb) ? p_command) THEN RETURN NULL; END IF;
  IF p_command='ask' AND NOT coalesce((v_options->>'aiEnabled')::boolean,false) THEN RETURN NULL; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('telegram:' || p_chat_id,0));
  SELECT * INTO v_connection FROM public.telegram_connections WHERE chat_id=p_chat_id AND telegram_user_id=p_telegram_user_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_connection.user_id::text,0));
  SELECT c.* INTO v_connection FROM public.telegram_connections c WHERE c.user_id=v_connection.user_id AND c.chat_id=p_chat_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT p.role,coalesce(u.locale,'en') INTO v_role,v_locale FROM public.profiles p LEFT JOIN public.user_preferences u ON u.user_id=p.id WHERE p.id=v_connection.user_id AND p.is_active=true;
  IF NOT FOUND OR v_role IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO v_previous FROM public.telegram_webhook_state WHERE chat_id=p_chat_id;
  IF FOUND AND (p_message_at<v_previous.last_message_at OR (p_update_id<=v_previous.last_update_id AND p_message_at<v_previous.last_message_at+interval '7 days')
    OR v_previous.last_command_at>now()-interval '1 second' OR (p_command='ask' AND v_previous.last_ai_at>now()-interval '1 minute')) THEN RETURN NULL; END IF;
  v_timezone := coalesce(v_options->>'timezone','Europe/Riga');
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name=v_timezone) THEN v_timezone := 'Europe/Riga'; END IF;
  v_date := (now() AT TIME ZONE v_timezone)::date;

  IF p_command IN ('today','orders','order','ask') THEN
    SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]'),coalesce(array_agg(q.id),'{}') INTO v_orders,v_order_ids FROM (
      SELECT o.id,o.po_number,left(o.title,180) AS title,left(o.client,120) AS client,o.status,o.priority,o.due_date,o.loading_date
      FROM public.draft_orders o
      WHERE public.telegram_order_visible(o.status,o.created_by,v_connection.user_id,v_role)
        AND CASE WHEN p_command='order' THEN (lower(o.id::text)=lower(p_argument) OR lower(o.po_number)=lower(p_argument))
          ELSE o.status NOT IN ('DISPATCHED','ARCHIVED','CANCELLED','VOIDED','REJECTED','DONE','COMPLETED') END
        AND (p_command<>'today' OR o.due_date=v_date OR o.loading_date=v_date)
        AND (p_command<>'orders' OR p_argument='' OR position(lower(p_argument) IN lower(coalesce(o.po_number,'') || ' ' || coalesce(o.title,'') || ' ' || coalesce(o.client,'')))>0)
      ORDER BY o.due_date ASC NULLS LAST,o.id LIMIT CASE WHEN p_command='order' THEN 1 ELSE 10 END
    ) q;
  END IF;
  IF p_command IN ('today','ask') THEN
    SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]') INTO v_events FROM (
      SELECT e.kind,left(e.title,180) AS title,left(e.note,350) AS note FROM public.calendar_events e WHERE e.date=v_date ORDER BY e.created_at,e.id LIMIT 10
    ) q;
  END IF;
  IF p_command IN ('notifications','ask') THEN
    SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]') INTO v_notifications FROM (
      SELECT n.id,left(n.title,200) AS title,left(n.message,350) AS message,n.link FROM public.notifications n
      WHERE n.user_id=v_connection.user_id AND NOT coalesce(n.is_read,false) AND NOT coalesce(n.is_dismissed,false)
      ORDER BY n.created_at DESC,n.id LIMIT 5
    ) q;
  END IF;
  v_payload := jsonb_build_object('kind',p_command,'locale',CASE WHEN v_locale IN ('en','ru','lv') THEN v_locale ELSE 'en' END,
    'date',v_date,'timezone',v_timezone,'orders',v_orders,'events',v_events,'notifications',v_notifications);
  IF p_command='read' THEN
    IF p_argument !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      v_payload := v_payload || '{"result":"invalid"}'::jsonb;
    ELSE
      UPDATE public.notifications SET is_read=true,read_at=coalesce(read_at,now()) WHERE id=p_argument::uuid AND user_id=v_connection.user_id AND NOT coalesce(is_dismissed,false);
      GET DIAGNOSTICS v_count=ROW_COUNT;
      v_payload := v_payload || jsonb_build_object('result',CASE WHEN v_count>0 THEN 'read' ELSE 'not_found' END);
    END IF;
  ELSIF p_command IN ('pause','resume') THEN
    PERFORM public.set_telegram_enabled(v_connection.user_id,p_command='resume');
    SELECT version INTO v_connection.version FROM public.telegram_connections WHERE user_id=v_connection.user_id;
  ELSIF p_command='ask' THEN
    v_payload := v_payload || jsonb_build_object('question',p_argument);
  END IF;
  INSERT INTO public.telegram_webhook_state(chat_id,last_update_id,last_message_at,last_command_at,last_ai_at)
    VALUES(p_chat_id,p_update_id,p_message_at,now(),CASE WHEN p_command='ask' THEN now() ELSE v_previous.last_ai_at END)
    ON CONFLICT(chat_id) DO UPDATE SET last_update_id=EXCLUDED.last_update_id,last_message_at=EXCLUDED.last_message_at,last_command_at=EXCLUDED.last_command_at,last_ai_at=EXCLUDED.last_ai_at;
  INSERT INTO public.telegram_bot_replies(user_id,connection_version,actor_role,command,payload,order_ids)
    VALUES(v_connection.user_id,v_connection.version,v_role,p_command,v_payload,v_order_ids) RETURNING id INTO v_reply;
  RETURN v_reply;
END $$;

CREATE FUNCTION public.claim_telegram_bot_replies(p_id uuid DEFAULT NULL,p_limit integer DEFAULT 2)
RETURNS SETOF public.telegram_bot_replies LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF coalesce(auth.role(),'') <> 'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  UPDATE public.telegram_bot_replies SET status='failed',payload='{}',order_ids='{}',claim_token=NULL,locked_at=NULL,completed_at=now(),last_error='expired'
    WHERE status IN ('pending','processing') AND (created_at<now()-interval '10 minutes' OR attempts>=5 AND (status='pending' OR locked_at<now()-interval '2 minutes'));
  RETURN QUERY WITH candidates AS (
    SELECT r.id FROM public.telegram_bot_replies r WHERE (p_id IS NULL OR r.id=p_id)
      AND ((r.status='pending' AND r.next_attempt_at<=now()) OR (r.status='processing' AND r.locked_at<now()-interval '2 minutes'))
      AND r.attempts<5 ORDER BY r.created_at LIMIT greatest(1,least(coalesce(p_limit,2),2)) FOR UPDATE OF r SKIP LOCKED
  ) UPDATE public.telegram_bot_replies r SET status='processing',claim_token=gen_random_uuid(),locked_at=now(),attempts=r.attempts+1
    FROM candidates c WHERE r.id=c.id RETURNING r.*;
END $$;

CREATE FUNCTION public.telegram_bot_reply_payload(p_id uuid,p_claim_token uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_payload jsonb; v_options jsonb;
BEGIN
  IF coalesce(auth.role(),'') <> 'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  SELECT options INTO v_options FROM public.telegram_system_settings WHERE singleton;
  IF v_options IS NOT NULL AND (NOT coalesce((v_options->>'enabled')::boolean,false) OR NOT coalesce((v_options->>'commandsEnabled')::boolean,true)) THEN RETURN NULL; END IF;
  SELECT jsonb_build_object('chatId',c.chat_id,'payload',r.payload) INTO v_payload FROM public.telegram_bot_replies r
    JOIN public.telegram_connections c ON c.user_id=r.user_id AND c.version=r.connection_version
    JOIN public.profiles p ON p.id=r.user_id AND p.is_active=true AND p.role=r.actor_role
    WHERE r.id=p_id AND r.claim_token=p_claim_token AND r.status='processing' AND r.locked_at>=now()-interval '2 minutes'
      AND r.created_at>=now()-interval '10 minutes'
      AND (r.command<>'ask' OR coalesce((v_options->>'aiEnabled')::boolean,false))
      AND (v_options IS NULL OR coalesce(v_options->'commands','[]'::jsonb) ? r.command)
      AND NOT EXISTS (SELECT 1 FROM unnest(r.order_ids) x(id) WHERE NOT EXISTS (SELECT 1 FROM public.draft_orders o WHERE o.id=x.id AND public.telegram_order_visible(o.status,o.created_by,r.user_id,p.role)));
  RETURN v_payload;
END $$;

CREATE FUNCTION public.prepare_telegram_bot_reply(p_id uuid,p_claim_token uuid,p_text text,p_keyboard jsonb DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF coalesce(auth.role(),'') <> 'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  IF p_text IS NULL OR length(p_text)=0 OR length(p_text)>4000 OR length(coalesce(p_keyboard::text,''))>6000 THEN RETURN false; END IF;
  UPDATE public.telegram_bot_replies SET payload=jsonb_build_object('kind',command,'locale',payload->>'locale','rendered',p_text,'keyboard',p_keyboard)
    WHERE id=p_id AND claim_token=p_claim_token AND status='processing' AND locked_at>=now()-interval '2 minutes';
  RETURN FOUND;
END $$;

CREATE FUNCTION public.finish_telegram_bot_reply(p_id uuid,p_claim_token uuid,p_status text,p_error text DEFAULT NULL,p_retry_at timestamptz DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF coalesce(auth.role(),'') <> 'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  IF p_status NOT IN ('sent','pending','failed','cancelled') THEN RETURN false; END IF;
  UPDATE public.telegram_bot_replies SET status=CASE WHEN p_status='pending' AND attempts>=5 THEN 'failed' ELSE p_status END,
    payload=CASE WHEN p_status='pending' AND attempts<5 THEN payload ELSE '{}'::jsonb END,
    order_ids=CASE WHEN p_status='pending' AND attempts<5 THEN order_ids ELSE '{}'::uuid[] END,
    next_attempt_at=greatest(now()+interval '1 second',least(coalesce(p_retry_at,now()+interval '30 seconds'),now()+interval '10 minutes')),
    last_error=left(p_error,80),claim_token=NULL,locked_at=NULL,completed_at=CASE WHEN p_status='pending' AND attempts<5 THEN NULL ELSE now() END
    WHERE id=p_id AND claim_token=p_claim_token AND status='processing';
  RETURN FOUND;
END $$;

-- A captured runtime may become obsolete after claiming work. Release only its
-- live lease without spending a provider attempt or reviving a cancelled row.
CREATE FUNCTION public.release_telegram_runtime_claim(p_id uuid,p_claim_token uuid,p_queue text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_user_id uuid;
BEGIN
  IF coalesce(auth.role(),'') <> 'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  IF p_queue='notification' THEN
    SELECT user_id INTO v_user_id FROM public.telegram_deliveries WHERE id=p_id;
  ELSIF p_queue='reply' THEN
    SELECT user_id INTO v_user_id FROM public.telegram_bot_replies WHERE id=p_id;
  ELSE RETURN false; END IF;
  IF v_user_id IS NULL THEN RETURN false; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::text,0));
  IF p_queue='notification' THEN
    UPDATE public.telegram_deliveries SET status='pending',attempts=greatest(0,attempts-1),
      next_attempt_at=now()+interval '10 seconds',claim_token=NULL,locked_at=NULL,completed_at=NULL,last_error='runtime_changed'
      WHERE id=p_id AND claim_token=p_claim_token AND status='processing';
  ELSE
    UPDATE public.telegram_bot_replies SET status='pending',attempts=greatest(0,attempts-1),
      next_attempt_at=now()+interval '10 seconds',claim_token=NULL,locked_at=NULL,completed_at=NULL,last_error='runtime_changed'
      WHERE id=p_id AND claim_token=p_claim_token AND status='processing';
  END IF;
  RETURN FOUND;
END $$;

CREATE FUNCTION public.telegram_admin_counts() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF coalesce(auth.role(),'') <> 'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('connected',(SELECT count(*) FROM public.telegram_connections),
    'pending',(SELECT count(*) FROM public.telegram_deliveries WHERE status IN ('pending','processing'))+(SELECT count(*) FROM public.telegram_bot_replies WHERE status IN ('pending','processing')),
    'failed',(SELECT count(*) FROM public.telegram_deliveries WHERE status='failed' AND created_at>now()-interval '24 hours')+(SELECT count(*) FROM public.telegram_bot_replies WHERE status='failed' AND created_at>now()-interval '24 hours'));
END $$;

CREATE FUNCTION public.retry_telegram_failures(p_actor uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_count integer;
BEGIN
  IF coalesce(auth.role(),'') <> 'service_role' OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=p_actor AND role='RD' AND is_active=true) THEN
    RAISE EXCEPTION 'Active R&D required' USING ERRCODE='42501';
  END IF;
  UPDATE public.telegram_deliveries d SET status='pending',attempts=0,next_attempt_at=now(),last_error=NULL,claim_token=NULL,locked_at=NULL,completed_at=NULL
    FROM public.telegram_connections c,public.profiles p,public.notifications n
    WHERE d.status='failed' AND d.created_at>=now()-interval '24 hours' AND d.telegram_message_id IS NULL
      AND c.user_id=d.user_id AND c.enabled AND c.version=d.connection_version AND p.id=d.user_id AND p.is_active=true
      AND n.id=d.notification_id AND n.user_id=d.user_id AND NOT coalesce(n.is_read,false) AND NOT coalesce(n.is_dismissed,false)
      AND public.telegram_notification_allowed(n.notification_type,n.source_type)
      AND NOT EXISTS (SELECT 1 FROM public.user_preferences u WHERE u.user_id=d.user_id AND u.notifications_enabled=false)
      AND NOT EXISTS (SELECT 1 FROM public.notification_preferences np WHERE np.user_id=d.user_id AND np.notification_type=n.notification_type AND np.enabled=false);
  GET DIAGNOSTICS v_count=ROW_COUNT;
  RETURN v_count;
END $$;

REVOKE ALL ON FUNCTION public.telegram_order_visible(text,uuid,uuid,text),public.process_telegram_bot_command(bigint,timestamptz,text,text,text,text),public.claim_telegram_bot_replies(uuid,integer),public.telegram_bot_reply_payload(uuid,uuid),public.prepare_telegram_bot_reply(uuid,uuid,text,jsonb),public.finish_telegram_bot_reply(uuid,uuid,text,text,timestamptz),public.telegram_admin_counts() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.telegram_order_visible(text,uuid,uuid,text),public.process_telegram_bot_command(bigint,timestamptz,text,text,text,text),public.claim_telegram_bot_replies(uuid,integer),public.telegram_bot_reply_payload(uuid,uuid),public.prepare_telegram_bot_reply(uuid,uuid,text,jsonb),public.finish_telegram_bot_reply(uuid,uuid,text,text,timestamptz),public.telegram_admin_counts() TO service_role;
REVOKE ALL ON FUNCTION public.retry_telegram_failures(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.retry_telegram_failures(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.release_telegram_runtime_claim(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.release_telegram_runtime_claim(uuid,uuid,text) TO service_role;
SELECT pg_notify('pgrst','reload schema');
COMMIT;
