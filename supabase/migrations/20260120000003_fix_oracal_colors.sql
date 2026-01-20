-- Migration to fix missing RGB/Hex values for Oracal films preview
-- This ensures all Oracal materials have both 'rgb' and 'hex' in their metadata

-- 1. First, compute 'hex' from 'rgb' for all materials that have 'rgb' but miss 'hex'
UPDATE public.materials
SET metadata = metadata || jsonb_build_object(
  'hex', 
  '#' || 
  LPAD(TO_HEX((metadata->'rgb'->>0)::int), 2, '0') || 
  LPAD(TO_HEX((metadata->'rgb'->>1)::int), 2, '0') || 
  LPAD(TO_HEX((metadata->'rgb'->>2)::int), 2, '0')
)
WHERE (category = 'VINYL_ORACAL' OR code ILIKE 'ORACAL%')
  AND metadata ? 'rgb' 
  AND (metadata->>'hex' IS NULL OR metadata->>'hex' = '');

-- 2. Also update INVENTORY_ITEMS if they have rgb but no hex (for consistency)
UPDATE public.inventory_items
SET metadata = metadata || jsonb_build_object(
  'hex', 
  '#' || 
  LPAD(TO_HEX((metadata->'rgb'->>0)::int), 2, '0') || 
  LPAD(TO_HEX((metadata->'rgb'->>1)::int), 2, '0') || 
  LPAD(TO_HEX((metadata->'rgb'->>2)::int), 2, '0')
)
WHERE (category = 'VINYL_ORACAL' OR sku ILIKE 'ORACAL%')
  AND metadata ? 'rgb' 
  AND (metadata->>'hex' IS NULL OR metadata->>'hex' = '');

-- 3. Provide explicit colors for common Oracal 8500 codes that might be missing them
-- This covers the main ones used in the system
DO $$
DECLARE
    color_record RECORD;
    oracal_colors JSONB := '{
        "010": {"rgb": [231, 232, 229], "hex": "#E7E8E5"},
        "025": {"rgb": [209, 198, 0], "hex": "#D1C600"},
        "021": {"rgb": [255, 207, 0], "hex": "#FFCF00"},
        "013": {"rgb": [243, 195, 0], "hex": "#F3C300"},
        "020": {"rgb": [250, 173, 0], "hex": "#FAAD00"},
        "207": {"rgb": [225, 165, 41], "hex": "#E1A529"},
        "034": {"rgb": [224, 84, 0], "hex": "#E05400"},
        "330": {"rgb": [200, 36, 17], "hex": "#C82411"},
        "323": {"rgb": [211, 39, 59], "hex": "#D3273B"},
        "032": {"rgb": [204, 49, 28], "hex": "#CC311C"},
        "329": {"rgb": [195, 5, 14], "hex": "#C3050E"},
        "016": {"rgb": [207, 17, 10], "hex": "#CF110A"},
        "031": {"rgb": [193, 28, 19], "hex": "#C11C13"},
        "017": {"rgb": [165, 0, 14], "hex": "#A5000E"},
        "030": {"rgb": [119, 0, 23], "hex": "#770017"},
        "085": {"rgb": [223, 142, 143], "hex": "#DF8E8F"},
        "413": {"rgb": [211, 97, 177], "hex": "#D361B1"},
        "041": {"rgb": [179, 0, 106], "hex": "#B3006A"},
        "008": {"rgb": [118, 6, 48], "hex": "#760630"},
        "040": {"rgb": [100, 0, 92], "hex": "#64005C"},
        "403": {"rgb": [94, 34, 135], "hex": "#5E2287"},
        "012": {"rgb": [69, 3, 87], "hex": "#450357"},
        "527": {"rgb": [87, 145, 173], "hex": "#5791AD"},
        "053": {"rgb": [0, 142, 213], "hex": "#008ED5"},
        "052": {"rgb": [0, 98, 183], "hex": "#0062B7"},
        "051": {"rgb": [0, 89, 172], "hex": "#0059AC"},
        "528": {"rgb": [0, 101, 157], "hex": "#00659D"},
        "005": {"rgb": [5, 57, 162], "hex": "#0539A2"},
        "006": {"rgb": [0, 45, 117], "hex": "#002D75"},
        "049": {"rgb": [36, 4, 123], "hex": "#24047B"},
        "542": {"rgb": [20, 36, 121], "hex": "#142479"},
        "065": {"rgb": [33, 0, 102], "hex": "#210066"},
        "007": {"rgb": [37, 35, 95], "hex": "#25235F"},
        "541": {"rgb": [0, 83, 115], "hex": "#005373"},
        "066": {"rgb": [0, 139, 150], "hex": "#008B96"},
        "054": {"rgb": [0, 172, 146], "hex": "#00AC92"},
        "062": {"rgb": [0, 153, 53], "hex": "#009935"},
        "063": {"rgb": [74, 182, 0], "hex": "#4AB600"},
        "009": {"rgb": [0, 157, 104], "hex": "#009D68"},
        "614": {"rgb": [0, 115, 50], "hex": "#007332"},
        "068": {"rgb": [0, 110, 56], "hex": "#006E38"},
        "618": {"rgb": [0, 63, 66], "hex": "#003F42"},
        "087": {"rgb": [0, 120, 50], "hex": "#007832"},
        "060": {"rgb": [0, 62, 41], "hex": "#003E29"},
        "070": {"rgb": [27, 29, 32], "hex": "#1B1D20"},
        "074": {"rgb": [135, 143, 143], "hex": "#878F8F"},
        "076": {"rgb": [155, 161, 167], "hex": "#9BA1A7"},
        "072": {"rgb": [198, 201, 202], "hex": "#C6C9CA"},
        "805": {"rgb": [227, 213, 179], "hex": "#E3D5B3"},
        "011": {"rgb": [223, 187, 135], "hex": "#DFBB87"},
        "081": {"rgb": [180, 137, 89], "hex": "#B48959"},
        "088": {"rgb": [70, 41, 33], "hex": "#462921"},
        "090": {"rgb": [125, 129, 132], "hex": "#7D8184"},
        "091": {"rgb": [144, 127, 68], "hex": "#907F44"}
    }';
    code_key text;
    val jsonb;
BEGIN
    FOR code_key, val IN SELECT * FROM jsonb_each(oracal_colors)
    LOOP
        -- Update materials table
        UPDATE public.materials
        SET metadata = metadata || val
        WHERE (code ILIKE '%' || code_key || '%' OR metadata->>'colorCode' = code_key)
          AND (category = 'VINYL_ORACAL' OR category = 'Films');
          
        -- Update inventory_items table
        UPDATE public.inventory_items
        SET metadata = metadata || val
        WHERE (sku ILIKE '%' || code_key || '%' OR color_code = code_key)
          AND (category = 'VINYL_ORACAL' OR category = 'Films');
    END LOOP;
END $$;
