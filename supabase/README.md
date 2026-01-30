# Supabase Database Structure

## Migrations

Migrations run in timestamp order. Current sequence:

1. **20231201000000** - Initial schema (profiles, orders, files, etc.)
2. **20231201000001-14** - Core features (inventory, chat, calendar, capacity)
3. **20260117000000-04** - Security & auth fixes
4. **20260120000002-05** - Materials & performance
5. **20260122000000** - Security enhancements
6. **20260123** - Order presets
7. **20260128** - Chat realtime

## Seeds

Material catalogs and reference data. Run manually as needed:

```bash
# Core materials
psql $DATABASE_URL -f seeds/01_ral_colors.sql
psql $DATABASE_URL -f seeds/02_plastics.sql
# ... etc
```

## Development

```bash
# Reset database
supabase db reset

# Create new migration
supabase migration new my_feature

# Apply migrations
supabase db push
```
