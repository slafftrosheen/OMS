-- OMS-R15: harden existing security-definer change-request RPCs.
-- This migration is additive and preserves recorded change_requests.
-- Apply AFTER 20260425000007_rpcs.sql and the R12 order migrations.
BEGIN;

CREATE OR REPLACE FUNCTION public.create_change_request(
 p_order_id UUID,p_description TEXT,p_proposed_diff JSONB DEFAULT '{}'::jsonb
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE
 v_actor UUID:=auth.uid();v_role TEXT;v_owner UUID;v_status TEXT;v_id UUID;
BEGIN
 IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 SELECT role INTO v_role FROM public.profiles WHERE id=v_actor AND is_active=TRUE;
 IF v_role IS NULL THEN RAISE EXCEPTION 'User inactive' USING ERRCODE='42501'; END IF;
 SELECT created_by,status INTO v_owner,v_status FROM public.draft_orders
 WHERE id=p_order_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Order not found' USING ERRCODE='P0002'; END IF;
 IF v_status NOT IN ('DRAFT','draft','PENDING_REVIEW','CONFIRMED','IN_PRODUCTION','READY_TO_LOAD','ON_HOLD') THEN
  RAISE EXCEPTION 'Order is locked for changes' USING ERRCODE='42501';
 END IF;
 IF v_actor IS DISTINCT FROM v_owner
    AND v_role NOT IN ('RD','Boss','HeadOfProduction')
    AND NOT EXISTS(SELECT 1 FROM public.order_assignees
      WHERE draft_order_id=p_order_id AND assignee_id=v_actor) THEN
  RAISE EXCEPTION 'No permission to request order changes' USING ERRCODE='42501';
 END IF;
 IF COALESCE(length(trim(p_description)),0) NOT BETWEEN 1 AND 4000 THEN
  RAISE EXCEPTION 'Description must be 1–4000 characters';
 END IF;
 IF p_proposed_diff IS NULL OR jsonb_typeof(p_proposed_diff)<>'object' OR
    (SELECT count(*) FROM jsonb_object_keys(p_proposed_diff))>10 OR EXISTS(
      SELECT 1 FROM jsonb_object_keys(p_proposed_diff) AS key
      WHERE key NOT IN ('title','client','due_date','loading_date','priority',
        'notes','is_rd','rd_notes','badges')
    ) THEN
  RAISE EXCEPTION 'Unsupported proposed order field';
 END IF;
 INSERT INTO public.change_requests(order_id,description,proposed_diff,requested_by)
 VALUES(p_order_id,p_description,p_proposed_diff,v_actor) RETURNING id INTO v_id;
 INSERT INTO public.order_activity_log(order_id,actor_id,event_type,payload)
 VALUES(p_order_id,v_actor,'change_request_created',
   jsonb_build_object('change_request_id',v_id,'description',p_description));
 RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_change_request(
 p_change_request_id UUID,p_decision TEXT,p_notes TEXT DEFAULT NULL
) RETURNS public.change_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE
 v_actor UUID:=auth.uid();v_role TEXT;v_row public.change_requests;
BEGIN
 IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 SELECT role INTO v_role FROM public.profiles WHERE id=v_actor AND is_active=TRUE;
 IF v_role NOT IN ('RD','Boss','HeadOfProduction') OR v_role IS NULL THEN
  RAISE EXCEPTION 'Reviewer role required' USING ERRCODE='42501';
 END IF;
 IF p_decision NOT IN ('approved','rejected') OR length(COALESCE(p_notes,''))>1000 THEN
  RAISE EXCEPTION 'Invalid review decision';
 END IF;
 SELECT * INTO v_row FROM public.change_requests
 WHERE id=p_change_request_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Change request not found' USING ERRCODE='P0002'; END IF;
 IF v_row.status<>'pending' THEN RAISE EXCEPTION 'Change request already reviewed' USING ERRCODE='23505'; END IF;
 UPDATE public.change_requests SET status=p_decision,reviewed_by=v_actor,
   reviewed_at=now(),review_notes=p_notes,updated_at=now()
 WHERE id=p_change_request_id RETURNING * INTO v_row;
 INSERT INTO public.order_activity_log(order_id,actor_id,event_type,payload)
 VALUES(v_row.order_id,v_actor,'change_request_'||p_decision,
   jsonb_build_object('change_request_id',v_row.id,'notes',p_notes));
 RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_change_request(p_change_request_id UUID)
RETURNS public.change_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE
 v_actor UUID:=auth.uid();v_role TEXT;v_row public.change_requests;
 v_diff JSONB;v_status TEXT;
BEGIN
 IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 SELECT role INTO v_role FROM public.profiles WHERE id=v_actor AND is_active=TRUE;
 IF v_role NOT IN ('RD','Boss','HeadOfProduction') OR v_role IS NULL THEN
  RAISE EXCEPTION 'Manager role required to apply changes' USING ERRCODE='42501';
 END IF;
 SELECT * INTO v_row FROM public.change_requests
 WHERE id=p_change_request_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Change request not found' USING ERRCODE='P0002'; END IF;
 IF v_row.status<>'approved' THEN RAISE EXCEPTION 'Request is not approved'; END IF;
 v_diff:=v_row.proposed_diff;
 IF jsonb_typeof(v_diff)<>'object' OR EXISTS(
     SELECT 1 FROM jsonb_object_keys(v_diff) AS key
     WHERE key NOT IN ('title','client','due_date','loading_date','priority',
       'notes','is_rd','rd_notes','badges')
   ) THEN
  RAISE EXCEPTION 'Unsafe or unsupported change-request fields';
 END IF;
 SELECT status INTO v_status FROM public.draft_orders
 WHERE id=v_row.order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Order not found' USING ERRCODE='P0002'; END IF;
 IF v_status NOT IN ('DRAFT','draft','PENDING_REVIEW','CONFIRMED','IN_PRODUCTION','READY_TO_LOAD','ON_HOLD') THEN
  RAISE EXCEPTION 'Order is locked against edits' USING ERRCODE='42501';
 END IF;
 IF (v_diff ? 'priority' AND v_diff->>'priority' NOT IN ('LOW','NORMAL','HIGH','URGENT'))
   OR (v_diff ? 'badges' AND jsonb_typeof(v_diff->'badges')<>'object')
   OR (v_diff ? 'title' AND length(v_diff->>'title')>200)
   OR (v_diff ? 'client' AND length(v_diff->>'client')>200)
   OR (v_diff ? 'notes' AND length(v_diff->>'notes')>20000)
   OR (v_diff ? 'rd_notes' AND length(v_diff->>'rd_notes')>8000) THEN
  RAISE EXCEPTION 'Invalid change-request value';
 END IF;
 UPDATE public.draft_orders SET
   title=CASE WHEN v_diff ? 'title' THEN v_diff->>'title' ELSE title END,
   client=CASE WHEN v_diff ? 'client' THEN v_diff->>'client' ELSE client END,
   due_date=CASE WHEN v_diff ? 'due_date' THEN (v_diff->>'due_date')::date ELSE due_date END,
   loading_date=CASE WHEN v_diff ? 'loading_date'
     THEN (v_diff->>'loading_date')::date ELSE loading_date END,
   priority=CASE WHEN v_diff ? 'priority' THEN v_diff->>'priority' ELSE priority END,
   notes=CASE WHEN v_diff ? 'notes' THEN v_diff->>'notes' ELSE notes END,
   is_rd=CASE WHEN v_diff ? 'is_rd' THEN (v_diff->>'is_rd')::boolean ELSE is_rd END,
   rd_notes=CASE WHEN v_diff ? 'rd_notes' THEN v_diff->>'rd_notes' ELSE rd_notes END,
   badges=CASE WHEN v_diff ? 'badges' THEN v_diff->'badges' ELSE badges END,
   updated_by=v_actor,updated_at=now()
 WHERE id=v_row.order_id;
 UPDATE public.change_requests SET status='applied',applied_at=now(),updated_at=now()
 WHERE id=p_change_request_id RETURNING * INTO v_row;
 INSERT INTO public.order_activity_log(order_id,actor_id,event_type,payload)
 VALUES(v_row.order_id,v_actor,'change_request_applied',
   jsonb_build_object('change_request_id',v_row.id));
 RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.create_change_request(UUID,TEXT,JSONB) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.review_change_request(UUID,TEXT,TEXT) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.apply_change_request(UUID) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_change_request(UUID,TEXT,JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_change_request(UUID,TEXT,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_change_request(UUID) TO authenticated;

-- Immutable evidence relation. File FKs prevent metadata deletion while
-- any revision review still references the source; application must also
-- check before deleting binary data from Supabase Storage.
CREATE TABLE IF NOT EXISTS public.order_revision_sources(
 change_request_id UUID PRIMARY KEY REFERENCES public.change_requests(id) ON DELETE RESTRICT,
 order_id UUID NOT NULL REFERENCES public.draft_orders(id) ON DELETE CASCADE,
 baseline_file_id UUID NOT NULL REFERENCES public.files(id) ON DELETE RESTRICT,
 revised_file_id UUID NOT NULL REFERENCES public.files(id) ON DELETE RESTRICT,
 baseline_sha256 TEXT NOT NULL CHECK (baseline_sha256 ~ '^[a-f0-9]{64}$'),
 revised_sha256 TEXT NOT NULL CHECK (revised_sha256 ~ '^[a-f0-9]{64}$'),
 created_by UUID NOT NULL REFERENCES public.profiles(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK (baseline_file_id<>revised_file_id)
);
CREATE INDEX IF NOT EXISTS idx_order_revision_sources_order ON public.order_revision_sources(order_id);
CREATE INDEX IF NOT EXISTS idx_order_revision_sources_base ON public.order_revision_sources(baseline_file_id);
CREATE INDEX IF NOT EXISTS idx_order_revision_sources_revised ON public.order_revision_sources(revised_file_id);
ALTER TABLE public.order_revision_sources ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_revision_sources FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.order_revision_sources TO authenticated;
DROP POLICY IF EXISTS order_revision_sources_select ON public.order_revision_sources;
CREATE POLICY order_revision_sources_select ON public.order_revision_sources FOR SELECT
 TO authenticated USING (public.is_order_child_visible(order_id));

-- One transaction for change request, attached evidence and activity log.
-- Browser-supplied hashes are checked against stored file bytes by the
-- SvelteKit API; this RPC ensures the referenced IDs/roles/revision are real.
CREATE OR REPLACE FUNCTION public.oms_create_revision_change_request(
 p_order_id UUID,p_baseline_file_id UUID,p_revised_file_id UUID,
 p_baseline_sha256 TEXT,p_revised_sha256 TEXT,p_description TEXT,
 p_proposed_diff JSONB,p_expected_updated_at TIMESTAMPTZ
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE
 v_actor UUID:=auth.uid();v_updated_at TIMESTAMPTZ;v_id UUID;
BEGIN
 IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF p_baseline_file_id=p_revised_file_id OR
    p_baseline_sha256 !~ '^[a-f0-9]{64}$' OR
    p_revised_sha256 !~ '^[a-f0-9]{64}$' THEN
  RAISE EXCEPTION 'Invalid revision evidence identifiers or checksums';
 END IF;
 SELECT updated_at INTO v_updated_at FROM public.draft_orders
 WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Order not found' USING ERRCODE='P0002'; END IF;
 IF v_updated_at IS DISTINCT FROM p_expected_updated_at THEN
  RAISE EXCEPTION 'Order has changed; compare revisions again' USING ERRCODE='23505';
 END IF;
 IF (SELECT COUNT(DISTINCT file_id) FROM public.order_files WHERE
   draft_order_id=p_order_id AND file_id IN (p_baseline_file_id,p_revised_file_id))<>2 THEN
  RAISE EXCEPTION 'Both source files must belong to the order' USING ERRCODE='42501';
 END IF;
 -- The hardened generic RPC verifies active user role and the diff allowlist.
 v_id:=public.create_change_request(p_order_id,p_description,p_proposed_diff);
 INSERT INTO public.order_revision_sources(
   change_request_id,order_id,baseline_file_id,revised_file_id,
   baseline_sha256,revised_sha256,created_by
 ) VALUES(v_id,p_order_id,p_baseline_file_id,p_revised_file_id,
   p_baseline_sha256,p_revised_sha256,v_actor);
 RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.oms_create_revision_change_request(
 UUID,UUID,UUID,TEXT,TEXT,TEXT,JSONB,TIMESTAMPTZ) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.oms_create_revision_change_request(
 UUID,UUID,UUID,TEXT,TEXT,TEXT,JSONB,TIMESTAMPTZ) TO authenticated;

COMMIT;
