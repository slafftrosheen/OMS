/**
 * Station Attachments System Migration
 * Enables photo uploads for station logs and order documentation
 */

-- Station attachments table
CREATE TABLE IF NOT EXISTS station_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Relations
  order_id UUID NOT NULL REFERENCES draft_orders(id) ON DELETE CASCADE,
  station_log_id UUID REFERENCES station_logs(id) ON DELETE CASCADE,
  
  -- File metadata
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL, -- Storage path
  file_type TEXT NOT NULL CHECK (file_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  file_size INTEGER NOT NULL, -- bytes
  mime_type TEXT NOT NULL,
  
  -- Image-specific metadata (NULL for PDFs)
  width INTEGER,
  height INTEGER,
  thumbnail_path TEXT,
  
  -- Context
  station TEXT NOT NULL,
  attachment_type TEXT NOT NULL DEFAULT 'photo' CHECK (
    attachment_type IN ('photo', 'damage_report', 'quality_check', 'progress', 'rework_doc', 'other')
  ),
  caption TEXT,
  notes TEXT,
  
  -- Metadata
  uploaded_by UUID NOT NULL REFERENCES auth.users(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Tags for categorization
  tags TEXT[] DEFAULT '{}',
  
  -- Visibility
  is_public BOOLEAN DEFAULT false,
  
  CONSTRAINT valid_file_size CHECK (file_size > 0 AND file_size <= 10485760) -- 10MB max
);

-- Indexes
CREATE INDEX idx_station_attachments_order ON station_attachments(order_id);
CREATE INDEX idx_station_attachments_station ON station_attachments(station);
CREATE INDEX idx_station_attachments_log ON station_attachments(station_log_id);
CREATE INDEX idx_station_attachments_type ON station_attachments(attachment_type);
CREATE INDEX idx_station_attachments_uploaded ON station_attachments(uploaded_at DESC);
CREATE INDEX idx_station_attachments_tags ON station_attachments USING GIN(tags);

-- RLS Policies
ALTER TABLE station_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view station attachments"
  ON station_attachments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can upload station attachments"
  ON station_attachments FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = uploaded_by);

CREATE POLICY "Users can update own attachments"
  ON station_attachments FOR UPDATE
  TO authenticated
  USING (auth.uid() = uploaded_by);

CREATE POLICY "Users can delete own attachments"
  ON station_attachments FOR DELETE
  TO authenticated
  USING (auth.uid() = uploaded_by);

-- Storage bucket for attachments
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'station-attachments',
  'station-attachments',
  false,
  10485760, -- 10MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Authenticated users can upload attachments"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'station-attachments');

CREATE POLICY "Users can view attachments"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'station-attachments');

CREATE POLICY "Users can delete own attachments"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'station-attachments' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Function to log attachment creation
CREATE OR REPLACE FUNCTION log_attachment_creation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Create notification for order assignees
  INSERT INTO notifications (user_id, type, title, message, related_id)
  SELECT 
    unnest(assignees::text[])::uuid,
    'attachment_added',
    'New Photo Added',
    'A photo was added to ' || NEW.station || ' for order',
    NEW.order_id
  FROM draft_orders
  WHERE id = NEW.order_id;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_log_attachment
AFTER INSERT ON station_attachments
FOR EACH ROW
EXECUTE FUNCTION log_attachment_creation();

-- View for attachment statistics
CREATE OR REPLACE VIEW station_attachment_stats AS
SELECT 
  station,
  attachment_type,
  COUNT(*) as total_attachments,
  SUM(file_size) as total_size_bytes,
  AVG(file_size)::INTEGER as avg_size_bytes,
  COUNT(DISTINCT order_id) as unique_orders,
  COUNT(DISTINCT uploaded_by) as unique_uploaders,
  MAX(uploaded_at) as latest_upload
FROM station_attachments
GROUP BY station, attachment_type;

COMMENT ON TABLE station_attachments IS 'Photo and document attachments for station logs and orders';
COMMENT ON VIEW station_attachment_stats IS 'Statistics about station attachments by station and type';