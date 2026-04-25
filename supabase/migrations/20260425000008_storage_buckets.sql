-- =================================================================
-- 20260425000008: STORAGE BUCKETS
-- =================================================================
-- Creates the two buckets the upload endpoints write to.  Uses ON CONFLICT
-- so re-running is safe.  RLS policies on storage.objects scope access.
-- =================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES
    ('files',                'files',                false),
    ('station-attachments',  'station-attachments',  false)
ON CONFLICT (id) DO NOTHING;

-- Drop any pre-existing policies with these names so the migration is idempotent.
DROP POLICY IF EXISTS "Authenticated read files"               ON storage.objects;
DROP POLICY IF EXISTS "Authenticated write files"              ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete files"             ON storage.objects;
DROP POLICY IF EXISTS "Authenticated read station-attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated write station-attachments" ON storage.objects;

-- files bucket
CREATE POLICY "Authenticated read files"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'files' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated write files"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'files' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated delete files"
    ON storage.objects FOR DELETE
    USING (bucket_id = 'files' AND auth.role() = 'authenticated');

-- station-attachments bucket
CREATE POLICY "Authenticated read station-attachments"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'station-attachments' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated write station-attachments"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'station-attachments' AND auth.role() = 'authenticated');

COMMENT ON POLICY "Authenticated read files"               ON storage.objects IS 'Files bucket: any authenticated user can read.';
COMMENT ON POLICY "Authenticated write files"              ON storage.objects IS 'Files bucket: any authenticated user can upload.';
COMMENT ON POLICY "Authenticated delete files"             ON storage.objects IS 'Files bucket: any authenticated user can delete.';
COMMENT ON POLICY "Authenticated read station-attachments" ON storage.objects IS 'Station-attachments bucket: any authenticated user can read.';
COMMENT ON POLICY "Authenticated write station-attachments" ON storage.objects IS 'Station-attachments bucket: any authenticated user can upload.';
