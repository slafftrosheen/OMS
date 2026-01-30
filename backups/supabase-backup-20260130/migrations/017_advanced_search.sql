/**
 * Advanced Search System Migration
 * Full-text search, saved filters, and search history
 */

-- Enable pg_trgm extension for fuzzy search
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Full-text search configuration
ALTER TABLE draft_orders
ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Create full-text search index
CREATE INDEX IF NOT EXISTS idx_orders_search_vector 
ON draft_orders USING GIN(search_vector);

-- Create trigram indexes for fuzzy search
CREATE INDEX IF NOT EXISTS idx_orders_po_number_trgm 
ON draft_orders USING GIN(po_number gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_orders_title_trgm 
ON draft_orders USING GIN(title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_orders_client_trgm 
ON draft_orders USING GIN(client gin_trgm_ops);

-- Saved filters table
CREATE TABLE IF NOT EXISTS saved_filters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Owner
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Filter details
  name TEXT NOT NULL,
  description TEXT,
  
  -- Filter configuration
  filters JSONB NOT NULL,
  sort_by TEXT,
  sort_direction TEXT CHECK (sort_direction IN ('asc', 'desc')),
  
  -- Visibility
  is_public BOOLEAN DEFAULT false,
  is_favorite BOOLEAN DEFAULT false,
  
  -- Usage tracking
  use_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  
  -- Tags for organization
  tags TEXT[] DEFAULT '{}'
);

-- Search history table
CREATE TABLE IF NOT EXISTS search_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Search details
  query TEXT NOT NULL,
  filters JSONB,
  results_count INTEGER,
  
  -- Context
  search_type TEXT DEFAULT 'general' CHECK (
    search_type IN ('general', 'orders', 'clients', 'stations', 'advanced')
  ),
  
  -- Metadata
  searched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Performance tracking
  execution_time_ms INTEGER
);

-- Indexes
CREATE INDEX idx_saved_filters_user ON saved_filters(user_id);
CREATE INDEX idx_saved_filters_favorite ON saved_filters(is_favorite) WHERE is_favorite = true;
CREATE INDEX idx_saved_filters_public ON saved_filters(is_public) WHERE is_public = true;
CREATE INDEX idx_search_history_user ON search_history(user_id);
CREATE INDEX idx_search_history_searched ON search_history(searched_at DESC);

-- RLS Policies
ALTER TABLE saved_filters ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own and public filters"
  ON saved_filters FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR is_public = true);

CREATE POLICY "Users can create own filters"
  ON saved_filters FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own filters"
  ON saved_filters FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own filters"
  ON saved_filters FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can view own search history"
  ON search_history FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can create own search history"
  ON search_history FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Function to update search vector
CREATE OR REPLACE FUNCTION update_order_search_vector()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_vector := 
    setweight(to_tsvector('english', COALESCE(NEW.po_number, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.client, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.notes, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.status, '')), 'D');
  
  RETURN NEW;
END;
$$;

-- Trigger to maintain search vector
DROP TRIGGER IF EXISTS trigger_update_order_search_vector ON draft_orders;
CREATE TRIGGER trigger_update_order_search_vector
BEFORE INSERT OR UPDATE OF po_number, title, client, notes, status
ON draft_orders
FOR EACH ROW
EXECUTE FUNCTION update_order_search_vector();

-- Update existing records
UPDATE draft_orders SET updated_at = NOW() WHERE search_vector IS NULL;

-- Function for advanced search
CREATE OR REPLACE FUNCTION search_orders(
  p_query TEXT DEFAULT NULL,
  p_filters JSONB DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  po_number TEXT,
  title TEXT,
  client TEXT,
  status TEXT,
  loading_day_id UUID,
  created_at TIMESTAMPTZ,
  relevance REAL
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sql TEXT;
  v_where_clauses TEXT[] := ARRAY[]::TEXT[];
  v_start_time TIMESTAMPTZ;
  v_end_time TIMESTAMPTZ;
  v_results_count INTEGER;
BEGIN
  v_start_time := clock_timestamp();
  
  -- Build base query
  v_sql := 'SELECT 
    o.id,
    o.po_number,
    o.title,
    o.client,
    o.status,
    o.loading_day_id,
    o.created_at,
    CASE 
      WHEN $1 IS NOT NULL THEN ts_rank(o.search_vector, plainto_tsquery(''english'', $1))
      ELSE 0
    END as relevance
  FROM draft_orders o
  WHERE 1=1';
  
  -- Full-text search
  IF p_query IS NOT NULL AND p_query != '' THEN
    v_where_clauses := array_append(v_where_clauses, 
      'o.search_vector @@ plainto_tsquery(''english'', $1)');
  END IF;
  
  -- Apply filters from JSONB
  IF p_filters IS NOT NULL THEN
    -- Status filter
    IF p_filters ? 'status' THEN
      v_where_clauses := array_append(v_where_clauses,
        format('o.status = %L', p_filters->>'status'));
    END IF;
    
    -- Client filter
    IF p_filters ? 'client' THEN
      v_where_clauses := array_append(v_where_clauses,
        format('o.client ILIKE %L', '%' || (p_filters->>'client') || '%'));
    END IF;
    
    -- Date range filter
    IF p_filters ? 'dateFrom' THEN
      v_where_clauses := array_append(v_where_clauses,
        format('o.created_at >= %L', p_filters->>'dateFrom'));
    END IF;
    
    IF p_filters ? 'dateTo' THEN
      v_where_clauses := array_append(v_where_clauses,
        format('o.created_at <= %L', p_filters->>'dateTo'));
    END IF;
    
    -- Assignee filter
    IF p_filters ? 'assignee' THEN
      v_where_clauses := array_append(v_where_clauses,
        format('o.assignees @> ARRAY[%L]::uuid[]', p_filters->>'assignee'));
    END IF;
  END IF;
  
  -- Combine WHERE clauses
  IF array_length(v_where_clauses, 1) > 0 THEN
    v_sql := v_sql || ' AND ' || array_to_string(v_where_clauses, ' AND ');
  END IF;
  
  -- Order by relevance if search query provided
  IF p_query IS NOT NULL AND p_query != '' THEN
    v_sql := v_sql || ' ORDER BY relevance DESC, o.created_at DESC';
  ELSE
    v_sql := v_sql || ' ORDER BY o.created_at DESC';
  END IF;
  
  -- Limit and offset
  v_sql := v_sql || format(' LIMIT %s OFFSET %s', p_limit, p_offset);
  
  -- Log search
  v_end_time := clock_timestamp();
  
  INSERT INTO search_history (user_id, query, filters, execution_time_ms, search_type)
  VALUES (
    auth.uid(),
    p_query,
    p_filters,
    EXTRACT(MILLISECONDS FROM (v_end_time - v_start_time))::INTEGER,
    'advanced'
  );
  
  -- Execute and return
  RETURN QUERY EXECUTE v_sql USING p_query;
END;
$$;

-- View for search suggestions
CREATE OR REPLACE VIEW search_suggestions AS
SELECT DISTINCT
  'client' as suggestion_type,
  client as value,
  COUNT(*) as frequency
FROM draft_orders
WHERE client IS NOT NULL
GROUP BY client

UNION ALL

SELECT DISTINCT
  'status' as suggestion_type,
  status as value,
  COUNT(*) as frequency
FROM draft_orders
WHERE status IS NOT NULL
GROUP BY status

UNION ALL

SELECT
  'recent_search' as suggestion_type,
  query as value,
  COUNT(*) as frequency
FROM search_history
WHERE searched_at > NOW() - INTERVAL '30 days'
  AND query IS NOT NULL
GROUP BY query

ORDER BY frequency DESC
LIMIT 100;

-- View for popular filters
CREATE OR REPLACE VIEW popular_saved_filters AS
SELECT 
  sf.*,
  u.email as owner_email,
  COUNT(DISTINCT sh.user_id) as unique_users
FROM saved_filters sf
JOIN auth.users u ON u.id = sf.user_id
LEFT JOIN search_history sh ON sh.filters = sf.filters
WHERE sf.is_public = true
GROUP BY sf.id, u.email
ORDER BY sf.use_count DESC, unique_users DESC
LIMIT 20;

COMMENT ON TABLE saved_filters IS 'User-created saved search filters';
COMMENT ON TABLE search_history IS 'Audit log of all search queries';
COMMENT ON FUNCTION search_orders IS 'Advanced search with full-text and filters';
COMMENT ON VIEW search_suggestions IS 'Auto-complete suggestions for search';
COMMENT ON VIEW popular_saved_filters IS 'Most used public filters';