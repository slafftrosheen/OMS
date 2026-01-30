-- supabase/003_rls_policies.sql

-- Enable RLS for all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draft_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;

-- Policies for the "profiles" table
CREATE POLICY "Allow authenticated users to read their own data"
ON public.profiles
FOR SELECT
USING (auth.uid() = id);

CREATE POLICY "Allow admins to read all user data"
ON public.profiles
FOR SELECT
USING (
  (
    SELECT roles->>'Admin'
    FROM public.profiles
    WHERE id = auth.uid()
  ) = 'SuperAdmin'
);

CREATE POLICY "Allow users to update their own data"
ON public.profiles
FOR UPDATE
USING (auth.uid() = id);

CREATE POLICY "Allow admins to update all user data"
ON public.profiles
FOR UPDATE
USING (
  (
    SELECT roles->>'Admin'
    FROM public.profiles
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
    FROM public.profiles
    WHERE id = auth.uid()
  ) = 'SuperAdmin'
);

-- Allow all authenticated users to insert into audit_log
CREATE POLICY "Allow authenticated users to insert into audit_log"
ON public.audit_log
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Policies for the "user_preferences" table
CREATE POLICY "Allow users to read their own preferences"
ON public.user_preferences
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Allow users to update their own preferences"
ON public.user_preferences
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Allow users to insert their own preferences"
ON public.user_preferences
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Policies for the "draft_orders" table
CREATE POLICY "Allow users to read their own draft orders"
ON public.draft_orders
FOR SELECT
USING (auth.uid() = created_by);

CREATE POLICY "Allow users to create their own draft orders"
ON public.draft_orders
FOR INSERT
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Allow users to update their own draft orders"
ON public.draft_orders
FOR UPDATE
USING (auth.uid() = created_by);

CREATE POLICY "Allow admins to read all draft orders"
ON public.draft_orders
FOR SELECT
USING (
  (
    SELECT roles->>'Admin'
    FROM public.profiles
    WHERE id = auth.uid()
  ) = 'SuperAdmin'
);

-- Policies for the "profile_templates" table
CREATE POLICY "Allow all authenticated users to read profile templates"
ON public.profile_templates
FOR SELECT
TO authenticated
USING (TRUE);

CREATE POLICY "Allow admins to manage profile templates"
ON public.profile_templates
FOR ALL
USING (
  (
    SELECT roles->>'Admin'
    FROM public.profiles
    WHERE id = auth.uid()
  ) = 'SuperAdmin'
);

-- Policies for the "materials" table
CREATE POLICY "Allow all authenticated users to read materials"
ON public.materials
FOR SELECT
TO authenticated
USING (TRUE);

CREATE POLICY "Allow admins to manage materials"
ON public.materials
FOR ALL
USING (
  (
    SELECT roles->>'Admin'
    FROM public.profiles
    WHERE id = auth.uid()
  ) = 'SuperAdmin'
);
