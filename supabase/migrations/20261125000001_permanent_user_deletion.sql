BEGIN;
SET LOCAL lock_timeout = '5s';

-- Account-owned rows already cascade. Shared orders, files and production
-- history must survive deletion without retaining a foreign key to the user.
-- Scope this repair to single-column public FKs referencing the two user tables;
-- leave Auth internals, unrelated FKs and existing CASCADE/SET NULL rules alone.
DO $migration$
DECLARE fk RECORD; definition TEXT;
BEGIN
  FOR fk IN
    SELECT c.conrelid::regclass AS relation, c.conname,
      a.attname AS column_name, pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f' AND n.nspname = 'public'
      AND c.confrelid IN ('public.profiles'::regclass, 'auth.users'::regclass)
      AND c.confdeltype IN ('a', 'r') AND cardinality(c.conkey) = 1
  LOOP
    definition := regexp_replace(fk.definition, ' ON DELETE (NO ACTION|RESTRICT)', '');
    IF fk.relation::text IN ('workforce_work_entries', 'public.workforce_work_entries', 'workforce_absences', 'public.workforce_absences')
       AND fk.column_name = 'user_id' THEN
      definition := definition || ' ON DELETE CASCADE';
    ELSE
      EXECUTE format('ALTER TABLE %s ALTER COLUMN %I DROP NOT NULL', fk.relation, fk.column_name);
      definition := definition || ' ON DELETE SET NULL';
    END IF;
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I, ADD CONSTRAINT %I %s',
      fk.relation, fk.conname, fk.conname, definition);
  END LOOP;
END $migration$;

-- Only the server's service-role client may invoke this operation. Recheck
-- the actor's live profile as well as the route guard, and lock against races.
CREATE OR REPLACE FUNCTION public.oms_delete_user(p_user_id UUID, p_actor_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE actor public.profiles; storage_column RECORD; removed UUID;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Admin service access required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO actor FROM public.profiles WHERE id = p_actor_id FOR UPDATE;
  IF actor.id IS NULL OR actor.is_active IS DISTINCT FROM TRUE
     OR actor.role IS NULL OR actor.role NOT IN ('RD', 'Boss', 'HeadOfProduction') THEN
    RAISE EXCEPTION 'Active admin access required' USING ERRCODE = '42501';
  END IF;
  IF p_user_id = p_actor_id THEN
    RAISE EXCEPTION 'You cannot delete your own account' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM auth.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  -- These Auth tables have legacy user IDs without a user foreign key.
  -- Session cascades alone do not remove old tokens with no session_id.
  DELETE FROM auth.refresh_tokens WHERE user_id = p_user_id::TEXT;
  DELETE FROM auth.flow_state WHERE user_id = p_user_id OR linking_target_id = p_user_id;

  -- Delete while the profile still exists: workforce audit triggers can then
  -- record the deletion, and their subject FK becomes NULL with the profile.
  IF to_regclass('public.workforce_work_entries') IS NOT NULL THEN
    DELETE FROM public.workforce_work_entries WHERE user_id = p_user_id;
  END IF;
  IF to_regclass('public.workforce_absences') IS NOT NULL THEN
    DELETE FROM public.workforce_absences WHERE user_id = p_user_id;
  END IF;

  -- Shared attachments stay in Storage. Release ownership, including both
  -- legacy UUID owner and current owner_id fields across Storage versions.
  FOR storage_column IN
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'storage'
      AND table_name IN ('objects', 'buckets', 's3_multipart_uploads', 's3_multipart_uploads_parts')
      AND column_name IN ('owner', 'owner_id')
  LOOP
    EXECUTE format('UPDATE storage.%I SET %I = NULL WHERE %I::TEXT = $1',
      storage_column.table_name, storage_column.column_name, storage_column.column_name)
      USING p_user_id::TEXT;
  END LOOP;

  DELETE FROM auth.users WHERE id = p_user_id RETURNING id INTO removed;
  RETURN removed IS NOT NULL;
END $function$;

REVOKE ALL ON FUNCTION public.oms_delete_user(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.oms_delete_user(UUID, UUID) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
