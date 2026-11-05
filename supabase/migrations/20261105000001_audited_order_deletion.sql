-- Soft deletion: preserve files, revisions, stock consumption and PO identity.
BEGIN;
CREATE OR REPLACE FUNCTION public.oms_delete_order(
 p_order_id UUID, p_expected_updated_at TIMESTAMPTZ
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 v_actor UUID := auth.uid();
 v_order public.draft_orders%ROWTYPE;
 v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=v_actor
   AND is_active=TRUE AND role::text IN ('Boss','RD','HeadOfProduction')) THEN
   RAISE EXCEPTION 'Manager role required' USING ERRCODE='42501';
 END IF;
 -- Same lock order as stage completion. Neither consumption nor confirmation
 -- can finish against a deleted order.
 SELECT * INTO v_order FROM public.draft_orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Order not found' USING ERRCODE='P0002'; END IF;
 IF v_order.status='CANCELLED' THEN
   RETURN jsonb_build_object('success',TRUE,'id',v_order.id,'status','CANCELLED','idempotent',TRUE);
 END IF;
 IF p_expected_updated_at IS NULL OR v_order.updated_at IS DISTINCT FROM p_expected_updated_at THEN
   RAISE EXCEPTION 'Order changed' USING ERRCODE='40001';
 END IF;
 IF v_order.status NOT IN ('DRAFT','draft','PENDING_REVIEW','CONFIRMED','IN_PRODUCTION','READY_TO_LOAD','ON_HOLD') THEN
   RAISE EXCEPTION 'Closed orders retain their dispatch/archive history' USING ERRCODE='22023';
 END IF;
 UPDATE public.draft_orders SET status='CANCELLED',updated_by=v_actor,updated_at=v_now WHERE id=p_order_id;
 UPDATE public.production_reservations SET status='CANCELLED',cancelled_by=v_actor,
   cancelled_at=v_now,updated_at=v_now WHERE draft_order_id=p_order_id AND status IN ('PROPOSED','APPROVED');
 DELETE FROM public.loading_event_pos WHERE draft_order_id=p_order_id;
 INSERT INTO public.order_activity_log(order_id,actor_id,event_type,payload)
 VALUES(p_order_id,v_actor,'order_deleted',jsonb_build_object('from',v_order.status,'to','CANCELLED',
   'soft_delete',TRUE,'files_retained',TRUE,'consumption_retained',TRUE));
 RETURN jsonb_build_object('success',TRUE,'id',p_order_id,'status','CANCELLED');
END; $$;
REVOKE ALL ON FUNCTION public.oms_delete_order(UUID,TIMESTAMPTZ) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.oms_delete_order(UUID,TIMESTAMPTZ) TO authenticated;
-- Physical deletes would bypass the audit path and cascade attachment/history rows.
REVOKE DELETE ON public.draft_orders FROM authenticated;
-- Make the new RPC discoverable immediately after the transaction commits.
NOTIFY pgrst, 'reload schema';
COMMIT;
