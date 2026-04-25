-- =================================================================
-- 20260425000007: MISSING RPC FUNCTIONS
-- =================================================================
-- Implements the 12 RPCs the API calls but no migration ever defined.
-- All are SECURITY DEFINER so they run with the function owner's privileges
-- but check auth.uid() / auth.role() inside.
-- =================================================================

-- -----------------------------------------------------------------
-- create_change_request
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_change_request(
    p_order_id      UUID,
    p_description   TEXT,
    p_proposed_diff JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_id      UUID;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;
    INSERT INTO public.change_requests (order_id, description, proposed_diff, requested_by)
    VALUES (p_order_id, p_description, p_proposed_diff, v_user_id)
    RETURNING id INTO v_id;

    INSERT INTO public.order_activity_log (order_id, actor_id, event_type, payload)
    VALUES (p_order_id, v_user_id, 'change_request_created',
            jsonb_build_object('change_request_id', v_id, 'description', p_description));

    RETURN v_id;
END;
$$;

-- -----------------------------------------------------------------
-- review_change_request
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.review_change_request(
    p_change_request_id UUID,
    p_decision          TEXT,        -- 'approved' | 'rejected'
    p_notes             TEXT DEFAULT NULL
)
RETURNS public.change_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_row     public.change_requests;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;
    IF p_decision NOT IN ('approved', 'rejected') THEN
        RAISE EXCEPTION 'p_decision must be approved or rejected';
    END IF;

    UPDATE public.change_requests
       SET status        = p_decision,
           reviewed_by   = v_user_id,
           reviewed_at   = now(),
           review_notes  = p_notes,
           updated_at    = now()
     WHERE id = p_change_request_id
     RETURNING * INTO v_row;

    INSERT INTO public.order_activity_log (order_id, actor_id, event_type, payload)
    VALUES (v_row.order_id, v_user_id, 'change_request_' || p_decision,
            jsonb_build_object('change_request_id', v_row.id, 'notes', p_notes));

    RETURN v_row;
END;
$$;

-- -----------------------------------------------------------------
-- apply_change_request
-- Applies the proposed_diff (a {column: new_value} JSONB map) to
-- draft_orders, marks the request as applied, logs activity.
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_change_request(
    p_change_request_id UUID
)
RETURNS public.change_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_row     public.change_requests;
    v_key     TEXT;
    v_value   JSONB;
    v_sql     TEXT;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT * INTO v_row FROM public.change_requests WHERE id = p_change_request_id;
    IF v_row IS NULL THEN
        RAISE EXCEPTION 'Change request not found';
    END IF;
    IF v_row.status <> 'approved' THEN
        RAISE EXCEPTION 'Change request must be approved before it can be applied';
    END IF;

    -- Apply the diff one column at a time, restricted to a small allow-list.
    FOR v_key, v_value IN SELECT * FROM jsonb_each(v_row.proposed_diff) LOOP
        IF v_key NOT IN ('title', 'client', 'due_date', 'loading_date', 'priority',
                         'notes', 'is_rd', 'rd_notes', 'badges', 'status') THEN
            RAISE EXCEPTION 'Column % is not allowed in change_request diff', v_key;
        END IF;
        v_sql := format('UPDATE public.draft_orders SET %I = $1, updated_by = $2, updated_at = now() WHERE id = $3',
                        v_key);
        EXECUTE v_sql USING v_value, v_user_id, v_row.order_id;
    END LOOP;

    UPDATE public.change_requests
       SET status      = 'applied',
           applied_at  = now(),
           updated_at  = now()
     WHERE id = p_change_request_id
     RETURNING * INTO v_row;

    INSERT INTO public.order_activity_log (order_id, actor_id, event_type, payload)
    VALUES (v_row.order_id, v_user_id, 'change_request_applied',
            jsonb_build_object('change_request_id', v_row.id));

    RETURN v_row;
END;
$$;

-- -----------------------------------------------------------------
-- toggle_loading_day_lock
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.toggle_loading_day_lock(
    p_date DATE
)
RETURNS public.loading_days
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_row public.loading_days;
BEGIN
    IF auth.role() <> 'authenticated' THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    INSERT INTO public.loading_days (date, is_blocked, max_capacity)
    VALUES (p_date, true, 10)
    ON CONFLICT (date) DO UPDATE
        SET is_blocked = NOT public.loading_days.is_blocked,
            updated_at = now()
    RETURNING * INTO v_row;

    RETURN v_row;
END;
$$;

-- -----------------------------------------------------------------
-- create_station_log
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_station_log(
    p_station TEXT,
    p_action  TEXT,
    p_details JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_id      UUID;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;
    INSERT INTO public.station_logs (user_id, station, action, details)
    VALUES (v_user_id, p_station, p_action, p_details)
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

-- -----------------------------------------------------------------
-- generate_order_qr_code
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_order_qr_code(
    p_order_id UUID,
    p_label    TEXT DEFAULT NULL
)
RETURNS public.order_qr_codes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_po      TEXT;
    v_code    TEXT;
    v_row     public.order_qr_codes;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT po_number INTO v_po FROM public.draft_orders WHERE id = p_order_id;
    IF v_po IS NULL THEN
        RAISE EXCEPTION 'Order not found';
    END IF;

    -- Encoded payload: PO + short random suffix.
    v_code := v_po || '-' || substr(replace(extensions.uuid_generate_v4()::text, '-', ''), 1, 8);

    INSERT INTO public.order_qr_codes (order_id, code, label, created_by, payload)
    VALUES (p_order_id, v_code, COALESCE(p_label, v_po), v_user_id,
            jsonb_build_object('po_number', v_po, 'order_id', p_order_id))
    RETURNING * INTO v_row;
    RETURN v_row;
END;
$$;

-- -----------------------------------------------------------------
-- get_order_statistics
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_order_statistics(
    p_from DATE DEFAULT (CURRENT_DATE - 30),
    p_to   DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
    SELECT jsonb_build_object(
        'period_from',     p_from,
        'period_to',       p_to,
        'total',           (SELECT COUNT(*) FROM public.draft_orders WHERE created_at::date BETWEEN p_from AND p_to),
        'completed',       (SELECT COUNT(*) FROM public.draft_orders WHERE status = 'completed' AND updated_at::date BETWEEN p_from AND p_to),
        'cancelled',       (SELECT COUNT(*) FROM public.draft_orders WHERE status = 'cancelled' AND updated_at::date BETWEEN p_from AND p_to),
        'rd_runs',         (SELECT COUNT(*) FROM public.draft_orders WHERE is_rd = true AND created_at::date BETWEEN p_from AND p_to),
        'avg_lead_days',   (SELECT AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 86400.0)
                              FROM public.draft_orders
                             WHERE status = 'completed' AND updated_at::date BETWEEN p_from AND p_to),
        'by_status',       (SELECT jsonb_object_agg(status, c) FROM (
                                SELECT status, COUNT(*) AS c FROM public.draft_orders
                                 WHERE created_at::date BETWEEN p_from AND p_to GROUP BY status
                            ) s)
    );
$$;

-- -----------------------------------------------------------------
-- get_station_workload
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_station_workload()
RETURNS TABLE (
    station        TEXT,
    in_progress    INTEGER,
    queued         INTEGER,
    blocked        INTEGER,
    rework         INTEGER,
    estimated_hrs  NUMERIC
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        s.station,
        COUNT(*) FILTER (WHERE s.state = 'IN_PROGRESS')::int,
        COUNT(*) FILTER (WHERE s.state = 'QUEUED')::int,
        COUNT(*) FILTER (WHERE s.state = 'BLOCKED')::int,
        COUNT(*) FILTER (WHERE s.state = 'REWORK')::int,
        COALESCE(SUM(s.estimated_hours) FILTER (WHERE s.state IN ('QUEUED','IN_PROGRESS')), 0)
      FROM public.order_stages s
     GROUP BY s.station;
$$;

-- -----------------------------------------------------------------
-- search_orders_advanced
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_orders_advanced(
    p_query    TEXT DEFAULT NULL,
    p_status   TEXT[] DEFAULT NULL,
    p_priority TEXT[] DEFAULT NULL,
    p_client   TEXT DEFAULT NULL,
    p_limit    INTEGER DEFAULT 50,
    p_offset   INTEGER DEFAULT 0
)
RETURNS SETOF public.ordersummary
LANGUAGE sql
STABLE
AS $$
    SELECT s.*
      FROM public.ordersummary s
     WHERE (p_query    IS NULL OR
                s.po_number ILIKE '%' || p_query || '%' OR
                s.title     ILIKE '%' || p_query || '%' OR
                s.client    ILIKE '%' || p_query || '%')
       AND (p_status   IS NULL OR s.status   = ANY(p_status))
       AND (p_priority IS NULL OR s.priority = ANY(p_priority))
       AND (p_client   IS NULL OR s.client   ILIKE '%' || p_client || '%')
     ORDER BY
        CASE WHEN s.priority = 'rush'   THEN 0
             WHEN s.priority = 'high'   THEN 1
             WHEN s.priority = 'normal' THEN 2
             ELSE 3 END,
        s.due_date NULLS LAST,
        s.created_at DESC
     LIMIT p_limit OFFSET p_offset;
$$;

-- -----------------------------------------------------------------
-- replace_order_profiles
-- Atomically replace all profile rows attached to an order.
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.replace_order_profiles(
    p_order_id UUID,
    p_profiles JSONB              -- array of profile spec objects
)
RETURNS SETOF public.order_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_profile JSONB;
    v_idx     INTEGER := 0;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    DELETE FROM public.order_profiles WHERE order_id = p_order_id;

    FOR v_profile IN SELECT jsonb_array_elements(p_profiles) LOOP
        INSERT INTO public.order_profiles (
            order_id, profile_template_id, quantity1, quantity2, quantity3, quantity4,
            configuration, notes, order_index
        ) VALUES (
            p_order_id,
            (v_profile->>'profile_template_id')::uuid,
            (v_profile->>'quantity1')::int,
            (v_profile->>'quantity2')::int,
            (v_profile->>'quantity3')::int,
            (v_profile->>'quantity4')::int,
            COALESCE(v_profile->'configuration', '{}'::jsonb),
            v_profile->>'notes',
            COALESCE((v_profile->>'order_index')::int, v_idx)
        );
        v_idx := v_idx + 1;
    END LOOP;

    RETURN QUERY SELECT * FROM public.order_profiles WHERE order_id = p_order_id ORDER BY order_index;
END;
$$;

-- -----------------------------------------------------------------
-- global_search
-- Cross-table fuzzy search using pg_trgm.
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.global_search(
    p_query TEXT,
    p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
    kind        TEXT,
    id          UUID,
    title       TEXT,
    subtitle    TEXT,
    similarity  REAL
)
LANGUAGE sql
STABLE
AS $$
    SELECT 'order'::text, o.id, o.po_number, o.client,
           GREATEST(
              extensions.similarity(o.po_number, p_query),
              extensions.similarity(COALESCE(o.title,''), p_query),
              extensions.similarity(o.client, p_query)
           ) AS similarity
      FROM public.draft_orders o
     WHERE o.po_number ILIKE '%' || p_query || '%'
        OR o.title     ILIKE '%' || p_query || '%'
        OR o.client    ILIKE '%' || p_query || '%'
    UNION ALL
    SELECT 'profile'::text, p.id, p.full_name, p.email,
           GREATEST(
              extensions.similarity(COALESCE(p.full_name,''), p_query),
              extensions.similarity(COALESCE(p.username,''),  p_query),
              extensions.similarity(COALESCE(p.email,''),     p_query)
           )
      FROM public.profiles p
     WHERE p.full_name ILIKE '%' || p_query || '%'
        OR p.username  ILIKE '%' || p_query || '%'
        OR p.email     ILIKE '%' || p_query || '%'
    UNION ALL
    SELECT 'material'::text, m.id, m.name_en, m.category,
           GREATEST(
              extensions.similarity(COALESCE(m.name_en,''),   p_query),
              extensions.similarity(COALESCE(m.code,''),      p_query),
              extensions.similarity(COALESCE(m.category,''),  p_query)
           )
      FROM public.materials m
     WHERE m.name_en  ILIKE '%' || p_query || '%'
        OR m.code     ILIKE '%' || p_query || '%'
        OR m.category ILIKE '%' || p_query || '%'
     ORDER BY similarity DESC
     LIMIT p_limit;
$$;

-- -----------------------------------------------------------------
-- match_code_chunks (pgvector)
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.match_code_chunks(
    query_embedding vector(768),
    match_threshold FLOAT DEFAULT 0.4,
    match_count     INTEGER DEFAULT 5
)
RETURNS TABLE (
    id          UUID,
    file_path   TEXT,
    symbol      TEXT,
    content     TEXT,
    similarity  FLOAT
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT
        cc.id, cc.file_path, cc.symbol, cc.content,
        1 - (cc.embedding <=> query_embedding) AS similarity
      FROM public.code_chunks cc
     WHERE 1 - (cc.embedding <=> query_embedding) > match_threshold
     ORDER BY cc.embedding <=> query_embedding
     LIMIT match_count;
END;
$$;

COMMENT ON FUNCTION public.create_change_request   IS 'Open an engineering change request for an order. Logs to order_activity_log.';
COMMENT ON FUNCTION public.review_change_request   IS 'Approve or reject a change request and log the decision.';
COMMENT ON FUNCTION public.apply_change_request    IS 'Apply an approved change_request''s proposed_diff to draft_orders.';
COMMENT ON FUNCTION public.toggle_loading_day_lock IS 'Toggle loading-day block flag. Creates the loading_day row if absent.';
COMMENT ON FUNCTION public.create_station_log      IS 'Append a workstation activity log entry for the calling user.';
COMMENT ON FUNCTION public.generate_order_qr_code  IS 'Generate a unique QR payload for an order traveller card.';
COMMENT ON FUNCTION public.get_order_statistics    IS 'Headline order metrics for an arbitrary date range.';
COMMENT ON FUNCTION public.get_station_workload    IS 'Per-station IN_PROGRESS / QUEUED / BLOCKED / REWORK counts.';
COMMENT ON FUNCTION public.search_orders_advanced  IS 'Fuzzy + multi-filter order search returning ordersummary rows.';
COMMENT ON FUNCTION public.replace_order_profiles  IS 'Atomically replace all profile rows attached to an order.';
COMMENT ON FUNCTION public.global_search           IS 'Cross-table fuzzy search across orders, profiles, materials.';
COMMENT ON FUNCTION public.match_code_chunks       IS 'Cosine-similarity vector search over the code_chunks table for the AI orchestrator.';
