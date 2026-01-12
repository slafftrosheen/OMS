# Reclame OMS - Agent Future Directions

**Created:** 2025-12-16  
**Last Updated:** 2025-12-16  
**Purpose:** Guidance document for AI agents working on this codebase  
**Status:** Living Document

---

## 🎯 Project Context

Reclame OMS is an Order Management System for signage/advertising production. The system handles:
- Order creation and workflow management
- Profile templates for product specifications
- Inventory management
- Loading/shipping calendar
- Multi-language support (EN/RU/LV)

---

## ✅ Current State (December 2025)

**Most critical issues from DATAANALYSIS.md have been resolved:**

### What's Fixed:
1. **Authentication** - PostgreSQL-backed with bcrypt, sessions, rate limiting, audit logging
2. **Order API** - Full CRUD operations via `/api/draft-orders`
3. **signage-store.ts** - All functions implemented (API + local store)
4. **Inventory** - Migrated to PostgreSQL with API endpoints
5. **Loading Calendar** - Migrated to PostgreSQL with API endpoints
6. **Database Schema** - 11 migration files, comprehensive schema
7. **Barcode Scanner** - Real scanning with quagga2 library
8. **User Management** - Full CRUD API with password reset
9. **File Upload** - CDR/PDF/image upload with local storage

### What Remains:
1. **Qwen AI Configuration** - Needs valid API key in `.env`
2. **WebSocket Integration** - Schema ready, not implemented
3. **Comprehensive Testing** - Limited test coverage

---

## 🚨 Remaining Issues to Address

### 1. AI Integration (P1 - Quick Win)
**Location:** `.env`

```
DASHSCOPE_API_KEY=your_qwen_api_key_here
```

Just needs a valid API key to enable all AI features.

### 2. WebSocket Integration (P3 - Real-time)
**Not implemented** - Schema exists in `009_chat_notifications_system.sql`

### 3. S3/MinIO Storage (P3 - Optional)
**Not implemented** - File upload works with local storage. S3 integration optional.

---

## 🏗️ Architecture Overview

```
src/
├── lib/                    # Shared libraries
│   ├── auth/              # Authentication (✅ PostgreSQL-backed)
│   ├── inventory/         # Inventory management (✅ PostgreSQL-backed)
│   ├── loading/           # Loading calendar (✅ PostgreSQL-backed)
│   ├── order/             # Order management (✅ API-integrated)
│   ├── profile-builder/   # Profile templates (✅ working)
│   ├── server/db/         # Database connection (✅ working)
│   │   └── migrations/    # 10 SQL migration files
│   └── topbar/            # UI components (✅ working)
├── routes/
│   ├── api/               # API endpoints
│   │   ├── auth/          # Auth API (✅ full CRUD)
│   │   ├── draft-orders/  # Order API (✅ full CRUD)
│   │   ├── inventory/     # Inventory API (✅ full CRUD)
│   │   ├── loading-days/  # Loading API (✅ full CRUD)
│   │   └── profiles/      # Profile API (✅ working)
│   └── [pages]/           # SvelteKit pages
└── locales/               # i18n translations (✅ working)
```

---

## 📋 Development Guidelines for Agents

### When Adding New Features

1. **Use existing patterns**
   - API routes: `src/routes/api/[resource]/+server.ts`
   - Stores: `src/lib/[feature]/[feature]-store.ts`
   - Use existing database connection: `src/lib/server/db/connection.ts`

2. **All business data goes to PostgreSQL**
   - localStorage is only for client preferences (theme, density, etc.)
   - Create proper migrations for new tables in `src/lib/server/db/migrations/`

3. **Check existing implementation first**
   - Most core features are now implemented
   - Look for existing API endpoints before creating new ones

### When Fixing Bugs

1. **Check API layer first**
   - Most data operations go through `/api/` endpoints
   - Store functions call these APIs

2. **Test with real data**
   - Database is the source of truth
   - Local stores cache API responses

---

## ✅ Working Components (Don't Break These)

All major components are now working:

1. **Authentication** - `src/routes/api/auth/+server.ts` + `src/lib/auth/auth-utils.ts`
2. **Order Management** - `src/lib/order/signage-store.ts` + `/api/draft-orders`
3. **Inventory System** - `src/lib/inventory/store.ts` + `/api/inventory`
4. **Loading Calendar** - `src/lib/loading/loading-store.ts` + `/api/loading-days`
5. **Profile Templates** - `/api/profiles/templates`
6. **Database Connection** - `src/lib/server/db/connection.ts`
7. **i18n Translations** - `src/locales/` (EN/RU/LV)
8. **Theme/Density/Font Preferences**
9. **Color Systems** - RAL, PANTONE, ORACAL
10. **PDF Viewer Component**
11. **Profile Builder Visual Components**

---

## 🔮 Future Development Priorities

### Short Term (Next Sprint)

1. **Configure AI Integration** (1 hour)
   - Get valid Dashscope API key
   - Update `.env`

2. **Upgrade Password Hashing** (2 hours)
   - Install bcrypt: `npm install bcrypt @types/bcrypt`
   - Update auth API to use bcrypt

3. **Add Login Rate Limiting** (2 hours)
   - Implement in auth API

### Medium Term (1-2 Months)

1. **File Upload System** (3 days)
   - CDR/PDF storage
   - S3/MinIO integration

2. **Barcode Scanner** (1 day)
   - Add quagga2 library
   - Implement actual barcode decoding

### Long Term (3+ Months)

1. **WebSocket Integration** (5 days)
   - Real-time order updates
   - Schema already in `009_chat_notifications_system.sql`

2. **Comprehensive Testing** (1 week)
   - API tests
   - Integration tests

---

## 🔧 Common Tasks

### Adding a New API Endpoint

```typescript
// src/routes/api/[resource]/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query, transaction } from '$lib/server/db/connection';

export const GET: RequestHandler = async ({ params }) => {
  const result = await query('SELECT * FROM table WHERE id = $1', [params.id]);
  if (result.rows.length === 0) throw error(404, 'Not found');
  return json(result.rows[0]);
};
```

### Adding a New Migration

Create file in `src/lib/server/db/migrations/` following naming convention:
```
011_your_feature.sql
```

### Adding a New Translation

1. Add key to `src/locales/en.json`
2. Add translations to `src/locales/ru.json` and `src/locales/lv.json`
3. Use with `$t('key.path')` in Svelte components

---

## 📁 Key Files Reference

| Purpose | File |
|---------|------|
| Auth API | `src/routes/api/auth/+server.ts` |
| Auth utilities | `src/lib/auth/auth-utils.ts` |
| Order store | `src/lib/order/signage-store.ts` |
| Order API | `src/routes/api/draft-orders/+server.ts` |
| Inventory store | `src/lib/inventory/store.ts` |
| Inventory API | `src/routes/api/inventory/` |
| Loading store | `src/lib/loading/loading-store.ts` |
| Loading API | `src/routes/api/loading-days/` |
| DB connection | `src/lib/server/db/connection.ts` |
| Migrations | `src/lib/server/db/migrations/` |
| System analysis | `DATAANALYSIS.md` |
| Development plan | `dev_plan.md` |

---

## ⚠️ Known Gotchas

1. **Placeholder password hashes** - Default seeded users have `$2b$10$placeholder` hashes that accept any password (for dev). New users get proper bcrypt hashes.
2. **AI features require API key** - Check `.env` for `DASHSCOPE_API_KEY`

---

## 📞 Reference Documents

- `DATAANALYSIS.md` - Original system analysis
- `dev_plan.md` - Detailed development plan with progress
- `ARCHITECTURE.md` - System architecture documentation
- `DEPLOYMENT_GUIDE.md` - Deployment instructions
- `SECURITY.md` - Security considerations

---

*This document should be updated as issues are resolved and new directions emerge.*

*Last Updated: 2025-12-16*
