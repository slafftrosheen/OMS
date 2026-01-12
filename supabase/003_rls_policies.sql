-- supabase/003_rls_policies.sql

-- Enable RLS for all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Policies for the "users" table
CREATE POLICY "Allow authenticated users to read their own data"
ON public.users
FOR SELECT
USING (auth.uid() = id);

CREATE POLICY "Allow admins to read all user data"
ON public.users
FOR SELECT
USING (
  (
    SELECT roles->>'Admin'
    FROM public.users
    WHERE id = auth.uid()
  ) = 'SuperAdmin'
);

CREATE POLICY "Allow users to update their own data"
ON public.users
FOR UPDATE
USING (auth.uid() = id);

CREATE POLICY "Allow admins to update all user data"
ON public.users
FOR UPDATE
USING (
  (
    SELECT roles->>'Admin'
    FROM public.users
    WHERE id = auth.uid()
  ) = 'SuperAdmin'
);

-- Policies for the "audit_log" table
CREATE POLICY "Allow admins to read all audit log data"
ON public.audit_log
FOR SELECT
USING (
  (
    SELECT roles->>'Admin'
    FROM public.users
    WHERE id = auth.uid()
  ) = 'SuperAdmin'
);
