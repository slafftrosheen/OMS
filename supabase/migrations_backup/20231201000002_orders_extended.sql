
-- Order files (linking many files to an order)
create table public.order_files (
  id uuid default gen_random_uuid() primary key,
  draft_order_id uuid references public.draft_orders(id) on delete cascade,
  file_id uuid references public.files(id) on delete cascade,
  file_type text,
  display_name text,
  created_at timestamp with time zone default now()
);

-- Delivery presets (referenced in API)
create table public.delivery_presets (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  address text,
  contact text,
  phone text,
  is_default boolean default false,
  created_at timestamp with time zone default now()
);

-- Add delivery_preset_id to draft_orders if not exists
alter table public.draft_orders
add column if not exists delivery_preset_id uuid references public.delivery_presets(id),
add column if not exists priority text default 'NORMAL',
add column if not exists delivery_address text,
add column if not exists delivery_contact text,
add column if not exists delivery_phone text;
