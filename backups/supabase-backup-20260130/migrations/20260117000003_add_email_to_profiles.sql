-- Add email column to profiles and sync with auth.users

-- 1. Add email column
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS email TEXT;

-- 2. Create function to sync email on auth user updates
CREATE OR REPLACE FUNCTION public.sync_user_email()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.profiles
  SET email = NEW.email
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Create trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_email_update ON auth.users;
CREATE TRIGGER on_auth_user_email_update
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.sync_user_email();

-- 4. Update the existing handle_new_user function to include email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name, email)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'username',
    NEW.raw_user_meta_data->>'full_name',
    NEW.email
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Backfill existing emails (This requires running as superuser/postgres)
-- We can do a best-effort update based on the seeded data we know
UPDATE public.profiles
SET email = 'slaff.trosheen@gmail.com'
WHERE username = 'slaff';
