-- Extend the existing private, manager-only asset library with playable media.
-- Keep the 25 MiB upload bound and all existing ownership/RLS policies.
BEGIN;
ALTER TABLE public.toolkit_assets DROP CONSTRAINT IF EXISTS toolkit_assets_mime_type_check;
ALTER TABLE public.toolkit_assets ADD CONSTRAINT toolkit_assets_mime_type_check
  CHECK (mime_type IN ('image/png','image/jpeg','image/webp','image/gif','application/pdf',
    'video/mp4','video/webm','audio/mpeg','audio/wav','audio/ogg','audio/mp4'));
UPDATE storage.buckets SET allowed_mime_types = ARRAY[
  'image/png','image/jpeg','image/webp','image/gif','application/pdf',
  'video/mp4','video/webm','audio/mpeg','audio/wav','audio/ogg','audio/mp4'
] WHERE id = 'toolkit-assets';
COMMIT;
