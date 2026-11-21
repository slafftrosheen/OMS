BEGIN;

-- The Mini App uses the signed-in OMS database role and the normal RLS policies.
-- Only date, title, status and reference fields are needed in the phone overview.
CREATE OR REPLACE FUNCTION public.telegram_workspace_today()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  WITH day AS (
    SELECT (pg_catalog.now() AT TIME ZONE 'Europe/Riga')::date AS today
    WHERE EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_active = true
    )
  ), order_rows AS (
    SELECT o.id, left(o.po_number, 60) AS po_number, left(o.title, 180) AS title, o.status,
      (o.due_date = d.today) IS TRUE AS due_today, (o.loading_date = d.today) IS TRUE AS loading_today
    FROM public.draft_orders o CROSS JOIN day d
    WHERE (o.due_date = d.today OR o.loading_date = d.today)
      AND o.status NOT IN ('DISPATCHED','ARCHIVED','CANCELLED','VOIDED','REJECTED','DONE','COMPLETED')
    ORDER BY loading_today DESC, due_today DESC, o.id
    LIMIT 12
  ), calendar_rows AS (
    SELECT e.id, e.kind, left(e.title, 180) AS title, e.created_at
    FROM public.calendar_events e CROSS JOIN day d
    WHERE e.date = d.today
    ORDER BY e.created_at, e.id
    LIMIT 8
  )
  SELECT pg_catalog.jsonb_build_object(
    'date', d.today,
    'timezone', 'Europe/Riga',
    'orders', COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(o) ORDER BY o.loading_today DESC, o.due_today DESC, o.id)
      FROM order_rows o
    ), '[]'::jsonb),
    'events', COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', e.id, 'kind', e.kind, 'title', e.title)
        ORDER BY e.created_at, e.id) FROM calendar_rows e
    ), '[]'::jsonb)
  )
  FROM day d;
$$;

REVOKE ALL ON FUNCTION public.telegram_workspace_today() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.telegram_workspace_today() TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
