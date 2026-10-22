-- OMS release preflight: manually run against the STAGING Supabase PostgreSQL
-- database. Read-only, no migrations, no data modification. Checks production
-- and inventory contracts through R44; fails if a prerequisite or security
-- boundary is absent.
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
    'public.production_exception_events','public.materials',
    'public.inventory_items','public.inventory_movements',
    'public.inventory_replenishment_requests',
    'public.inventory_replenishment_events'
  ] LOOP
    IF to_regclass(item) IS NULL THEN missing:=array_append(missing,item); END IF;
  END LOOP;
  IF cardinality(missing)>0 THEN
    RAISE EXCEPTION 'Missing production tables: %',array_to_string(missing,', ');
  END IF;

  FOREACH item IN ARRAY ARRAY[
    'public.complete_stage_with_consumption(uuid,text,jsonb,boolean,text,numeric,text)',
    'public.complete_stage_with_consumption(uuid,text,jsonb,boolean,text,numeric,text,timestamp with time zone)',
    'public.consume_materials_for_order(uuid,text,jsonb,uuid)',
    'public.open_order_rework(uuid,text,text,text)',
    'public.resolve_order_rework(uuid,uuid,text)',
    'public.assign_order_loading_day(uuid,uuid,text)',
    'public.confirm_order_with_stages(uuid,text)',
    'public.oms_update_draft_form(uuid,jsonb,jsonb,timestamp with time zone)',
    'public.oms_manage_production_reservation(text,uuid,uuid,text,date,numeric,text,timestamp with time zone)',
    'public.oms_manage_production_exception(text,uuid,text,text,uuid,timestamp with time zone,date,text)',
    'public.oms_record_manual_inventory_movement(uuid,uuid,text,integer,text)',
    'public.oms_reconcile_inventory_stock(uuid,uuid,integer,integer,integer,text)',
    'public.oms_manage_inventory_replenishment(text,uuid,uuid,timestamp with time zone,integer,text,text,text)'
  ] LOOP
    IF to_regprocedure(item) IS NULL THEN bad:=array_append(bad,item); END IF;
  END LOOP;
  IF cardinality(bad)>0 THEN
    RAISE EXCEPTION 'Missing production RPCs: %',array_to_string(bad,', ');
  END IF;

  FOREACH relation_name IN ARRAY ARRAY[
    'production_station_capacity','production_reservations',
    'production_exception_reviews','production_exception_events',
    'inventory_movements','inventory_replenishment_requests',
    'inventory_replenishment_events'
  ] LOOP
    IF NOT (SELECT c.relrowsecurity FROM pg_class c
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=relation_name) THEN
      RAISE EXCEPTION 'RLS disabled: public.%',relation_name;
    END IF;
  END LOOP;

  FOREACH item IN ARRAY ARRAY[
    'public.production_reservations','public.production_exception_reviews',
    'public.production_exception_events','public.inventory_movements',
    'public.inventory_replenishment_requests',
    'public.inventory_replenishment_events'
  ] LOOP
    IF has_table_privilege('authenticated',item,'INSERT')
       OR has_table_privilege('authenticated',item,'UPDATE')
       OR has_table_privilege('authenticated',item,'DELETE')
       OR has_table_privilege('anon',item,'SELECT') THEN
      RAISE EXCEPTION 'Unexpected direct table or anonymous grant on %',item;
    END IF;
  END LOOP;
  IF NOT has_table_privilege('authenticated','public.production_reservations','SELECT')
     OR NOT has_table_privilege('authenticated','public.production_exception_reviews','SELECT')
     OR NOT has_table_privilege('authenticated','public.inventory_movements','SELECT')
     OR NOT has_table_privilege('authenticated','public.inventory_replenishment_requests','SELECT')
     OR NOT has_table_privilege('authenticated','public.inventory_replenishment_events','SELECT') THEN
    RAISE EXCEPTION 'Production or inventory audit tables are not readable by authenticated clients';
  END IF;

  FOREACH item IN ARRAY ARRAY[
    'public.complete_stage_with_consumption(uuid,text,jsonb,boolean,text,numeric,text,timestamp with time zone)',
    'public.oms_manage_production_reservation(text,uuid,uuid,text,date,numeric,text,timestamp with time zone)',
    'public.oms_manage_production_exception(text,uuid,text,text,uuid,timestamp with time zone,date,text)',
    'public.oms_record_manual_inventory_movement(uuid,uuid,text,integer,text)',
    'public.oms_reconcile_inventory_stock(uuid,uuid,integer,integer,integer,text)',
    'public.oms_manage_inventory_replenishment(text,uuid,uuid,timestamp with time zone,integer,text,text,text)'
  ] LOOP
    IF has_function_privilege('anon',item,'EXECUTE')
       OR NOT has_function_privilege('authenticated',item,'EXECUTE') THEN
      RAISE EXCEPTION 'Invalid RPC grants: %',item;
    END IF;
  END LOOP;

  IF has_function_privilege('authenticated',
       'public.complete_stage_with_consumption(uuid,text,jsonb,boolean,text,numeric,text)','EXECUTE')
     OR has_function_privilege('anon',
       'public.complete_stage_with_consumption(uuid,text,jsonb,boolean,text,numeric,text)','EXECUTE')
     OR NOT has_function_privilege('service_role',
       'public.complete_stage_with_consumption(uuid,text,jsonb,boolean,text,numeric,text)','EXECUTE')
     OR has_function_privilege('authenticated',
       'public.consume_materials_for_order(uuid,text,jsonb,uuid)','EXECUTE')
     OR has_function_privilege('anon',
       'public.consume_materials_for_order(uuid,text,jsonb,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Unsafe direct grant on internal inventory/stage consumption RPC';
  END IF;

  IF (SELECT count(*) FROM pg_policies
      WHERE schemaname='public' AND tablename='production_reservations')<1
     OR (SELECT count(*) FROM pg_policies
      WHERE schemaname='public' AND tablename='production_exception_reviews')<1
     OR (SELECT count(*) FROM pg_policies
      WHERE schemaname='public' AND tablename='production_exception_events')<1 THEN
    RAISE EXCEPTION 'Missing production row access policy';
  END IF;

  IF (SELECT count(*) FROM pg_policies
      WHERE schemaname='public' AND tablename='inventory_movements')<1
     OR (SELECT count(*) FROM pg_policies
      WHERE schemaname='public' AND tablename='inventory_replenishment_requests')<1
     OR (SELECT count(*) FROM pg_policies
      WHERE schemaname='public' AND tablename='inventory_replenishment_events')<1 THEN
    RAISE EXCEPTION 'Missing inventory audit or replenishment row access policy';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid=ANY(ARRAY[
      to_regprocedure('public.oms_record_manual_inventory_movement(uuid,uuid,text,integer,text)')::oid,
      to_regprocedure('public.oms_reconcile_inventory_stock(uuid,uuid,integer,integer,integer,text)')::oid,
      to_regprocedure('public.oms_manage_inventory_replenishment(text,uuid,uuid,timestamp with time zone,integer,text,text,text)')::oid
    ]) AND NOT p.prosecdef
  ) THEN
    RAISE EXCEPTION 'An inventory write RPC is not SECURITY DEFINER';
  END IF;

  RAISE NOTICE 'OMS production and inventory schema/RPC/grant/RLS checks: PASS';
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
UNION ALL
SELECT 'legacy_inventory_rows_without_material', count(*)
  FROM public.inventory_items WHERE material_id IS NULL
UNION ALL
SELECT 'materials_with_multiple_legacy_inventory_rows', count(*)
  FROM (SELECT material_id FROM public.inventory_items
        WHERE material_id IS NOT NULL GROUP BY material_id HAVING count(*)>1) duplicates
UNION ALL
SELECT 'canonical_legacy_inventory_balance_mismatches', count(*)
  FROM public.materials m
  JOIN public.inventory_items i ON i.material_id=m.id
  WHERE i.stock IS DISTINCT FROM m.stock
    AND (SELECT count(*) FROM public.inventory_items mapped
         WHERE mapped.material_id=m.id)=1
ORDER BY check_name;

ROLLBACK;
