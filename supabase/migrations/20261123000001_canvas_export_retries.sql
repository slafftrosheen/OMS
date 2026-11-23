-- Commit a generated export and its order link together so a retry can recover both.
CREATE OR REPLACE FUNCTION public.register_canvas_export(
  p_order_id uuid, p_file_id uuid, p_pocket text, p_name text, p_original_name text,
  p_storage_key text, p_size bigint, p_mime text, p_fingerprint text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  actor uuid := auth.uid();
  inserted_id uuid;
  saved jsonb;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_order_id IS NULL OR p_file_id IS NULL OR p_pocket IS NULL OR
     p_pocket NOT IN ('laser', 'cnc', 'bender', 'visuals') OR
     p_name IS NULL OR char_length(p_name) NOT BETWEEN 1 AND 255 OR
     p_original_name IS NULL OR char_length(p_original_name) NOT BETWEEN 1 AND 255 OR
     p_size IS NULL OR p_size NOT BETWEEN 1 AND 26214400 OR
     p_mime IS NULL OR p_mime NOT IN ('application/pdf', 'application/postscript', 'image/svg+xml', 'image/png', 'application/dxf') OR
     p_fingerprint IS NULL OR p_fingerprint !~ '^[0-9a-f]{64}$' OR
     p_storage_key IS NULL OR split_part(p_storage_key, '/', 1) <> 'orders' OR
     split_part(p_storage_key, '/', 2) <> p_order_id::text OR
     split_part(p_storage_key, '/', 3) <> actor::text OR
     split_part(p_storage_key, '/', 4) !~ '^[0-9a-f-]{36}-[A-Za-z0-9._-]{1,100}$' OR
     array_length(string_to_array(p_storage_key, '/'), 1) <> 4 THEN
    RAISE EXCEPTION 'Invalid Canvas export' USING ERRCODE = '22023';
  END IF;

  -- Apply the same role and status rules as the upload endpoint.
  IF NOT EXISTS (
    SELECT 1 FROM public.draft_orders o
    JOIN public.profiles p ON p.id = actor AND p.is_active IS TRUE
    WHERE o.id = p_order_id AND (
      (o.status::text IN ('DRAFT', 'draft', 'PENDING_REVIEW') AND
        (o.created_by = actor OR p.role IN ('RD', 'Boss', 'HeadOfProduction')))
      OR (o.status::text IN ('CONFIRMED', 'IN_PRODUCTION', 'READY_TO_LOAD', 'ON_HOLD') AND
        p.role IN ('RD', 'Boss', 'HeadOfProduction'))
    )
  ) THEN
    RAISE EXCEPTION 'Canvas export is not permitted for this order' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.files (id, filename, original_name, filepath, mimetype, size, uploaded_by, metadata)
  VALUES (p_file_id, split_part(p_storage_key, '/', 4), p_original_name, p_storage_key, p_mime,
    p_size, actor, jsonb_build_object('storage_key', p_storage_key, 'storage_bucket', 'files',
      'canvas_export_fingerprint', p_fingerprint))
  ON CONFLICT (id) DO NOTHING
  RETURNING id INTO inserted_id;

  IF inserted_id IS NOT NULL THEN
    INSERT INTO public.order_files (draft_order_id, file_id, file_type, display_name)
    VALUES (p_order_id, inserted_id, p_pocket, p_name);
  END IF;

  SELECT to_jsonb(f) || jsonb_build_object('file_type', l.file_type, 'display_name', l.display_name)
    INTO saved
    FROM public.files f
    JOIN public.order_files l ON l.file_id = f.id AND l.draft_order_id = p_order_id
    WHERE f.id = p_file_id AND f.uploaded_by = actor AND l.file_type = p_pocket
      AND f.mimetype = p_mime AND f.size = p_size AND f.original_name = p_original_name
      AND f.metadata ->> 'canvas_export_fingerprint' = p_fingerprint;
  IF saved IS NULL THEN
    RAISE EXCEPTION 'Canvas export conflicts with an existing file' USING ERRCODE = '23505';
  END IF;
  RETURN saved;
END;
$$;

REVOKE ALL ON FUNCTION public.register_canvas_export(uuid, uuid, text, text, text, text, bigint, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_canvas_export(uuid, uuid, text, text, text, text, bigint, text, text) TO authenticated;
