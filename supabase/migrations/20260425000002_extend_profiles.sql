-- =================================================================
-- 20260425000002: EXTEND profiles
-- =================================================================
-- Adds columns the API joins/selects but the original schema lacks:
--   - full_name   (mirrors display_name; many places already query for it)
--   - avatar_url  (lucide placeholder until Storage avatars ship)
--   - role        (top-level role string complementing the JSONB roles map)
--   - station     (derived: first entry of the existing stations[] array)
--
-- Q3b decision: stations[] stays as the source of truth.  `station` is a
-- generated column so existing array-based code keeps working AND new code
-- that reads a single station works automatically.
--
-- Audit references:
--   - src/routes/api/orders/[id]/+server.ts:50-57,178
-- =================================================================

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS full_name  TEXT,
    ADD COLUMN IF NOT EXISTS avatar_url TEXT,
    ADD COLUMN IF NOT EXISTS role       TEXT;

-- Backfill full_name from display_name where missing.
UPDATE public.profiles
   SET full_name = display_name
 WHERE full_name IS NULL
   AND display_name IS NOT NULL;

-- Keep full_name in sync with display_name going forward (one-way for now;
-- new code should write full_name directly, old code that writes display_name
-- still gets a sane mirror).
CREATE OR REPLACE FUNCTION public.profiles_sync_full_name()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.full_name IS DISTINCT FROM OLD.full_name THEN
        NEW.display_name = COALESCE(NEW.full_name, NEW.display_name);
    ELSIF NEW.display_name IS DISTINCT FROM OLD.display_name AND NEW.full_name IS NULL THEN
        NEW.full_name = NEW.display_name;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS profiles_sync_full_name ON public.profiles;
CREATE TRIGGER profiles_sync_full_name
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.profiles_sync_full_name();

-- Generated column: `station` mirrors stations[1].  STORED so it can be indexed.
-- Wrapped in DO block because adding a generated column is non-idempotent.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name   = 'profiles'
           AND column_name  = 'station'
    ) THEN
        ALTER TABLE public.profiles
            ADD COLUMN station TEXT GENERATED ALWAYS AS (stations[1]) STORED;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_station ON public.profiles(station);

-- Convenience view that surfaces a single primary station alongside the array.
CREATE OR REPLACE VIEW public.profiles_with_primary_station AS
SELECT
    p.*,
    p.stations[1] AS primary_station,
    array_length(p.stations, 1) AS station_count
  FROM public.profiles p;

GRANT SELECT ON public.profiles_with_primary_station TO authenticated, anon;

COMMENT ON COLUMN public.profiles.full_name  IS 'Canonical display name. Mirrors display_name for back-compat; prefer full_name in new code.';
COMMENT ON COLUMN public.profiles.avatar_url IS 'URL of the user avatar (Supabase Storage path or external link).';
COMMENT ON COLUMN public.profiles.role       IS 'Top-level role (admin, manager, operator, viewer). Complementary to the JSONB roles map.';
COMMENT ON COLUMN public.profiles.station    IS 'Generated: first entry of stations[]. Use this when you only need the user''s primary station.';
COMMENT ON VIEW   public.profiles_with_primary_station IS 'Profiles with a derived primary_station column for code that wants a single value.';
