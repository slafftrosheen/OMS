-- Voice messages retain audio for three calendar months from commit, in UTC.
-- Text/message rows are never deleted by this retention worker. Binary deletion
-- uses the Storage API; no SQL DELETE of storage.objects is performed here.
BEGIN;

CREATE FUNCTION public.chat_voice_now() RETURNS TIMESTAMPTZ
LANGUAGE sql STABLE SET search_path = pg_catalog AS $$ SELECT now(); $$;

ALTER TABLE public.chat_attachments
  ALTER COLUMN room_id DROP NOT NULL,
  ADD COLUMN order_id UUID REFERENCES public.draft_orders(id) ON DELETE CASCADE,
  ADD COLUMN storage_bucket TEXT NOT NULL DEFAULT 'chat-attachments',
  ADD COLUMN client_request_id UUID,
  ADD COLUMN voice_state TEXT CHECK (voice_state IN ('staged', 'ready', 'deleted')),
  ADD COLUMN voice_sent_at TIMESTAMPTZ,
  ADD COLUMN voice_expires_at TIMESTAMPTZ,
  ADD COLUMN voice_upload_expires_at TIMESTAMPTZ,
  ADD COLUMN voice_upload_lease_until TIMESTAMPTZ,
  ADD COLUMN voice_sha256 TEXT,
  ADD COLUMN voice_pending_text TEXT,
  ADD COLUMN voice_reply_to_id UUID REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  ADD COLUMN storage_deleted_at TIMESTAMPTZ;

-- Older audio already used this relation, sometimes without message linkage.
-- Preserve its metadata and use the actual sent/created time, never a new 3-month
-- window at deployment. Existing downloaded copies cannot be recalled.
UPDATE public.chat_attachments SET attachment_kind = 'voice' WHERE lower(file_type) LIKE 'audio/%';
UPDATE public.chat_attachments a SET
  voice_state = CASE WHEN a.message_id IS NULL THEN 'staged' ELSE 'ready' END,
  voice_sent_at = CASE WHEN a.message_id IS NULL THEN NULL ELSE coalesce((SELECT m.created_at FROM public.chat_messages m WHERE m.id=a.message_id), a.created_at, public.chat_voice_now()) END,
  voice_upload_expires_at = coalesce(a.created_at, public.chat_voice_now()) + INTERVAL '24 hours'
WHERE a.attachment_kind = 'voice';
UPDATE public.chat_attachments SET voice_expires_at = ((voice_sent_at AT TIME ZONE 'UTC') + INTERVAL '3 months') AT TIME ZONE 'UTC'
WHERE attachment_kind = 'voice' AND voice_sent_at IS NOT NULL;
CREATE UNIQUE INDEX chat_voice_request_idx ON public.chat_attachments(uploader_id, client_request_id) WHERE client_request_id IS NOT NULL;
CREATE INDEX chat_voice_expiry_idx ON public.chat_attachments(voice_expires_at) WHERE attachment_kind='voice' AND storage_deleted_at IS NULL;

CREATE TABLE public.chat_voice_cleanup_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attachment_id UUID REFERENCES public.chat_attachments(id) ON DELETE SET NULL,
  storage_bucket TEXT NOT NULL CHECK (storage_bucket IN ('chat-voice', 'chat-attachments')),
  storage_path TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('expired', 'abandoned', 'record_deleted')),
  available_at TIMESTAMPTZ NOT NULL DEFAULT public.chat_voice_now(),
  lease_token UUID,
  lease_until TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT public.chat_voice_now(),
  UNIQUE(storage_bucket, storage_path)
);
ALTER TABLE public.chat_voice_cleanup_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chat_voice_cleanup_jobs FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.chat_voice_cleanup_jobs TO service_role;

CREATE FUNCTION public.chat_voice_order_allowed(p_actor UUID, p_order UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p JOIN public.draft_orders o ON o.id=p_order
    WHERE p.id=p_actor AND p.is_active=true AND (p.role IN ('RD','Boss','HeadOfProduction') OR o.created_by=p_actor
      OR EXISTS (SELECT 1 FROM public.order_assignees a WHERE a.draft_order_id=o.id AND a.assignee_id=p_actor)));
$$;

CREATE FUNCTION public.chat_voice_actor_allowed(p_actor UUID, p_order UUID, p_room TEXT, p_write BOOLEAN DEFAULT false) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=p_actor AND p.is_active=true)
    AND (p_order IS NULL OR public.chat_voice_order_allowed(p_actor,p_order))
    AND CASE WHEN p_room IS NULL THEN p_order IS NOT NULL ELSE EXISTS (
      SELECT 1 FROM public.chat_rooms r WHERE r.id=p_room AND (NOT p_write OR r.archived_at IS NULL)
        AND (r.order_id IS NULL OR (public.chat_voice_order_allowed(p_actor,r.order_id) AND (p_order IS NULL OR p_order=r.order_id)))
        AND (r.order_id IS NOT NULL OR NOT coalesce(r.is_private,false)
          OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=p_actor AND p.is_active=true AND p.role IN ('RD','Boss','HeadOfProduction'))
          OR EXISTS (SELECT 1 FROM public.chat_room_members m WHERE m.room_id=r.id AND m.user_id=p_actor))
    ) END;
$$;

CREATE OR REPLACE FUNCTION public.can_access_chat_message(p_order_id UUID, p_room_id TEXT) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT public.chat_voice_actor_allowed(auth.uid(),p_order_id,p_room_id,false);
$$;

CREATE FUNCTION public.chat_can_send_to(p_order_id UUID, p_room_id TEXT) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT public.chat_voice_actor_allowed(auth.uid(),p_order_id,p_room_id,true);
$$;

-- Restrictive policies also protect installations with an older permissive
-- policy name. Existing author/moderator edit/delete rules still apply.
CREATE POLICY chat_active_scope_guard ON public.chat_messages AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.can_access_chat_message(order_id,room_id)) WITH CHECK (public.chat_can_send_to(order_id,room_id));

CREATE FUNCTION public.chat_voice_attachment_allowed(p_attachment UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT EXISTS (SELECT 1 FROM public.chat_attachments a
    WHERE a.id=p_attachment AND public.chat_voice_actor_allowed(auth.uid(),a.order_id,a.room_id,false)
      AND ((a.message_id IS NULL AND a.uploader_id=auth.uid()) OR EXISTS (
        SELECT 1 FROM public.chat_messages m WHERE m.id=a.message_id AND NOT coalesce(m.is_deleted,false)
          AND m.room_id IS NOT DISTINCT FROM a.room_id AND m.order_id IS NOT DISTINCT FROM a.order_id
          AND public.chat_voice_actor_allowed(auth.uid(),m.order_id,m.room_id,false))));
$$;

CREATE POLICY chat_attachment_scope_guard ON public.chat_attachments AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.chat_voice_attachment_allowed(id));
CREATE POLICY chat_attachment_no_voice_insert ON public.chat_attachments AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (attachment_kind <> 'voice' AND lower(file_type) NOT LIKE 'audio/%' AND voice_state IS NULL AND storage_bucket='chat-attachments'
    AND uploader_id=auth.uid() AND public.chat_can_send_to(order_id,room_id)
    AND (message_id IS NULL OR EXISTS (SELECT 1 FROM public.chat_messages m WHERE m.id=chat_attachments.message_id AND m.user_id=auth.uid()
      AND m.room_id IS NOT DISTINCT FROM chat_attachments.room_id AND m.order_id IS NOT DISTINCT FROM chat_attachments.order_id AND NOT coalesce(m.is_deleted,false))));
CREATE POLICY chat_attachment_no_voice_update ON public.chat_attachments AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (attachment_kind <> 'voice' AND voice_state IS NULL)
  WITH CHECK (attachment_kind <> 'voice' AND lower(file_type) NOT LIKE 'audio/%' AND voice_state IS NULL AND storage_bucket='chat-attachments');
CREATE POLICY chat_attachment_no_voice_delete ON public.chat_attachments AS RESTRICTIVE FOR DELETE TO authenticated
  USING (attachment_kind <> 'voice' AND voice_state IS NULL);
-- Content validation lives in the server upload endpoint. Ordinary clients may
-- not bypass it by declaring audio bytes as application/octet-stream/file.
REVOKE INSERT,UPDATE,DELETE ON public.chat_attachments FROM anon,authenticated;

-- New recordings are private and reachable only through the authenticated proxy.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES ('chat-voice','chat-voice',false,15728640,ARRAY['audio/webm','audio/ogg','audio/mp4'])
ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
INSERT INTO storage.buckets(id,name,public) VALUES ('chat-attachments','chat-attachments',false)
ON CONFLICT(id) DO UPDATE SET public=false;

CREATE FUNCTION public.chat_voice_protected_path(p_bucket TEXT,p_path TEXT) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT p_bucket='chat-voice' OR EXISTS (SELECT 1 FROM public.chat_attachments a
    WHERE a.storage_bucket=p_bucket AND a.storage_path=p_path AND a.attachment_kind='voice')
    OR EXISTS (SELECT 1 FROM public.chat_voice_cleanup_jobs j WHERE j.storage_bucket=p_bucket AND j.storage_path=p_path);
$$;
CREATE POLICY chat_voice_storage_boundary ON storage.objects AS RESTRICTIVE FOR ALL TO anon,authenticated
  USING (NOT public.chat_voice_protected_path(bucket_id,name)) WITH CHECK (NOT public.chat_voice_protected_path(bucket_id,name));
CREATE POLICY chat_file_storage_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='chat-attachments' AND EXISTS (SELECT 1 FROM public.chat_attachments a
    WHERE a.storage_bucket=bucket_id AND a.storage_path=name AND a.attachment_kind <> 'voice' AND public.chat_voice_attachment_allowed(a.id)));
CREATE POLICY chat_file_storage_scope_guard ON storage.objects AS RESTRICTIVE FOR SELECT TO anon,authenticated
  USING (bucket_id <> 'chat-attachments' OR EXISTS (SELECT 1 FROM public.chat_attachments a
    WHERE a.storage_bucket=bucket_id AND a.storage_path=name AND public.chat_voice_attachment_allowed(a.id)));
CREATE POLICY chat_file_storage_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='chat-attachments' AND split_part(name,'/',1)='chat' AND split_part(name,'/',3)=auth.uid()::TEXT
    AND public.chat_can_send_to(NULL,split_part(name,'/',2)));
CREATE POLICY chat_file_storage_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id='chat-attachments' AND split_part(name,'/',1)='chat' AND split_part(name,'/',3)=auth.uid()::TEXT);
CREATE POLICY chat_file_server_insert_only ON storage.objects AS RESTRICTIVE FOR INSERT TO anon,authenticated
  WITH CHECK (bucket_id <> 'chat-attachments');
CREATE POLICY chat_file_server_update_only ON storage.objects AS RESTRICTIVE FOR UPDATE TO anon,authenticated
  USING (bucket_id <> 'chat-attachments') WITH CHECK (bucket_id <> 'chat-attachments');
CREATE POLICY chat_file_server_delete_only ON storage.objects AS RESTRICTIVE FOR DELETE TO anon,authenticated
  USING (bucket_id <> 'chat-attachments');

CREATE FUNCTION public.chat_voice_store_file(p_actor UUID,p_room TEXT,p_message UUID,p_name TEXT,p_mime TEXT,p_size BIGINT,p_path TEXT,p_kind TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE item public.chat_attachments;
BEGIN
  IF coalesce(auth.role(),'') <> 'service_role' OR NOT public.chat_voice_actor_allowed(p_actor,NULL,p_room,true) THEN
    RAISE EXCEPTION 'Chat access denied' USING ERRCODE='42501';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN('file','image','video') OR p_mime IS NULL OR lower(p_mime) LIKE 'audio/%'
    OR p_size IS NULL OR p_size NOT BETWEEN 1 AND 52428800 OR p_name IS NULL OR char_length(p_name) NOT BETWEEN 1 AND 255
    OR p_path IS NULL OR p_path NOT LIKE 'files/'||p_actor::TEXT||'/%' THEN RAISE EXCEPTION 'Invalid file attachment' USING ERRCODE='22023'; END IF;
  IF p_message IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.chat_messages m WHERE m.id=p_message AND m.user_id=p_actor
    AND m.room_id=p_room AND m.order_id IS NULL AND NOT coalesce(m.is_deleted,false)) THEN
    RAISE EXCEPTION 'Attachment message scope mismatch' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.chat_attachments(room_id,message_id,uploader_id,file_name,file_type,file_size,storage_path,attachment_kind)
    VALUES(p_room,p_message,p_actor,p_name,p_mime,p_size,p_path,p_kind) RETURNING * INTO item;
  RETURN to_jsonb(item);
END $$;

CREATE FUNCTION public.chat_voice_reserve(p_actor UUID,p_room_id TEXT,p_order_id UUID,p_request_id UUID,
  p_mime TEXT,p_size BIGINT,p_duration_ms INTEGER,p_sha256 TEXT,p_text TEXT,p_reply_to UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE item public.chat_attachments; extension TEXT; attachment_id UUID := gen_random_uuid();
BEGIN
  IF coalesce(auth.role(),'') <> 'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  IF NOT public.chat_voice_actor_allowed(p_actor,p_order_id,p_room_id,true) THEN RAISE EXCEPTION 'Chat access denied' USING ERRCODE='42501'; END IF;
  IF (p_room_id IS NULL)=(p_order_id IS NULL) OR p_request_id IS NULL OR p_mime IS NULL OR p_mime NOT IN ('audio/webm','audio/ogg','audio/mp4')
    OR p_size IS NULL OR p_size NOT BETWEEN 1 AND 15728640 OR p_duration_ms IS NULL OR p_duration_ms NOT BETWEEN 1 AND 300000
    OR p_sha256 IS NULL OR p_sha256 !~ '^[a-f0-9]{64}$' OR p_text IS NULL OR char_length(p_text)>4000 THEN
    RAISE EXCEPTION 'Invalid voice upload' USING ERRCODE='22023';
  END IF;
  IF p_reply_to IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.chat_messages m WHERE m.id=p_reply_to
    AND m.room_id IS NOT DISTINCT FROM p_room_id AND m.order_id IS NOT DISTINCT FROM p_order_id AND NOT coalesce(m.is_deleted,false)) THEN
    RAISE EXCEPTION 'Reply does not belong to this chat' USING ERRCODE='42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('chat-voice:'||p_actor::TEXT||':'||p_request_id::TEXT,0));
  SELECT * INTO item FROM public.chat_attachments WHERE uploader_id=p_actor AND client_request_id=p_request_id FOR UPDATE;
  IF FOUND THEN
    IF item.room_id IS DISTINCT FROM p_room_id OR item.order_id IS DISTINCT FROM p_order_id OR item.file_type<>p_mime OR item.file_size<>p_size
      OR item.voice_sha256<>p_sha256 OR item.voice_pending_text IS DISTINCT FROM p_text OR item.voice_reply_to_id IS DISTINCT FROM p_reply_to THEN
      RAISE EXCEPTION 'Request identifier already used' USING ERRCODE='40001';
    END IF;
    IF item.voice_state='ready' THEN RETURN to_jsonb(item); END IF;
    IF item.voice_state='deleted' OR item.voice_upload_expires_at<=public.chat_voice_now()
      OR EXISTS(SELECT 1 FROM public.chat_voice_cleanup_jobs j WHERE j.storage_bucket=item.storage_bucket AND j.storage_path=item.storage_path) THEN
      RAISE EXCEPTION 'Upload expired' USING ERRCODE='P0003';
    END IF;
    UPDATE public.chat_attachments SET voice_upload_lease_until=public.chat_voice_now()+INTERVAL '5 minutes' WHERE id=item.id RETURNING * INTO item;
    RETURN to_jsonb(item);
  END IF;
  extension := CASE p_mime WHEN 'audio/webm' THEN 'webm' WHEN 'audio/ogg' THEN 'ogg' ELSE 'm4a' END;
  INSERT INTO public.chat_attachments(id,room_id,order_id,uploader_id,file_name,file_type,file_size,storage_path,storage_bucket,attachment_kind,
    duration_secs,client_request_id,voice_state,voice_upload_expires_at,voice_upload_lease_until,voice_sha256,voice_pending_text,voice_reply_to_id)
  VALUES (attachment_id,p_room_id,p_order_id,p_actor,'Voice message.'||extension,p_mime,p_size,
    'voices/'||p_actor::TEXT||'/'||attachment_id::TEXT||'.'||extension,'chat-voice','voice',p_duration_ms::NUMERIC/1000,
    p_request_id,'staged',public.chat_voice_now()+INTERVAL '24 hours',public.chat_voice_now()+INTERVAL '5 minutes',p_sha256,p_text,p_reply_to)
  RETURNING * INTO item;
  RETURN to_jsonb(item);
END $$;

CREATE FUNCTION public.chat_voice_commit(p_actor UUID,p_attachment_id UUID) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE item public.chat_attachments; message public.chat_messages; sent TIMESTAMPTZ := public.chat_voice_now(); sender_name TEXT; notification_ids UUID[];
BEGIN
  IF coalesce(auth.role(),'') <> 'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  SELECT * INTO item FROM public.chat_attachments WHERE id=p_attachment_id AND uploader_id=p_actor AND attachment_kind='voice' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recording not found' USING ERRCODE='P0002'; END IF;
  IF NOT public.chat_voice_actor_allowed(p_actor,item.order_id,item.room_id,true) THEN RAISE EXCEPTION 'Chat access denied' USING ERRCODE='42501'; END IF;
  IF item.voice_state='ready' THEN
    SELECT * INTO message FROM public.chat_messages WHERE id=item.message_id AND NOT coalesce(is_deleted,false);
    IF NOT FOUND THEN RAISE EXCEPTION 'Message no longer available' USING ERRCODE='P0002'; END IF;
    RETURN jsonb_build_object('message',to_jsonb(message),'attachment',to_jsonb(item),'replayed',true);
  END IF;
  IF item.voice_state<>'staged' OR item.voice_upload_lease_until<=sent
    OR EXISTS(SELECT 1 FROM public.chat_voice_cleanup_jobs j WHERE j.storage_bucket=item.storage_bucket AND j.storage_path=item.storage_path) THEN
    RAISE EXCEPTION 'Upload expired' USING ERRCODE='P0003';
  END IF;
  IF item.voice_reply_to_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.chat_messages m WHERE m.id=item.voice_reply_to_id
    AND m.room_id IS NOT DISTINCT FROM item.room_id AND m.order_id IS NOT DISTINCT FROM item.order_id AND NOT coalesce(m.is_deleted,false)) THEN
    RAISE EXCEPTION 'Reply no longer belongs to this chat' USING ERRCODE='42501';
  END IF;
  -- The trusted HTTP service has uploaded the validated bytes before committing.
  -- Message identity + attachment binding + expiry commit in one transaction.
  INSERT INTO public.chat_messages(room_id,order_id,user_id,text,content,attachments,reply_to_id,is_edited,is_deleted,created_at,updated_at)
    VALUES (item.room_id,item.order_id,p_actor,coalesce(item.voice_pending_text,''),coalesce(item.voice_pending_text,''),'[]'::JSONB,item.voice_reply_to_id,false,false,sent,sent)
    RETURNING * INTO message;
  UPDATE public.chat_attachments SET message_id=message.id,voice_state='ready',voice_sent_at=sent,
    voice_expires_at=((sent AT TIME ZONE 'UTC')+INTERVAL '3 months') AT TIME ZONE 'UTC',voice_upload_lease_until=NULL
    WHERE id=item.id RETURNING * INTO item;
  IF item.order_id IS NOT NULL THEN
    SELECT coalesce(nullif(display_name,''),nullif(username,''),'A team member') INTO sender_name FROM public.profiles WHERE id=p_actor;
    WITH recipients AS (
      SELECT created_by AS user_id FROM public.draft_orders WHERE id=item.order_id
      UNION SELECT assignee_id FROM public.order_assignees WHERE draft_order_id=item.order_id
    ), inserted AS (
      INSERT INTO public.notifications(user_id,notification_type,title,message,link,source_type,source_id)
        SELECT p.id,'chat_message','New voice message',sender_name||' sent a voice message.',
          '/orders/'||item.order_id::TEXT||'?tab=chat','chat',item.order_id
        FROM recipients r JOIN public.profiles p ON p.id=r.user_id AND p.is_active=true WHERE p.id<>p_actor RETURNING id
    ) SELECT coalesce(array_agg(id),'{}'::UUID[]) INTO notification_ids FROM inserted;
    IF cardinality(notification_ids)>0 AND to_regprocedure('public.enqueue_telegram_notifications(uuid[])') IS NOT NULL THEN
      PERFORM public.enqueue_telegram_notifications(notification_ids);
    END IF;
  END IF;
  RETURN jsonb_build_object('message',to_jsonb(message),'attachment',to_jsonb(item),'replayed',false);
END $$;

CREATE FUNCTION public.chat_voice_playback(p_attachment_id UUID) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE item public.chat_attachments;
BEGIN
  IF NOT public.chat_voice_attachment_allowed(p_attachment_id) THEN RAISE EXCEPTION 'Chat access denied' USING ERRCODE='42501'; END IF;
  SELECT * INTO item FROM public.chat_attachments WHERE id=p_attachment_id AND attachment_kind='voice';
  IF NOT FOUND THEN RAISE EXCEPTION 'Recording not found' USING ERRCODE='P0002'; END IF;
  IF item.voice_state<>'ready' OR item.voice_expires_at IS NULL OR item.voice_expires_at<=public.chat_voice_now() OR item.storage_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Recording expired' USING ERRCODE='P0003';
  END IF;
  RETURN jsonb_build_object('id',item.id,'storage_bucket',item.storage_bucket,'storage_path',item.storage_path,'file_type',item.file_type,
    'file_size',item.file_size,'voice_expires_at',item.voice_expires_at);
END $$;

CREATE FUNCTION public.chat_voice_queue_deleted() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF OLD.attachment_kind='voice' AND OLD.storage_deleted_at IS NULL THEN
    INSERT INTO public.chat_voice_cleanup_jobs(storage_bucket,storage_path,reason,available_at)
      VALUES (OLD.storage_bucket,OLD.storage_path,'record_deleted',greatest(public.chat_voice_now(),coalesce(OLD.voice_upload_lease_until,public.chat_voice_now())))
      ON CONFLICT(storage_bucket,storage_path) DO UPDATE SET attachment_id=NULL,available_at=least(chat_voice_cleanup_jobs.available_at,excluded.available_at);
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER chat_voice_delete_cleanup BEFORE DELETE ON public.chat_attachments FOR EACH ROW EXECUTE FUNCTION public.chat_voice_queue_deleted();

CREATE FUNCTION public.chat_voice_claim_cleanup(p_limit INTEGER DEFAULT 20) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE result JSONB;
BEGIN
  IF coalesce(auth.role(),'') <> 'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  WITH expired AS (
    SELECT a.* FROM public.chat_attachments a WHERE a.attachment_kind='voice' AND a.storage_deleted_at IS NULL
      AND ((a.voice_state='ready' AND a.voice_expires_at<=public.chat_voice_now())
        OR (a.voice_state='staged' AND a.voice_upload_expires_at<=public.chat_voice_now() AND coalesce(a.voice_upload_lease_until,'-infinity')<=public.chat_voice_now()))
    FOR UPDATE SKIP LOCKED LIMIT 100
  ) INSERT INTO public.chat_voice_cleanup_jobs(attachment_id,storage_bucket,storage_path,reason)
    SELECT a.id,a.storage_bucket,a.storage_path,CASE WHEN a.voice_state='staged' THEN 'abandoned' ELSE 'expired' END FROM expired a
    ON CONFLICT(storage_bucket,storage_path) DO NOTHING;
  WITH candidates AS (
    SELECT id FROM public.chat_voice_cleanup_jobs WHERE completed_at IS NULL AND available_at<=public.chat_voice_now()
      AND (lease_until IS NULL OR lease_until<=public.chat_voice_now()) ORDER BY available_at,id
      FOR UPDATE SKIP LOCKED LIMIT greatest(1,least(coalesce(p_limit,20),50))
  ), leased AS (
    UPDATE public.chat_voice_cleanup_jobs j SET lease_token=gen_random_uuid(),lease_until=public.chat_voice_now()+INTERVAL '5 minutes',attempts=attempts+1
      FROM candidates c WHERE j.id=c.id RETURNING j.*
  ) SELECT coalesce(jsonb_agg(jsonb_build_object('jobId',id,'leaseToken',lease_token,'bucket',storage_bucket,'path',storage_path)),'[]'::JSONB) INTO result FROM leased;
  RETURN result;
END $$;

CREATE FUNCTION public.chat_voice_complete_cleanup(p_job_id UUID,p_lease_token UUID) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE job public.chat_voice_cleanup_jobs;
BEGIN
  IF coalesce(auth.role(),'') <> 'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  SELECT * INTO job FROM public.chat_voice_cleanup_jobs WHERE id=p_job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cleanup job not found' USING ERRCODE='P0002'; END IF;
  IF job.completed_at IS NOT NULL THEN RETURN true; END IF;
  IF job.lease_token IS DISTINCT FROM p_lease_token OR job.lease_until<=public.chat_voice_now() THEN RAISE EXCEPTION 'Cleanup lease changed' USING ERRCODE='40001'; END IF;
  UPDATE public.chat_attachments SET voice_state='deleted',storage_deleted_at=public.chat_voice_now()
    WHERE id=job.attachment_id AND attachment_kind='voice';
  UPDATE public.chat_voice_cleanup_jobs SET completed_at=public.chat_voice_now(),lease_until=NULL WHERE id=job.id;
  RETURN true;
END $$;

CREATE FUNCTION public.chat_voice_retry_cleanup(p_job_id UUID,p_lease_token UUID) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF coalesce(auth.role(),'') <> 'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  UPDATE public.chat_voice_cleanup_jobs SET lease_until=NULL,lease_token=NULL,
    available_at=public.chat_voice_now()+make_interval(secs=>least(3600,60*power(2,least(attempts,6)))::INTEGER)
    WHERE id=p_job_id AND lease_token=p_lease_token AND completed_at IS NULL;
  RETURN FOUND;
END $$;

CREATE FUNCTION public.chat_create_dm(p_peer UUID) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE actor UUID := auth.uid(); peer public.profiles; me public.profiles; room public.chat_rooms; room_key TEXT;
BEGIN
  SELECT * INTO me FROM public.profiles WHERE id=actor AND is_active=true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active account required' USING ERRCODE='42501'; END IF;
  SELECT * INTO peer FROM public.profiles WHERE id=p_peer AND is_active=true AND id<>actor;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active peer required' USING ERRCODE='22023'; END IF;
  room_key := 'dm-'||least(actor::TEXT,p_peer::TEXT)||'-'||greatest(actor::TEXT,p_peer::TEXT);
  PERFORM pg_advisory_xact_lock(hashtextextended('chat-dm:'||room_key,0));
  SELECT * INTO room FROM public.chat_rooms WHERE id=room_key FOR UPDATE;
  IF FOUND THEN
    IF NOT coalesce(room.is_private,false) OR room.kind<>'direct' OR room.order_id IS NOT NULL
      OR EXISTS(SELECT 1 FROM public.chat_room_members WHERE room_id=room_key AND user_id NOT IN(actor,p_peer)) THEN
      RAISE EXCEPTION 'Direct room identity conflict' USING ERRCODE='40001';
    END IF;
    IF room.archived_at IS NOT NULL THEN UPDATE public.chat_rooms SET archived_at=NULL WHERE id=room_key RETURNING * INTO room; END IF;
  ELSE
    INSERT INTO public.chat_rooms(id,name,room_type,kind,is_private,created_by)
      VALUES(room_key,coalesce(peer.display_name,peer.username,'Team member')||' ↔ '||coalesce(me.display_name,me.username,'Team member'),'direct','direct',true,actor)
      RETURNING * INTO room;
  END IF;
  INSERT INTO public.chat_room_members(room_id,user_id,is_admin) VALUES(room_key,actor,true),(room_key,p_peer,false)
    ON CONFLICT(room_id,user_id) DO NOTHING;
  RETURN jsonb_build_object('id',room.id,'name',room.name,'kind',room.kind,'private',true,
    'peer',jsonb_build_object('id',peer.id,'displayName',peer.display_name,'username',peer.username));
END $$;

DO $$ DECLARE fn RECORD; BEGIN
  FOR fn IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname LIKE 'chat_voice_%' LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',fn.signature);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.chat_can_send_to(UUID,TEXT),public.chat_create_dm(UUID) FROM PUBLIC,anon,service_role;
REVOKE ALL ON FUNCTION public.can_access_chat_message(UUID,TEXT) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_access_chat_message(UUID,TEXT),public.chat_can_send_to(UUID,TEXT),public.chat_create_dm(UUID),
  public.chat_voice_attachment_allowed(UUID),public.chat_voice_playback(UUID) TO authenticated;
-- Anonymous Storage policy evaluation can call this predicate; with no active
-- auth.uid it always returns false and exposes no attachment metadata.
GRANT EXECUTE ON FUNCTION public.chat_voice_protected_path(TEXT,TEXT),public.chat_voice_attachment_allowed(UUID) TO authenticated,anon;
GRANT EXECUTE ON FUNCTION public.chat_voice_reserve(UUID,TEXT,UUID,UUID,TEXT,BIGINT,INTEGER,TEXT,TEXT,UUID),
  public.chat_voice_store_file(UUID,TEXT,UUID,TEXT,TEXT,BIGINT,TEXT,TEXT),
  public.chat_voice_commit(UUID,UUID),public.chat_voice_claim_cleanup(INTEGER),public.chat_voice_complete_cleanup(UUID,UUID),
  public.chat_voice_retry_cleanup(UUID,UUID) TO service_role;

COMMENT ON COLUMN public.chat_attachments.voice_expires_at IS 'Audio byte retention deadline: sent timestamp + 3 calendar months in UTC. Message text and attachment placeholder remain.';
COMMENT ON TABLE public.chat_voice_cleanup_jobs IS 'Durable, leased Storage API deletion jobs. Cascaded attachment deletion also preserves the binary path here.';
NOTIFY pgrst,'reload schema';
COMMIT;
