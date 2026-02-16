-- Update Plexiglas XT materials with proper hex values
UPDATE materials 
SET metadata = jsonb_set(metadata, '{hex}', '"#FFFFFF"')
WHERE code LIKE 'PLEXIGLAS_XT_%' 
AND (metadata->>'colorCode' = '0F00' OR code LIKE '%0F00%' OR name_en ILIKE '%Clear%');

UPDATE materials 
SET metadata = jsonb_set(metadata, '{hex}', '"#F5F5F0"')
WHERE code LIKE 'PLEXIGLAS_XT_%' 
AND (metadata->>'colorCode' ILIKE '%WN071%' OR name_en ILIKE '%White Opal%');

UPDATE materials 
SET metadata = jsonb_set(metadata, '{hex}', '"#FFD700"')
WHERE code LIKE 'PLEXIGLAS_XT_%' 
AND (metadata->>'colorCode' ILIKE '%1N870%' OR name_en ILIKE '%Yellow%' OR name_en ILIKE '%Gold%');

UPDATE materials 
SET metadata = jsonb_set(metadata, '{hex}', '"#DC143C"')
WHERE code LIKE 'PLEXIGLAS_XT_%' 
AND (metadata->>'colorCode' ILIKE '%3N570%' OR name_en ILIKE '%Red%' OR name_en ILIKE '%Ruby%');

UPDATE materials 
SET metadata = jsonb_set(metadata, '{hex}', '"#0000FF"')
WHERE code LIKE 'PLEXIGLAS_XT_%' 
AND (metadata->>'colorCode' ILIKE '%5N870%' OR name_en ILIKE '%Blue%');

UPDATE materials 
SET metadata = jsonb_set(metadata, '{hex}', '"#008000"')
WHERE code LIKE 'PLEXIGLAS_XT_%' 
AND (metadata->>'colorCode' ILIKE '%6N570%' OR name_en ILIKE '%Green%');

UPDATE materials 
SET metadata = jsonb_set(metadata, '{hex}', '"#808080"')
WHERE code LIKE 'PLEXIGLAS_XT_%' 
AND (metadata->>'colorCode' ILIKE '%7A670%' OR name_en ILIKE '%Grey%' OR name_en ILIKE '%Gray%');

UPDATE materials 
SET metadata = jsonb_set(metadata, '{hex}', '"#8B4513"')
WHERE code LIKE 'PLEXIGLAS_XT_%' 
AND (metadata->>'colorCode' ILIKE '%8A570%' OR name_en ILIKE '%Brown%');

UPDATE materials 
SET metadata = jsonb_set(metadata, '{hex}', '"#000000"')
WHERE code LIKE 'PLEXIGLAS_XT_%' 
AND (metadata->>'colorCode' ILIKE '%9N870%' OR name_en ILIKE '%Black%');

-- Also update GS materials
UPDATE materials 
SET metadata = jsonb_set(metadata, '{hex}', '"#FFFFFF"')
WHERE code LIKE 'PLEXIGLAS_GS_%' 
AND (metadata->>'colorCode' ILIKE '%0F00%' OR metadata->>'colorCode' ILIKE '%WH%' OR name_en ILIKE '%Clear%' OR name_en ILIKE '%White%');