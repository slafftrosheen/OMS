-- Every committed delivery-address use is recorded alongside the ordinary
-- atomic order save. AI analysis and local application never write this book.
BEGIN;
CREATE OR REPLACE FUNCTION public.oms_address_key(value text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=public,pg_temp
AS $$ SELECT btrim(regexp_replace(lower(normalize(coalesce(value,''),NFKC)),
 '[[:space:],]+',' ','g')) $$;

CREATE TABLE IF NOT EXISTS public.client_delivery_addresses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 client_key text NOT NULL,
 address_key text NOT NULL,
 client_name text NOT NULL,
 normalized_address text NOT NULL,
 first_used_at timestamptz NOT NULL,
 last_used_at timestamptz NOT NULL,
 UNIQUE(client_key,address_key),
 CHECK(client_key<>'' AND address_key<>'')
);
CREATE TABLE IF NOT EXISTS public.client_delivery_address_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 address_id uuid NOT NULL REFERENCES public.client_delivery_addresses(id),
 source_order_id uuid REFERENCES public.draft_orders(id) ON DELETE SET NULL,
 order_updated_at timestamptz NOT NULL,
 actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
 client_name text NOT NULL,
 raw_address text NOT NULL,
 contact text,
 phone text,
 email text,
 used_at timestamptz NOT NULL,
 snapshot_key text NOT NULL,
 UNIQUE(source_order_id,order_updated_at,address_id,snapshot_key)
);
CREATE INDEX IF NOT EXISTS client_address_history_source_idx
 ON public.client_delivery_address_history(source_order_id,address_id);
CREATE INDEX IF NOT EXISTS client_address_history_address_idx
 ON public.client_delivery_address_history(address_id,used_at DESC);

CREATE OR REPLACE FUNCTION public.oms_record_client_delivery_address(
 p_order public.draft_orders,p_actor uuid,p_used_at timestamptz
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_id uuid; v_client text:=public.oms_address_key(p_order.client);
 v_address text:=public.oms_address_key(p_order.delivery_address);
BEGIN
 IF v_client='' OR v_address='' THEN RETURN; END IF;
 INSERT INTO public.client_delivery_addresses(
  client_key,address_key,client_name,normalized_address,first_used_at,last_used_at
 ) VALUES (
  v_client,v_address,btrim(p_order.client),
  btrim(regexp_replace(normalize(p_order.delivery_address,NFKC),'[[:space:]]+',' ','g')),
  p_used_at,p_used_at
 ) ON CONFLICT(client_key,address_key) DO UPDATE SET
  first_used_at=least(client_delivery_addresses.first_used_at,excluded.first_used_at),
  last_used_at=greatest(client_delivery_addresses.last_used_at,excluded.last_used_at)
 RETURNING id INTO v_id;
 INSERT INTO public.client_delivery_address_history(
  address_id,source_order_id,order_updated_at,actor_id,client_name,raw_address,
  contact,phone,email,used_at,snapshot_key
 ) VALUES (
  v_id,p_order.id,p_order.updated_at,p_actor,p_order.client,p_order.delivery_address,
  p_order.delivery_contact,p_order.delivery_phone,p_order.metadata->>'delivery_email',p_used_at,
  md5(jsonb_build_array(p_order.client,p_order.delivery_address,p_order.delivery_contact,
    p_order.delivery_phone,p_order.metadata->>'delivery_email')::text)
 ) ON CONFLICT(source_order_id,order_updated_at,address_id,snapshot_key) DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.oms_record_client_delivery_address(public.draft_orders,uuid,timestamptz)
 FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.oms_capture_client_delivery_address()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF ROW(NEW.client,NEW.delivery_address,NEW.delivery_contact,NEW.delivery_phone,NEW.metadata->>'delivery_email')
   IS NOT DISTINCT FROM ROW(OLD.client,OLD.delivery_address,OLD.delivery_contact,OLD.delivery_phone,OLD.metadata->>'delivery_email')
   THEN RETURN NEW; END IF;
 END IF;
 PERFORM public.oms_record_client_delivery_address(NEW,coalesce(auth.uid(),NEW.updated_by,NEW.created_by),NEW.updated_at);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.oms_capture_client_delivery_address() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS capture_client_delivery_address ON public.draft_orders;
CREATE TRIGGER capture_client_delivery_address
 AFTER INSERT OR UPDATE OF client,delivery_address,delivery_contact,delivery_phone,metadata
 ON public.draft_orders FOR EACH ROW EXECUTE FUNCTION public.oms_capture_client_delivery_address();

-- Backfill current saved uses; never touch the source order or invent older
-- addresses. Re-running the migration cannot duplicate a snapshot.
DO $$ DECLARE v_order public.draft_orders; BEGIN
 FOR v_order IN SELECT * FROM public.draft_orders
  WHERE public.oms_address_key(client)<>'' AND public.oms_address_key(delivery_address)<>''
 LOOP
  PERFORM public.oms_record_client_delivery_address(v_order,
   coalesce(v_order.updated_by,v_order.created_by),v_order.updated_at);
 END LOOP;
END $$;

ALTER TABLE public.client_delivery_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_delivery_address_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_delivery_addresses,public.client_delivery_address_history FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.client_delivery_addresses,public.client_delivery_address_history TO authenticated;
DROP POLICY IF EXISTS client_address_history_read ON public.client_delivery_address_history;
CREATE POLICY client_address_history_read ON public.client_delivery_address_history
 FOR SELECT TO authenticated USING (
  EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.is_active=true)
  AND EXISTS(SELECT 1 FROM public.draft_orders o WHERE o.id=source_order_id)
 );
DROP POLICY IF EXISTS client_addresses_read ON public.client_delivery_addresses;
CREATE POLICY client_addresses_read ON public.client_delivery_addresses
 FOR SELECT TO authenticated USING (
  EXISTS(SELECT 1 FROM public.client_delivery_address_history h WHERE h.address_id=client_delivery_addresses.id)
 );
REVOKE ALL ON FUNCTION public.oms_address_key(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.oms_address_key(text) TO authenticated;
CREATE OR REPLACE FUNCTION public.oms_client_delivery_addresses(p_client text)
RETURNS TABLE(id uuid,address text,contact text,phone text,email text,last_used_at timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
 SELECT a.id,h.raw_address,h.contact,h.phone,h.email,h.used_at
 FROM public.client_delivery_addresses a
 CROSS JOIN LATERAL (
  SELECT s.raw_address,s.contact,s.phone,s.email,s.used_at
  FROM public.client_delivery_address_history s WHERE s.address_id=a.id
  ORDER BY s.used_at DESC,s.id DESC LIMIT 1
 ) h
 WHERE a.client_key=public.oms_address_key(p_client)
 ORDER BY h.used_at DESC,a.id LIMIT 50
$$;
REVOKE ALL ON FUNCTION public.oms_client_delivery_addresses(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.oms_client_delivery_addresses(text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
