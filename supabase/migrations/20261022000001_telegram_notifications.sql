-- Telegram is an explicit, per-user opt-in. Credentials never enter the database.
-- Only trusted server emitters may publish to this outbox; there is deliberately
-- no trigger on notifications because clients can create in-app notifications.
BEGIN;

CREATE TABLE public.telegram_connections (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL UNIQUE CHECK (chat_id ~ '^[1-9][0-9]{0,15}$'),
  telegram_user_id TEXT NOT NULL CHECK (telegram_user_id = chat_id),
  username TEXT CHECK (username IS NULL OR username ~ '^[A-Za-z0-9_]{1,32}$'),
  enabled BOOLEAN NOT NULL DEFAULT false,
  version UUID NOT NULL DEFAULT gen_random_uuid(),
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.telegram_link_tokens (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Survives unlinking, so replaying an old /stop cannot disconnect a new link.
-- Only command ordering metadata is stored; never a raw update or start token.
CREATE TABLE public.telegram_webhook_state (
  chat_id TEXT PRIMARY KEY CHECK (chat_id ~ '^[1-9][0-9]{0,15}$'),
  last_update_id BIGINT NOT NULL CHECK (last_update_id >= 0),
  last_message_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE public.telegram_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL UNIQUE REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  connection_version UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ,
  claim_token UUID,
  last_error TEXT,
  telegram_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX telegram_deliveries_pending ON public.telegram_deliveries(next_attempt_at, created_at)
  WHERE status IN ('pending', 'processing');
CREATE INDEX telegram_deliveries_user ON public.telegram_deliveries(user_id, status);

ALTER TABLE public.telegram_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_link_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_webhook_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.telegram_connections, public.telegram_link_tokens, public.telegram_deliveries, public.telegram_webhook_state FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_connections, public.telegram_link_tokens, public.telegram_deliveries, public.telegram_webhook_state TO service_role;

CREATE FUNCTION public.prepare_telegram_link(p_user_id UUID, p_token_hash TEXT)
RETURNS TIMESTAMPTZ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_until TIMESTAMPTZ := now() + INTERVAL '10 minutes';
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND is_active = true) THEN
    RAISE EXCEPTION 'Active user required' USING ERRCODE='42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::TEXT, 0));
  IF EXISTS (SELECT 1 FROM public.telegram_link_tokens WHERE user_id = p_user_id AND created_at > now() - INTERVAL '30 seconds') THEN
    RAISE EXCEPTION 'link_rate_limited' USING ERRCODE='P0001';
  END IF;
  INSERT INTO public.telegram_link_tokens(user_id, token_hash, expires_at)
    VALUES (p_user_id, p_token_hash, v_until)
    ON CONFLICT (user_id) DO UPDATE SET token_hash = EXCLUDED.token_hash, expires_at = EXCLUDED.expires_at, created_at = now();
  RETURN v_until;
END $$;

CREATE FUNCTION public.consume_telegram_link(p_token_hash TEXT, p_chat_id TEXT, p_telegram_user_id TEXT, p_username TEXT DEFAULT NULL)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_user_id UUID;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  IF p_chat_id IS NULL OR p_chat_id !~ '^[1-9][0-9]{0,15}$' OR p_telegram_user_id IS DISTINCT FROM p_chat_id THEN RETURN false; END IF;
  SELECT user_id INTO v_user_id FROM public.telegram_link_tokens WHERE token_hash = p_token_hash;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('telegram:' || p_chat_id, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::TEXT, 0));
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id AND is_active = true)
    OR EXISTS (SELECT 1 FROM public.telegram_connections WHERE chat_id = p_chat_id AND user_id <> v_user_id) THEN RETURN false; END IF;
  DELETE FROM public.telegram_link_tokens WHERE user_id = v_user_id AND token_hash = p_token_hash AND expires_at > now();
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE public.telegram_deliveries SET status = 'cancelled', completed_at = now(), claim_token = NULL
    WHERE user_id = v_user_id AND status IN ('pending', 'processing');
  INSERT INTO public.telegram_connections(user_id, chat_id, telegram_user_id, username, enabled)
    VALUES (v_user_id, p_chat_id, p_telegram_user_id, p_username, true)
    ON CONFLICT (user_id) DO UPDATE SET chat_id = EXCLUDED.chat_id, telegram_user_id = EXCLUDED.telegram_user_id,
      username = EXCLUDED.username, enabled = true, version = gen_random_uuid(), linked_at = now(), updated_at = now();
  RETURN true;
END $$;

CREATE FUNCTION public.set_telegram_enabled(p_user_id UUID, p_enabled BOOLEAN)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  IF p_enabled IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND is_active = true) THEN RETURN false; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::TEXT, 0));
  UPDATE public.telegram_connections SET enabled = p_enabled, updated_at = now(),
    version = CASE WHEN p_enabled THEN version ELSE gen_random_uuid() END WHERE user_id = p_user_id;
  IF NOT FOUND THEN RETURN false; END IF;
  IF NOT p_enabled THEN
    DELETE FROM public.telegram_link_tokens WHERE user_id = p_user_id;
    UPDATE public.telegram_deliveries SET status = 'cancelled', completed_at = now(), claim_token = NULL
      WHERE user_id = p_user_id AND status IN ('pending', 'processing');
  END IF;
  RETURN true;
END $$;

CREATE FUNCTION public.disconnect_telegram(p_user_id UUID DEFAULT NULL, p_chat_id TEXT DEFAULT NULL)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_user_id UUID;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  IF (p_user_id IS NULL) = (p_chat_id IS NULL) THEN RETURN false; END IF;
  v_user_id := p_user_id;
  IF v_user_id IS NULL THEN SELECT user_id INTO v_user_id FROM public.telegram_connections WHERE chat_id = p_chat_id; END IF;
  IF v_user_id IS NULL THEN RETURN true; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::TEXT, 0));
  IF p_chat_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.telegram_connections WHERE user_id = v_user_id AND chat_id = p_chat_id) THEN RETURN true; END IF;
  DELETE FROM public.telegram_link_tokens WHERE user_id = v_user_id;
  UPDATE public.telegram_deliveries SET status = 'cancelled', completed_at = now(), claim_token = NULL
    WHERE user_id = v_user_id AND status IN ('pending', 'processing');
  DELETE FROM public.telegram_connections WHERE user_id = v_user_id;
  RETURN true;
END $$;

CREATE FUNCTION public.process_telegram_update(p_update_id BIGINT, p_message_at TIMESTAMPTZ,
  p_command TEXT, p_chat_id TEXT, p_telegram_user_id TEXT, p_token_hash TEXT DEFAULT NULL, p_username TEXT DEFAULT NULL)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_previous public.telegram_webhook_state%ROWTYPE; v_applied BOOLEAN;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  IF p_update_id IS NULL OR p_update_id < 0 OR p_message_at IS NULL OR p_message_at > now() + INTERVAL '5 minutes'
    OR p_command IS NULL OR p_command NOT IN ('connect', 'disconnect') OR p_chat_id IS NULL OR p_chat_id !~ '^[1-9][0-9]{0,15}$'
    OR p_telegram_user_id IS DISTINCT FROM p_chat_id THEN RETURN false; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('telegram:' || p_chat_id, 0));
  SELECT * INTO v_previous FROM public.telegram_webhook_state WHERE chat_id = p_chat_id;
  IF FOUND AND (
    p_message_at < v_previous.last_message_at
    OR (p_update_id <= v_previous.last_update_id AND p_message_at < v_previous.last_message_at + INTERVAL '7 days')
  ) THEN RETURN false; END IF;
  IF p_command = 'connect' THEN
    v_applied := public.consume_telegram_link(p_token_hash, p_chat_id, p_telegram_user_id, p_username);
  ELSE
    v_applied := public.disconnect_telegram(NULL, p_chat_id);
  END IF;
  IF NOT v_applied THEN RETURN false; END IF;
  -- Telegram may choose a random update ID after a week without updates.
  INSERT INTO public.telegram_webhook_state(chat_id, last_update_id, last_message_at)
    VALUES (p_chat_id, p_update_id, p_message_at)
    ON CONFLICT (chat_id) DO UPDATE SET last_update_id = EXCLUDED.last_update_id, last_message_at = EXCLUDED.last_message_at;
  RETURN true;
END $$;

CREATE FUNCTION public.enqueue_telegram_notifications(p_notification_ids UUID[])
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_count INTEGER;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  INSERT INTO public.telegram_deliveries(notification_id, user_id, connection_version)
    SELECT n.id, n.user_id, c.version
      FROM public.notifications n JOIN public.telegram_connections c ON c.user_id = n.user_id AND c.enabled
      JOIN public.profiles p ON p.id = n.user_id AND p.is_active = true
      LEFT JOIN public.user_preferences u ON u.user_id = n.user_id
      WHERE n.id = ANY(p_notification_ids) AND NOT coalesce(n.is_dismissed, false) AND NOT coalesce(n.is_read, false)
        AND coalesce(u.notifications_enabled, true)
        AND NOT EXISTS (SELECT 1 FROM public.notification_preferences np WHERE np.user_id = n.user_id
          AND np.notification_type = n.notification_type AND np.enabled = false)
    ON CONFLICT (notification_id) DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

CREATE FUNCTION public.publish_telegram_notifications(p_notifications JSONB)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_ids UUID[];
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  IF p_notifications IS NULL OR jsonb_typeof(p_notifications) <> 'array' OR jsonb_array_length(p_notifications) > 100 THEN
    RAISE EXCEPTION 'Invalid notification batch' USING ERRCODE='22023';
  END IF;
  WITH inserted AS (
    INSERT INTO public.notifications(id, user_id, notification_type, title, message, link, source_type, source_id)
      SELECT x.id, x.user_id, x.notification_type, left(x.title, 300), left(x.message, 5000), x.link, x.source_type, x.source_id
      FROM jsonb_to_recordset(p_notifications) AS x(id UUID, user_id UUID, notification_type TEXT, title TEXT, message TEXT, link TEXT, source_type TEXT, source_id UUID)
      JOIN public.profiles p ON p.id = x.user_id AND p.is_active = true
      ON CONFLICT (id) DO NOTHING RETURNING id
  ) SELECT coalesce(array_agg(id), '{}'::UUID[]) INTO v_ids FROM inserted;
  PERFORM public.enqueue_telegram_notifications(v_ids);
  RETURN cardinality(v_ids);
END $$;

CREATE FUNCTION public.claim_telegram_deliveries(p_limit INTEGER DEFAULT 10)
RETURNS SETOF public.telegram_deliveries LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  DELETE FROM public.telegram_link_tokens WHERE expires_at <= now();
  RETURN QUERY WITH candidates AS (
    SELECT d.id,
      EXISTS (SELECT 1 FROM public.telegram_connections c JOIN public.profiles p ON p.id = c.user_id
        JOIN public.notifications n ON n.id = d.notification_id AND n.user_id = c.user_id
        LEFT JOIN public.user_preferences u ON u.user_id = c.user_id
        WHERE c.user_id = d.user_id AND c.enabled AND c.version = d.connection_version AND p.is_active = true
          AND NOT coalesce(n.is_read, false) AND NOT coalesce(n.is_dismissed, false) AND coalesce(u.notifications_enabled, true)
          AND NOT EXISTS (SELECT 1 FROM public.notification_preferences np WHERE np.user_id = n.user_id
            AND np.notification_type = n.notification_type AND np.enabled = false)) AS eligible,
      (d.attempts < 5 AND d.created_at >= now() - INTERVAL '24 hours') AS fresh
      FROM public.telegram_deliveries d
      WHERE ((d.status = 'pending' AND d.next_attempt_at <= now()) OR (d.status = 'processing' AND d.locked_at < now() - INTERVAL '5 minutes'))
      ORDER BY d.next_attempt_at, d.created_at LIMIT greatest(1, least(coalesce(p_limit, 10), 10)) FOR UPDATE OF d SKIP LOCKED
  ), updated AS (
    UPDATE public.telegram_deliveries d SET
      status = CASE WHEN NOT c.eligible THEN 'cancelled' WHEN NOT c.fresh THEN 'failed' ELSE 'processing' END,
      locked_at = CASE WHEN c.eligible AND c.fresh THEN now() ELSE NULL END,
      claim_token = CASE WHEN c.eligible AND c.fresh THEN gen_random_uuid() ELSE NULL END,
      attempts = d.attempts + CASE WHEN c.eligible AND c.fresh THEN 1 ELSE 0 END,
      completed_at = CASE WHEN c.eligible AND c.fresh THEN NULL ELSE now() END,
      last_error = CASE WHEN NOT c.fresh THEN 'expired' ELSE d.last_error END
      FROM candidates c WHERE d.id = c.id RETURNING d.*
  ) SELECT * FROM updated WHERE status = 'processing';
END $$;

-- Revalidate the recipient immediately before sending, after acquiring a lease.
CREATE FUNCTION public.telegram_delivery_payload(p_id UUID, p_claim_token UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_payload JSONB;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  SELECT jsonb_build_object('chatId', c.chat_id, 'notification', jsonb_build_object('title', n.title, 'message', n.message, 'link', n.link))
    INTO v_payload FROM public.telegram_deliveries d
      JOIN public.telegram_connections c ON c.user_id = d.user_id AND c.enabled AND c.version = d.connection_version
      JOIN public.profiles p ON p.id = d.user_id AND p.is_active = true
      JOIN public.notifications n ON n.id = d.notification_id AND n.user_id = d.user_id
      LEFT JOIN public.user_preferences u ON u.user_id = d.user_id
    WHERE d.id = p_id AND d.claim_token = p_claim_token AND d.status = 'processing'
      AND d.locked_at >= now() - INTERVAL '5 minutes' AND d.created_at >= now() - INTERVAL '24 hours'
      AND NOT coalesce(n.is_read, false) AND NOT coalesce(n.is_dismissed, false) AND coalesce(u.notifications_enabled, true)
      AND NOT EXISTS (SELECT 1 FROM public.notification_preferences np WHERE np.user_id = n.user_id
        AND np.notification_type = n.notification_type AND np.enabled = false);
  RETURN v_payload;
END $$;

CREATE FUNCTION public.finish_telegram_delivery(p_id UUID, p_claim_token UUID, p_status TEXT,
  p_retry_at TIMESTAMPTZ DEFAULT NULL, p_error TEXT DEFAULT NULL, p_message_id TEXT DEFAULT NULL)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_delivery public.telegram_deliveries%ROWTYPE; v_user_id UUID;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  IF p_status NOT IN ('sent', 'pending', 'failed', 'cancelled') THEN RAISE EXCEPTION 'Invalid delivery state' USING ERRCODE='22023'; END IF;
  SELECT user_id INTO v_user_id FROM public.telegram_deliveries WHERE id = p_id;
  IF NOT FOUND THEN RETURN false; END IF;
  -- Same lock order as pause/disconnect; two blocked deliveries cannot lock
  -- separate rows first and then deadlock while pausing the same connection.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::TEXT, 0));
  UPDATE public.telegram_deliveries SET
    status = CASE WHEN p_status = 'pending' AND attempts >= 5 THEN 'failed' ELSE p_status END,
    next_attempt_at = CASE WHEN p_status = 'pending' THEN greatest(now() + INTERVAL '1 second', least(coalesce(p_retry_at, now() + INTERVAL '1 minute'), now() + INTERVAL '24 hours')) ELSE next_attempt_at END,
    completed_at = CASE WHEN p_status = 'pending' AND attempts < 5 THEN NULL ELSE now() END,
    last_error = left(p_error, 80), telegram_message_id = p_message_id, locked_at = NULL, claim_token = NULL
    WHERE id = p_id AND status = 'processing' AND claim_token = p_claim_token RETURNING * INTO v_delivery;
  IF NOT FOUND THEN RETURN false; END IF;
  IF p_status = 'failed' AND p_error = 'blocked' THEN
    UPDATE public.telegram_connections SET enabled = false, updated_at = now(), version = gen_random_uuid()
      WHERE user_id = v_delivery.user_id AND version = v_delivery.connection_version;
  END IF;
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.prepare_telegram_link(UUID, TEXT), public.consume_telegram_link(TEXT, TEXT, TEXT, TEXT),
  public.set_telegram_enabled(UUID, BOOLEAN), public.disconnect_telegram(UUID, TEXT), public.process_telegram_update(BIGINT, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TEXT), public.enqueue_telegram_notifications(UUID[]),
  public.publish_telegram_notifications(JSONB), public.claim_telegram_deliveries(INTEGER), public.telegram_delivery_payload(UUID, UUID),
  public.finish_telegram_delivery(UUID, UUID, TEXT, TIMESTAMPTZ, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_telegram_link(UUID, TEXT), public.consume_telegram_link(TEXT, TEXT, TEXT, TEXT),
  public.set_telegram_enabled(UUID, BOOLEAN), public.disconnect_telegram(UUID, TEXT), public.process_telegram_update(BIGINT, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TEXT), public.enqueue_telegram_notifications(UUID[]),
  public.publish_telegram_notifications(JSONB), public.claim_telegram_deliveries(INTEGER), public.telegram_delivery_payload(UUID, UUID),
  public.finish_telegram_delivery(UUID, UUID, TEXT, TIMESTAMPTZ, TEXT, TEXT) TO service_role;

COMMENT ON TABLE public.telegram_link_tokens IS 'Server-only SHA-256 digests of expiring, single-use Telegram account links.';
COMMENT ON TABLE public.telegram_deliveries IS 'Trusted server notification outbox. At-least-once delivery with leases and bounded retries.';
COMMIT;
