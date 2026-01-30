-- Migration to setup profiles and other tables based on previous schema

-- Create profiles table (replacing users table)
-- This table extends auth.users
create table public.profiles (
  id uuid references auth.users on delete cascade not null primary key,
  username text unique,
  display_name text,
  primary_section text default 'Production',
  sections text[] default array['Production'],
  roles jsonb default '{"Admin": "Viewer", "Production": "Operator", "Logistics": "Viewer"}',
  stations text[] default array[]::text[],
  is_active boolean default true,
  last_login_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  metadata jsonb default '{}'
);

-- RLS policies for profiles
alter table public.profiles enable row level security;

create policy "Public profiles are viewable by everyone."
  on public.profiles for select
  using ( true );

create policy "Users can insert their own profile."
  on public.profiles for insert
  with check ( auth.uid() = id );

create policy "Users can update own profile."
  on public.profiles for update
  using ( auth.uid() = id );

-- Function to handle new user signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username, display_name)
  values (new.id, new.raw_user_meta_data->>'username', new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer;

-- Trigger to call handle_new_user on signup
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- Files table
create table public.files (
  id uuid default gen_random_uuid() primary key,
  filename text not null,
  filepath text not null,
  mimetype text not null,
  size integer not null,
  created_at timestamp with time zone default now(),
  uploaded_by uuid references auth.users(id)
);

-- Profile templates
create table public.profile_templates (
  id uuid default gen_random_uuid() primary key,
  code text unique not null,
  name text not null,
  version integer default 1,
  is_active boolean default true,
  created_at timestamp with time zone default now(),
  metadata jsonb default '{}'
);

-- Draft orders
create table public.draft_orders (
  id uuid default gen_random_uuid() primary key,
  po_number text unique not null,
  client text,
  title text,
  due_date date,
  loading_date date,
  cdr_file_id uuid references public.files(id),
  pdf_file_id uuid references public.files(id),
  status text default 'draft',
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  metadata jsonb default '{}'
);

-- Order profiles
create table public.order_profiles (
  id uuid default gen_random_uuid() primary key,
  draft_order_id uuid references public.draft_orders(id) on delete cascade,
  profile_template_id uuid references public.profile_templates(id),
  quantity integer check (quantity between 1 and 4),
  configuration jsonb default '{}',
  notes text,
  order_index integer default 0
);

-- Materials
create table public.materials (
  id uuid default gen_random_uuid() primary key,
  category text not null,
  code text unique not null,
  name_en text,
  name_ru text,
  name_lv text,
  thickness_options jsonb default '[]',
  metadata jsonb default '{}'
);

-- User preferences
create table public.user_preferences (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade unique,
  theme text default 'DarkVim',
  locale text default 'en',
  scale text default 'normal',
  density text default 'cozy',
  pdf_zoom decimal(3,2) default 1.00,
  sidebar_collapsed boolean default false,
  notifications_enabled boolean default true,
  custom_settings jsonb default '{}'
);

-- Audit log
create table public.audit_log (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete set null,
  username text,
  action text not null,
  entity_type text,
  entity_id text,
  old_values jsonb,
  new_values jsonb,
  ip_address text,
  created_at timestamp with time zone default now()
);

-- Triggers for updated_at
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_profiles_updated_at
  before update on public.profiles
  for each row execute function update_updated_at_column();

create trigger update_draft_orders_updated_at
  before update on public.draft_orders
  for each row execute function update_updated_at_column();
