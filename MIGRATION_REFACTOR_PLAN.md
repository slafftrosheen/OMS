# Migration Refactoring Plan

## Critical Issues Found

### 1. **Schema Conflicts**
- `inventory_items`: Two different schemas (text PK vs UUID PK)
- `chat_messages`: Conflicting column names (`author_id` vs `user_id`)
- `loading_event_pos`: Inconsistent foreign keys

### 2. **Duplicate Policies/Indexes**
- Chat RLS policies defined 3 times
- Multiple `update_updated_at_column()` function definitions
- Redundant indexes

### 3. **Missing Tables Referenced**
- `order_materials` (referenced but never created)
- `order_comments` (referenced but never created)

### 4. **Problematic Migrations**
- `20260117000002_repair_missing_tables.sql` - Creates schema divergence
- `20260202100000_supabase_advisor_security_fixes.sql` - References non-existent columns

## Refactoring Strategy

### Phase 1: Clean Database (DESTRUCTIVE - Local Only)
1. Drop all Supabase volumes
2. Start fresh with consolidated migrations

### Phase 2: Consolidated Migrations
Create new migration sequence:
1. `00_init_extensions.sql` - Extensions only
2. `01_core_tables.sql` - Core tables (users, profiles, files)
3. `02_orders.sql` - Order management tables
4. `03_calendar.sql` - Calendar and loading events
5. `04_inventory.sql` - Inventory system (ONE schema)
6. `05_chat.sql` - Chat system with RLS
7. `06_notifications.sql` - Notifications
8. `07_sync_system.sql` - Offline sync (only for tables that exist)
9. `08_functions_triggers.sql` - All functions and triggers
10. `09_rls_policies.sql` - All RLS policies in one place
11. `10_indexes.sql` - Performance indexes
12. `11_seed_data.sql` - Initial seed data

### Phase 3: Code Alignment
- Update TypeScript types to match schema
- Fix API endpoints
- Update UI components

## Action Items

- [ ] Review and approve this plan
- [ ] Reset local database
- [ ] Create consolidated migrations
- [ ] Test full migration sequence
- [ ] Update codebase to match schema
- [ ] Create proper seed data
- [ ] Document final schema

## Recommended Schema (Based on Code Analysis)

### inventory_items (Correct Schema from Code)
```sql
CREATE TABLE inventory_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    category TEXT,
    section TEXT,
    location TEXT,
    stock INTEGER DEFAULT 0,
    min_stock INTEGER DEFAULT 0,
    max_stock INTEGER,
    unit TEXT DEFAULT 'pieces',
    supplier TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
```

### inventory_stock (Separate History Table)
```sql
CREATE TABLE inventory_stock (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID REFERENCES inventory_items(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL,
    change_type TEXT, -- 'adjustment', 'order', 'return'
    reference_id UUID, -- order_id if related to order
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID REFERENCES auth.users(id)
);
```
