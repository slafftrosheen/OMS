-- Add original_name to files table
ALTER TABLE public.files ADD COLUMN IF NOT EXISTS original_name text;
