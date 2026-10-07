-- Restrict shared material and loading-day changes to management roles.
-- API handlers also enforce this boundary; RLS protects direct PostgREST access.

DROP POLICY IF EXISTS "Authenticated users can manage materials" ON public.materials;
DROP POLICY IF EXISTS "Authenticated users can manage loading days" ON public.loading_days;

CREATE POLICY "Managers can manage materials"
  ON public.materials
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Managers can manage loading days"
  ON public.loading_days
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Retain existing public/authenticated SELECT policies. Apply through the
-- project's migration runner and verify policies before deploying API code.
