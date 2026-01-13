
-- Inventory stock (linking materials to stock)
create table public.inventory_stock (
  id uuid default gen_random_uuid() primary key,
  material_id uuid references public.materials(id) on delete cascade,
  thickness numeric,
  quantity_in_stock numeric default 0,
  unit_of_measure text,
  location text,
  minimum_stock_level numeric default 0,
  reorder_point numeric default 0,
  cost_per_unit numeric,
  notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create trigger update_inventory_stock_updated_at
  before update on public.inventory_stock
  for each row execute function update_updated_at_column();
