
-- Inventory movements
create table public.inventory_movements (
  id uuid default gen_random_uuid() primary key,
  item_id text references public.inventory_items(id) on delete cascade,
  kind text not null check (kind in ('IN', 'OUT', 'ADJUST')),
  qty numeric not null,
  unit text,
  performed_by text,
  ref_po text,
  note text,
  created_at timestamp with time zone default now()
);

-- RPC to handle movement and stock update safely
create or replace function record_inventory_movement(
  p_item_id text,
  p_kind text,
  p_qty numeric,
  p_unit text,
  p_performed_by text,
  p_ref_po text,
  p_note text
)
returns jsonb
language plpgsql
as $$
declare
  v_item record;
  v_new_stock numeric;
  v_movement_id uuid;
begin
  -- Lock item for update
  select * into v_item from public.inventory_items where id = p_item_id for update;

  if not found then
    raise exception 'Item not found';
  end if;

  -- Calculate new stock
  if p_kind = 'ADJUST' then
    v_new_stock := greatest(0, p_qty);
  elsif p_kind = 'IN' then
    v_new_stock := v_item.stock + p_qty;
  elsif p_kind = 'OUT' then
    v_new_stock := greatest(0, v_item.stock - p_qty);
  else
    raise exception 'Invalid movement kind';
  end if;

  -- Update stock
  update public.inventory_items
  set stock = v_new_stock, updated_at = now()
  where id = p_item_id;

  -- Record movement
  insert into public.inventory_movements (item_id, kind, qty, unit, performed_by, ref_po, note)
  values (p_item_id, p_kind, p_qty, coalesce(p_unit, v_item.unit), p_performed_by, p_ref_po, p_note)
  returning id into v_movement_id;

  return jsonb_build_object(
    'id', v_movement_id,
    'itemId', p_item_id,
    'kind', p_kind,
    'qty', p_qty,
    'previousStock', v_item.stock,
    'newStock', v_new_stock,
    'unit', coalesce(p_unit, v_item.unit)
  );
end;
$$;
