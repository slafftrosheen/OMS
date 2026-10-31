-- Workshop-specified aluminium sheet family, not a supplier catalog product.
-- Source: supabase/catalogs/workshop-aluminium-2026-10-31.json.
-- Adds a 1500 x 3000 mm sheet with the owner's thickness choices. Existing
-- material records, saved profile references, stock and prices are untouched.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $preflight$
DECLARE
  missing_columns text[];
BEGIN
  IF to_regclass('public.materials') IS NULL
    OR to_regclass('public.material_thickness_options') IS NULL THEN
    RAISE EXCEPTION 'Workshop sheet seed requires materials and material_thickness_options';
  END IF;
  SELECT array_agg(required.name) INTO missing_columns
  FROM unnest(ARRAY['id', 'code', 'sku', 'category', 'name_en', 'name_ru', 'name_lv',
    'thickness_options', 'metadata', 'unit', 'section', 'item_group', 'stock', 'price']) AS required(name)
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = 'materials' AND c.column_name = required.name
  );
  IF missing_columns IS NOT NULL THEN
    RAISE EXCEPTION 'Workshop sheet seed requires the unified materials schema. Missing columns: %', missing_columns;
  END IF;
  SELECT array_agg(required.name) INTO missing_columns
  FROM unnest(ARRAY['material_type', 'thickness', 'unit', 'display_name', 'sort_order']) AS required(name)
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = 'material_thickness_options' AND c.column_name = required.name
  );
  IF missing_columns IS NOT NULL THEN
    RAISE EXCEPTION 'Workshop sheet seed requires the thickness-options schema. Missing columns: %', missing_columns;
  END IF;
END
$preflight$;

CREATE TEMPORARY TABLE workshop_aluminium_20261031 ON COMMIT DROP AS
SELECT * FROM jsonb_to_recordset($workshop_materials$
[
  {"category":"ALU_SHEET","code":"WORKSHOP_ALU_SHEET_1500X3000","sku":"WORKSHOP_ALU_SHEET_1500X3000","name_en":"Aluminium sheet · 1500 × 3000 mm","name_ru":"Алюминиевый лист · 1500 × 3000 мм","name_lv":"Alumīnija loksne · 1500 × 3000 mm","thickness_options":[0.5,1,1.5,2,3,5,8,10,15],"unit":"PCS","section":"materials","item_group":"Aluminium sheets","metadata":{"short_name":"Aluminium 1500 × 3000","material":"Aluminium","type":"sheet","product_form":"sheet","standardSize":"1500x3000mm","sheet_width_mm":1500,"sheet_length_mm":3000,"source_kind":"workshop_specification","specified_at":"2026-10-31","catalog_seed":"workshop-aluminium-2026-10-31","data_notes":"Generic sheet family using workshop-specified 1500 × 3000 mm stock format and thickness choices. Supplier, alloy, finish, price and available stock are not specified. Choose the required thickness separately in the order profile."}}
]
$workshop_materials$::jsonb) AS p(
  category text, code text, sku text, name_en text, name_ru text, name_lv text,
  thickness_options jsonb, unit text, section text, item_group text, metadata jsonb
);

DO $identity_check$
BEGIN
  IF EXISTS (
    SELECT 1 FROM workshop_aluminium_20261031 p
    JOIN public.materials m ON m.sku = p.sku AND m.code <> p.code
  ) THEN
    RAISE EXCEPTION 'Workshop sheet seed SKU collision; reconcile the existing material before retrying';
  END IF;
  IF EXISTS (
    SELECT 1 FROM workshop_aluminium_20261031 p
    JOIN public.materials m ON m.code = p.code
    WHERE m.metadata->>'catalog_seed' IS DISTINCT FROM 'workshop-aluminium-2026-10-31'
  ) THEN
    RAISE EXCEPTION 'Workshop sheet seed code collision; reconcile the existing material before retrying';
  END IF;
END
$identity_check$;

INSERT INTO public.materials (
  category, code, sku, name_en, name_ru, name_lv, thickness_options,
  unit, section, item_group, metadata
)
SELECT category, code, sku, name_en, name_ru, name_lv, thickness_options,
  unit, section, item_group, metadata
FROM workshop_aluminium_20261031
ON CONFLICT (code) DO NOTHING;

-- Complete the legacy aluminium thickness family without deleting, changing or
-- reactivating any existing option. The new sheet has its exact list above.
INSERT INTO public.material_thickness_options (
  material_type, thickness, unit, display_name, sort_order
)
SELECT 'ALUMINUM', choice.thickness, 'mm', choice.thickness::text || ' mm Aluminium', choice.position * 10
FROM unnest(ARRAY[0.5, 1, 1.5, 2, 3, 5, 8, 10, 15]::numeric[]) WITH ORDINALITY AS choice(thickness, position)
WHERE NOT EXISTS (
  SELECT 1 FROM public.material_thickness_options existing
  WHERE existing.material_type = 'ALUMINUM'
    AND existing.thickness = choice.thickness
    AND lower(btrim(existing.unit)) = 'mm'
);

COMMIT;
