-- Clock-time entry for the existing one-row-per-worker/day ledger.
-- Live schema access was unavailable during authoring. These preconditions
-- validate the predecessor contract before any change; deploy manually after
-- reviewing the target schema. Historical duration-only rows remain untouched.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.workforce_work_entries') IS NULL
     OR to_regprocedure('public.workforce_save_entry(date,integer,text,integer)') IS NULL
     OR to_regprocedure('public.workforce_actor()') IS NULL
     OR to_regprocedure('public.workforce_lock_months(date,date)') IS NULL
     OR to_regprocedure('public.workforce_holiday_name(date)') IS NULL THEN
    RAISE EXCEPTION 'Install and verify the workforce cabinet migration before adding clock times';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
      AND table_name = 'workforce_work_entries' AND column_name = 'actual_minutes' AND data_type = 'integer' AND is_nullable = 'NO')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
      AND table_name = 'workforce_work_entries' AND column_name = 'multiplier' AND data_type = 'smallint' AND is_nullable = 'NO')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
      AND table_name = 'workforce_work_entries' AND column_name = 'credited_minutes' AND is_generated = 'ALWAYS'
      AND regexp_replace(generation_expression, '[[:space:]()]', '', 'g') = 'actual_minutes*multiplier') THEN
    RAISE EXCEPTION 'Unexpected workforce minute/credit contract; review the target schema before applying this migration';
  END IF;
END $$;

ALTER TABLE public.workforce_work_entries
  ADD COLUMN start_time TIME WITHOUT TIME ZONE,
  ADD COLUMN finish_time TIME WITHOUT TIME ZONE;

-- Resolve local times explicitly. A skipped or repeated clock boundary cannot
-- be guessed; unambiguous boundaries around a DST change use elapsed minutes.
CREATE FUNCTION public.workforce_clock_minutes(p_work_date DATE, p_start_time TIME, p_finish_time TIME)
RETURNS INTEGER LANGUAGE plpgsql STABLE SET search_path = pg_catalog, public AS $$
DECLARE local_start TIMESTAMP; local_finish TIMESTAMP; started TIMESTAMPTZ; finished TIMESTAMPTZ; minutes INTEGER;
BEGIN
  IF p_work_date IS NULL OR p_work_date NOT BETWEEN DATE '2015-01-01' AND DATE '2099-12-31'
     OR p_start_time IS NULL OR p_finish_time IS NULL OR p_finish_time <= p_start_time
     OR p_finish_time >= TIME '24:00' OR extract(second FROM p_start_time) <> 0 OR extract(second FROM p_finish_time) <> 0 THEN
    RAISE EXCEPTION 'Start and finish must be minute-precision times on the same work date, with finish after start' USING ERRCODE = '22023';
  END IF;
  local_start := p_work_date + p_start_time;
  local_finish := p_work_date + p_finish_time;
  started := local_start AT TIME ZONE 'Europe/Riga';
  finished := local_finish AT TIME ZONE 'Europe/Riga';
  IF (started AT TIME ZONE 'Europe/Riga') <> local_start OR (finished AT TIME ZONE 'Europe/Riga') <> local_finish
     OR ((started - INTERVAL '1 hour') AT TIME ZONE 'Europe/Riga') = local_start
     OR ((started + INTERVAL '1 hour') AT TIME ZONE 'Europe/Riga') = local_start
     OR ((finished - INTERVAL '1 hour') AT TIME ZONE 'Europe/Riga') = local_finish
     OR ((finished + INTERVAL '1 hour') AT TIME ZONE 'Europe/Riga') = local_finish THEN
    RAISE EXCEPTION 'Clock boundary is missing or repeated during a Riga clock change' USING ERRCODE = '22007';
  END IF;
  minutes := (extract(epoch FROM (finished - started)) / 60)::INTEGER;
  IF minutes NOT BETWEEN 1 AND 1440 THEN RAISE EXCEPTION 'Working interval must be positive and at most 24 hours' USING ERRCODE = '22023'; END IF;
  RETURN minutes;
END $$;

ALTER TABLE public.workforce_work_entries ADD CONSTRAINT workforce_entry_clock_pair CHECK (
  (start_time IS NULL AND finish_time IS NULL)
  OR (start_time IS NOT NULL AND finish_time IS NOT NULL
    AND actual_minutes = public.workforce_clock_minutes(work_date, start_time, finish_time))
);

CREATE FUNCTION public.workforce_save_clock_entry(p_work_date DATE, p_start_time TIME, p_finish_time TIME, p_note TEXT, p_expected_version INTEGER)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE actor UUID := public.workforce_actor(); item public.workforce_work_entries; holiday TEXT; rate SMALLINT; minutes INTEGER;
BEGIN
  minutes := public.workforce_clock_minutes(p_work_date, p_start_time, p_finish_time);
  IF p_work_date > (public.workforce_now() AT TIME ZONE 'Europe/Riga')::DATE
     OR p_note IS NULL OR char_length(p_note) > 500 OR (p_expected_version IS NOT NULL AND p_expected_version < 1) THEN
    RAISE EXCEPTION 'Invalid daily work entry' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('workforce-user:' || actor::TEXT, 0));
  PERFORM public.workforce_lock_months(p_work_date, p_work_date);
  IF EXISTS (SELECT 1 FROM public.workforce_absences WHERE user_id = actor AND status = 'active'
    AND NOT partial_day AND p_work_date BETWEEN start_date AND end_date) THEN
    RAISE EXCEPTION 'Full-day absence overlaps work' USING ERRCODE = '23P01';
  END IF;
  holiday := public.workforce_holiday_name(p_work_date);
  rate := CASE WHEN extract(isodow FROM p_work_date) IN (6, 7) OR holiday IS NOT NULL THEN 2 ELSE 1 END;
  SELECT * INTO item FROM public.workforce_work_entries WHERE user_id = actor AND work_date = p_work_date FOR UPDATE;
  IF FOUND THEN
    -- An exact retry remains safe if the original HTTP response was lost.
    IF item.start_time = p_start_time AND item.finish_time = p_finish_time AND item.actual_minutes = minutes
       AND item.note = btrim(p_note) AND item.multiplier = rate AND item.holiday_name IS NOT DISTINCT FROM holiday THEN RETURN to_jsonb(item); END IF;
    IF p_expected_version IS DISTINCT FROM item.version THEN RAISE EXCEPTION 'Entry version changed' USING ERRCODE = '40001'; END IF;
    UPDATE public.workforce_work_entries SET start_time = p_start_time, finish_time = p_finish_time,
      actual_minutes = minutes, multiplier = rate, holiday_name = holiday,
      note = btrim(p_note), version = version + 1, updated_at = public.workforce_now() WHERE id = item.id RETURNING * INTO item;
  ELSE
    IF p_expected_version IS NOT NULL THEN RAISE EXCEPTION 'Entry version changed' USING ERRCODE = '40001'; END IF;
    INSERT INTO public.workforce_work_entries(user_id, work_date, start_time, finish_time, actual_minutes, multiplier, holiday_name, note)
      VALUES (actor, p_work_date, p_start_time, p_finish_time, minutes, rate, holiday, btrim(p_note)) RETURNING * INTO item;
  END IF;
  RETURN to_jsonb(item);
END $$;

-- Old duration-only rows stay readable. Retire public manual-hour writes so an
-- old client cannot bypass clock input or leave stored times and minutes apart.
REVOKE ALL ON FUNCTION public.workforce_save_entry(DATE, INTEGER, TEXT, INTEGER) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.workforce_clock_minutes(DATE, TIME, TIME),
  public.workforce_save_clock_entry(DATE, TIME, TIME, TEXT, INTEGER) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.workforce_save_clock_entry(DATE, TIME, TIME, TEXT, INTEGER) TO authenticated;

COMMENT ON COLUMN public.workforce_work_entries.start_time IS 'Entered Europe/Riga start clock time; NULL means historical hours-only input, never an inferred time.';
COMMENT ON COLUMN public.workforce_work_entries.finish_time IS 'Entered Europe/Riga finish clock time on work_date; later than start on that same calendar day.';
COMMENT ON FUNCTION public.workforce_save_clock_entry(DATE, TIME, TIME, TEXT, INTEGER) IS 'Own daily clock interval; server-derived elapsed minutes and calendar pay factor, with version/audit/absence safeguards.';
NOTIFY pgrst, 'reload schema';
COMMIT;
