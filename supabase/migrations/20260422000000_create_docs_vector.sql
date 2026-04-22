-- =================================================================
-- Migration: Create framework_docs vector table for external documentation
-- =================================================================
-- Stores embedded documentation pages (e.g., Svelte 5, SvelteKit, MDN)
-- crawled by the src/workers/crawler worker and used for RAG retrieval.
-- =================================================================

-- 1. Enable pgvector extension (idempotent)
CREATE EXTENSION IF NOT EXISTS vector SCHEMA extensions;

-- 2. Create the framework_docs table
CREATE TABLE IF NOT EXISTS public.framework_docs (
    id          uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    url         text NOT NULL,
    title       text NOT NULL,
    content     text NOT NULL,
    embedding   vector(768) NOT NULL,
    crawled_at  timestamptz DEFAULT now(),

    -- Prevent duplicate chunks for the same URL + title combination
    CONSTRAINT framework_docs_url_title_key UNIQUE (url, title)
);

-- Enable RLS (deny all by default — only service_role bypasses RLS)
ALTER TABLE public.framework_docs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.framework_docs IS
    'Vector store for external documentation pages (Svelte, MDN, etc.) ingested by the crawler worker.';

-- 3. HNSW index for fast cosine similarity search
--    HNSW gives ~10x faster queries than IVFFlat at the cost of slightly more insert time.
CREATE INDEX IF NOT EXISTS framework_docs_embedding_idx
    ON public.framework_docs
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- 4. B-tree index on url for deduplication lookups
CREATE INDEX IF NOT EXISTS framework_docs_url_idx
    ON public.framework_docs (url);

-- 5. RPC function: match_framework_docs
--    Mirrors the existing match_code_chunks function signature.
CREATE OR REPLACE FUNCTION public.match_framework_docs(
    query_embedding vector(768),
    match_threshold float DEFAULT 0.4,
    match_count int DEFAULT 5
)
RETURNS TABLE (
    id          uuid,
    url         text,
    title       text,
    content     text,
    similarity  float
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT
        fd.id,
        fd.url,
        fd.title,
        fd.content,
        1 - (fd.embedding <=> query_embedding) AS similarity
    FROM public.framework_docs fd
    WHERE 1 - (fd.embedding <=> query_embedding) > match_threshold
    ORDER BY fd.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

COMMENT ON FUNCTION public.match_framework_docs IS
    'Cosine similarity search over external documentation embeddings. Used by the Hivemind orchestrator.';
