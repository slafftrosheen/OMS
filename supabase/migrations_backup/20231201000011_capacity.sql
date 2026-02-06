
-- Capacity config
create table public.capacity_config (
  id uuid default gen_random_uuid() primary key,
  config_type text unique not null,
  default_capacity integer default 10,
  is_active boolean default true,
  updated_at timestamp with time zone default now()
);

-- Day capacities
create table public.day_capacities (
  id uuid default gen_random_uuid() primary key,
  config_id uuid references public.capacity_config(id) on delete cascade,
  date date not null,
  capacity integer not null,
  unique(config_id, date)
);
