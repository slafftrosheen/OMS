-- Run against the migrated self-hosted database with psql -v ON_ERROR_STOP=1.
-- No messages are sent: all reply/session/record changes are rolled back.
BEGIN;
SET LOCAL request.jwt.claim.role='service_role';
DO $$
DECLARE c public.telegram_connections%ROWTYPE; uid uuid; rid uuid:=gen_random_uuid(); token uuid:=gen_random_uuid();
 result jsonb; src text; role_name text; baseline bigint; visible bigint;
BEGIN
 SELECT * INTO STRICT c FROM public.telegram_connections LIMIT 1;
 SELECT role INTO role_name FROM public.profiles WHERE id=c.user_id;
 INSERT INTO public.telegram_bot_replies(id,user_id,connection_version,actor_role,command,payload,status,claim_token,locked_at,attempts)
 VALUES(rid,c.user_id,c.version,role_name,'ask','{"kind":"ask","locale":"en","personalAiAllowed":true}', 'processing',token,now(),1);
 FOREACH src IN ARRAY ARRAY['orders','order_profiles','production_stages','materials','inventory','calendar','staff','work_entries','reports','chat_messages','knowledge'] LOOP
   BEGIN
     result:=public.telegram_bot_read_context(rid,token,src,'count');
     IF result IS NULL OR result->>'exact' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Missing exact count for %',src; END IF;
     RAISE NOTICE 'PASS: % context read using authenticated RLS',src;
   EXCEPTION WHEN insufficient_privilege THEN
     RAISE NOTICE 'PASS: % denied by existing permissions',src;
   END;
 END LOOP;
 IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'Claims were not restored'; END IF;
 SELECT count(*) INTO baseline FROM public.notifications WHERE user_id=c.user_id;
 result:=public.telegram_bot_read_context(rid,token,'notifications','count');
 IF (result->>'count')::bigint<>baseline THEN RAISE EXCEPTION 'Notification ownership RLS bypassed'; END IF;
 SELECT count(*) INTO baseline FROM public.workforce_work_entries WHERE user_id=c.user_id;
 UPDATE public.profiles SET role='Operator' WHERE id=c.user_id;
 UPDATE public.telegram_bot_replies SET actor_role='Operator' WHERE id=rid;
 result:=public.telegram_bot_read_context(rid,token,'work_entries','count');
 IF (result->>'count')::bigint<>baseline THEN RAISE EXCEPTION 'Worker can inspect another worker attendance'; END IF;
 UPDATE public.profiles SET role=role_name WHERE id=c.user_id;
 UPDATE public.telegram_bot_replies SET actor_role=role_name WHERE id=rid;
 RAISE NOTICE 'PASS: notification ownership and non-manager workforce RLS';

 BEGIN
  PERFORM public.telegram_bot_read_context(rid,token,'telegram_connections');
  RAISE EXCEPTION 'Credential source was accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN
  PERFORM public.telegram_bot_read_context(rid,token,'orders','rows','[{"field":"api_key","op":"eq","value":"secret"}]');
  RAISE EXCEPTION 'Unlisted field accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 -- Aggregate outputs must be revalidated, even when they returned no row IDs.
 result:=public.telegram_bot_read_context(rid,token,'notifications','count');
 INSERT INTO public.notifications(user_id,notification_type,title,message) VALUES(c.user_id,'system','Aggregate regression','Temporary rollback-only test');
 IF public.telegram_bot_context_current(rid,token) THEN RAISE EXCEPTION 'Changed count was not invalidated'; END IF;
 DELETE FROM public.notifications WHERE user_id=c.user_id AND title='Aggregate regression';
 IF NOT public.telegram_bot_context_current(rid,token) THEN RAISE EXCEPTION 'Restored count did not recover'; END IF;
 result:=public.telegram_bot_read_context(rid,token,'notifications','summary','[]','title');
 result:=public.telegram_bot_read_context(rid,token,'notifications','summary','[]','notification_type');
 IF (SELECT count(*) FROM oms_telegram_private.context_queries WHERE reply_id=rid AND source='notifications' AND mode='summary')<>2 THEN
  RAISE EXCEPTION 'Distinct grouped summaries overwrote authorization dependencies'; END IF;
 result:=public.telegram_bot_read_context(rid,token,'orders','summary','[]','status');
 IF result->'groups' IS NULL THEN RAISE EXCEPTION 'Missing grouped summary'; END IF;
 result:=public.telegram_bot_read_context(rid,token,'orders','rows');
 IF NOT public.telegram_bot_context_current(rid,token) THEN RAISE EXCEPTION 'Current records rejected'; END IF;
 UPDATE public.telegram_connections SET version=gen_random_uuid() WHERE user_id=c.user_id;
 IF public.telegram_bot_read_context(rid,token,'orders','count') IS NOT NULL OR public.telegram_bot_context_current(rid,token) THEN
  RAISE EXCEPTION 'Revoked connection retained access'; END IF;
 RAISE NOTICE 'PASS: source/column allowlist, exact summary, claims restoration and revoked connection';
END $$;
ROLLBACK;
