-- OMS-R06 | Team-shared Toolkit canvases; private per-user canvas conversations.
-- This migration MUST run before the R06 application deployment.
-- Back up and test on a disposable PostgreSQL 17 clone first.
BEGIN;

ALTER TABLE public.canvas_documents
  ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 0;
ALTER TABLE public.canvas_documents
  ALTER COLUMN shared SET DEFAULT TRUE;

-- Legacy Chat nodes stored messages inside the tldraw snapshot, not in a
-- conversation table. Preserve their history per creator, then remove the
-- sensitive props from every canvas before enabling team-wide RLS.
CREATE OR REPLACE FUNCTION public.toolkit_legacy_chat_threads(p_payload JSONB)
RETURNS JSONB LANGUAGE plpgsql IMMUTABLE SET search_path=public,pg_temp AS $
DECLARE
  p_path TEXT[];
  n INTEGER;
  store JSONB;
  record_row RECORD;
  threads JSONB := '{}'::jsonb;
BEGIN
  FOR n IN 1..3 LOOP
    p_path := CASE n WHEN 1 THEN ARRAY['snapshot','store']
      WHEN 2 THEN ARRAY['store'] ELSE ARRAY['snapshot','document','store'] END;
    store := p_payload #> p_path;
    IF jsonb_typeof(store) IS DISTINCT FROM 'object' THEN CONTINUE; END IF;
    FOR record_row IN SELECT key, value FROM jsonb_each(store) LOOP
      IF record_row.value->>'type' = 'chat'
        AND jsonb_typeof(record_row.value #> '{props,messages}') = 'array' THEN
        threads := threads || jsonb_build_object(record_row.key, record_row.value #> '{props,messages}');
      END IF;
    END LOOP;
  END LOOP;
  RETURN threads;
END;
$;

CREATE OR REPLACE FUNCTION public.toolkit_strip_private_canvas_payload(p_payload JSONB)
RETURNS JSONB LANGUAGE plpgsql IMMUTABLE SET search_path=public,pg_temp AS $
DECLARE
  p_path TEXT[];
  n INTEGER;
  store JSONB;
  record_row RECORD;
  clean_store JSONB;
  clean_record JSONB;
  cleaned JSONB := p_payload - 'conversation' - 'conversations' - 'messages' - 'proposals';
BEGIN
  FOR n IN 1..3 LOOP
    p_path := CASE n WHEN 1 THEN ARRAY['snapshot','store']
      WHEN 2 THEN ARRAY['store'] ELSE ARRAY['snapshot','document','store'] END;
    store := cleaned #> p_path;
    IF jsonb_typeof(store) IS DISTINCT FROM 'object' THEN CONTINUE; END IF;
    clean_store := '{}'::jsonb;
    FOR record_row IN SELECT key, value FROM jsonb_each(store) LOOP
      clean_record := record_row.value;
      IF clean_record->>'type' = 'chat' AND
        jsonb_typeof(clean_record->'props') = 'object' THEN
        clean_record := jsonb_set(clean_record, '{props,messages}', '[]'::jsonb, true);
      END IF;
      clean_store := clean_store || jsonb_build_object(record_row.key, clean_record);
    END LOOP;
    cleaned := jsonb_set(cleaned, p_path, clean_store, false);
  END LOOP;
  RETURN cleaned;
END;
$;

-- Recover historical R05 per-owner conversations BEFORE scrubbing the shared payload.
-- Historic records without user_id cannot be attributed safely and are not copied.
CREATE TABLE IF NOT EXISTS public.toolkit_canvas_conversations (
  canvas_id UUID NOT NULL REFERENCES public.canvas_documents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  proposals JSONB NOT NULL DEFAULT '[]'::jsonb,
  node_threads JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (canvas_id, user_id),
  CONSTRAINT toolkit_messages_array CHECK (jsonb_typeof(messages) = 'array'),
  CONSTRAINT toolkit_proposals_array CHECK (jsonb_typeof(proposals) = 'array')
);
INSERT INTO public.toolkit_canvas_conversations(canvas_id,user_id,messages,proposals)
SELECT id, user_id,
  CASE WHEN jsonb_typeof(payload->'conversation') = 'array' THEN payload->'conversation'
       WHEN jsonb_typeof(payload->'messages') = 'array' THEN payload->'messages'
       ELSE '[]'::jsonb END,
  CASE WHEN jsonb_typeof(payload->'proposals') = 'array' THEN payload->'proposals' ELSE '[]'::jsonb END
FROM public.canvas_documents
WHERE user_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM auth.users au WHERE au.id = canvas_documents.user_id)
  AND (payload ? 'conversation' OR payload ? 'messages' OR payload ? 'proposals')
ON CONFLICT (canvas_id,user_id) DO NOTHING;

-- Archive historical embedded ChatShape messages under each creator's own
-- private discussion row. Existing private conversation rows are preserved.
INSERT INTO public.toolkit_canvas_conversations(canvas_id,user_id,node_threads)
SELECT id,user_id,public.toolkit_legacy_chat_threads(payload)
FROM public.canvas_documents
WHERE user_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM auth.users au WHERE au.id = canvas_documents.user_id)
  AND public.toolkit_legacy_chat_threads(payload) <> '{}'::jsonb
ON CONFLICT (canvas_id,user_id) DO UPDATE
  SET node_threads = public.toolkit_canvas_conversations.node_threads || EXCLUDED.node_threads;

-- Run for every existing board before any shared RLS policy is enabled.
UPDATE public.canvas_documents
SET payload = public.toolkit_strip_private_canvas_payload(payload), shared = TRUE
WHERE payload IS DISTINCT FROM public.toolkit_strip_private_canvas_payload(payload)
   OR shared IS DISTINCT FROM TRUE;

ALTER TABLE public.canvas_documents ADD CONSTRAINT canvas_documents_shared_team
  CHECK (shared IS TRUE);

-- Guarantee revision increments and creator immutability for ALL direct PostgREST writes.
CREATE OR REPLACE FUNCTION public.toolkit_canvas_before_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public,pg_temp AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Canvas owner cannot change' USING ERRCODE = '42501';
  END IF;
  NEW.payload := public.toolkit_strip_private_canvas_payload(NEW.payload);
  NEW.revision := OLD.revision + 1;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION public.toolkit_canvas_before_insert()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $
BEGIN
  NEW.shared := TRUE;
  NEW.payload := public.toolkit_strip_private_canvas_payload(NEW.payload);
  RETURN NEW;
END;
$;
DROP TRIGGER IF EXISTS toolkit_canvas_sanitize_insert ON public.canvas_documents;
CREATE TRIGGER toolkit_canvas_sanitize_insert BEFORE INSERT ON public.canvas_documents
FOR EACH ROW EXECUTE FUNCTION public.toolkit_canvas_before_insert();

DROP TRIGGER IF EXISTS toolkit_canvas_revision_update ON public.canvas_documents;
CREATE TRIGGER toolkit_canvas_revision_update
BEFORE UPDATE ON public.canvas_documents
FOR EACH ROW EXECUTE FUNCTION public.toolkit_canvas_before_update();

-- Remove stale owner-scoped policies. There must be no permissive OR-policy
-- that gives other staff access after enabling sharing.
DO $$
DECLARE existing RECORD;
BEGIN
  FOR existing IN SELECT policyname FROM pg_policies
    WHERE schemaname='public' AND tablename='canvas_documents'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.canvas_documents', existing.policyname);
  END LOOP;
END;
$$;
ALTER TABLE public.canvas_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY toolkit_canvas_managers_read ON public.canvas_documents
  FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY toolkit_canvas_managers_create ON public.canvas_documents
  FOR INSERT TO authenticated WITH CHECK (public.is_admin() AND user_id = auth.uid() AND shared IS TRUE);
CREATE POLICY toolkit_canvas_managers_update ON public.canvas_documents
  FOR UPDATE TO authenticated USING (public.is_admin())
  WITH CHECK (public.is_admin() AND shared IS TRUE);
CREATE POLICY toolkit_canvas_managers_delete ON public.canvas_documents
  FOR DELETE TO authenticated USING (public.is_admin());

-- Strictly private discussions; unlike canvases, NO management override.
DO $$
DECLARE existing RECORD;
BEGIN
  FOR existing IN SELECT policyname FROM pg_policies
    WHERE schemaname='public' AND tablename='toolkit_canvas_conversations'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.toolkit_canvas_conversations', existing.policyname);
  END LOOP;
END;
$$;
ALTER TABLE public.toolkit_canvas_conversations ENABLE ROW LEVEL SECURITY;
-- Archive data stays in the same owner-only row as the modern discussion.
CREATE POLICY toolkit_conversations_owner_read ON public.toolkit_canvas_conversations
  FOR SELECT TO authenticated USING (user_id = auth.uid() AND public.is_admin());
CREATE POLICY toolkit_conversations_owner_insert ON public.toolkit_canvas_conversations
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND public.is_admin());
CREATE POLICY toolkit_conversations_owner_update ON public.toolkit_canvas_conversations
  FOR UPDATE TO authenticated USING (user_id = auth.uid() AND public.is_admin())
  WITH CHECK (user_id = auth.uid() AND public.is_admin());
CREATE POLICY toolkit_conversations_owner_delete ON public.toolkit_canvas_conversations
  FOR DELETE TO authenticated USING (user_id = auth.uid() AND public.is_admin());

-- Private file objects, manager-shared via authenticated streaming API.
-- The bucket is private: no public URLs or unauthenticated Storage reads.
INSERT INTO storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
VALUES ('toolkit-assets', 'toolkit-assets', false, 26214400,
 ARRAY['image/png','image/jpeg','image/webp','image/gif','application/pdf'])
ON CONFLICT(id) DO UPDATE SET public = FALSE, file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE TABLE IF NOT EXISTS public.toolkit_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_id UUID NOT NULL REFERENCES public.canvas_documents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  file_name TEXT NOT NULL CHECK (length(file_name) BETWEEN 1 AND 180),
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/png','image/jpeg','image/webp','image/gif','application/pdf')),
  bytes BIGINT NOT NULL CHECK (bytes > 0 AND bytes <= 26214400),
  storage_path TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS toolkit_assets_canvas_idx ON public.toolkit_assets(canvas_id);

ALTER TABLE public.toolkit_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY toolkit_assets_read ON public.toolkit_assets
 FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY toolkit_assets_write ON public.toolkit_assets
 FOR INSERT TO authenticated WITH CHECK (public.is_admin() AND user_id = auth.uid());
CREATE POLICY toolkit_assets_delete ON public.toolkit_assets
 FOR DELETE TO authenticated USING (public.is_admin());

-- Storage policies are scoped to the dedicated bucket. Ownership of every
-- path is checked through signed-in manager status, not public bucket listing.
DROP POLICY IF EXISTS toolkit_asset_storage_select ON storage.objects;
DROP POLICY IF EXISTS toolkit_asset_storage_insert ON storage.objects;
DROP POLICY IF EXISTS toolkit_asset_storage_delete ON storage.objects;
CREATE POLICY toolkit_asset_storage_select ON storage.objects FOR SELECT TO authenticated
 USING (bucket_id = 'toolkit-assets' AND public.is_admin());
CREATE POLICY toolkit_asset_storage_insert ON storage.objects FOR INSERT TO authenticated
 WITH CHECK (bucket_id = 'toolkit-assets' AND public.is_admin());
CREATE POLICY toolkit_asset_storage_delete ON storage.objects FOR DELETE TO authenticated
 USING (bucket_id = 'toolkit-assets' AND public.is_admin());
GRANT SELECT,INSERT,DELETE ON public.toolkit_assets TO authenticated;

-- Authenticated role grants are needed for PostgREST; policies remain authoritative.
GRANT SELECT,INSERT,UPDATE,DELETE ON public.canvas_documents TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.toolkit_canvas_conversations TO authenticated;
REVOKE ALL ON public.toolkit_canvas_conversations FROM anon;

COMMIT;
