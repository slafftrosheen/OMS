-- Rollback-only test; run via scripts/ops/oms-local-order-check.sh.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id,email) VALUES('a1000000-0000-4000-8000-000000000001','qa-delete-20261105@example.invalid');
UPDATE public.profiles SET role='Boss',is_active=true WHERE id='a1000000-0000-4000-8000-000000000001';
INSERT INTO public.draft_orders(id,client,status,created_by,updated_at) VALUES
 ('a2000000-0000-4000-8000-000000000001','TEST ONLY deletion','IN_PRODUCTION','a1000000-0000-4000-8000-000000000001','2026-11-05 10:00:00+00');
SELECT set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN
 PERFORM public.oms_delete_order('a2000000-0000-4000-8000-000000000001','2026-11-04 10:00:00+00');
 RAISE EXCEPTION 'stale delete accepted';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 PERFORM public.oms_delete_order('a2000000-0000-4000-8000-000000000001','2026-11-05 10:00:00+00');
 IF (SELECT status FROM public.draft_orders WHERE id='a2000000-0000-4000-8000-000000000001')<>'CANCELLED' THEN
 RAISE EXCEPTION 'not cancelled'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.order_activity_log WHERE order_id='a2000000-0000-4000-8000-000000000001' AND event_type='order_deleted') THEN
 RAISE EXCEPTION 'missing audit'; END IF;
 PERFORM public.oms_delete_order('a2000000-0000-4000-8000-000000000001','2026-11-05 10:00:00+00');
END $$;
RESET ROLE;
UPDATE public.profiles SET role='Operator' WHERE id='a1000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN
 PERFORM public.oms_delete_order('a2000000-0000-4000-8000-000000000001','2026-11-05 10:00:00+00');
 RAISE EXCEPTION 'operator delete accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
DO $$ BEGIN
 BEGIN
 DELETE FROM public.draft_orders WHERE id='a2000000-0000-4000-8000-000000000001';
 RAISE EXCEPTION 'physical deletion accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='draft_orders')
 OR NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='order_stages') THEN
  RAISE EXCEPTION 'missing realtime publication';
 END IF;
 RAISE NOTICE 'PASS stale deletion, manager deletion, idempotency, audit, operator denial, physical-delete denial and realtime publication';
END $$;
ROLLBACK;
