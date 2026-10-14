-- OMS-R26: manually run against the STAGING Supabase PostgreSQL database.
-- Read-only, no migrations, no data modification. Fails with a PostgreSQL error
-- if a prerequisite or security boundary is absent.
\set ON_ERROR_STOP on
BEGIN TRANSACTION READ ONLY;

DO $r26$
DECLARE
  item TEXT;
  missing TEXT[]:=ARRAY[]::TEXT[];
  bad TEXT[]:=ARRAY[]::TEXT[];
  relation_name TEXT;
  current_status TEXT;
  reviewed INTEGER;
BEGIN
  FOREACH item IN ARRAY ARRAY[
    'public.draft_orders','public.order_stages','public.profiles',
    'public.user_stations','public.production_station_capacity',
    'public.production_reservations','public.production_exception_reviews',
    'public.production_exception_events'
  ] LOOP
    IF to_regclass(item) IS NULL THEN missing:=array_append(missing,item); END IF;
  END LOOP;
  IF cardinality(missing)>0 THEN
    RAISE EXCEPTION 'Missing production tables: %',array_to_string(missing,', ');
  END IF;

  FOREACH item IN ARRAY ARRAY[
    'public.complete_stage_with_consumption(uuid,text,jsonb,boolean,text,numeric,text)',
    'public.open_order_rework(uuid,text,text,text)',
    'public.resolve_order_rework(uuid,uuid,text)',
    'public.assign_order_loading_day(uuid,uuid,text)',
    'public.confirm_order_with_stages(uuid,text)',
    'public.oms_update_draft_form(uuid,jsonb,jsonb,timestamp with time zone)',
    'public.oms_manage_production_reservation(text,uuid,uuid,text,date,numeric,text,timestamp with time zone)',
    'public.oms_manage_production_exception(text,uuid,text,text,uuid,timestamp with time zone,date,text)'
  ] LOOP
    IF to_regprocedure(item) IS NULL THEN bad:=array_append(bad,item); END IF;
  END LOOP;
  IF cardinality(bad)>0 THEN
    RAISE EXCEPTION 'Missing production RPCs: %',array_to_string(bad,', ');
  END IF;

  FOREACH relation_name IN ARRAY ARRAY[
    'production_station_capacity','production_reservations',
    'production_exception_reviews','production_exception_events'
  ] LOOP
    IF NOT (SELECT c.relrowsecurity FROM pg_class c
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=relation_name) THEN
      RAISE EXCEPTION 'RLS disabled: public.%',relation_name;
    END IF;
  END LOOP;

  FOREACH item IN ARRAY ARRAY[
    'public.production_reservations','public.production_exception_reviews',
    'public.production_exception_events'
  ] LOOP
    IF has_table_privilege('authenticated',item,'INSERT')
       OR has_table_privilege('authenticated',item,'UPDATE')
       OR has_table_privilege('authenticated',item,'DELETE')
       OR has_table_privilege('anon',item,'SELECT') THEN
      RAISE EXCEPTION 'Unexpected direct table or anonymous grant on %',item;
    END IF;
  END LOOP;
  IF NOT has_table_privilege('authenticated','public.production_reservations','SELECT')
     OR NOT has_table_privilege('authenticated','public.production_exception_reviews','SELECT') THEN
    RAISE EXCEPTION 'Production reviews/reservations are not readable by authenticated clients';
  END IF;

  FOREACH item IN ARRAY ARRAY[
    'public.complete_stage_with_consumption(uuid,text,jsonb,boolean,text,numeric,text)',
    'public.oms_manage_production_reservation(text,uuid,uuid,text,date,numeric,text,timestamp with time zone)',
    'public.oms_manage_production_exception(text,uuid,text,text,uuid,timestamp with time zone,date,text)'
  ] LOOP
    IF has_function_privilege('anon',item,'EXECUTE')
       OR NOT has_function_privilege('authenticated',item,'EXECUTE') THEN
      RAISE EXCEPTION 'Invalid RPC grants: %',item;
    END IF;
  END LOOP;

  IF (SELECT count(*) FROM pg_policies
      WHERE schemaname='public' AND tablename='production_reservations')<1
     OR (SELECT count(*) FROM pg_policies
      WHERE schemaname='public' AND tablename='production_exception_reviews')<1
     OR (SELECT count(*) FROM pg_policies
      WHERE schemaname='public' AND tablename='production_exception_events')<1 THEN
    RAISE EXCEPTION 'Missing production row access policy';
  END IF;

  RAISE NOTICE 'OMS-R26 schema/RPC/grant/RLS checks: PASS';
END;
$r26$;

-- Counts and integrity observations only; inspect results before deployment.
SELECT 'stages_completed_without_actual' AS check_name, count(*) AS records
  FROM public.order_stages WHERE state='COMPLETED' AND actual_hours IS NULL
UNION ALL
SELECT 'stages_completed_without_timestamp', count(*)
  FROM public.order_stages WHERE state='COMPLETED' AND completed_at IS NULL
UNION ALL
SELECT 'active_production_reservations', count(*)
  FROM public.production_reservations WHERE status IN ('PROPOSED','APPROVED')
UNION ALL
SELECT 'approved_reservations_in_past', count(*)
  FROM public.production_reservations WHERE status='APPROVED'
    AND work_date<(now() AT TIME ZONE 'Europe/Riga')::date
UNION ALL
SELECT 'unresolved_production_reviews', count(*)
  FROM public.production_exception_reviews WHERE status<>'RESOLVED'
UNION ALL
SELECT 'unassigned_production_reviews', count(*)
  FROM public.production_exception_reviews WHERE status<>'RESOLVED' AND owner_id IS NULL
ORDER BY check_name;

ROLLBACK;
