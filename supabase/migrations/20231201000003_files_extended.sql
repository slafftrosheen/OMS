
-- Add original_name to files table
alter table public.files
add column if not exists original_name text;
