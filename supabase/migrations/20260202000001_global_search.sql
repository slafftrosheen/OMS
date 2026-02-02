-- =====================================================
-- GLOBAL SEARCH SYSTEM
-- =====================================================

-- Enable pg_trgm for fuzzy text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Global search function across multiple entities
CREATE OR REPLACE FUNCTION global_search(
    p_query TEXT,
    p_entity_types TEXT[] DEFAULT ARRAY['orders', 'materials', 'inventory', 'users'],
    p_limit INTEGER DEFAULT 50
)
RETURNS TABLE(
    entity_type TEXT,
    entity_id UUID,
    title TEXT,
    subtitle TEXT,
    description TEXT,
    url TEXT,
    metadata JSONB,
    relevance FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY

    -- Search Orders
    (
        SELECT
            'order'::TEXT as entity_type,
            o.id as entity_id,
            o.order_code as title,
            o.customer as subtitle,
            COALESCE(o.notes, '') as description,
            ('/orders/' || o.id::TEXT) as url,
            jsonb_build_object(
                'status', o.status,
                'priority', o.priority,
                'due_date', o.due_date,
                'progress', o.progress
            ) as metadata,
            (
                similarity(o.order_code, p_query) * 2 +
                similarity(o.customer, p_query) +
                similarity(COALESCE(o.notes, ''), p_query) * 0.5
            ) as relevance
        FROM orders o
        WHERE
            'orders' = ANY(p_entity_types)
            AND (
                o.order_code ILIKE '%' || p_query || '%'
                OR o.customer ILIKE '%' || p_query || '%'
                OR o.notes ILIKE '%' || p_query || '%'
            )
        ORDER BY relevance DESC
        LIMIT p_limit
    )

    UNION ALL

    -- Search Materials
    (
        SELECT
            'material'::TEXT as entity_type,
            m.id as entity_id,
            m.name as title,
            m.category as subtitle,
            COALESCE(m.description, '') as description,
            '/materials' as url,
            jsonb_build_object(
                'category', m.category,
                'type', m.type,
                'unit', m.unit
            ) as metadata,
            (
                similarity(m.name, p_query) * 2 +
                similarity(COALESCE(m.description, ''), p_query) +
                similarity(m.category, p_query)
            ) as relevance
        FROM materials m
        WHERE
            'materials' = ANY(p_entity_types)
            AND (
                m.name ILIKE '%' || p_query || '%'
                OR m.description ILIKE '%' || p_query || '%'
                OR m.category ILIKE '%' || p_query || '%'
            )
        ORDER BY relevance DESC
        LIMIT p_limit
    )

    UNION ALL

    -- Search Inventory Items
    (
        SELECT
            'inventory'::TEXT as entity_type,
            i.id as entity_id,
            i.name as title,
            (i.quantity::TEXT || ' ' || i.unit) as subtitle,
            COALESCE(i.notes, '') as description,
            '/inventory' as url,
            jsonb_build_object(
                'quantity', i.quantity,
                'unit', i.unit,
                'low_stock', i.quantity <= i.reorder_point
            ) as metadata,
            (
                similarity(i.name, p_query) * 2 +
                similarity(COALESCE(i.notes, ''), p_query)
            ) as relevance
        FROM inventory_items i
        WHERE
            'inventory' = ANY(p_entity_types)
            AND (
                i.name ILIKE '%' || p_query || '%'
                OR i.notes ILIKE '%' || p_query || '%'
            )
        ORDER BY relevance DESC
        LIMIT p_limit
    )

    UNION ALL

    -- Search Users
    (
        SELECT
            'user'::TEXT as entity_type,
            u.id as entity_id,
            COALESCE(u.raw_user_meta_data->>'full_name', u.email) as title,
            u.email as subtitle,
            COALESCE(u.raw_user_meta_data->>'role', 'user') as description,
            '/team' as url,
            jsonb_build_object(
                'email', u.email,
                'role', COALESCE(u.raw_user_meta_data->>'role', 'user')
            ) as metadata,
            (
                similarity(COALESCE(u.raw_user_meta_data->>'full_name', ''), p_query) * 2 +
                similarity(u.email, p_query)
            ) as relevance
        FROM auth.users u
        WHERE
            'users' = ANY(p_entity_types)
            AND (
                u.email ILIKE '%' || p_query || '%'
                OR u.raw_user_meta_data->>'full_name' ILIKE '%' || p_query || '%'
            )
        ORDER BY relevance DESC
        LIMIT p_limit
    )

    ORDER BY relevance DESC
    LIMIT p_limit;
END;
$$;

-- Optimized order search with full-text search and parameterized queries
CREATE OR REPLACE FUNCTION search_orders_advanced(
    p_query TEXT,
    p_filters JSONB DEFAULT '{}'::JSONB,
    p_sort_by TEXT DEFAULT 'relevance',
    p_sort_order TEXT DEFAULT 'desc',
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
    id UUID,
    order_code TEXT,
    customer TEXT,
    status TEXT,
    priority INTEGER,
    due_date TIMESTAMP,
    progress INTEGER,
    relevance FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_sql TEXT;
    v_where_clauses TEXT[] := ARRAY[]::TEXT[];
BEGIN
    -- Base query with relevance scoring
    -- We use $1 for p_query in relevance calculation
    v_sql := '
        SELECT
            o.id,
            o.order_code,
            o.customer,
            o.status,
            o.priority,
            o.due_date,
            o.progress,
            (
                similarity(o.order_code, $1) * 3 +
                similarity(o.customer, $1) * 2 +
                similarity(COALESCE(o.notes, ''''), $1) +
                CASE WHEN o.order_code ILIKE $1 THEN 5 ELSE 0 END
            ) as relevance
        FROM orders o
        WHERE 1=1
    ';

    -- Add text search condition using parameter $1
    IF p_query IS NOT NULL AND length(trim(p_query)) > 0 THEN
        v_where_clauses := array_append(v_where_clauses,
            '(o.order_code ILIKE ''%'' || $1 || ''%'' OR o.customer ILIKE ''%'' || $1 || ''%'' OR o.notes ILIKE ''%'' || $1 || ''%'')'
        );
    END IF;

    -- Apply JSON filters using parameter $2 (p_filters)

    -- Status: checks if status matches any in the array
    IF p_filters ? 'status' THEN
        v_where_clauses := array_append(v_where_clauses,
            'o.status = ANY(ARRAY(SELECT jsonb_array_elements_text($2->''status'')))'
        );
    END IF;

    -- Priority Min/Max: safely cast json value
    IF p_filters ? 'priority_min' THEN
        v_where_clauses := array_append(v_where_clauses,
            'o.priority >= ($2->>''priority_min'')::INTEGER'
        );
    END IF;

    IF p_filters ? 'priority_max' THEN
        v_where_clauses := array_append(v_where_clauses,
            'o.priority <= ($2->>''priority_max'')::INTEGER'
        );
    END IF;

    -- Date From/To
    IF p_filters ? 'due_date_from' THEN
        v_where_clauses := array_append(v_where_clauses,
            'o.due_date >= ($2->>''due_date_from'')::TIMESTAMP'
        );
    END IF;

    IF p_filters ? 'due_date_to' THEN
        v_where_clauses := array_append(v_where_clauses,
            'o.due_date <= ($2->>''due_date_to'')::TIMESTAMP'
        );
    END IF;

    -- Progress Min/Max
    IF p_filters ? 'progress_min' THEN
        v_where_clauses := array_append(v_where_clauses,
            'o.progress >= ($2->>''progress_min'')::INTEGER'
        );
    END IF;

    IF p_filters ? 'progress_max' THEN
        v_where_clauses := array_append(v_where_clauses,
            'o.progress <= ($2->>''progress_max'')::INTEGER'
        );
    END IF;

    -- Combine where clauses
    IF array_length(v_where_clauses, 1) > 0 THEN
        v_sql := v_sql || ' AND ' || array_to_string(v_where_clauses, ' AND ');
    END IF;

    -- Add sorting with allow-list validation
    v_sql := v_sql || ' ORDER BY ';

    -- Validate p_sort_by against allow-list
    IF p_sort_by NOT IN ('relevance', 'id', 'order_code', 'customer', 'status', 'priority', 'due_date', 'progress') THEN
        p_sort_by := 'relevance';
    END IF;

    -- Validate p_sort_order
    IF lower(p_sort_order) NOT IN ('asc', 'desc') THEN
        p_sort_order := 'desc';
    END IF;

    IF p_sort_by = 'relevance' THEN
        v_sql := v_sql || 'relevance';
    ELSE
        v_sql := v_sql || 'o.' || quote_ident(p_sort_by);
    END IF;

    v_sql := v_sql || ' ' || p_sort_order;

    -- Add pagination using parameters $3 and $4
    v_sql := v_sql || ' LIMIT $3 OFFSET $4';

    -- Execute dynamic query with parameters
    RETURN QUERY EXECUTE v_sql USING p_query, p_filters, p_limit, p_offset;
END;
$$;

-- Create indexes for better search performance
CREATE INDEX IF NOT EXISTS idx_orders_search_trgm
    ON orders USING gin (order_code gin_trgm_ops, customer gin_trgm_ops, notes gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_materials_search_trgm
    ON materials USING gin (name gin_trgm_ops, description gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_inventory_search_trgm
    ON inventory_items USING gin (name gin_trgm_ops);

-- Search history for analytics
CREATE TABLE IF NOT EXISTS search_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    query TEXT NOT NULL,
    entity_type TEXT,
    filters JSONB,
    results_count INTEGER,
    clicked_result UUID,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_search_history_user ON search_history(user_id, created_at DESC);
CREATE INDEX idx_search_history_query ON search_history USING gin(query gin_trgm_ops);
