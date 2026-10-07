-- ============================================================================
-- 20260810000002_station_attachments.sql
-- Station photo/document attachments (used by AttachmentGallery + the
-- /api/station-attachments routes for station-log evidence uploads).
-- Backs the columns the API actually INSERTs/SELECTs; the Storage bucket
-- "station-attachments" already exists, so this migration only creates the
-- table, its FKs/indexes, and RLS policies (matching the auth checks the
-- route enforces: uploader-only delete, any authenticated user can view).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.station_attachments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID NOT NULL
                    REFERENCES public.draft_orders(id) ON DELETE CASCADE,
  station_log_id  UUID
                    REFERENCES public.station_logs(id) ON DELETE SET NULL,
  station         TEXT NOT NULL,
  attachment_type TEXT NOT NULL DEFAULT 'photo'
                    CHECK (attachment_type IN (
                      'photo', 'damage_report', 'quality_check',
                      'progress', 'rework_doc'
                    )),
  file_name       TEXT NOT NULL,
  file_path       TEXT NOT NULL,            -- Supabase Storage object path
  file_type       TEXT NOT NULL,            -- MIME type
  mime_type       TEXT,                     -- kept for forward-compat
  file_size       BIGINT NOT NULL,          -- bytes
  width           INT,                      -- image/video
  height          INT,                      -- image/video
  thumbnail_path  TEXT,                     -- Supabase Storage thumbnail path
  caption         TEXT,
  notes           TEXT,
  tags            TEXT[] DEFAULT '{}',
  -- FK name matters: the API join uses
  -- auth.users!station_attachments_uploaded_by_fkey
  uploaded_by     UUID NOT NULL
                    CONSTRAINT station_attachments_uploaded_by_fkey
                    REFERENCES auth.users(id),
  uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_station_attachments_order
  ON public.station_attachments(order_id);
CREATE INDEX IF NOT EXISTS idx_station_attachments_station
  ON public.station_attachments(station);
CREATE INDEX IF NOT EXISTS idx_station_attachments_type
  ON public.station_attachments(attachment_type);
CREATE INDEX IF NOT EXISTS idx_station_attachments_uploaded_at
  ON public.station_attachments(uploaded_at DESC);

ALTER TABLE public.station_attachments ENABLE ROW LEVEL SECURITY;

-- Any authenticated user may view attachments.
DROP POLICY IF EXISTS "station_attachments_read" ON public.station_attachments;
CREATE POLICY "station_attachments_read" ON public.station_attachments
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- You can only insert rows attributed to yourself.
DROP POLICY IF EXISTS "station_attachments_insert" ON public.station_attachments;
CREATE POLICY "station_attachments_insert" ON public.station_attachments
  FOR INSERT WITH CHECK (auth.uid() = uploaded_by);

-- You can only delete rows you uploaded (mirrors the API ownership check).
DROP POLICY IF EXISTS "station_attachments_delete" ON public.station_attachments;
CREATE POLICY "station_attachments_delete" ON public.station_attachments
  FOR DELETE USING (auth.uid() = uploaded_by);
