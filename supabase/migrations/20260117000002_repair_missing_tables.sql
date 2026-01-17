-- Repair migration: Re-create tables if they are missing
-- This handles the case where tables were deleted but migration history remains

-- 1. PROFILES
CREATE TABLE IF NOT EXISTS public.profiles (
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

-- 2. FILES
CREATE TABLE IF NOT EXISTS public.files (
  id uuid default gen_random_uuid() primary key,
  filename text not null,
  filepath text not null,
  mimetype text not null,
  size integer not null,
  created_at timestamp with time zone default now(),
  uploaded_by uuid references auth.users(id)
);

-- 3. PROFILE TEMPLATES
CREATE TABLE IF NOT EXISTS public.profile_templates (
  id uuid default gen_random_uuid() primary key,
  code text unique not null,
  name text not null,
  version integer default 1,
  is_active boolean default true,
  created_at timestamp with time zone default now(),
  metadata jsonb default '{}'
);

-- 4. DRAFT ORDERS
CREATE TABLE IF NOT EXISTS public.draft_orders (
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

-- 5. ORDER PROFILES
CREATE TABLE IF NOT EXISTS public.order_profiles (
  id uuid default gen_random_uuid() primary key,
  draft_order_id uuid references public.draft_orders(id) on delete cascade,
  profile_template_id uuid references public.profile_templates(id),
  quantity integer check (quantity between 1 and 4),
  configuration jsonb default '{}',
  notes text,
  order_index integer default 0
);

-- 6. MATERIALS
CREATE TABLE IF NOT EXISTS public.materials (
  id uuid default gen_random_uuid() primary key,
  category text not null,
  code text unique not null,
  name_en text,
  name_ru text,
  name_lv text,
  thickness_options jsonb default '[]',
  metadata jsonb default '{}'
);

-- 7. USER PREFERENCES
CREATE TABLE IF NOT EXISTS public.user_preferences (
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

-- 8. AUDIT LOG
CREATE TABLE IF NOT EXISTS public.audit_log (
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

-- 9. ORDER FILES (from extended schema)
CREATE TABLE IF NOT EXISTS public.order_files (
  id uuid default gen_random_uuid() primary key,
  draft_order_id uuid references public.draft_orders(id) on delete cascade,
  file_id uuid references public.files(id) on delete cascade,
  file_type text,
  display_name text,
  created_at timestamp with time zone default now()
);

-- 10. DELIVERY PRESETS
CREATE TABLE IF NOT EXISTS public.delivery_presets (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  address text,
  contact text,
  phone text,
  is_default boolean default false,
  created_at timestamp with time zone default now()
);

-- 11. NOTIFICATIONS
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  notification_type text not null,
  title text not null,
  message text,
  link text,
  is_read boolean default false,
  is_dismissed boolean default false,
  created_at timestamp with time zone default now()
);

-- 12. CALENDAR & LOADING
CREATE TABLE IF NOT EXISTS public.calendar_events (
  id uuid default gen_random_uuid() primary key,
  kind text not null,
  date date not null,
  title text,
  note text,
  created_by uuid references auth.users(id),
  created_at timestamp with time zone default now()
);

CREATE TABLE IF NOT EXISTS public.loading_events (
  id uuid primary key references public.calendar_events(id) on delete cascade,
  carrier text,
  window_start time,
  window_end time
);

CREATE TABLE IF NOT EXISTS public.loading_event_pos (
  id serial primary key,
  loading_event_id uuid references public.loading_events(id) on delete cascade,
  draft_order_id uuid references public.draft_orders(id) on delete cascade,
  unique(loading_event_id, draft_order_id)
);

CREATE TABLE IF NOT EXISTS public.capacity_config (
  id serial primary key,
  config_type text not null default 'loading',
  default_capacity integer not null default 10,
  is_active boolean default true
);

-- 13. CHAT
CREATE TABLE IF NOT EXISTS public.chat_rooms (
  id text primary key,
  name text not null,
  room_type text default 'channel',
  is_private boolean default false,
  created_by uuid references auth.users(id)
);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid default gen_random_uuid() primary key,
  room_id text references public.chat_rooms(id) on delete cascade,
  author_id uuid references auth.users(id),
  text text not null,
  variant text default 'user',
  mentions uuid[] default array[]::uuid[],
  is_edited boolean default false,
  is_deleted boolean default false,
  created_at timestamp with time zone default now()
);

-- 14. INVENTORY
CREATE TABLE IF NOT EXISTS public.inventory_items (
    id uuid default gen_random_uuid() primary key,
    sku text unique not null,
    name text not null,
    group_name text,
    subgroup_name text,
    unit text not null default 'pcs',
    location text,
    min_quantity decimal(10,2) default 0,
    price decimal(10,2),
    supplier text,
    barcode text,
    metadata jsonb default '{}',
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

CREATE TABLE IF NOT EXISTS public.inventory_stock (
  id uuid default gen_random_uuid() primary key,
  item_id uuid references public.inventory_items(id) on delete cascade,
  quantity decimal(10,2) not null default 0,
  last_updated_at timestamp with time zone default now()
);

CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id uuid default gen_random_uuid() primary key,
  item_id uuid references public.inventory_items(id) on delete cascade,
  movement_type text not null,
  quantity decimal(10,2) not null,
  reference_id text,
  performed_by uuid references auth.users(id),
  notes text,
  created_at timestamp with time zone default now()
);

-- 15. STATION LOGS
CREATE TABLE IF NOT EXISTS public.station_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id),
  station text,
  action text,
  details jsonb,
  created_at timestamp with time zone default now()
);

-- 16. LOADING DAYS (Legacy/Misc)
CREATE TABLE IF NOT EXISTS public.loading_days (
  id uuid default gen_random_uuid() primary key,
  date date not null unique,
  max_capacity integer default 10,
  notes text,
  is_blocked boolean default false,
  created_at timestamp with time zone default now()
);

-- 17. FAQS
CREATE TABLE IF NOT EXISTS public.faqs (
  id uuid default gen_random_uuid() primary key,
  slug text unique not null,
  question text not null,
  answer text not null,
  order_index integer default 0,
  created_at timestamp with time zone default now()
);
