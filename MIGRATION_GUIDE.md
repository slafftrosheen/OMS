# Materials & Inventory Consolidation Migration Guide

## Overview

This migration consolidates the duplicate `materials` and `inventory_items` tables into a single unified `materials` table. This eliminates data duplication and provides a single source of truth for all material/inventory operations.

## Migration Date

**Created:** February 17, 2026  
**Migration File:** `supabase/migrations/20260217000000_unify_materials_inventory.sql`

## What Changed

### Database Schema

**Before:**
- `materials` table: Material definitions (code, name_en, category, thickness_options)
- `inventory_items` table: Physical stock (sku, name, stock, min_stock, etc.)
- Dual tracking caused data duplication and sync issues

**After:**
- Single `materials` table with all fields from both tables
- `inventory_items` table marked as DEPRECATED (not dropped for safety)
- `inventory_items_view` created for backwards compatibility

### New Columns Added to `materials` Table

```sql
- sku TEXT UNIQUE
- stock INTEGER DEFAULT 0
- min_stock INTEGER DEFAULT 0
- max_stock INTEGER
- unit TEXT DEFAULT 'PCS'
- location TEXT
- vendor TEXT
- supplier TEXT
- color_code TEXT
- hex_color TEXT
- barcode TEXT
- price NUMERIC(10,2)
- section TEXT
- item_group TEXT
- subgroup TEXT
- note TEXT
- leftover_data JSONB
- thickness_mm NUMERIC
- metadata JSONB
```

### TypeScript Types

**New Primary Type:** `Material` (in `src/lib/inventory/types.ts`)
```typescript
export interface Material {
  id: string;
  sku?: string;
  code: string;
  category: Category;
  name_en?: string;
  stock: number;
  min_stock: number;
  // ... and more
}
```

**Deprecated Type:** `Item` (kept for backwards compatibility)
```typescript
/** @deprecated Use Material instead */
export interface Item { ... }
```

### Store API Changes

**Old API:**
```typescript
import { items, loadItems, getItem, addItem } from '$lib/inventory/store';
```

**New API:**
```typescript
import { materials, loadMaterials, getMaterial, addMaterial } from '$lib/inventory/store';
```

**Backwards Compatibility Aliases:**
```typescript
export const getItem = getMaterial;
export const findItemBySku = findMaterialBySku;
export const addItem = addMaterial;
export const updateItem = updateMaterial;
export const removeItem = removeMaterial;
```

### API Endpoints

All inventory API endpoints now query the `materials` table:

- `GET /api/inventory/items` - Lists materials with SKU
- `POST /api/inventory/items` - Creates new material
- `GET /api/inventory/items/:id` - Gets material by ID
- `PUT /api/inventory/items/:id` - Updates material
- `DELETE /api/inventory/items/:id` - Deletes material
- `GET /api/inventory/movements` - Lists material movements
- `POST /api/inventory/movements` - Records material movement

### Field Name Changes

| Old (Item) | New (Material) |
|------------|----------------|
| `name` | `name_en` |
| `group` | `item_group` |
| `min` | `min_stock` |
| `colorCode` | `color_code` |
| `hexColor` | `hex_color` |
| `thicknessMM` | `thickness_mm` |
| `updatedAt` | `updated_at` |
| `leftover` | `leftover_data` |

## Migration Steps

### 1. Backup Database

```bash
supabase db dump > backup_before_migration_$(date +%Y%m%d).sql
```

### 2. Run Migration

```bash
npm run migrate
# or
supabase db push
# or manually run:
psql -f supabase/migrations/20260217000000_unify_materials_inventory.sql
```

### 3. Verify Migration

```sql
-- Check materials count
SELECT COUNT(*) FROM materials WHERE sku IS NOT NULL;

-- Check inventory_items count (should match)
SELECT COUNT(*) FROM inventory_items;

-- Verify data migration
SELECT sku, name_en, stock, min_stock 
FROM materials 
WHERE sku IS NOT NULL 
LIMIT 10;
```

### 4. Update Frontend Code

All inventory-related components have been updated:
- ✅ `src/routes/inventory/+page.svelte`
- ✅ `src/routes/inventory/[id]/+page.svelte`
- ✅ `src/routes/inventory/new/+page.svelte`
- ✅ `src/routes/inventory/catalog/+page.svelte`
- ✅ `src/lib/inventory/store.ts`
- ✅ `src/lib/inventory/types.ts`
- ✅ `src/routes/api/inventory/items/+server.ts`
- ✅ `src/routes/api/inventory/items/[id]/+server.ts`
- ✅ `src/routes/api/inventory/movements/+server.ts`

### 5. Test Thoroughly

**Test Cases:**
- [ ] View inventory list
- [ ] Create new material
- [ ] Edit material details
- [ ] Delete material
- [ ] Record stock IN movement
- [ ] Record stock OUT movement
- [ ] Record stock adjustment
- [ ] Filter by category
- [ ] Filter by section
- [ ] Search by SKU/name
- [ ] Low stock alerts
- [ ] Export to CSV
- [ ] Scan barcode
- [ ] Import from CSV

## Benefits

✅ **Single source of truth** - No more data duplication  
✅ **Unified category system** - Consistent categorization  
✅ **Stock visibility in order forms** - Real-time stock levels  
✅ **Simpler codebase** - One table to maintain  
✅ **Consistent material IDs** - Across all systems  
✅ **Better performance** - Fewer joins required  

## Rollback Plan

If issues occur, the `inventory_items` table is preserved:

```sql
-- Revert to using inventory_items table
-- (Application code would need to be reverted as well)
```

## Future Cleanup

After confirming everything works (recommended: 2-4 weeks):

```sql
-- Future migration: drop inventory_items table
DROP TABLE IF EXISTS public.inventory_items CASCADE;
DROP VIEW IF EXISTS public.inventory_items_view;
```

## Support

For issues or questions:
1. Check migration logs: `supabase migration list`
2. Review database schema: `psql -c "\d materials"`
3. Check application logs for errors
4. Verify data integrity with SQL queries above

## Related Files

- Migration: `supabase/migrations/20260217000000_unify_materials_inventory.sql`
- Types: `src/lib/inventory/types.ts`
- Store: `src/lib/inventory/store.ts`
- API: `src/routes/api/inventory/`
- Pages: `src/routes/inventory/`
