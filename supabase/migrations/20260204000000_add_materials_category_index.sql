-- Add index on materials.category for faster filtering
-- This will dramatically speed up category-based queries
CREATE INDEX IF NOT EXISTS idx_materials_category
ON public.materials(category);

-- Add composite index for common query patterns
CREATE INDEX IF NOT EXISTS idx_materials_category_code
ON public.materials(category, code);

-- Analyze the table to update query planner statistics
ANALYZE public.materials;
