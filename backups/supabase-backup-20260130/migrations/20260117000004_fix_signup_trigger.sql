-- Fix handle_new_user to handle conflicts gracefully

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || substr(NEW.id::text, 1, 8)),
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'New User'),
    NEW.email
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    username = COALESCE(EXCLUDED.username, public.profiles.username),
    updated_at = NOW();

  RETURN NEW;
EXCEPTION
  WHEN unique_violation THEN
    -- If username exists, try appending random suffix or just fail silently (let auth proceed)
    -- Here we try to insert with a fallback username to ensure profile creation
    INSERT INTO public.profiles (id, username, display_name, email)
    VALUES (
      NEW.id,
      (NEW.raw_user_meta_data->>'username') || '_' || substr(md5(random()::text), 1, 4),
      COALESCE(NEW.raw_user_meta_data->>'full_name', 'New User'),
      NEW.email
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
