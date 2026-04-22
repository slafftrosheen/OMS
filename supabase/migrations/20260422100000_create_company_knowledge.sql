-- =================================================================
-- Migration: Create company_knowledge vector table
-- =================================================================
-- Stores embedded corporate identity data scraped from reclamefabriek.eu.
-- Segregated from framework_docs to prevent semantic bleeding between
-- external documentation and proprietary company knowledge.
-- =================================================================

-- 1. Ensure pgvector extension (idempotent — may already exist from PR 2)
CREATE EXTENSION IF NOT EXISTS vector SCHEMA extensions;

-- 2. Create the company_knowledge table
CREATE TABLE IF NOT EXISTS public.company_knowledge (
    id          uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    url         text NOT NULL,
    category    text NOT NULL DEFAULT 'general',
    content     text NOT NULL,
    embedding   vector(768) NOT NULL,
    crawled_at  timestamptz DEFAULT now(),

    -- Prevent duplicate chunks for the same URL + category + content hash
    CONSTRAINT company_knowledge_url_category_key UNIQUE (url, category)
);

-- Enable RLS (deny all by default — only service_role bypasses RLS)
ALTER TABLE public.company_knowledge ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.company_knowledge IS
    'Vector store for proprietary corporate knowledge scraped from reclamefabriek.eu (portfolios, services, profiles).';

-- 3. HNSW index for fast cosine similarity search
CREATE INDEX IF NOT EXISTS company_knowledge_embedding_idx
    ON public.company_knowledge
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- 4. B-tree indexes for filtering and deduplication
CREATE INDEX IF NOT EXISTS company_knowledge_url_idx
    ON public.company_knowledge (url);

CREATE INDEX IF NOT EXISTS company_knowledge_category_idx
    ON public.company_knowledge (category);

-- 5. RPC function: match_company_knowledge
--    Mirrors match_code_chunks / match_framework_docs signature.
CREATE OR REPLACE FUNCTION public.match_company_knowledge(
    query_embedding vector(768),
    match_threshold float DEFAULT 0.4,
    match_count int DEFAULT 5
)
RETURNS TABLE (
    id          uuid,
    url         text,
    category    text,
    content     text,
    similarity  float
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ck.id,
        ck.url,
        ck.category,
        ck.content,
        1 - (ck.embedding <=> query_embedding) AS similarity
    FROM public.company_knowledge ck
    WHERE 1 - (ck.embedding <=> query_embedding) > match_threshold
    ORDER BY ck.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

COMMENT ON FUNCTION public.match_company_knowledge IS
    'Cosine similarity search over corporate identity embeddings from reclamefabriek.eu. Used by the Hivemind orchestrator.';
