-- OMS-R44 — Internal procurement follow-ups, NOT supplier orders or stock receipts.
-- Depends on the canonical materials inventory and R41/R42 parity controls.
-- No change to stock, reservations or manufacturing stage transitions.
BEGIN;

CREATE TABLE IF NOT EXISTS public.inventory_replenishment_requests (
 id UUID PRIMARY KEY,
 material_id UUID NOT NULL REFERENCES public.materials(id) ON DELETE RESTRICT,
 quantity INTEGER NOT NULL CHECK (quantity>0 AND quantity<=100000000),
 unit TEXT NOT NULL CHECK (length(unit) BETWEEN 1 AND 32),
 supplier_label TEXT CHECK (supplier_label IS NULL OR length(supplier_label)<=200),
 supplier_reference TEXT CHECK (supplier_reference IS NULL OR length(supplier_reference)<=200),
 note TEXT NOT NULL DEFAULT '' CHECK (length(note)<=1000),
 status TEXT NOT NULL DEFAULT 'OPEN'
   CHECK (status IN ('OPEN','ORDERED','CLOSED','CANCELLED')),
 stock_at_request INTEGER NOT NULL CHECK (stock_at_request>=0),
 minimum_at_request INTEGER NOT NULL CHECK (minimum_at_request>=0),
 created_by UUID NOT NULL REFERENCES auth.users(id),
 updated_by UUID NOT NULL REFERENCES auth.users(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 ordered_at TIMESTAMPTZ,
 closed_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS inventory_replenishment_one_active_per_material
 ON public.inventory_replenishment_requests(material_id)
 WHERE status IN ('OPEN','ORDERED');
CREATE INDEX IF NOT EXISTS inventory_replenishment_updated
 ON public.inventory_replenishment_requests(updated_at DESC,id);

CREATE TABLE IF NOT EXISTS public.inventory_replenishment_events (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id UUID NOT NULL REFERENCES public.inventory_replenishment_requests(id) ON DELETE CASCADE,
 action TEXT NOT NULL CHECK (action IN ('create','update','order','close','cancel')),
 previous_status TEXT,
 next_status TEXT NOT NULL,
 actor_id UUID NOT NULL REFERENCES auth.users(id),
 note TEXT NOT NULL DEFAULT '' CHECK (length(note)<=1000),
 occurred_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS inventory_replenishment_events_request_time
 ON public.inventory_replenishment_events(request_id,occurred_at,id);

ALTER TABLE public.inventory_replenishment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_replenishment_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inventory_replenishment_manager_read ON public.inventory_replenishment_requests;
CREATE POLICY inventory_replenishment_manager_read
 ON public.inventory_replenishment_requests FOR SELECT TO authenticated USING (
 EXISTS (SELECT 1 FROM public.profiles p
         WHERE p.id=auth.uid() AND p.is_active=TRUE
           AND p.role::text IN ('RD','Boss','HeadOfProduction'))
);
DROP POLICY IF EXISTS inventory_replenishment_events_manager_read ON public.inventory_replenishment_events;
CREATE POLICY inventory_replenishment_events_manager_read
 ON public.inventory_replenishment_events FOR SELECT TO authenticated USING (
 EXISTS (SELECT 1 FROM public.inventory_replenishment_requests r
         WHERE r.id=inventory_replenishment_events.request_id)
);
REVOKE ALL ON public.inventory_replenishment_requests FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.inventory_replenishment_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.inventory_replenishment_requests TO authenticated;
GRANT SELECT ON public.inventory_replenishment_events TO authenticated;

-- Single audited write path. An OPEN request is a procurement follow-up;
-- ORDERED records a human's external purchase reference, not an API purchase.
-- CLOSED means administratively closed, not a stock receipt. Stock must be
-- received separately through the R41 audited IN movement.
CREATE OR REPLACE FUNCTION public.oms_manage_inventory_replenishment(
 p_action TEXT,
 p_request_id UUID,
 p_material_id UUID DEFAULT NULL,
 p_expected_updated_at TIMESTAMPTZ DEFAULT NULL,
 p_quantity INTEGER DEFAULT NULL,
 p_supplier_label TEXT DEFAULT NULL,
 p_supplier_reference TEXT DEFAULT NULL,
 p_note TEXT DEFAULT NULL
) RETURNS public.inventory_replenishment_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE
 v_actor UUID:=auth.uid();
 v_role TEXT;
 v_row public.inventory_replenishment_requests%ROWTYPE;
 v_material public.materials%ROWTYPE;
 v_previous TEXT;
 v_legacy_count INTEGER;
 v_legacy_stock INTEGER;
 v_supplier TEXT:=nullif(btrim(coalesce(p_supplier_label,'')),'');
 v_reference TEXT:=nullif(btrim(coalesce(p_supplier_reference,'')),'');
 v_note TEXT:=btrim(coalesce(p_note,''));
BEGIN
 SELECT role::text INTO v_role FROM public.profiles
 WHERE id=v_actor AND is_active=TRUE;
 IF v_actor IS NULL OR v_role IS NULL OR
   v_role NOT IN ('RD','Boss','HeadOfProduction') THEN
   RAISE EXCEPTION 'Active inventory manager required' USING ERRCODE='42501';
 END IF;
 IF p_action IS NULL OR p_action NOT IN ('create','update','order','close','cancel')
   OR p_request_id IS NULL OR length(v_note)>1000
   OR length(coalesce(p_supplier_label,''))>200
   OR length(coalesce(p_supplier_reference,''))>200 THEN
   RAISE EXCEPTION 'Invalid replenishment request' USING ERRCODE='22023';
 END IF;

 IF p_action='create' THEN
   IF p_material_id IS NULL OR p_expected_updated_at IS NOT NULL OR
     p_quantity IS NULL OR p_quantity<=0 OR p_quantity>100000000 OR
     p_supplier_reference IS NOT NULL THEN
     RAISE EXCEPTION 'Invalid replenishment creation' USING ERRCODE='22023';
   END IF;
   -- Idempotent retry after the browser loses the response.
   SELECT * INTO v_row FROM public.inventory_replenishment_requests
     WHERE id=p_request_id;
   IF FOUND THEN
     IF v_row.material_id IS DISTINCT FROM p_material_id OR
       v_row.quantity IS DISTINCT FROM p_quantity OR
       v_row.created_by IS DISTINCT FROM v_actor OR
       v_row.supplier_label IS DISTINCT FROM v_supplier OR
       v_row.note IS DISTINCT FROM v_note THEN
       RAISE EXCEPTION 'Request ID reused with different input' USING ERRCODE='P0001';
     END IF;
     RETURN v_row;
   END IF;
   SELECT * INTO v_material FROM public.materials WHERE id=p_material_id FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Material not found' USING ERRCODE='P0002'; END IF;
   IF v_material.stock IS NULL OR v_material.stock<0 OR
     v_material.min_stock IS NULL OR v_material.min_stock<0 OR
     nullif(btrim(coalesce(v_material.unit,'')),'') IS NULL THEN
     RAISE EXCEPTION 'Material stock or unit invalid' USING ERRCODE='P0001';
   END IF;
   INSERT INTO public.inventory_replenishment_requests(
     id,material_id,quantity,unit,supplier_label,note,stock_at_request,
     minimum_at_request,created_by,updated_by
   ) VALUES (
     p_request_id,p_material_id,p_quantity,v_material.unit,v_supplier,v_note,
     v_material.stock,v_material.min_stock,v_actor,v_actor
   ) RETURNING * INTO v_row;
 ELSE
   IF p_material_id IS NOT NULL OR p_expected_updated_at IS NULL THEN
     RAISE EXCEPTION 'Existing review revision required' USING ERRCODE='22023';
   END IF;
   SELECT * INTO v_row FROM public.inventory_replenishment_requests
     WHERE id=p_request_id FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Request no longer exists' USING ERRCODE='P0002'; END IF;
   IF v_row.updated_at IS DISTINCT FROM p_expected_updated_at THEN
     RAISE EXCEPTION 'Request changed since it was opened' USING ERRCODE='P0001';
   END IF;
   v_previous:=v_row.status;
   IF p_action='update' THEN
     IF v_row.status<>'OPEN' OR p_quantity IS NULL OR
       p_quantity<=0 OR p_quantity>100000000 OR
       p_supplier_reference IS NOT NULL THEN
       RAISE EXCEPTION 'Only open requests can be edited' USING ERRCODE='22023';
     END IF;
     UPDATE public.inventory_replenishment_requests SET
       quantity=p_quantity,supplier_label=v_supplier,note=v_note,
       updated_by=v_actor,updated_at=clock_timestamp()
     WHERE id=p_request_id RETURNING * INTO v_row;
   ELSIF p_action='order' THEN
     IF v_row.status<>'OPEN' OR p_quantity IS NOT NULL OR
       v_reference IS NULL OR v_row.supplier_label IS NULL THEN
       RAISE EXCEPTION 'External supplier and order reference required'
         USING ERRCODE='22023';
     END IF;
     -- Ordering is blocked on unresolved R42 parity discrepancies.
     -- This does NOT prove physical stock; it prevents known double-ledger
     -- inconsistencies from being converted into purchase commitments.
     SELECT * INTO v_material FROM public.materials
       WHERE id=v_row.material_id FOR SHARE;
     IF NOT FOUND OR v_material.stock IS NULL OR v_material.stock<0 THEN
       RAISE EXCEPTION 'Canonical material unavailable' USING ERRCODE='P0001';
     END IF;
     SELECT count(*) INTO v_legacy_count FROM public.inventory_items
       WHERE material_id=v_row.material_id;
     IF v_legacy_count>1 THEN
       RAISE EXCEPTION 'Ambiguous legacy inventory mapping' USING ERRCODE='P0001';
     END IF;
     IF v_legacy_count=1 THEN
       SELECT stock INTO v_legacy_stock FROM public.inventory_items
         WHERE material_id=v_row.material_id FOR SHARE;
       IF v_legacy_stock IS DISTINCT FROM v_material.stock THEN
         RAISE EXCEPTION 'Reconcile inventory parity before ordering' USING ERRCODE='P0001';
       END IF;
     END IF;
     UPDATE public.inventory_replenishment_requests SET
       status='ORDERED',supplier_reference=v_reference,
       ordered_at=clock_timestamp(),updated_by=v_actor,
       updated_at=clock_timestamp()
     WHERE id=p_request_id RETURNING * INTO v_row;
   ELSIF p_action IN ('close','cancel') THEN
     IF (p_action='close' AND v_row.status<>'ORDERED')
       OR (p_action='cancel' AND v_row.status NOT IN ('OPEN','ORDERED'))
       OR length(v_note)<5 OR p_quantity IS NOT NULL OR
       p_supplier_reference IS NOT NULL THEN
       RAISE EXCEPTION 'Invalid close/cancel or missing explanation'
         USING ERRCODE='22023';
     END IF;
     UPDATE public.inventory_replenishment_requests SET
       status=CASE WHEN p_action='close' THEN 'CLOSED' ELSE 'CANCELLED' END,
       note=v_note,closed_at=clock_timestamp(),updated_by=v_actor,
       updated_at=clock_timestamp()
     WHERE id=p_request_id RETURNING * INTO v_row;
   END IF;
 END IF;
 INSERT INTO public.inventory_replenishment_events(
   request_id,action,previous_status,next_status,actor_id,note
 ) VALUES (
   v_row.id,p_action,v_previous,v_row.status,v_actor,
   CASE WHEN p_action='order' THEN 'Supplier order reference: '||v_reference||
       CASE WHEN v_note='' THEN '' ELSE '; '||v_note END
     ELSE v_note END
 );
 RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.oms_manage_inventory_replenishment(
 TEXT,UUID,UUID,TIMESTAMPTZ,INTEGER,TEXT,TEXT,TEXT
) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.oms_manage_inventory_replenishment(
 TEXT,UUID,UUID,TIMESTAMPTZ,INTEGER,TEXT,TEXT,TEXT
) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
