
-- Inventory items
create table public.inventory_items (
  id text primary key, -- Text to support custom IDs like INV-123
  sku text unique,
  name text not null,
  category text,
  section text,
  item_group text,
  subgroup text,
  unit text,
  stock numeric default 0,
  min_stock numeric default 0,
  thickness_mm numeric,
  location text,
  vendor text,
  color_code text,
  barcode text,
  note text,
  leftover_data jsonb,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Trigger for updated_at
create trigger update_inventory_items_updated_at
  before update on public.inventory_items
  for each row execute function update_updated_at_column();
