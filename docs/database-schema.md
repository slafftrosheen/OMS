# Database Schema

Complete reference for the PostgreSQL database schema.

## Schema Overview

The system uses **Supabase** for the database layer. Authentication is handled by Supabase Auth (`auth.users`), which maps to a public `profiles` table for application-specific user data. All primary keys use `UUID`s.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CORE ENTITIES                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                 │
│  │ auth.users   │───▶│   profiles   │    │  materials   │                 │
│  └──────────────┘    ├──────────────┤    ├──────────────┤                 │
│                      │ id (UUID)    │    │ id (UUID)    │                 │
│                      │ username     │    │ code         │                 │
│                      │ roles (JSON) │    │ category     │                 │
│                      │ stations[]   │    │ thickness    │                 │
│                      └──────────────┘    └──────────────┘                 │
│                             ▲                   ▲                         │
│                             │                   │                         │
│                      ┌──────────────┐           │                         │
│                      │ draft_orders │           │                         │
│                      ├──────────────┤           │                         │
│                      │ id (UUID)    │           │                         │
│                      │ created_by   │───────────┘                         │
│                      │ po_number    │                                     │
│                      └──────────────┘                                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Core Tables

### profiles
Extends Supabase Auth users with application-specific data.

| Column | Type | Description |
|---|---|---|
| `id` | UUID | Primary key (References `auth.users.id`) |
| `username` | TEXT | Unique login identifier |
| `display_name` | TEXT | Full name for display |
| `primary_section` | TEXT | Default section: Admin, Production, Logistics |
| `sections` | TEXT[] | Accessible sections array |
| `roles` | JSONB | Role per section: `{section: role}` |
| `stations` | TEXT[] | Assigned stations: CNC, SANDING, etc. |
| `is_active` | BOOLEAN | Account active status |
| `last_login_at` | TIMESTAMPTZ | Timestamp of the last login |
| `created_at` | TIMESTAMPTZ | Timestamp of profile creation |
| `updated_at` | TIMESTAMPTZ | Timestamp of the last update |
| `metadata` | JSONB | Additional user metadata |

### draft_orders
Manufacturing orders.

| Column | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `po_number` | TEXT | Unique PO Number (e.g., PO-1234) |
| `client` | TEXT | Client name |
| `title` | TEXT | Order title/description |
| `due_date` | DATE | Expected completion date |
| `loading_date` | DATE | Assigned loading date |
| `status` | TEXT | `draft`, `pending`, `approved`, `in_production`, `completed` |
| `created_by` | UUID | References `auth.users` |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `priority` | TEXT | `NORMAL`, `URGENT` |

### materials
Material library for manufacturing.

| Column | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `category` | TEXT | Material category (ALU, PVC, etc.) |
| `code` | TEXT | Unique material code |
| `name_en` | TEXT | English name |
| `thickness_options` | JSONB | Array of available thicknesses |

## Security & RLS

Row-Level Security (RLS) is enabled on **all public tables**.

- **Read Access**: Authenticated users can read data.
- **Write Access**: Restricted to authenticated users (often refined by role in application logic, enforced by RLS policies where applicable).
- **Public Access**: None. All API access requires a valid Supabase session.

## Migrations

Migrations are managed via the Supabase CLI in `supabase/migrations/`.

- `20231201000000_init_schema.sql`: Core tables (profiles, draft_orders).
- `20260117000000_enable_rls.sql`: Comprehensive security hardening (RLS enable + policies).