
-- Profile sections
create table public.profile_sections (
  id uuid default gen_random_uuid() primary key,
  template_id uuid references public.profile_templates(id) on delete cascade,
  name text not null,
  display_name_en text,
  display_name_ru text,
  display_name_lv text,
  order_index integer default 0,
  is_required boolean default false,
  metadata jsonb default '{}'
);

-- Profile fields
create table public.profile_fields (
  id uuid default gen_random_uuid() primary key,
  section_id uuid references public.profile_sections(id) on delete cascade,
  field_key text not null,
  field_type text not null,
  label_en text,
  label_ru text,
  label_lv text,
  order_index integer default 0,
  is_required boolean default false,
  options jsonb default '[]',
  config jsonb default '{}',
  validation_rules jsonb default '[]',
  conditional_logic jsonb default '[]',
  metadata jsonb default '{}'
);

-- Template versions
create table public.template_versions (
  id uuid default gen_random_uuid() primary key,
  template_id uuid references public.profile_templates(id) on delete cascade,
  version integer not null,
  template_snapshot jsonb not null,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamp with time zone default now()
);

-- Add created_by/updated_by to profile_templates if not exists (check previous migration)
-- Assuming previous migration created it, but without FKs or with text.
-- Let's alter to ensure they are UUIDs referencing auth.users if needed, or just keep them as is if they were text in original schema.
-- In original migration 001, they weren't present. In 005_profile_templates_extended, they might be.
-- Let's add them if they don't exist in 001 replacment.

alter table public.profile_templates
add column if not exists description text,
add column if not exists created_by uuid references auth.users(id),
add column if not exists updated_by uuid references auth.users(id),
add column if not exists updated_at timestamp with time zone default now();
