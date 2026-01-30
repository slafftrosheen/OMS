-- Migration 027: File Versioning System
-- Track file revision history with diff support

-- File versions table
CREATE TABLE IF NOT EXISTS file_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id uuid REFERENCES files(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  storage_path text NOT NULL,
  size_bytes bigint,
  mime_type text,
  checksum text NOT NULL,
  uploaded_by uuid REFERENCES auth.users(id),
  upload_reason text,
  metadata jsonb DEFAULT '{}'::jsonb,
  is_current boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(file_id, version_number)
);

CREATE INDEX idx_file_versions_file ON file_versions(file_id);
CREATE INDEX idx_file_versions_current ON file_versions(file_id) WHERE is_current;
CREATE INDEX idx_file_versions_checksum ON file_versions(checksum);

-- File comparison/diff tracking
CREATE TABLE IF NOT EXISTS file_comparisons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id uuid REFERENCES files(id) ON DELETE CASCADE,
  version_from integer NOT NULL,
  version_to integer NOT NULL,
  diff_summary jsonb,
  visual_diff_path text,
  pages_changed integer[],
  created_at timestamptz DEFAULT now(),
  UNIQUE(file_id, version_from, version_to)
);

CREATE INDEX idx_file_comparisons_file ON file_comparisons(file_id);

-- File restoration log
CREATE TABLE IF NOT EXISTS file_restorations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id uuid REFERENCES files(id) ON DELETE CASCADE,
  restored_from_version integer NOT NULL,
  restored_to_version integer NOT NULL,
  restored_by uuid REFERENCES auth.users(id),
  reason text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_file_restorations_file ON file_restorations(file_id);

-- Function: Create new file version
CREATE OR REPLACE FUNCTION create_file_version(
  p_file_id uuid,
  p_storage_path text,
  p_size_bytes bigint,
  p_mime_type text,
  p_checksum text,
  p_uploaded_by uuid,
  p_upload_reason text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  next_version integer;
  new_version_id uuid;
BEGIN
  -- Get next version number
  SELECT COALESCE(MAX(version_number), 0) + 1 INTO next_version
  FROM file_versions
  WHERE file_id = p_file_id;
  
  -- Mark all previous versions as not current
  UPDATE file_versions SET is_current = false WHERE file_id = p_file_id;
  
  -- Insert new version
  INSERT INTO file_versions (
    file_id, version_number, storage_path, size_bytes, mime_type,
    checksum, uploaded_by, upload_reason, metadata, is_current
  ) VALUES (
    p_file_id, next_version, p_storage_path, p_size_bytes, p_mime_type,
    p_checksum, p_uploaded_by, p_upload_reason, p_metadata, true
  ) RETURNING id INTO new_version_id;
  
  -- Update main files table
  UPDATE files SET
    storage_path = p_storage_path,
    file_size = p_size_bytes,
    updated_at = now()
  WHERE id = p_file_id;
  
  RETURN new_version_id;
END;
$$;

-- Function: Restore file to previous version
CREATE OR REPLACE FUNCTION restore_file_version(
  p_file_id uuid,
  p_version_number integer,
  p_restored_by uuid,
  p_reason text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  version_record file_versions%ROWTYPE;
  current_version integer;
BEGIN
  -- Get the version to restore
  SELECT * INTO version_record
  FROM file_versions
  WHERE file_id = p_file_id AND version_number = p_version_number;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Version % not found for file %', p_version_number, p_file_id;
  END IF;
  
  -- Get current version number
  SELECT version_number INTO current_version
  FROM file_versions
  WHERE file_id = p_file_id AND is_current = true;
  
  -- Create restoration record
  INSERT INTO file_restorations (file_id, restored_from_version, restored_to_version, restored_by, reason)
  VALUES (p_file_id, current_version, p_version_number, p_restored_by, p_reason);
  
  -- Mark restored version as current
  UPDATE file_versions SET is_current = false WHERE file_id = p_file_id;
  UPDATE file_versions SET is_current = true 
  WHERE file_id = p_file_id AND version_number = p_version_number;
  
  -- Update main files table
  UPDATE files SET
    storage_path = version_record.storage_path,
    file_size = version_record.size_bytes,
    updated_at = now()
  WHERE id = p_file_id;
  
  RETURN true;
END;
$$;

-- Function: Get file version history
CREATE OR REPLACE FUNCTION get_file_version_history(p_file_id uuid)
RETURNS TABLE (
  version_id uuid,
  version_number integer,
  size_bytes bigint,
  uploaded_by uuid,
  uploader_name text,
  upload_reason text,
  is_current boolean,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    fv.id,
    fv.version_number,
    fv.size_bytes,
    fv.uploaded_by,
    p.display_name,
    fv.upload_reason,
    fv.is_current,
    fv.created_at
  FROM file_versions fv
  LEFT JOIN profiles p ON p.id = fv.uploaded_by
  WHERE fv.file_id = p_file_id
  ORDER BY fv.version_number DESC;
END;
$$;

-- Function: Check for duplicate files (deduplication)
CREATE OR REPLACE FUNCTION find_duplicate_file(p_checksum text)
RETURNS TABLE (
  file_id uuid,
  storage_path text,
  version_number integer
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT fv.file_id, fv.storage_path, fv.version_number
  FROM file_versions fv
  WHERE fv.checksum = p_checksum
  LIMIT 1;
END;
$$;

-- Trigger: Auto-create initial version when file is created
CREATE OR REPLACE FUNCTION auto_create_file_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO file_versions (
      file_id, version_number, storage_path, size_bytes, mime_type,
      checksum, uploaded_by, is_current
    ) VALUES (
      NEW.id, 1, NEW.storage_path, NEW.file_size, NEW.mime_type,
      COALESCE(NEW.metadata->>'checksum', md5(NEW.storage_path)), NEW.uploaded_by, true
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER create_initial_file_version
  AFTER INSERT ON files
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_file_version();

-- RLS Policies
ALTER TABLE file_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_comparisons ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_restorations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view file versions for accessible files"
  ON file_versions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM files f
    WHERE f.id = file_versions.file_id
  ));

CREATE POLICY "Users can create file versions for their uploads"
  ON file_versions FOR INSERT
  WITH CHECK (auth.uid() = uploaded_by);

CREATE POLICY "Users can view file comparisons"
  ON file_comparisons FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM files f
    WHERE f.id = file_comparisons.file_id
  ));

CREATE POLICY "Users can view restoration history"
  ON file_restorations FOR SELECT
  USING (true);

CREATE POLICY "Admins can restore files"
  ON file_restorations FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'operator')
  ));

COMMENT ON TABLE file_versions IS 'Tracks all versions of uploaded files';
COMMENT ON TABLE file_comparisons IS 'Stores diff/comparison data between file versions';
COMMENT ON TABLE file_restorations IS 'Audit log of file version restorations';
