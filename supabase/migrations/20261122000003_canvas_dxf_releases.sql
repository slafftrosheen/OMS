-- Register the reviewed file and its order link in one transaction.
-- File and link RLS still run as the caller.
CREATE OR REPLACE FUNCTION public.register_canvas_dxf_release(
  p_order_id uuid, p_file_id uuid, p_pocket text, p_name text, p_original_name text,
  p_storage_key text, p_size bigint, p_release jsonb
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
     p_storage_key IS NULL OR split_part(p_storage_key, '/', 1) <> 'orders' OR
     split_part(p_storage_key, '/', 2) <> p_order_id::text OR
     split_part(p_storage_key, '/', 3) <> actor::text OR
     split_part(p_storage_key, '/', 4) = '' OR split_part(p_storage_key, '/', 5) <> '' OR
     p_release IS NULL OR jsonb_typeof(p_release) <> 'object' OR octet_length(p_release::text) > 3000 THEN
    RAISE EXCEPTION 'Invalid Canvas DXF release' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.files (id, filename, original_name, filepath, mimetype, size, uploaded_by, metadata)
  VALUES (p_file_id, split_part(p_storage_key, '/', 4), p_original_name, p_storage_key, 'application/dxf',
    p_size, actor, jsonb_build_object('storage_key', p_storage_key, 'storage_bucket', 'files', 'canvas_dxf_release', p_release))
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
    WHERE f.id = p_file_id AND f.uploaded_by = actor AND f.metadata -> 'canvas_dxf_release' = p_release;
  IF saved IS NULL THEN
    RAISE EXCEPTION 'Canvas DXF release conflicts with an existing file' USING ERRCODE = '23505';
  END IF;
  RETURN saved;
END;
$$;

REVOKE ALL ON FUNCTION public.register_canvas_dxf_release(uuid, uuid, text, text, text, text, bigint, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_canvas_dxf_release(uuid, uuid, text, text, text, text, bigint, jsonb) TO authenticated;
