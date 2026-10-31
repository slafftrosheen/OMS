-- Personal hours, absence records and durable production reports.
-- Policy: actual minutes are immutable inputs to a separately stored 1x/2x credit.
-- Weekends OR Latvian holidays/observed days receive 2x, never 4x. This is the
-- company's hours-credit rule, not a full salary/overtime payroll calculation.
-- Calendar source, verified 2026-10-31:
-- https://likumi.lv/ta/en/en/id/72608-on-public-holidays-commemoration-days-and-celebration-days
-- Nationwide festival dates and future one-off holidays require explicit overrides.
-- Government workday transfers are not automatically applied to this employer.

BEGIN;

-- Private database clock seam for isolated tests; never caller-configurable.
CREATE FUNCTION public.workforce_now() RETURNS TIMESTAMPTZ
LANGUAGE sql STABLE SET search_path = pg_catalog AS $$ SELECT now(); $$;

CREATE TABLE public.workforce_work_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  work_date DATE NOT NULL CHECK (work_date BETWEEN DATE '2015-01-01' AND DATE '2099-12-31'),
  actual_minutes INTEGER NOT NULL CHECK (actual_minutes BETWEEN 0 AND 1440),
  multiplier SMALLINT NOT NULL CHECK (multiplier IN (1, 2)),
  credited_minutes INTEGER GENERATED ALWAYS AS (actual_minutes * multiplier) STORED,
  holiday_name TEXT,
  note TEXT NOT NULL DEFAULT '' CHECK (char_length(note) <= 500),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT public.workforce_now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT public.workforce_now(),
  UNIQUE (user_id, work_date)
);
CREATE INDEX workforce_entries_month_idx ON public.workforce_work_entries(work_date, user_id);

CREATE TABLE public.workforce_absences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  start_date DATE NOT NULL CHECK (start_date >= DATE '2015-01-01'),
  end_date DATE NOT NULL CHECK (end_date <= DATE '2099-12-31'),
  partial_day BOOLEAN NOT NULL DEFAULT false,
  reason TEXT NOT NULL CHECK (reason IN ('leave', 'sick', 'personal', 'other')),
  note TEXT NOT NULL DEFAULT '' CHECK (char_length(note) <= 500),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT public.workforce_now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT public.workforce_now(),
  CHECK (end_date >= start_date AND end_date - start_date <= 365)
);
CREATE INDEX workforce_absences_user_idx ON public.workforce_absences(user_id, start_date, end_date);
CREATE INDEX workforce_active_absences_idx ON public.workforce_absences(start_date, end_date) WHERE status = 'active';

CREATE TABLE public.workforce_holiday_overrides (
  date DATE PRIMARY KEY CHECK (date BETWEEN DATE '2015-01-01' AND DATE '2099-12-31'),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  is_public_holiday BOOLEAN NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT public.workforce_now()
);

CREATE TABLE public.workforce_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('monthly_hours', 'daily_absences')),
  period DATE NOT NULL CHECK (period BETWEEN DATE '2015-01-01' AND DATE '2099-12-31'),
  version INTEGER NOT NULL CHECK (version > 0),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT public.workforce_now(),
  generated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_stale BOOLEAN NOT NULL DEFAULT false,
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  UNIQUE (kind, period, version),
  CHECK (kind <> 'monthly_hours' OR extract(day FROM period) = 1)
);
CREATE INDEX workforce_reports_period_idx ON public.workforce_reports(period, generated_at DESC);

CREATE TABLE public.workforce_report_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('monthly_hours', 'daily_absences')),
  period DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed')),
  lease_token UUID,
  lease_expires_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  report_id UUID REFERENCES public.workforce_reports(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT public.workforce_now(),
  completed_at TIMESTAMPTZ,
  UNIQUE (kind, period),
  CHECK (kind <> 'monthly_hours' OR extract(day FROM period) = 1)
);

CREATE TABLE public.workforce_report_schedule (
  singleton BOOLEAN PRIMARY KEY DEFAULT true CHECK (singleton),
  installed_at TIMESTAMPTZ NOT NULL DEFAULT public.workforce_now()
);
INSERT INTO public.workforce_report_schedule(singleton) VALUES (true);

CREATE TABLE public.workforce_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  entity TEXT NOT NULL,
  entity_key TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  before_row JSONB,
  after_row JSONB,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT public.workforce_now()
);
CREATE INDEX workforce_audit_subject_idx ON public.workforce_audit_log(subject_user_id, changed_at DESC);

CREATE FUNCTION public.workforce_actor_active() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_active = true);
$$;

CREATE FUNCTION public.workforce_is_manager() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_active = true AND role IN ('RD', 'Boss', 'HeadOfProduction'));
$$;

CREATE FUNCTION public.workforce_actor() RETURNS UUID
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT public.workforce_actor_active() THEN RAISE EXCEPTION 'Active worker account required' USING ERRCODE = '42501'; END IF;
  RETURN auth.uid();
END $$;

ALTER TABLE public.workforce_work_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workforce_absences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workforce_holiday_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workforce_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workforce_report_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workforce_report_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workforce_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY workforce_entries_read ON public.workforce_work_entries FOR SELECT TO authenticated
  USING (public.workforce_actor_active() AND (user_id = auth.uid() OR public.workforce_is_manager()));
CREATE POLICY workforce_absences_read ON public.workforce_absences FOR SELECT TO authenticated
  USING (public.workforce_actor_active() AND (user_id = auth.uid() OR public.workforce_is_manager()));
CREATE POLICY workforce_holidays_read ON public.workforce_holiday_overrides FOR SELECT TO authenticated
  USING (public.workforce_actor_active());
CREATE POLICY workforce_reports_read ON public.workforce_reports FOR SELECT TO authenticated
  USING (public.workforce_is_manager());
CREATE POLICY workforce_audit_read ON public.workforce_audit_log FOR SELECT TO authenticated
  USING (public.workforce_actor_active() AND (subject_user_id = auth.uid() OR public.workforce_is_manager()));

-- No authenticated direct DML: callers cannot forge worker IDs, rates, revisions or reports.
REVOKE ALL ON public.workforce_work_entries, public.workforce_absences, public.workforce_holiday_overrides,
  public.workforce_reports, public.workforce_report_jobs, public.workforce_report_schedule, public.workforce_audit_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.workforce_work_entries, public.workforce_absences, public.workforce_holiday_overrides,
  public.workforce_reports, public.workforce_audit_log TO authenticated;
GRANT SELECT ON public.workforce_work_entries, public.workforce_absences, public.workforce_holiday_overrides,
  public.workforce_reports, public.workforce_report_jobs, public.workforce_report_schedule, public.workforce_audit_log TO service_role;

CREATE FUNCTION public.workforce_easter(p_year INTEGER) RETURNS DATE
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, public AS $$
DECLARE a INTEGER; b INTEGER; c INTEGER; d INTEGER; e INTEGER; f INTEGER; g INTEGER; h INTEGER; i INTEGER; k INTEGER; l INTEGER; m INTEGER; n INTEGER;
BEGIN
  a := p_year % 19; b := p_year / 100; c := p_year % 100; d := b / 4; e := b % 4;
  f := (b + 8) / 25; g := (b - f + 1) / 3; h := (19 * a + b - d - g + 15) % 30;
  i := c / 4; k := c % 4; l := (32 + 2 * e + 2 * i - h - k) % 7; m := (a + 11 * h + 22 * l) / 451;
  n := h + l - 7 * m + 114;
  RETURN make_date(p_year, n / 31, n % 31 + 1);
END $$;

CREATE FUNCTION public.workforce_base_holiday(p_date DATE) RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, public AS $$
DECLARE y INTEGER := extract(year FROM p_date); e DATE; may_first DATE; holiday DATE; weekday INTEGER; label TEXT;
BEGIN
  label := CASE to_char(p_date, 'MM-DD')
    WHEN '01-01' THEN 'New Year’s Day' WHEN '05-01' THEN 'Labour Day' WHEN '05-04' THEN 'Restoration of Independence Day'
    WHEN '06-23' THEN 'Līgo Day' WHEN '06-24' THEN 'Jāņi Day' WHEN '11-18' THEN 'Proclamation of the Republic of Latvia'
    WHEN '12-24' THEN 'Christmas Eve' WHEN '12-25' THEN 'Christmas Day' WHEN '12-26' THEN 'Second Day of Christmas'
    WHEN '12-31' THEN 'New Year’s Eve' ELSE NULL END;
  IF label IS NOT NULL THEN RETURN label; END IF;
  e := public.workforce_easter(y);
  may_first := make_date(y, 5, 1);
  IF p_date = e - 2 THEN RETURN 'Good Friday'; ELSIF p_date = e THEN RETURN 'Easter Sunday';
  ELSIF p_date = e + 1 THEN RETURN 'Easter Monday'; ELSIF p_date = e + 49 THEN
    RETURN CASE WHEN p_date = may_first + ((7 - extract(dow FROM may_first)::INTEGER) % 7) + 7 THEN 'Pentecost / Mother’s Day' ELSE 'Pentecost' END;
  END IF;
  IF p_date = may_first + ((7 - extract(dow FROM may_first)::INTEGER) % 7) + 7 THEN RETURN 'Mother’s Day'; END IF;
  FOREACH holiday IN ARRAY ARRAY[make_date(y, 5, 4), make_date(y, 11, 18)] LOOP
    weekday := extract(isodow FROM holiday);
    IF weekday IN (6, 7) AND p_date = holiday + (8 - weekday) THEN
      RETURN CASE extract(month FROM holiday) WHEN 5 THEN 'Restoration of Independence Day — observed day off' ELSE 'Proclamation of the Republic of Latvia — observed day off' END;
    END IF;
  END LOOP;
  IF p_date = DATE '2018-09-24' THEN RETURN 'Papal Visit to Latvia'; END IF;
  IF p_date = DATE '2023-05-29' THEN RETURN 'Latvian Ice Hockey Bronze Medal Day'; END IF;
  -- Verified historical final days; future festival years are explicit overrides.
  -- https://www.vdi.gov.lv/lv/jaunums/03072018-pec-dziesmu-un-deju-svetkiem-pirmdiena-9-julijs-ir-brivdiena
  -- https://www.vdi.gov.lv/lv/dazadi-jautajumi
  IF p_date IN (DATE '2018-07-08', DATE '2023-07-09') THEN RETURN 'Nationwide Latvian Song and Dance Celebration — final day'; END IF;
  IF p_date IN (DATE '2018-07-09', DATE '2023-07-10') THEN RETURN 'Nationwide Latvian Song and Dance Celebration — observed day off'; END IF;
  RETURN NULL;
END $$;

CREATE FUNCTION public.workforce_holiday_name(p_date DATE) RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE item public.workforce_holiday_overrides;
BEGIN
  SELECT * INTO item FROM public.workforce_holiday_overrides WHERE date = p_date;
  IF FOUND THEN RETURN CASE WHEN item.is_public_holiday THEN item.name ELSE NULL END; END IF;
  RETURN public.workforce_base_holiday(p_date);
END $$;

CREATE FUNCTION public.workforce_lock_months(p_start DATE, p_end DATE) RETURNS VOID
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE month DATE;
BEGIN
  FOR month IN SELECT generate_series(date_trunc('month', p_start), date_trunc('month', p_end), INTERVAL '1 month')::DATE LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('workforce-month:' || month::TEXT, 0));
  END LOOP;
END $$;

CREATE FUNCTION public.workforce_audit_change() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE before_data JSONB; after_data JSONB; item JSONB; period_start DATE; period_end DATE; subject UUID;
BEGIN
  IF TG_OP <> 'INSERT' THEN before_data := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN after_data := to_jsonb(NEW); END IF;
  item := coalesce(after_data, before_data);
  subject := (item->>'user_id')::UUID;
  INSERT INTO public.workforce_audit_log(subject_user_id, actor_user_id, entity, entity_key, action, before_row, after_row)
    VALUES (subject, auth.uid(), TG_TABLE_NAME, coalesce(item->>'id', item->>'date'), TG_OP, before_data, after_data);
  IF TG_TABLE_NAME = 'workforce_work_entries' THEN
    period_start := date_trunc('month', (item->>'work_date')::DATE)::DATE;
    UPDATE public.workforce_reports SET is_stale = true WHERE kind = 'monthly_hours' AND period = period_start AND NOT is_stale;
  ELSIF TG_TABLE_NAME = 'workforce_absences' THEN
    period_start := (item->>'start_date')::DATE; period_end := (item->>'end_date')::DATE;
    UPDATE public.workforce_reports SET is_stale = true WHERE NOT is_stale AND (
      (kind = 'daily_absences' AND period BETWEEN period_start AND period_end) OR
      (kind = 'monthly_hours' AND period BETWEEN date_trunc('month', period_start)::DATE AND date_trunc('month', period_end)::DATE));
  END IF;
  RETURN coalesce(NEW, OLD);
END $$;
CREATE TRIGGER workforce_entries_audit AFTER INSERT OR UPDATE OR DELETE ON public.workforce_work_entries FOR EACH ROW EXECUTE FUNCTION public.workforce_audit_change();
CREATE TRIGGER workforce_absences_audit AFTER INSERT OR UPDATE OR DELETE ON public.workforce_absences FOR EACH ROW EXECUTE FUNCTION public.workforce_audit_change();
CREATE TRIGGER workforce_holidays_audit AFTER INSERT OR UPDATE OR DELETE ON public.workforce_holiday_overrides FOR EACH ROW EXECUTE FUNCTION public.workforce_audit_change();

CREATE FUNCTION public.workforce_save_entry(p_work_date DATE, p_actual_minutes INTEGER, p_note TEXT, p_expected_version INTEGER)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE actor UUID := public.workforce_actor(); item public.workforce_work_entries; holiday TEXT; rate SMALLINT;
BEGIN
  IF p_work_date IS NULL OR p_work_date NOT BETWEEN DATE '2015-01-01' AND DATE '2099-12-31' OR p_work_date > (public.workforce_now() AT TIME ZONE 'Europe/Riga')::DATE
     OR p_actual_minutes IS NULL OR p_actual_minutes NOT BETWEEN 0 AND 1440 OR p_note IS NULL OR char_length(p_note) > 500
     OR (p_expected_version IS NOT NULL AND p_expected_version < 1) THEN
    RAISE EXCEPTION 'Invalid daily work entry' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('workforce-user:' || actor::TEXT, 0));
  PERFORM public.workforce_lock_months(p_work_date, p_work_date);
  IF p_actual_minutes > 0 AND EXISTS (SELECT 1 FROM public.workforce_absences WHERE user_id = actor AND status = 'active'
    AND NOT partial_day AND p_work_date BETWEEN start_date AND end_date) THEN
    RAISE EXCEPTION 'Full-day absence overlaps work' USING ERRCODE = '23P01';
  END IF;
  holiday := public.workforce_holiday_name(p_work_date);
  rate := CASE WHEN extract(isodow FROM p_work_date) IN (6, 7) OR holiday IS NOT NULL THEN 2 ELSE 1 END;
  SELECT * INTO item FROM public.workforce_work_entries WHERE user_id = actor AND work_date = p_work_date FOR UPDATE;
  IF FOUND THEN
    -- Exact retry is safe even when its first HTTP response was lost.
    IF item.actual_minutes = p_actual_minutes AND item.note = btrim(p_note) AND item.multiplier = rate AND item.holiday_name IS NOT DISTINCT FROM holiday THEN RETURN to_jsonb(item); END IF;
    IF p_expected_version IS DISTINCT FROM item.version THEN RAISE EXCEPTION 'Entry version changed' USING ERRCODE = '40001'; END IF;
    UPDATE public.workforce_work_entries SET actual_minutes = p_actual_minutes, multiplier = rate, holiday_name = holiday,
      note = btrim(p_note), version = version + 1, updated_at = public.workforce_now() WHERE id = item.id RETURNING * INTO item;
  ELSE
    IF p_expected_version IS NOT NULL THEN RAISE EXCEPTION 'Entry version changed' USING ERRCODE = '40001'; END IF;
    INSERT INTO public.workforce_work_entries(user_id, work_date, actual_minutes, multiplier, holiday_name, note)
      VALUES (actor, p_work_date, p_actual_minutes, rate, holiday, btrim(p_note)) RETURNING * INTO item;
  END IF;
  RETURN to_jsonb(item);
END $$;

CREATE FUNCTION public.workforce_delete_entry(p_id UUID, p_expected_version INTEGER)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE actor UUID := public.workforce_actor(); item public.workforce_work_entries;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('workforce-user:' || actor::TEXT, 0));
  SELECT * INTO item FROM public.workforce_work_entries WHERE id = p_id AND user_id = actor;
  IF NOT FOUND THEN RAISE EXCEPTION 'Entry not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.workforce_lock_months(item.work_date, item.work_date);
  SELECT * INTO item FROM public.workforce_work_entries WHERE id = p_id AND user_id = actor FOR UPDATE;
  IF p_expected_version IS DISTINCT FROM item.version THEN RAISE EXCEPTION 'Entry version changed' USING ERRCODE = '40001'; END IF;
  DELETE FROM public.workforce_work_entries WHERE id = item.id;
  RETURN true;
END $$;

CREATE FUNCTION public.workforce_create_absence(p_start_date DATE, p_end_date DATE, p_partial_day BOOLEAN, p_reason TEXT, p_note TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE actor UUID := public.workforce_actor(); item public.workforce_absences;
BEGIN
  IF p_start_date IS NULL OR p_end_date IS NULL OR p_start_date < DATE '2015-01-01' OR p_end_date > DATE '2099-12-31'
     OR p_end_date < p_start_date OR p_end_date - p_start_date > 365 OR p_partial_day IS NULL
     OR p_reason IS NULL OR p_reason NOT IN ('leave', 'sick', 'personal', 'other') OR p_note IS NULL OR char_length(p_note) > 500 THEN
    RAISE EXCEPTION 'Invalid absence period' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('workforce-user:' || actor::TEXT, 0));
  PERFORM public.workforce_lock_months(p_start_date, p_end_date);
  SELECT * INTO item FROM public.workforce_absences WHERE user_id = actor AND status = 'active' AND start_date = p_start_date
    AND end_date = p_end_date AND partial_day = p_partial_day AND reason = p_reason AND note = btrim(p_note);
  IF FOUND THEN RETURN to_jsonb(item); END IF;
  IF EXISTS (SELECT 1 FROM public.workforce_absences WHERE user_id = actor AND status = 'active' AND start_date <= p_end_date AND end_date >= p_start_date) THEN
    RAISE EXCEPTION 'An active absence already covers this period' USING ERRCODE = '23P01';
  END IF;
  IF NOT p_partial_day AND EXISTS (SELECT 1 FROM public.workforce_work_entries WHERE user_id = actor AND work_date BETWEEN p_start_date AND p_end_date AND actual_minutes > 0) THEN
    RAISE EXCEPTION 'Recorded work overlaps full-day absence' USING ERRCODE = '23P01';
  END IF;
  INSERT INTO public.workforce_absences(user_id, start_date, end_date, partial_day, reason, note)
    VALUES (actor, p_start_date, p_end_date, p_partial_day, p_reason, btrim(p_note)) RETURNING * INTO item;
  PERFORM public.workforce_notify_absence(item.id, 'created');
  RETURN to_jsonb(item);
END $$;

CREATE FUNCTION public.workforce_cancel_absence(p_id UUID, p_expected_version INTEGER)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE actor UUID := public.workforce_actor(); item public.workforce_absences;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('workforce-user:' || actor::TEXT, 0));
  SELECT * INTO item FROM public.workforce_absences WHERE id = p_id AND user_id = actor;
  IF NOT FOUND THEN RAISE EXCEPTION 'Absence not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.workforce_lock_months(item.start_date, item.end_date);
  SELECT * INTO item FROM public.workforce_absences WHERE id = p_id AND user_id = actor FOR UPDATE;
  IF item.status = 'cancelled' THEN RETURN to_jsonb(item); END IF;
  IF p_expected_version IS DISTINCT FROM item.version THEN RAISE EXCEPTION 'Absence version changed' USING ERRCODE = '40001'; END IF;
  UPDATE public.workforce_absences SET status = 'cancelled', version = version + 1, updated_at = public.workforce_now() WHERE id = item.id RETURNING * INTO item;
  PERFORM public.workforce_notify_absence(item.id, 'cancelled');
  RETURN to_jsonb(item);
END $$;

CREATE FUNCTION public.workforce_notify_absence(p_id UUID, p_action TEXT) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE item public.workforce_absences; worker_name TEXT;
BEGIN
  SELECT * INTO STRICT item FROM public.workforce_absences WHERE id = p_id;
  SELECT coalesce(nullif(display_name, ''), nullif(username, ''), 'Team member') INTO worker_name FROM public.profiles WHERE id = item.user_id;
  -- In-app immediately, even after the 08:00 snapshot. No reason or private note in notifications.
  INSERT INTO public.notifications(user_id, notification_type, title, message, link, source_type, source_id)
  SELECT p.id, 'workforce_absence', CASE WHEN p_action = 'cancelled' THEN 'Absence cancelled' ELSE 'Absence recorded' END,
    worker_name || CASE WHEN p_action = 'cancelled' THEN ' cancelled an absence for ' ELSE ' recorded a ' || CASE WHEN item.partial_day THEN 'partial-day' ELSE 'full-day' END || ' absence for ' END
      || item.start_date::TEXT || CASE WHEN item.end_date <> item.start_date THEN ' to ' || item.end_date::TEXT ELSE '' END || '.',
    '/cabinet?view=team&month=' || to_char(item.start_date, 'YYYY-MM') || '&worker=' || item.user_id::TEXT, 'workforce_absence', item.id
  FROM public.profiles p WHERE p.is_active = true AND p.role = 'HeadOfProduction';
END $$;

CREATE FUNCTION public.workforce_save_holiday_override(p_date DATE, p_name TEXT, p_is_public_holiday BOOLEAN, p_expected_version INTEGER)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE actor UUID := public.workforce_actor(); item public.workforce_holiday_overrides; holiday TEXT; rate SMALLINT;
BEGIN
  IF NOT public.workforce_is_manager() THEN RAISE EXCEPTION 'Manager required' USING ERRCODE = '42501'; END IF;
  IF p_date IS NULL OR p_date NOT BETWEEN DATE '2015-01-01' AND DATE '2099-12-31' OR p_name IS NULL OR char_length(btrim(p_name)) NOT BETWEEN 1 AND 120
    OR p_is_public_holiday IS NULL OR (p_expected_version IS NOT NULL AND p_expected_version < 1) THEN
    RAISE EXCEPTION 'Invalid holiday override' USING ERRCODE = '22023';
  END IF;
  PERFORM public.workforce_lock_months(p_date, p_date);
  SELECT * INTO item FROM public.workforce_holiday_overrides WHERE date = p_date FOR UPDATE;
  IF FOUND THEN
    IF item.name = btrim(p_name) AND item.is_public_holiday = p_is_public_holiday THEN RETURN to_jsonb(item); END IF;
    IF p_expected_version IS DISTINCT FROM item.version THEN RAISE EXCEPTION 'Holiday version changed' USING ERRCODE = '40001'; END IF;
    UPDATE public.workforce_holiday_overrides SET name = btrim(p_name), is_public_holiday = p_is_public_holiday,
      version = version + 1, updated_by = actor, updated_at = public.workforce_now() WHERE date = p_date RETURNING * INTO item;
  ELSE
    IF p_expected_version IS NOT NULL THEN RAISE EXCEPTION 'Holiday version changed' USING ERRCODE = '40001'; END IF;
    INSERT INTO public.workforce_holiday_overrides(date, name, is_public_holiday, updated_by)
      VALUES (p_date, btrim(p_name), p_is_public_holiday, actor) RETURNING * INTO item;
  END IF;
  holiday := public.workforce_holiday_name(p_date);
  rate := CASE WHEN extract(isodow FROM p_date) IN (6, 7) OR holiday IS NOT NULL THEN 2 ELSE 1 END;
  UPDATE public.workforce_work_entries SET multiplier = rate, holiday_name = holiday, version = version + 1, updated_at = public.workforce_now()
    WHERE work_date = p_date AND (multiplier <> rate OR holiday_name IS DISTINCT FROM holiday);
  RETURN to_jsonb(item);
END $$;

CREATE FUNCTION public.workforce_delete_holiday_override(p_date DATE, p_expected_version INTEGER)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE actor UUID := public.workforce_actor(); item public.workforce_holiday_overrides; holiday TEXT; rate SMALLINT;
BEGIN
  IF NOT public.workforce_is_manager() THEN RAISE EXCEPTION 'Manager required' USING ERRCODE = '42501'; END IF;
  PERFORM public.workforce_lock_months(p_date, p_date);
  SELECT * INTO item FROM public.workforce_holiday_overrides WHERE date = p_date FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Holiday override not found' USING ERRCODE = 'P0002'; END IF;
  IF p_expected_version IS DISTINCT FROM item.version THEN RAISE EXCEPTION 'Holiday version changed' USING ERRCODE = '40001'; END IF;
  DELETE FROM public.workforce_holiday_overrides WHERE date = p_date;
  holiday := public.workforce_holiday_name(p_date);
  rate := CASE WHEN extract(isodow FROM p_date) IN (6, 7) OR holiday IS NOT NULL THEN 2 ELSE 1 END;
  UPDATE public.workforce_work_entries SET multiplier = rate, holiday_name = holiday, version = version + 1, updated_at = public.workforce_now()
    WHERE work_date = p_date AND (multiplier <> rate OR holiday_name IS DISTINCT FROM holiday);
  RETURN true;
END $$;

CREATE FUNCTION public.workforce_absence_json(item public.workforce_absences) RETURNS JSONB
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public AS $$
  SELECT jsonb_build_object('id', item.id, 'userId', item.user_id, 'startDate', item.start_date, 'endDate', item.end_date,
    'partialDay', item.partial_day, 'reason', item.reason, 'note', item.note, 'status', item.status, 'version', item.version,
    'createdAt', item.created_at, 'updatedAt', item.updated_at);
$$;

CREATE FUNCTION public.workforce_team_payload(p_month DATE) RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  WITH entry_totals AS (
    SELECT user_id, jsonb_build_object(
      'actualMinutes', coalesce(sum(actual_minutes), 0),
      'regularMinutes', coalesce(sum(actual_minutes) FILTER (WHERE multiplier = 1), 0),
      'premiumMinutes', coalesce(sum(actual_minutes) FILTER (WHERE multiplier = 2), 0),
      'creditedMinutes', coalesce(sum(credited_minutes), 0),
      'daysWorked', count(*) FILTER (WHERE actual_minutes > 0), 'recordedDays', count(*)) AS totals
    FROM public.workforce_work_entries WHERE work_date >= p_month AND work_date < p_month + INTERVAL '1 month' GROUP BY user_id
  ), absence_rows AS (
    SELECT a.user_id, jsonb_agg(public.workforce_absence_json(a) ORDER BY a.start_date, a.id) AS absences
    FROM public.workforce_absences a WHERE a.status = 'active' AND a.start_date < p_month + INTERVAL '1 month' AND a.end_date >= p_month GROUP BY a.user_id
  ), worker_rows AS (
    SELECT p.id, coalesce(nullif(p.display_name, ''), nullif(p.username, ''), 'Team member') AS display_name,
      jsonb_build_object('userId', p.id, 'displayName', coalesce(nullif(p.display_name, ''), nullif(p.username, ''), 'Team member'),
        'username', coalesce(p.username, ''), 'role', p.role, 'isActive', coalesce(p.is_active, false),
        'totals', coalesce(t.totals, '{"actualMinutes":0,"regularMinutes":0,"premiumMinutes":0,"creditedMinutes":0,"daysWorked":0,"recordedDays":0}'::JSONB),
        'activeAbsences', coalesce(a.absences, '[]'::JSONB)) AS worker
    FROM public.profiles p LEFT JOIN entry_totals t ON t.user_id = p.id LEFT JOIN absence_rows a ON a.user_id = p.id
  ) SELECT jsonb_build_object('month', to_char(p_month, 'YYYY-MM'), 'timeZone', 'Europe/Riga', 'policyVersion', 'lv-company-hours-v1',
    'workers', coalesce((SELECT jsonb_agg(worker ORDER BY lower(display_name), id) FROM worker_rows), '[]'::JSONB),
    'totals', (SELECT jsonb_build_object('actualMinutes', coalesce(sum(actual_minutes), 0),
      'regularMinutes', coalesce(sum(actual_minutes) FILTER (WHERE multiplier = 1), 0),
      'premiumMinutes', coalesce(sum(actual_minutes) FILTER (WHERE multiplier = 2), 0),
      'creditedMinutes', coalesce(sum(credited_minutes), 0), 'daysWorked', count(*) FILTER (WHERE actual_minutes > 0), 'recordedDays', count(*))
      FROM public.workforce_work_entries WHERE work_date >= p_month AND work_date < p_month + INTERVAL '1 month'));
$$;

CREATE FUNCTION public.workforce_team_month(p_month DATE) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT public.workforce_is_manager() THEN RAISE EXCEPTION 'Manager required' USING ERRCODE = '42501'; END IF;
  IF p_month IS NULL OR extract(day FROM p_month) <> 1 OR p_month NOT BETWEEN DATE '2015-01-01' AND DATE '2099-12-01' THEN
    RAISE EXCEPTION 'Invalid report month' USING ERRCODE = '22023';
  END IF;
  RETURN public.workforce_team_payload(p_month);
END $$;

CREATE FUNCTION public.workforce_build_report(p_kind TEXT, p_period DATE, p_actor UUID) RETURNS public.workforce_reports
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE payload JSONB; item public.workforce_reports; next_version INTEGER;
BEGIN
  PERFORM public.workforce_lock_months(p_period, p_period);
  -- Writers take the same month lock before changing entries/absences/calendar.
  -- No correction can slip between the snapshot and its stale-marker insertion.
  IF p_kind = 'monthly_hours' THEN
    payload := public.workforce_team_payload(p_period);
  ELSIF p_kind = 'daily_absences' THEN
    SELECT jsonb_build_object('date', p_period, 'timeZone', 'Europe/Riga', 'policyVersion', 'lv-company-hours-v1',
      'totalAbsent', count(DISTINCT a.user_id), 'absences', coalesce(jsonb_agg(public.workforce_absence_json(a) ||
        jsonb_build_object('displayName', coalesce(nullif(p.display_name, ''), nullif(p.username, ''), 'Team member'), 'username', coalesce(p.username, ''))
        ORDER BY lower(coalesce(p.display_name, p.username, '')), a.id), '[]'::JSONB)) INTO payload
    FROM public.workforce_absences a JOIN public.profiles p ON p.id = a.user_id
    WHERE a.status = 'active' AND p.is_active = true AND p_period BETWEEN a.start_date AND a.end_date;
  ELSE RAISE EXCEPTION 'Invalid report kind' USING ERRCODE = '22023'; END IF;
  SELECT coalesce(max(version), 0) + 1 INTO next_version FROM public.workforce_reports WHERE kind = p_kind AND period = p_period;
  INSERT INTO public.workforce_reports(kind, period, version, generated_by, payload)
    VALUES (p_kind, p_period, next_version, p_actor, payload) RETURNING * INTO item;
  RETURN item;
END $$;

CREATE FUNCTION public.workforce_regenerate_monthly_report(p_month DATE) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE actor UUID := public.workforce_actor(); item public.workforce_reports;
BEGIN
  IF NOT public.workforce_is_manager() THEN RAISE EXCEPTION 'Manager required' USING ERRCODE = '42501'; END IF;
  IF p_month IS NULL OR extract(day FROM p_month) <> 1 OR p_month NOT BETWEEN DATE '2015-01-01' AND DATE '2099-12-01'
    OR p_month >= date_trunc('month', public.workforce_now() AT TIME ZONE 'Europe/Riga')::DATE THEN
    RAISE EXCEPTION 'Only closed months can be reported' USING ERRCODE = '22023';
  END IF;
  item := public.workforce_build_report('monthly_hours', p_month, actor);
  RETURN to_jsonb(item);
END $$;

CREATE FUNCTION public.workforce_due_report_jobs() RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE local_now TIMESTAMP := public.workforce_now() AT TIME ZONE 'Europe/Riga'; first_month DATE; last_month DATE; result JSONB;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501'; END IF;
  SELECT date_trunc('month', installed_at AT TIME ZONE 'Europe/Riga')::DATE INTO first_month FROM public.workforce_report_schedule WHERE singleton;
  last_month := (date_trunc('month', local_now) - INTERVAL '1 month')::DATE;
  IF extract(day FROM local_now) = 1 AND local_now::TIME < TIME '08:00' THEN last_month := (last_month - INTERVAL '1 month')::DATE; END IF;
  WITH candidates AS (
    SELECT 'monthly_hours'::TEXT AS kind, s::DATE AS period FROM generate_series(first_month::TIMESTAMP, last_month::TIMESTAMP, INTERVAL '1 month') s
    UNION ALL SELECT 'daily_absences', local_now::DATE WHERE local_now::TIME >= TIME '08:00'
  ), pending AS (
    SELECT c.kind, c.period FROM candidates c LEFT JOIN public.workforce_report_jobs j ON j.kind = c.kind AND j.period = c.period
    WHERE j.id IS NULL OR j.status = 'pending' OR (j.status = 'running' AND j.lease_expires_at <= public.workforce_now())
    ORDER BY c.period, c.kind LIMIT 24
  ) SELECT coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'period', period) ORDER BY period, kind), '[]'::JSONB) INTO result FROM pending;
  RETURN result;
END $$;

CREATE FUNCTION public.workforce_claim_report_job(p_kind TEXT, p_period DATE) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE item public.workforce_report_jobs; token UUID; local_now TIMESTAMP := public.workforce_now() AT TIME ZONE 'Europe/Riga'; first_month DATE; last_month DATE;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501'; END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('monthly_hours', 'daily_absences') OR p_period IS NULL
    OR p_period NOT BETWEEN DATE '2015-01-01' AND DATE '2099-12-31' THEN RAISE EXCEPTION 'Invalid report period' USING ERRCODE = '22023'; END IF;
  SELECT date_trunc('month', installed_at AT TIME ZONE 'Europe/Riga')::DATE INTO first_month FROM public.workforce_report_schedule WHERE singleton;
  last_month := (date_trunc('month', local_now) - INTERVAL '1 month')::DATE;
  IF extract(day FROM local_now) = 1 AND local_now::TIME < TIME '08:00' THEN last_month := (last_month - INTERVAL '1 month')::DATE; END IF;
  IF (p_kind = 'daily_absences' AND (p_period <> local_now::DATE OR local_now::TIME < TIME '08:00'))
    OR (p_kind = 'monthly_hours' AND (extract(day FROM p_period) <> 1 OR p_period < first_month OR p_period > last_month)) THEN
    RAISE EXCEPTION 'Report is not due' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.workforce_report_jobs(kind, period) VALUES (p_kind, p_period) ON CONFLICT (kind, period) DO NOTHING;
  SELECT * INTO item FROM public.workforce_report_jobs WHERE kind = p_kind AND period = p_period FOR UPDATE;
  IF item.status = 'completed' THEN RETURN jsonb_build_object('status', 'completed', 'jobId', item.id, 'reportId', item.report_id); END IF;
  IF item.status = 'running' AND item.lease_expires_at > public.workforce_now() THEN RETURN jsonb_build_object('status', 'busy', 'jobId', item.id); END IF;
  token := gen_random_uuid();
  UPDATE public.workforce_report_jobs SET status = 'running', lease_token = token, lease_expires_at = public.workforce_now() + INTERVAL '5 minutes', attempts = attempts + 1 WHERE id = item.id;
  RETURN jsonb_build_object('status', 'claimed', 'jobId', item.id, 'leaseToken', token);
END $$;

CREATE FUNCTION public.workforce_complete_report_job(p_job_id UUID, p_lease_token UUID) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE job public.workforce_report_jobs; report public.workforce_reports; notification_ids UUID[];
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO job FROM public.workforce_report_jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Report job not found' USING ERRCODE = 'P0002'; END IF;
  IF job.status = 'completed' THEN RETURN jsonb_build_object('status', 'already_completed', 'reportId', job.report_id); END IF;
  IF job.status <> 'running' OR job.lease_token IS DISTINCT FROM p_lease_token OR job.lease_expires_at <= public.workforce_now() THEN
    RAISE EXCEPTION 'Report lease expired or changed' USING ERRCODE = '40001';
  END IF;
  report := public.workforce_build_report(job.kind, job.period, NULL);
  WITH inserted AS (
    INSERT INTO public.notifications(user_id, notification_type, title, message, link, source_type, source_id)
    SELECT p.id, 'workforce_report', CASE WHEN job.kind = 'monthly_hours' THEN 'Monthly hours report · ' || to_char(job.period, 'YYYY-MM') ELSE 'Daily absence report · ' || job.period::TEXT END,
      CASE WHEN job.kind = 'monthly_hours' THEN 'The consolidated worker hours report is ready, including actual hours and separate 2× credits.'
        ELSE coalesce(report.payload->>'totalAbsent', '0') || ' team member(s) have a recorded absence today. Open the report for full-day and partial-day details.' END,
      '/cabinet?view=reports&month=' || to_char(job.period, 'YYYY-MM') || '&report=' || report.id::TEXT, 'workforce_report', report.id
    FROM public.profiles p WHERE p.is_active = true AND p.role = 'HeadOfProduction' RETURNING id
  ) SELECT coalesce(array_agg(id), '{}'::UUID[]) INTO notification_ids FROM inserted;
  -- Existing optional transport is transactional and deduplicates on notification_id.
  -- A configured outbox failure rolls everything back; a missing optional function is fine.
  IF to_regprocedure('public.enqueue_telegram_notifications(uuid[])') IS NOT NULL AND cardinality(notification_ids) > 0 THEN
    PERFORM public.enqueue_telegram_notifications(notification_ids);
  END IF;
  UPDATE public.workforce_report_jobs SET status = 'completed', report_id = report.id, completed_at = public.workforce_now(), lease_expires_at = NULL WHERE id = job.id;
  RETURN jsonb_build_object('status', 'completed', 'reportId', report.id);
END $$;

-- Helpers are private unless explicitly exposed below. SECURITY DEFINER functions
-- use a fixed search_path and authorize against current active profiles/JWT identity.
DO $$
DECLARE fn RECORD;
BEGIN
  FOR fn IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname LIKE 'workforce_%' LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', fn.signature);
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.workforce_actor_active(), public.workforce_is_manager() TO authenticated;
GRANT EXECUTE ON FUNCTION public.workforce_save_entry(DATE, INTEGER, TEXT, INTEGER), public.workforce_delete_entry(UUID, INTEGER),
  public.workforce_create_absence(DATE, DATE, BOOLEAN, TEXT, TEXT), public.workforce_cancel_absence(UUID, INTEGER),
  public.workforce_save_holiday_override(DATE, TEXT, BOOLEAN, INTEGER), public.workforce_delete_holiday_override(DATE, INTEGER),
  public.workforce_team_month(DATE), public.workforce_regenerate_monthly_report(DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workforce_due_report_jobs(), public.workforce_claim_report_job(TEXT, DATE),
  public.workforce_complete_report_job(UUID, UUID) TO service_role;

COMMENT ON TABLE public.workforce_work_entries IS 'Daily actual integer minutes and separate company 1x/2x credits; zero explicitly recorded differs from no entry.';
COMMENT ON TABLE public.workforce_reports IS 'Immutable dated report payloads; later corrections mark affected versions stale. Manager regeneration creates another version.';
COMMENT ON TABLE public.workforce_report_schedule IS 'Installation month is the earliest scheduled monthly report. Daily catch-up sends only today after 08:00 Europe/Riga.';
COMMENT ON TABLE public.workforce_absences IS 'Self-reported full/partial-day absence notices, not leave approval or medical records.';

COMMIT;
