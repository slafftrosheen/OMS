-- Run after applying the workspace migration. All role changes are rolled back.
BEGIN;
DO $$
BEGIN
  IF pg_catalog.has_function_privilege('anon', 'public.telegram_workspace_today()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous role can run the Telegram workspace RPC';
  END IF;
  IF NOT pg_catalog.has_function_privilege('authenticated', 'public.telegram_workspace_today()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated role cannot run the Telegram workspace RPC';
  END IF;
  IF (SELECT prosecdef FROM pg_catalog.pg_proc WHERE oid = 'public.telegram_workspace_today()'::regprocedure) THEN
    RAISE EXCEPTION 'Telegram workspace must use the caller role';
  END IF;
END $$;

SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub', '', true);
SELECT pg_catalog.set_config('request.jwt.claims', '{}', true);
DO $$
BEGIN
  IF public.telegram_workspace_today() IS NOT NULL THEN
    RAISE EXCEPTION 'A request without an authenticated user received workspace data';
  END IF;
END $$;
ROLLBACK;
