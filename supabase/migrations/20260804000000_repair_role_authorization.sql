-- Keep the deployed database and application on the single current role model.
-- RD and Boss are superusers; HeadOfProduction has administrative access.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'Operator';

UPDATE public.profiles
SET role = CASE
  WHEN role IN ('Admin', 'SuperAdmin', 'admin', 'superadmin') THEN 'RD'
  WHEN roles::text ILIKE '%superadmin%' THEN 'RD'
  WHEN roles::text ILIKE '%stationlead%' THEN 'StationHead'
  WHEN role IS NULL OR role NOT IN ('RD', 'Boss', 'HeadOfProduction', 'StationHead', 'Operator') THEN 'Operator'
  ELSE role
END;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('RD', 'Boss', 'HeadOfProduction', 'StationHead', 'Operator'));

-- The named account is the system owner.  This is idempotent and also repairs
-- deployments where the old SuperAdmin value survived the role rename.
UPDATE public.profiles p
SET role = 'RD', is_active = true, updated_at = now()
FROM auth.users u
WHERE u.id = p.id
  AND (lower(u.email) = 'slaff.trosheen@gmail.com'
       OR lower(p.username) = 'slaff.trosheen');

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('RD', 'Boss', 'HeadOfProduction')
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;

-- Station assignments are managed by the server-side admin API.  The prior
-- policy allowed every authenticated user to modify every user's assignments.
DROP POLICY IF EXISTS "user_stations_write" ON public.user_stations;
DROP POLICY IF EXISTS "user_stations_admin_write" ON public.user_stations;
CREATE POLICY "user_stations_admin_write" ON public.user_stations
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
