-- =================================================================
-- 01: EXTENSIONS AND BASE SETUP
-- =================================================================
-- Enable required PostgreSQL extensions
-- =================================================================

-- Full text search
CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA extensions;

-- UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA extensions;

-- Comments
COMMENT ON SCHEMA extensions IS 'PostgreSQL extensions for OMS application';
