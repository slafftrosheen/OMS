-- R&D-controlled company-wide OpenRouter transmission permission.
-- Default off. Source policy is checked on every provider request.
BEGIN;
CREATE TABLE IF NOT EXISTS public.openrouter_system_policy (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);
INSERT INTO public.openrouter_system_policy(singleton,enabled) VALUES (true,false)
  ON CONFLICT (singleton) DO NOTHING;
ALTER TABLE public.openrouter_system_policy ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.openrouter_system_policy FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON public.openrouter_system_policy TO service_role;
COMMIT;
