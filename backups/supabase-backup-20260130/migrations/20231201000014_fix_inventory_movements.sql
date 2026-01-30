
-- Add material_id to inventory_movements
alter table public.inventory_movements
add column if not exists material_id uuid references public.materials(id) on delete cascade;

-- Alter check constraint on inventory_movements to allow item_id OR material_id
alter table public.inventory_movements
drop constraint if exists inventory_movements_item_id_fkey; -- Removing FK if strict, but let's keep it nullable.

-- Add check constraint that either item_id or material_id must be present
alter table public.inventory_movements
add constraint check_item_or_material check (
  (item_id is not null and material_id is null) or
  (item_id is null and material_id is not null)
);


-- Update RPC to handle material movements
create or replace function record_inventory_movement(
  p_item_id text,
  p_kind text,
  p_qty numeric,
  p_unit text,
  p_performed_by text,
  p_ref_po text,
  p_note text,
  p_material_id uuid default null -- Added parameter
)
returns jsonb
language plpgsql
as $$
declare
  v_current_stock numeric;
  v_new_stock numeric;
  v_movement_id uuid;
  v_unit text;
begin
  if p_item_id is not null then
      -- Inventory Items
      select stock, unit into v_current_stock, v_unit from public.inventory_items where id = p_item_id for update;
      if not found then raise exception 'Item not found'; end if;
      v_unit := coalesce(p_unit, v_unit);
  elsif p_material_id is not null then
      -- Inventory Stock (Materials)
      select quantity_in_stock, unit_of_measure into v_current_stock, v_unit from public.inventory_stock where material_id = p_material_id for update;
      if not found then raise exception 'Material stock not found'; end if;
      v_unit := coalesce(p_unit, v_unit);
  else
      raise exception 'Either item_id or material_id must be provided';
  end if;

  -- Calculate new stock
  if p_kind = 'ADJUST' then
    v_new_stock := greatest(0, p_qty);
  elsif p_kind = 'IN' then
    v_new_stock := v_current_stock + p_qty;
  elsif p_kind = 'OUT' then
    v_new_stock := greatest(0, v_current_stock - p_qty);
  else
    raise exception 'Invalid movement kind';
  end if;

  -- Update stock
  if p_item_id is not null then
      update public.inventory_items
      set stock = v_new_stock, updated_at = now()
      where id = p_item_id;

      insert into public.inventory_movements (item_id, kind, qty, unit, performed_by, ref_po, note)
      values (p_item_id, p_kind, p_qty, v_unit, p_performed_by, p_ref_po, p_note)
      returning id into v_movement_id;
  else
      update public.inventory_stock
      set quantity_in_stock = v_new_stock, updated_at = now()
      where material_id = p_material_id;

      insert into public.inventory_movements (material_id, kind, qty, unit, performed_by, ref_po, note)
      values (p_material_id, p_kind, p_qty, v_unit, p_performed_by, p_ref_po, p_note)
      returning id into v_movement_id;
  end if;

  return jsonb_build_object(
    'id', v_movement_id,
    'itemId', p_item_id,
    'materialId', p_material_id,
    'kind', p_kind,
    'qty', p_qty,
    'previousStock', v_current_stock,
    'newStock', v_new_stock,
    'unit', v_unit
  );
end;
$$;
