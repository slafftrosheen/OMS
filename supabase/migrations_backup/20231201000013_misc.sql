
-- Additional tables
create table public.station_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id),
  station text,
  action text,
  details jsonb,
  created_at timestamp with time zone default now()
);

create table public.loading_days (
  id uuid default gen_random_uuid() primary key,
  date date not null unique,
  max_capacity integer default 10,
  notes text,
  is_blocked boolean default false,
  created_at timestamp with time zone default now()
);

-- FAQ (assuming simple table)
create table public.faqs (
  id uuid default gen_random_uuid() primary key,
  slug text unique not null,
  question text not null,
  answer text not null,
  order_index integer default 0,
  created_at timestamp with time zone default now()
);
