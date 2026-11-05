-- A successful subscription does not emit changes unless the underlying tables
-- are published. `orders` is a view; the canonical parent is draft_orders.
BEGIN;
DO $$
DECLARE v_table TEXT;
BEGIN
 IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
  FOREACH v_table IN ARRAY ARRAY['draft_orders','order_stages'] LOOP
   IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
      WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=v_table) THEN
    EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',v_table);
   END IF;
  END LOOP;
 END IF;
END $$;
COMMIT;
