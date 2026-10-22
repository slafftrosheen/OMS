-- R&D controls public configuration; only service-role RPCs can access Vault.
BEGIN;
CREATE TABLE public.telegram_system_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  options jsonb NOT NULL CHECK (jsonb_typeof(options) = 'object'),
  updated_by uuid REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.telegram_system_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.telegram_system_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.telegram_system_settings TO service_role;

CREATE FUNCTION public.get_telegram_settings() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_options jsonb; v_revision timestamptz; v_result jsonb;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  SELECT options,updated_at INTO v_options,v_revision FROM public.telegram_system_settings WHERE singleton;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT jsonb_build_object('options', v_options, 'revision', v_revision,
    'botToken', coalesce((SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='reclame_oms_telegram_bot_token' LIMIT 1), ''),
    'webhookSecret', coalesce((SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='reclame_oms_telegram_webhook_secret' LIMIT 1), ''),
    'deliverySecret', coalesce((SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='reclame_oms_telegram_delivery_secret' LIMIT 1), '')) INTO v_result;
  RETURN v_result;
END $$;

CREATE FUNCTION public.set_telegram_settings(p_actor uuid, p_options jsonb, p_bot_token text, p_webhook_secret text, p_delivery_secret text, p_previous_bot_id text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_id uuid; v_name text; v_value text; v_old_token text; v_previous_bot_id text; v_user_id uuid;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=p_actor AND role='RD' AND is_active=true) THEN
    RAISE EXCEPTION 'Active R&D required' USING ERRCODE='42501';
  END IF;
  IF p_options IS NULL OR jsonb_typeof(p_options) <> 'object' OR p_options ?| ARRAY['botToken','webhookSecret','deliverySecret']
    OR jsonb_typeof(p_options->'enabled') IS DISTINCT FROM 'boolean' OR length(p_options::text) > 4000
    OR coalesce(p_bot_token,'') !~ '^([0-9]+:[A-Za-z0-9_-]{20,}|)$'
    OR (coalesce(p_webhook_secret,'') <> '' AND (p_webhook_secret !~ '^[A-Za-z0-9_-]+$' OR length(p_webhook_secret) NOT BETWEEN 32 AND 256))
    OR (coalesce(p_delivery_secret,'') <> '' AND (p_delivery_secret !~ '^[A-Za-z0-9_-]+$' OR length(p_delivery_secret) NOT BETWEEN 32 AND 256))
    OR (coalesce(p_webhook_secret,'') <> '' AND p_webhook_secret=p_delivery_secret) THEN
    RAISE EXCEPTION 'Invalid settings' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('telegram:settings', 0));
  SELECT decrypted_secret INTO v_old_token FROM vault.decrypted_secrets WHERE name='reclame_oms_telegram_bot_token' LIMIT 1;
  v_previous_bot_id := coalesce(nullif(split_part(v_old_token,':',1),''),CASE WHEN p_previous_bot_id ~ '^[0-9]+$' THEN p_previous_bot_id ELSE NULL END);
  FOR v_name, v_value IN SELECT * FROM (VALUES
    ('reclame_oms_telegram_bot_token', coalesce(p_bot_token,'')),
    ('reclame_oms_telegram_webhook_secret', coalesce(p_webhook_secret,'')),
    ('reclame_oms_telegram_delivery_secret', coalesce(p_delivery_secret,''))) AS secrets(name, value)
  LOOP
    SELECT id INTO v_id FROM vault.secrets WHERE name=v_name LIMIT 1;
    IF v_value <> '' THEN
      IF v_id IS NULL THEN PERFORM vault.create_secret(v_value, v_name, 'Telegram credential managed by R&D', NULL);
      ELSE PERFORM vault.update_secret(v_id, v_value, v_name, 'Telegram credential managed by R&D', NULL); END IF;
    END IF;
  END LOOP;
  INSERT INTO public.telegram_system_settings(singleton, options, updated_by) VALUES (true, p_options, p_actor)
    ON CONFLICT (singleton) DO UPDATE SET options=EXCLUDED.options, updated_by=p_actor, updated_at=now();
  IF NOT coalesce((p_options->>'enabled')::boolean, false) OR
    (v_previous_bot_id IS NOT NULL AND v_previous_bot_id <> split_part(p_bot_token,':',1)) THEN
    -- Match pause/disconnect lock order: users before delivery/connection rows.
    FOR v_user_id IN SELECT user_id FROM public.telegram_connections ORDER BY user_id LOOP
      PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::text,0));
    END LOOP;
    UPDATE public.telegram_deliveries SET status='cancelled', completed_at=now(), claim_token=NULL, locked_at=NULL WHERE status IN ('pending','processing');
    IF to_regclass('public.telegram_bot_replies') IS NOT NULL THEN
      UPDATE public.telegram_bot_replies SET status='cancelled',payload='{}',order_ids='{}',completed_at=now(),claim_token=NULL,locked_at=NULL WHERE status IN ('pending','processing');
    END IF;
  END IF;
  IF v_previous_bot_id IS NOT NULL AND v_previous_bot_id <> split_part(p_bot_token,':',1) THEN
    DELETE FROM public.telegram_connections;
    DELETE FROM public.telegram_link_tokens;
  END IF;
END $$;

CREATE FUNCTION public.remove_telegram_credentials(p_actor uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user_id uuid;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=p_actor AND role='RD' AND is_active=true) THEN
    RAISE EXCEPTION 'Active R&D required' USING ERRCODE='42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('telegram:settings', 0));
  FOR v_user_id IN SELECT user_id FROM public.telegram_connections ORDER BY user_id LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::text,0));
  END LOOP;
  DELETE FROM vault.secrets WHERE name IN ('reclame_oms_telegram_bot_token','reclame_oms_telegram_webhook_secret','reclame_oms_telegram_delivery_secret');
  INSERT INTO public.telegram_system_settings(singleton,options,updated_by) VALUES (true,'{"enabled":false}'::jsonb,p_actor)
    ON CONFLICT (singleton) DO UPDATE SET options=jsonb_set(public.telegram_system_settings.options,'{enabled}','false'),updated_by=p_actor,updated_at=now();
  UPDATE public.telegram_deliveries SET status='cancelled',completed_at=now(),claim_token=NULL,locked_at=NULL WHERE status IN ('pending','processing');
  DELETE FROM public.telegram_link_tokens;
  DELETE FROM public.telegram_connections;
  IF to_regclass('public.telegram_bot_replies') IS NOT NULL THEN
    UPDATE public.telegram_bot_replies SET status='cancelled',payload='{}',order_ids='{}',completed_at=now(),claim_token=NULL,locked_at=NULL WHERE status IN ('pending','processing');
  END IF;
END $$;

CREATE FUNCTION public.telegram_notification_allowed(p_type text, p_source text) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_options jsonb; v_category text;
BEGIN
  SELECT options INTO v_options FROM public.telegram_system_settings WHERE singleton;
  IF NOT FOUND THEN RETURN true; END IF; -- Legacy environment configuration.
  IF NOT coalesce((v_options->>'enabled')::boolean,false) THEN RETURN false; END IF;
  v_category := CASE WHEN p_source='inventory' OR p_type ~* '^(inventory|low_stock)' THEN 'INVENTORY'
    WHEN p_source='chat' OR p_type ~* '^(chat|message|mention)' THEN 'CHAT'
    WHEN p_source IN ('order','stage') OR p_type ~* '^(order|station|stage|loading|rework|assignment|consumption)' THEN 'ORDER' ELSE 'SYSTEM' END;
  RETURN coalesce(v_options->'notificationCategories','["ORDER","CHAT","INVENTORY","SYSTEM"]'::jsonb) ? v_category;
END $$;

CREATE OR REPLACE FUNCTION public.enqueue_telegram_notifications(p_notification_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_count integer;
BEGIN
  IF coalesce(auth.role(),'') <> 'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  INSERT INTO public.telegram_deliveries(notification_id,user_id,connection_version)
  SELECT n.id,n.user_id,c.version FROM public.notifications n
    JOIN public.telegram_connections c ON c.user_id=n.user_id AND c.enabled
    JOIN public.profiles p ON p.id=n.user_id AND p.is_active=true
    LEFT JOIN public.user_preferences u ON u.user_id=n.user_id
    WHERE n.id=ANY(p_notification_ids) AND NOT coalesce(n.is_dismissed,false) AND NOT coalesce(n.is_read,false)
      AND coalesce(u.notifications_enabled,true) AND public.telegram_notification_allowed(n.notification_type,n.source_type)
      AND NOT EXISTS (SELECT 1 FROM public.notification_preferences np WHERE np.user_id=n.user_id AND np.notification_type=n.notification_type AND np.enabled=false)
    ON CONFLICT (notification_id) DO NOTHING;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  RETURN v_count;
END $$;

CREATE OR REPLACE FUNCTION public.telegram_delivery_payload(p_id uuid,p_claim_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_payload jsonb;
BEGIN
  IF coalesce(auth.role(),'') <> 'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  SELECT jsonb_build_object('chatId',c.chat_id,'notification',jsonb_build_object('id',n.id,'title',n.title,'message',n.message,'link',n.link))
  INTO v_payload FROM public.telegram_deliveries d
    JOIN public.telegram_connections c ON c.user_id=d.user_id AND c.enabled AND c.version=d.connection_version
    JOIN public.profiles p ON p.id=d.user_id AND p.is_active=true
    JOIN public.notifications n ON n.id=d.notification_id AND n.user_id=d.user_id
    LEFT JOIN public.user_preferences u ON u.user_id=d.user_id
    WHERE d.id=p_id AND d.claim_token=p_claim_token AND d.status='processing'
      AND d.locked_at>=now()-interval '5 minutes' AND d.created_at>=now()-interval '24 hours'
      AND NOT coalesce(n.is_read,false) AND NOT coalesce(n.is_dismissed,false) AND coalesce(u.notifications_enabled,true)
      AND public.telegram_notification_allowed(n.notification_type,n.source_type)
      AND NOT EXISTS (SELECT 1 FROM public.notification_preferences np WHERE np.user_id=n.user_id AND np.notification_type=n.notification_type AND np.enabled=false);
  RETURN v_payload;
END $$;

REVOKE ALL ON FUNCTION public.get_telegram_settings(),public.set_telegram_settings(uuid,jsonb,text,text,text,text),public.remove_telegram_credentials(uuid),public.telegram_notification_allowed(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_telegram_settings(),public.set_telegram_settings(uuid,jsonb,text,text,text,text),public.remove_telegram_credentials(uuid),public.telegram_notification_allowed(text,text) TO service_role;
SELECT pg_notify('pgrst','reload schema');
COMMIT;
