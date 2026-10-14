-- OMS-R25. Requires R21/R22 capacity and reservation migrations for missed-booking detection.
-- Review records do not modify stages, estimates, booking commitments or material stock.
BEGIN;
CREATE TABLE IF NOT EXISTS public.production_exception_reviews (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 draft_order_id UUID NOT NULL REFERENCES public.draft_orders(id) ON DELETE CASCADE,
 station TEXT NOT NULL CHECK (station IN (
   'CAD','CNC','EDGE','ASSEMBLY','PAINT','PACKAGING','DELIVERY',
   'SANDING','BENDING','WELDING','FILM_COATING','GLUEING','QC','LOGISTICS'
 )),
 kind TEXT NOT NULL CHECK (kind IN (
   'MISSING_ACTUAL','ACTUAL_OVERRUN','BLOCKED','REWORK','MISSED_BOOKING'
 )),
 status TEXT NOT NULL DEFAULT 'ACKNOWLEDGED'
   CHECK (status IN ('OPEN','ACKNOWLEDGED','RESOLVED')),
 owner_id UUID REFERENCES auth.users(id),
 due_date DATE,
 follow_up_note TEXT NOT NULL DEFAULT '' CHECK (length(follow_up_note)<=1000),
 resolution_note TEXT CHECK (length(resolution_note)<=2000),
 created_by UUID NOT NULL REFERENCES auth.users(id),
 updated_by UUID NOT NULL REFERENCES auth.users(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 resolved_at TIMESTAMPTZ,
 UNIQUE (draft_order_id,station,kind)
);
CREATE INDEX IF NOT EXISTS production_exception_reviews_status_due
 ON public.production_exception_reviews(status,due_date);

CREATE TABLE IF NOT EXISTS public.production_exception_events (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 review_id UUID NOT NULL REFERENCES public.production_exception_reviews(id) ON DELETE CASCADE,
 action TEXT NOT NULL CHECK (action IN ('claim','take','update','resolve','reopen')),
 previous_status TEXT,
 new_status TEXT NOT NULL,
 actor_id UUID NOT NULL REFERENCES auth.users(id),
 description TEXT NOT NULL DEFAULT '' CHECK (length(description)<=2000),
 occurred_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS production_exception_events_review_time
 ON public.production_exception_events(review_id,occurred_at);

ALTER TABLE public.production_exception_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_exception_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS production_exception_review_read ON public.production_exception_reviews;
CREATE POLICY production_exception_review_read ON public.production_exception_reviews
 FOR SELECT TO authenticated USING (
   EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.is_active=TRUE)
   AND EXISTS (SELECT 1 FROM public.draft_orders o
     WHERE o.id=production_exception_reviews.draft_order_id)
 );
DROP POLICY IF EXISTS production_exception_events_read ON public.production_exception_events;
CREATE POLICY production_exception_events_read ON public.production_exception_events
 FOR SELECT TO authenticated USING (
   EXISTS (SELECT 1 FROM public.production_exception_reviews r
     WHERE r.id=production_exception_events.review_id)
 );
REVOKE ALL ON public.production_exception_reviews FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.production_exception_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.production_exception_reviews TO authenticated;
GRANT SELECT ON public.production_exception_events TO authenticated;

CREATE OR REPLACE FUNCTION public.oms_manage_production_exception(
 p_action TEXT,
 p_order_id UUID DEFAULT NULL,
 p_station TEXT DEFAULT NULL,
 p_kind TEXT DEFAULT NULL,
 p_review_id UUID DEFAULT NULL,
 p_expected_updated_at TIMESTAMPTZ DEFAULT NULL,
 p_due_date DATE DEFAULT NULL,
 p_note TEXT DEFAULT NULL
) RETURNS public.production_exception_reviews
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 v_actor UUID:=auth.uid();
 v_role TEXT;
 v_review public.production_exception_reviews%ROWTYPE;
 v_stage public.order_stages%ROWTYPE;
 v_order public.draft_orders%ROWTYPE;
 v_station TEXT;
 v_kind TEXT;
 v_issue_exists BOOLEAN:=FALSE;
 v_previous_status TEXT;
 v_today DATE:=(now() AT TIME ZONE 'Europe/Riga')::date;
BEGIN
 SELECT p.role::text INTO v_role FROM public.profiles p
 WHERE p.id=v_actor AND p.is_active=TRUE;
 IF v_actor IS NULL OR v_role NOT IN ('RD','Boss','HeadOfProduction') OR v_role IS NULL THEN
   RAISE EXCEPTION 'Active production manager required' USING ERRCODE='42501';
 END IF;
 IF p_action NOT IN ('claim','take','update','resolve','reopen') THEN
   RAISE EXCEPTION 'Unsupported review action' USING ERRCODE='22023';
 END IF;
 IF p_note IS NOT NULL AND length(p_note)>2000 THEN
   RAISE EXCEPTION 'Review note too long or invalid' USING ERRCODE='22023';
 END IF;
 IF p_action IN ('claim','take','update') AND p_due_date IS NULL THEN
   RAISE EXCEPTION 'An accountable follow-up due date is required' USING ERRCODE='22023';
 END IF;
 IF p_due_date IS NOT NULL AND
   (p_due_date<v_today OR p_due_date>v_today+365) THEN
   RAISE EXCEPTION 'Follow-up date must be within the next year' USING ERRCODE='22023';
 END IF;

 IF p_action='claim' THEN
   IF p_review_id IS NOT NULL OR p_expected_updated_at IS NOT NULL OR
      p_order_id IS NULL OR p_station IS NULL OR p_kind IS NULL OR
      p_kind NOT IN ('MISSING_ACTUAL','ACTUAL_OVERRUN','BLOCKED','REWORK','MISSED_BOOKING') THEN
     RAISE EXCEPTION 'Invalid exception claim' USING ERRCODE='22023';
   END IF;
   v_station=upper(trim(p_station));v_kind=p_kind;
 ELSE
   IF p_review_id IS NULL OR p_expected_updated_at IS NULL OR
     p_order_id IS NOT NULL OR p_station IS NOT NULL OR p_kind IS NOT NULL THEN
     RAISE EXCEPTION 'Review id and revision required; source fields not allowed' USING ERRCODE='22023';
   END IF;
   SELECT * INTO v_review FROM public.production_exception_reviews
   WHERE id=p_review_id FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Review not found' USING ERRCODE='P0002'; END IF;
   IF v_review.updated_at IS DISTINCT FROM p_expected_updated_at THEN
     RAISE EXCEPTION 'Review was changed; reload' USING ERRCODE='P0001';
   END IF;
   v_station=v_review.station;v_kind=v_review.kind;
 END IF;

 IF p_action IN ('claim','reopen') THEN
   SELECT * INTO v_order FROM public.draft_orders
   WHERE id=CASE WHEN p_action='claim' THEN p_order_id ELSE v_review.draft_order_id END;
   SELECT * INTO v_stage FROM public.order_stages
   WHERE draft_order_id=CASE WHEN p_action='claim' THEN p_order_id ELSE v_review.draft_order_id END
     AND station::text=v_station FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Stage no longer exists' USING ERRCODE='P0001'; END IF;
   v_issue_exists=CASE v_kind
     WHEN 'MISSING_ACTUAL' THEN
       v_stage.state::text='COMPLETED' AND v_stage.actual_hours IS NULL
     WHEN 'ACTUAL_OVERRUN' THEN
       v_stage.actual_hours IS NOT NULL AND v_stage.estimated_hours IS NOT NULL
       AND v_stage.actual_hours>v_stage.estimated_hours
     WHEN 'BLOCKED' THEN
       v_stage.state::text='BLOCKED' AND v_order.status::text IN
         ('CONFIRMED','IN_PRODUCTION','READY_TO_LOAD','ON_HOLD')
     WHEN 'REWORK' THEN
       v_stage.state::text='REWORK' AND v_order.status::text IN
         ('CONFIRMED','IN_PRODUCTION','READY_TO_LOAD','ON_HOLD')
     WHEN 'MISSED_BOOKING' THEN
       v_stage.state::text IN ('NOT_STARTED','QUEUED','IN_PROGRESS','BLOCKED','REWORK')
       AND v_order.status::text IN ('CONFIRMED','IN_PRODUCTION','READY_TO_LOAD','ON_HOLD')
       AND EXISTS (
         SELECT 1 FROM public.production_reservations r
         WHERE r.draft_order_id=v_stage.draft_order_id AND r.station=v_station
           AND r.status='APPROVED' AND r.work_date<v_today
       )
     ELSE FALSE
   END;
   IF NOT COALESCE(v_issue_exists,FALSE) THEN
     RAISE EXCEPTION 'Exception is no longer present in canonical production data'
       USING ERRCODE='P0001';
   END IF;
 END IF;

 IF p_action='claim' THEN
   IF p_note IS NOT NULL AND length(p_note)>1000 THEN
     RAISE EXCEPTION 'Follow-up note exceeds 1000 characters' USING ERRCODE='22023';
   END IF;
   INSERT INTO public.production_exception_reviews
     (draft_order_id,station,kind,status,owner_id,due_date,
      follow_up_note,created_by,updated_by)
   VALUES (p_order_id,v_station,v_kind,'ACKNOWLEDGED',v_actor,p_due_date,
      COALESCE(p_note,''),v_actor,v_actor)
   RETURNING * INTO v_review;
   v_previous_status=NULL;
 ELSE
   v_previous_status=v_review.status;
   IF p_action='take' THEN
     IF v_review.status<>'OPEN' THEN
       RAISE EXCEPTION 'Only open reviews can be claimed' USING ERRCODE='P0001';
     END IF;
     UPDATE public.production_exception_reviews
       SET owner_id=v_actor,status='ACKNOWLEDGED',due_date=COALESCE(p_due_date,due_date),
           updated_at=clock_timestamp(),updated_by=v_actor
     WHERE id=p_review_id RETURNING * INTO v_review;
   ELSIF p_action='update' THEN
     IF v_review.status='RESOLVED' THEN
       RAISE EXCEPTION 'Reopen resolved review before updating' USING ERRCODE='P0001';
     END IF;
     IF p_note IS NULL OR length(p_note)>1000 THEN
       RAISE EXCEPTION 'Follow-up note required (up to 1000 characters)' USING ERRCODE='22023';
     END IF;
     UPDATE public.production_exception_reviews
       SET due_date=p_due_date,follow_up_note=p_note,
           updated_at=clock_timestamp(),updated_by=v_actor
     WHERE id=p_review_id RETURNING * INTO v_review;
   ELSIF p_action='resolve' THEN
     IF v_review.status='RESOLVED' OR
       nullif(btrim(COALESCE(p_note,'')),'') IS NULL THEN
       RAISE EXCEPTION 'A resolution note and open review are required' USING ERRCODE='P0001';
     END IF;
     UPDATE public.production_exception_reviews
       SET status='RESOLVED',resolution_note=p_note,resolved_at=clock_timestamp(),
           updated_at=clock_timestamp(),updated_by=v_actor
     WHERE id=p_review_id RETURNING * INTO v_review;
   ELSIF p_action='reopen' THEN
     IF v_review.status<>'RESOLVED' THEN
       RAISE EXCEPTION 'Only resolved reviews may be reopened' USING ERRCODE='P0001';
     END IF;
     UPDATE public.production_exception_reviews
       SET status='OPEN',resolution_note=NULL,resolved_at=NULL,
           owner_id=NULL,due_date=NULL,
           updated_at=clock_timestamp(),updated_by=v_actor
     WHERE id=p_review_id RETURNING * INTO v_review;
   END IF;
 END IF;
 INSERT INTO public.production_exception_events
  (review_id,action,previous_status,new_status,actor_id,description)
 VALUES (v_review.id,p_action,v_previous_status,v_review.status,v_actor,
   COALESCE(p_note,''));
 RETURN v_review;
END;
$$;
REVOKE ALL ON FUNCTION public.oms_manage_production_exception(
 TEXT,UUID,TEXT,TEXT,UUID,TIMESTAMPTZ,DATE,TEXT) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.oms_manage_production_exception(
 TEXT,UUID,TEXT,TEXT,UUID,TIMESTAMPTZ,DATE,TEXT) TO authenticated;
COMMIT;
