-- Run on a local development database only, with ON_ERROR_STOP=1.
-- A caller may prepend the deletion migration with its BEGIN/COMMIT removed.
-- Every TEST ONLY record and schema change is rolled back.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id,email) VALUES('a1000000-0000-4000-8000-000000000002','qa-flow-20261105@example.invalid');
UPDATE public.profiles SET role='Boss',is_active=true WHERE id='a1000000-0000-4000-8000-000000000002';
SELECT set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000002',true);
DO $$
DECLARE
 v_order public.draft_orders;
 v_file UUID;
 v_material UUID;
 v_station TEXT;
 v_version TIMESTAMPTZ;
 v_result JSONB;
 v_count INTEGER:=0;
BEGIN
 SELECT * INTO v_order FROM public.oms_create_draft_form(
  '{"client":"TEST ONLY lifecycle","title":"TEST ONLY all stations","due_date":"2026-12-01","priority":"NORMAL"}', '[]', 'DRAFT');
 BEGIN
  PERFORM public.oms_submit_draft_for_review(v_order.id);
  RAISE EXCEPTION 'submission without persisted files accepted';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='submission without persisted files accepted' THEN RAISE; END IF;
 END;
 INSERT INTO public.files(filename,filepath,mimetype,size,uploaded_by)
 VALUES('TEST-ONLY.pdf','orders/TEST-ONLY.pdf','application/pdf',20,'a1000000-0000-4000-8000-000000000002') RETURNING id INTO v_file;
 INSERT INTO public.order_files(draft_order_id,file_id,file_type) VALUES(v_order.id,v_file,'attachment');
 PERFORM public.oms_submit_draft_for_review(v_order.id);
 SELECT * INTO v_order FROM public.draft_orders WHERE id=v_order.id;
 IF v_order.status<>'PENDING_REVIEW' THEN RAISE EXCEPTION 'submission state mismatch'; END IF;
 PERFORM public.confirm_order_with_stages(v_order.id,'QA-NOV05',v_order.updated_at);
 IF (SELECT count(*) FROM public.order_stages WHERE draft_order_id=v_order.id)<>7 THEN RAISE EXCEPTION 'confirmation missing stages'; END IF;
 INSERT INTO public.materials(category,code,name_en,stock,unit)
 VALUES('OTHER','QA-NOV05','TEST ONLY lifecycle material',20,'pcs') RETURNING id INTO v_material;
 FOREACH v_station IN ARRAY ARRAY['CAD','CNC','EDGE','ASSEMBLY','PAINT','PACKAGING','DELIVERY',
  'SANDING','BENDING','WELDING','FILM_COATING','GLUEING','QC','LOGISTICS'] LOOP
  IF v_count>=7 THEN
   INSERT INTO public.order_stages(draft_order_id,station,state) VALUES(v_order.id,v_station,'QUEUED');
  END IF;
  IF (SELECT state FROM public.order_stages WHERE draft_order_id=v_order.id AND station=v_station)<>'QUEUED' THEN
   RAISE EXCEPTION 'handoff to % was not queued',v_station; END IF;
  UPDATE public.order_stages SET state='IN_PROGRESS',updated_at=clock_timestamp(),started_at=clock_timestamp()
   WHERE draft_order_id=v_order.id AND station=v_station RETURNING updated_at INTO v_version;
  SELECT public.complete_stage_with_consumption(v_order.id,v_station,
   jsonb_build_array(jsonb_build_object('item_id',v_material,'quantity',1)),false,NULL,0.5,'TEST ONLY production check',v_version) INTO v_result;
  IF (v_result->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'completion failed for %',v_station; END IF;
  BEGIN
   PERFORM public.complete_stage_with_consumption(v_order.id,v_station,
    jsonb_build_array(jsonb_build_object('item_id',v_material,'quantity',1)),false,NULL,0.5,NULL,v_version);
   RAISE EXCEPTION 'duplicate completion accepted';
  EXCEPTION WHEN raise_exception THEN
   IF SQLERRM='duplicate completion accepted' THEN RAISE; END IF;
  END;
  v_count:=v_count+1;
 END LOOP;
 IF (SELECT stock FROM public.materials WHERE id=v_material)<>6 THEN RAISE EXCEPTION 'material balance incorrect or deducted twice'; END IF;
 IF (SELECT count(*) FROM public.order_files WHERE draft_order_id=v_order.id)<>1 THEN RAISE EXCEPTION 'confirmation lost files'; END IF;
 RAISE NOTICE 'PASS draft, missing-file rejection, review, confirmation, 14 stations, handoff, consumption and replay protection';
END $$;
ROLLBACK;
