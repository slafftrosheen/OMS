-- Claim-bound, read-only business context under the linked user's existing RLS policies.
BEGIN;
CREATE SCHEMA IF NOT EXISTS oms_telegram_private;
REVOKE ALL ON SCHEMA oms_telegram_private FROM PUBLIC;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='oms_telegram_reader') THEN
    CREATE ROLE oms_telegram_reader NOLOGIN NOSUPERUSER NOBYPASSRLS INHERIT;
  END IF;
END $$;
GRANT authenticated TO oms_telegram_reader;
GRANT USAGE ON SCHEMA public,oms_telegram_private TO oms_telegram_reader;
CREATE FUNCTION oms_telegram_private.sources() RETURNS jsonb LANGUAGE sql IMMUTABLE AS $sources$
 SELECT '{"orders": {"table": "draft_orders", "key": "id", "columns": ["id", "po_number", "internal_ref", "client", "title", "status", "priority", "due_date", "loading_date", "notes", "delivery_address", "delivery_contact", "delivery_phone", "is_rd", "rd_notes", "price", "created_by", "created_at", "updated_at", "confirmed_at", "dispatched_at"]}, "order_profiles": {"table": "order_profiles", "key": "id", "columns": ["id", "draft_order_id", "profile_template_id", "quantity1", "quantity2", "quantity3", "quantity4", "configuration", "notes", "order_index", "updated_at"]}, "production_stages": {"table": "order_stages", "key": "id", "columns": ["id", "draft_order_id", "station", "state", "started_at", "completed_at", "blocked_reason", "estimated_hours", "actual_hours", "notes", "updated_at"]}, "order_materials": {"table": "order_materials", "key": "id", "columns": ["id", "draft_order_id", "material_type", "material_category", "thickness", "dimensions", "color", "ral_code", "quantity", "unit", "supplier", "notes"]}, "order_assignees": {"table": "order_assignees", "key": "id", "columns": ["id", "draft_order_id", "assignee_id", "assigned_by", "assigned_at"]}, "materials": {"table": "materials", "key": "id", "columns": ["id", "code", "sku", "name_en", "name_ru", "name_lv", "category", "thickness_options", "stock", "min_stock", "max_stock", "unit", "location", "vendor", "supplier", "color_code", "price", "note", "thickness_mm"]}, "inventory": {"table": "inventory_items", "key": "id", "columns": ["id", "material_id", "sku", "name", "category", "unit", "stock", "min_stock", "max_stock", "thickness_mm", "location", "vendor", "color_code", "note", "updated_at"]}, "inventory_movements": {"table": "inventory_movements", "key": "id", "columns": ["id", "item_id", "material_id", "movement_type", "quantity", "reference_id", "reference_type", "performed_by", "notes", "created_at", "stock_before", "stock_after"]}, "replenishment": {"table": "inventory_replenishment_requests", "key": "id", "columns": ["id", "material_id", "quantity", "unit", "supplier_label", "supplier_reference", "note", "status", "stock_at_request", "minimum_at_request", "created_by", "created_at", "updated_at", "ordered_at", "closed_at"]}, "calendar": {"table": "calendar_events", "key": "id", "columns": ["id", "kind", "date", "title", "note", "created_by", "updated_at"]}, "loading_events": {"table": "loading_events", "key": "id", "columns": ["id", "carrier", "window_start", "window_end", "notes", "created_at"]}, "loading_days": {"table": "loading_days", "key": "id", "columns": ["id", "date", "max_capacity", "notes", "is_blocked", "updated_at"]}, "staff": {"table": "profiles", "key": "id", "columns": ["id", "username", "display_name", "full_name", "role", "station", "stations", "is_active"]}, "work_entries": {"table": "workforce_work_entries", "key": "id", "columns": ["id", "user_id", "work_date", "actual_minutes", "multiplier", "credited_minutes", "holiday_name", "note", "start_time", "finish_time", "updated_at"]}, "absences": {"table": "workforce_absences", "key": "id", "columns": ["id", "user_id", "start_date", "end_date", "partial_day", "reason", "note", "status", "updated_at"]}, "reports": {"table": "workforce_reports", "key": "id", "columns": ["id", "kind", "period", "version", "generated_at", "is_stale", "payload"]}, "order_history": {"table": "order_activity_log", "key": "id", "columns": ["id", "order_id", "actor_id", "event_type", "payload", "created_at"]}, "station_logs": {"table": "station_logs", "key": "id", "columns": ["id", "user_id", "station", "action", "details", "created_at", "order_id"]}, "change_requests": {"table": "change_requests", "key": "id", "columns": ["id", "order_id", "description", "proposed_diff", "status", "requested_by", "reviewed_by", "reviewed_at", "review_notes", "created_at", "updated_at"]}, "chat_rooms": {"table": "chat_rooms", "key": "id", "columns": ["id", "name", "kind", "station", "order_id", "is_private", "archived_at"]}, "chat_messages": {"table": "chat_messages", "key": "id", "columns": ["id", "room_id", "user_id", "text", "content", "message", "order_id", "created_at", "updated_at"]}, "knowledge": {"table": "company_knowledge", "key": "id", "columns": ["id", "url", "category", "content", "crawled_at"]}, "profile_templates": {"table": "profile_templates", "key": "id", "columns": ["id", "code", "name", "version", "is_active", "description", "updated_at"]}, "capacity": {"table": "production_station_capacity", "key": "station", "columns": ["station", "workers", "hours_per_worker", "efficiency_percent", "workdays", "updated_at"]}, "files": {"table": "files", "key": "id", "columns": ["id", "filename", "original_name", "mimetype", "size", "uploaded_by", "created_at"]}, "order_files": {"table": "order_files", "key": "id", "columns": ["id", "draft_order_id", "file_id", "file_type", "display_name", "created_at"]}, "order_revisions": {"table": "order_revisions", "key": "id", "columns": ["id", "order_id", "revision_number", "note", "created_by", "created_at"]}, "notifications": {"table": "notifications", "key": "id", "columns": ["id", "notification_type", "title", "message", "link", "is_read", "source_type", "source_id", "created_at"]}}'::jsonb;
$sources$;

REVOKE ALL ON FUNCTION oms_telegram_private.sources() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION oms_telegram_private.sources() TO oms_telegram_reader;
CREATE TABLE oms_telegram_private.context_reads (
 reply_id uuid NOT NULL REFERENCES public.telegram_bot_replies(id) ON DELETE CASCADE,
 source text NOT NULL, record_key text NOT NULL, PRIMARY KEY(reply_id,source,record_key)
);

CREATE FUNCTION oms_telegram_private.read_source(p_source text,p_mode text,p_filters jsonb,p_group text,p_offset integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=on AS $$
DECLARE spec jsonb; cols text; base_sql text; clause text:='true'; f jsonb; typ text;
 field text; op text; predicate text; result jsonb; items jsonb; total bigint;
BEGIN
 spec:=oms_telegram_private.sources()->p_source;
 IF spec IS NULL OR p_mode NOT IN ('rows','count','summary') OR p_offset NOT BETWEEN 0 AND 2000
   OR jsonb_typeof(p_filters) IS DISTINCT FROM 'array' OR jsonb_array_length(p_filters)>5 THEN
   RAISE EXCEPTION 'Invalid context request' USING ERRCODE='22023'; END IF;
 -- Even a future allowlist entry cannot silently bypass missing RLS.
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class t WHERE t.oid=to_regclass('public.'||(spec->>'table')) AND t.relrowsecurity) THEN
   RAISE EXCEPTION 'Source unavailable' USING ERRCODE='42501'; END IF;
 SELECT string_agg(format('%I',v),',') INTO cols FROM jsonb_array_elements_text(spec->'columns') x(v);
 FOR f IN SELECT value FROM jsonb_array_elements(p_filters) LOOP
  field:=f->>'field'; op:=f->>'op';
  IF NOT (spec->'columns') ? field OR op NOT IN ('eq','contains','gte','lte')
    OR jsonb_typeof(f->'value') IS DISTINCT FROM 'string' OR length(f->>'value')>200 THEN
    RAISE EXCEPTION 'Invalid filter' USING ERRCODE='22023'; END IF;
  SELECT format_type(a.atttypid,a.atttypmod) INTO typ FROM pg_catalog.pg_attribute a
   WHERE a.attrelid=to_regclass('public.'||(spec->>'table')) AND a.attname=field AND NOT a.attisdropped;
  IF op='contains' THEN predicate:=format('position(lower(%L) in lower(%I::text))>0',f->>'value',field);
  ELSE predicate:=format('%I %s %L::%s',field,CASE op WHEN 'eq' THEN '=' WHEN 'gte' THEN '>=' ELSE '<=' END,f->>'value',typ);
  END IF;
  clause:=clause||' AND ('||predicate||')';
 END LOOP;
 IF p_source='chat_messages' THEN clause:=clause||' AND NOT coalesce(is_deleted,false) AND NOT coalesce(deleted,false) AND deleted_at IS NULL'; END IF;
 base_sql:=format(' FROM public.%I WHERE %s',spec->>'table',clause);
 IF p_mode='count' THEN
  EXECUTE 'SELECT count(*)'||base_sql INTO total;
  RETURN jsonb_build_object('source',p_source,'count',total,'exact',true,'scope','Records visible to the linked account','observedAt',clock_timestamp());
 ELSIF p_mode='summary' THEN
  IF p_group IS NULL OR NOT (spec->'columns') ? p_group THEN RAISE EXCEPTION 'Invalid group' USING ERRCODE='22023'; END IF;
  EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(q)),''[]''::jsonb) FROM (SELECT %I AS value,count(*) AS count%s GROUP BY %I ORDER BY count(*) DESC,%I NULLS LAST LIMIT 101) q',p_group,base_sql,p_group,p_group) INTO items;
  RETURN jsonb_build_object('source',p_source,'groups',(SELECT coalesce(jsonb_agg(value),'[]'::jsonb) FROM jsonb_array_elements(items) WITH ORDINALITY x(value,n) WHERE n<=100),
    'truncated',jsonb_array_length(items)>100,'scope','Records visible to the linked account','observedAt',clock_timestamp());
 END IF;
 EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(q)),''[]''::jsonb) FROM (SELECT %s%s ORDER BY %I LIMIT 21 OFFSET %s) q',cols,base_sql,spec->>'key',p_offset) INTO items;
 result:=jsonb_build_object('source',p_source,'rows',(SELECT coalesce(jsonb_agg(value),'[]'::jsonb) FROM jsonb_array_elements(items) WITH ORDINALITY x(value,n) WHERE n<=20),
   'truncated',jsonb_array_length(items)>20,'nextOffset',CASE WHEN jsonb_array_length(items)>20 THEN p_offset+20 ELSE NULL END,
   'scope','Records visible to the linked account','observedAt',clock_timestamp());
 RETURN result;
END $$;
GRANT CREATE ON SCHEMA oms_telegram_private TO oms_telegram_reader;
ALTER FUNCTION oms_telegram_private.read_source(text,text,jsonb,text,integer) OWNER TO oms_telegram_reader;
REVOKE CREATE ON SCHEMA oms_telegram_private FROM oms_telegram_reader;
REVOKE ALL ON FUNCTION oms_telegram_private.read_source(text,text,jsonb,text,integer) FROM PUBLIC;

CREATE FUNCTION public.telegram_bot_read_context(p_id uuid,p_claim_token uuid,p_source text,p_mode text DEFAULT 'rows',
 p_filters jsonb DEFAULT '[]',p_group text DEFAULT NULL,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.telegram_bot_replies%ROWTYPE; result jsonb; spec jsonb; item jsonb;
 old_claims text:=current_setting('request.jwt.claims',true); old_sub text:=current_setting('request.jwt.claim.sub',true);
 old_role text:=current_setting('request.jwt.claim.role',true);
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
 IF public.telegram_bot_reply_payload(p_id,p_claim_token) IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO r FROM public.telegram_bot_replies WHERE id=p_id AND claim_token=p_claim_token AND status='processing' AND command='ask'
   AND coalesce((payload->>'personalAiAllowed')::boolean,false) AND NOT coalesce((payload->>'personalAiDisabled')::boolean,false);
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.openrouter_system_policy WHERE singleton AND enabled) THEN RETURN NULL; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',r.user_id,'role','authenticated')::text,true);
 PERFORM set_config('request.jwt.claim.sub',r.user_id::text,true);
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
 result:=oms_telegram_private.read_source(p_source,p_mode,p_filters,p_group,p_offset);
 PERFORM set_config('request.jwt.claims',coalesce(old_claims,''),true);
 PERFORM set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);
 PERFORM set_config('request.jwt.claim.role',coalesce(old_role,''),true);
 -- Persist only identity dependencies; do not duplicate private message bodies.
 spec:=oms_telegram_private.sources()->p_source;
 FOR item IN SELECT value FROM jsonb_array_elements(coalesce(result->'rows','[]')) LOOP
   INSERT INTO oms_telegram_private.context_reads VALUES(p_id,p_source,item->>(spec->>'key')) ON CONFLICT DO NOTHING;
 END LOOP;
 IF public.telegram_bot_reply_payload(p_id,p_claim_token) IS NULL THEN RETURN NULL; END IF;
 RETURN result;
END $$;

CREATE FUNCTION oms_telegram_private.records_visible(p_source text,p_keys text[]) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=on AS $$
DECLARE spec jsonb:=oms_telegram_private.sources()->p_source; n bigint; clause text:='';
BEGIN
 IF spec IS NULL THEN RETURN false; END IF;
 IF p_source='chat_messages' THEN clause:=' AND NOT coalesce(is_deleted,false) AND NOT coalesce(deleted,false) AND deleted_at IS NULL'; END IF;
 EXECUTE format('SELECT count(*) FROM public.%I WHERE %I::text=ANY($1)%s',spec->>'table',spec->>'key',clause) INTO n USING p_keys;
 RETURN n=cardinality(p_keys);
END $$;
GRANT CREATE ON SCHEMA oms_telegram_private TO oms_telegram_reader;
ALTER FUNCTION oms_telegram_private.records_visible(text,text[]) OWNER TO oms_telegram_reader;
REVOKE CREATE ON SCHEMA oms_telegram_private FROM oms_telegram_reader;
REVOKE ALL ON FUNCTION oms_telegram_private.records_visible(text,text[]) FROM PUBLIC;
ALTER FUNCTION public.telegram_bot_reply_payload(uuid,uuid) RENAME TO telegram_bot_reply_payload_before_context;
REVOKE ALL ON FUNCTION public.telegram_bot_reply_payload_before_context(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.telegram_bot_context_current(p_id uuid,p_claim_token uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid; dep record; valid boolean:=true;
 old_claims text:=current_setting('request.jwt.claims',true); old_sub text:=current_setting('request.jwt.claim.sub',true);
 old_role text:=current_setting('request.jwt.claim.role',true);
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
 IF public.telegram_bot_reply_payload_before_context(p_id,p_claim_token) IS NULL THEN RETURN false; END IF;
 SELECT user_id INTO uid FROM public.telegram_bot_replies WHERE id=p_id AND claim_token=p_claim_token AND status='processing';
 IF uid IS NULL THEN RETURN false; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
 PERFORM set_config('request.jwt.claim.sub',uid::text,true);
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
 FOR dep IN SELECT source,array_agg(record_key) AS keys FROM oms_telegram_private.context_reads WHERE reply_id=p_id GROUP BY source LOOP
   IF NOT oms_telegram_private.records_visible(dep.source,dep.keys) THEN valid:=false; EXIT; END IF;
 END LOOP;
 PERFORM set_config('request.jwt.claims',coalesce(old_claims,''),true);
 PERFORM set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);
 PERFORM set_config('request.jwt.claim.role',coalesce(old_role,''),true);
 RETURN valid;
END $$;
CREATE FUNCTION public.telegram_bot_reply_payload(p_id uuid,p_claim_token uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 result:=public.telegram_bot_reply_payload_before_context(p_id,p_claim_token);
 IF result IS NULL OR NOT public.telegram_bot_context_current(p_id,p_claim_token) THEN RETURN NULL; END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.telegram_bot_reply_payload(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.telegram_bot_reply_payload(uuid,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.telegram_bot_read_context(uuid,uuid,text,text,jsonb,text,integer),public.telegram_bot_context_current(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.telegram_bot_read_context(uuid,uuid,text,text,jsonb,text,integer),public.telegram_bot_context_current(uuid,uuid) TO service_role;
CREATE FUNCTION oms_telegram_private.clear_context_reads() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.status IN ('sent','failed','cancelled') THEN
  DELETE FROM oms_telegram_private.context_reads WHERE reply_id=NEW.id;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION oms_telegram_private.clear_context_reads() FROM PUBLIC;
CREATE TRIGGER telegram_context_reads_finished AFTER UPDATE OF status ON public.telegram_bot_replies
 FOR EACH ROW EXECUTE FUNCTION oms_telegram_private.clear_context_reads();
SELECT pg_notify('pgrst','reload schema');
COMMIT;
