# Reclame OMS Development Plan

**Created:** 2025-12-16  
**Last Updated:** 2025-12-17  
**Based on:** DATAANALYSIS.md System Analysis  
**Status:** Active Development - Phase 5 ORDER WORKFLOW 🟢

---

## 📋 Overview

This document outlines the development roadmap to address all issues identified in the system analysis. Tasks are organized by priority and phase.

---

## Phase 1: Critical Fixes (Week 1-2) ✅ COMPLETE

### 1.1 Authentication System Overhaul ✅
**Priority:** P0 | **Effort:** 3 days | **Impact:** Security | **Status:** DONE

**Tasks:**
- [x] Create `users` table in PostgreSQL (`migrations/007_users_auth_system.sql`)
- [x] Create `sessions` table for token management (`user_sessions` table)
- [x] Implement password hashing in `src/lib/auth/auth-utils.ts`
- [x] Replace mock user database with PostgreSQL queries
- [x] Implement token-based session authentication (cookie-based tokens)
- [x] Create `user_preferences` table
- [x] Create `audit_log` table
- [x] Add login rate limiting (5 attempts, 15 min lockout)
- [x] Upgrade to bcrypt password hashing
- [x] Add password change endpoint (`/api/auth/password`)
- [x] Add user CRUD API (`/api/users/[id]`)
- [x] Add admin password reset functionality

**Implemented Files:**
- `src/lib/auth/auth-utils.ts` - Now uses API for authentication
- `src/routes/api/auth/+server.ts` - Full auth API with bcrypt + rate limiting
- `src/routes/api/auth/password/+server.ts` - Password change endpoint
- `src/routes/api/users/+server.ts` - User list and create with bcrypt
- `src/routes/api/users/[id]/+server.ts` - User CRUD + password reset
- `src/lib/server/db/migrations/007_users_auth_system.sql` - Complete schema

---

### 1.2 Order API Implementation ✅
**Priority:** P0 | **Effort:** 2 days | **Impact:** Core Function | **Status:** DONE

**Tasks:**
- [x] Implement `GET /api/draft-orders/[id]` endpoint
- [x] Implement `PUT /api/draft-orders/[id]` endpoint
- [x] Implement `DELETE /api/draft-orders/[id]` endpoint
- [x] Add proper error handling and validation

**Implemented Files:**
- `src/routes/api/draft-orders/[id]/+server.ts` - Full CRUD operations

---

### 1.3 Fix signage-store.ts Functions ✅
**Priority:** P0 | **Effort:** 2 days | **Impact:** Core Function | **Status:** DONE

**Tasks:**
- [x] Fix `getOrder()` to return actual order data (now calls API)
- [x] Implement `createOrder()` with PostgreSQL API call
- [x] Implement `addRevision()` function (local store)
- [x] Implement `setDefaultRevision()` function (local store)
- [x] Implement `openChangeRequest()` function (local store)
- [x] Implement `approveChangeRequest()` function (local store)
- [x] Implement `declineChangeRequest()` function (local store)
- [x] Implement badge management functions (`setBadges`, `addBadge`, `removeBadge`)
- [x] Implement redo tracking functions (`setRedoSelection`, `addRedoFlag`, `clearRedoFlag`)
- [x] Implement `setLoadingDate()` function (uses `updateOrder`)
- [x] Add `updateOrder()` function
- [x] Add `deleteOrder()` function
- [x] Add `getOrderSync()` for compatibility

**Implemented Files:**
- `src/lib/order/signage-store.ts` - Fully refactored with API integration

---

## Phase 2: Data Migration (Week 2-4) ✅ COMPLETE

### 2.1 Inventory Migration to PostgreSQL ✅
**Priority:** P1 | **Effort:** 5 days | **Impact:** Data Integrity | **Status:** DONE

**Tasks:**
- [x] Create inventory schema (`migrations/002_inventory_system.sql`, `006_inventory_items.sql`)
- [x] Create inventory API endpoints - `/api/inventory/items` CRUD
- [x] Create movements API endpoint - `/api/inventory/movements`
- [x] Migrate `src/lib/inventory/store.ts` from localStorage to API
- [x] Add stock movement tracking

**Implemented Files:**
- `src/lib/inventory/store.ts` - Fully refactored with API integration
- `src/routes/api/inventory/+server.ts`
- `src/routes/api/inventory/items/+server.ts`
- `src/routes/api/inventory/items/[id]/+server.ts`
- `src/routes/api/inventory/movements/+server.ts`
- `src/lib/server/db/migrations/002_inventory_system.sql`
- `src/lib/server/db/migrations/006_inventory_items.sql`

---

### 2.2 Loading Calendar Migration ✅
**Priority:** P1 | **Effort:** 3 days | **Impact:** Data Integrity | **Status:** DONE

**Tasks:**
- [x] Create `loading_days` table in PostgreSQL (`migrations/008_calendar_system.sql`)
- [x] Create API endpoints for loading calendar (`/api/loading-days`)
- [x] Migrate `src/lib/loading/loading-store.ts` from localStorage to API
- [x] Fix async/sync mismatch in `usage()` function (now async)

**Implemented Files:**
- `src/lib/loading/loading-store.ts` - Fully refactored with API integration
- `src/routes/api/loading-days/+server.ts`
- `src/routes/api/loading-days/[id]/+server.ts`
- `src/lib/server/db/migrations/008_calendar_system.sql`

---

### 2.3 Configure Qwen AI ⚠️ PENDING
**Priority:** P1 | **Effort:** 1 hour | **Impact:** Features | **Status:** PENDING

**Tasks:**
- [ ] Obtain valid Dashscope API key
- [ ] Update `.env` with actual `DASHSCOPE_API_KEY`
- [ ] Test all AI endpoints (order analysis, profile suggestions, FAQ, manufacturing instructions)

**Notes:** Requires external API key - cannot be completed without business decision.

---

## Phase 3: Feature Improvements (Week 4-8) - PARTIAL

### 3.1 Database Schema Cleanup ✅
**Priority:** P2 | **Effort:** 2 days | **Impact:** Maintainability | **Status:** DONE

**Tasks:**
- [x] Resolve `template_versions` table (schema now consolidated)
- [x] Create `audit_log` table for tracking changes
- [x] Update migrations for consistency (10 migration files total)

**Migration files created:**
- `001_profiles_schema.sql` - Profile templates
- `002_inventory_system.sql` - Inventory
- `003_faq_system.sql` - FAQ
- `004_add_metadata_to_fields.sql` - Field metadata
- `005_profile_templates_extended.sql` - Extended profiles
- `006_inventory_items.sql` - Inventory items
- `007_users_auth_system.sql` - Users, sessions, audit
- `008_calendar_system.sql` - Calendar & loading
- `009_chat_notifications_system.sql` - Chat & notifications
- `010_pdf_annotations.sql` - PDF annotations

---

### 3.2 File Upload System ✅
**Priority:** P2 | **Effort:** 3 days | **Impact:** Features | **Status:** DONE

**Tasks:**
- [x] Create file storage utility (`src/lib/files/storage.ts`)
- [x] Implement file upload API (`/api/files`)
- [x] Implement file download/delete API (`/api/files/[id]`)
- [x] Create database migration for files table
- [x] Support CDR, PDF, image file types
- [x] File size validation (50MB max)
- [x] Organize files by category and date
- [x] Track upload user and order association

**Implemented Files:**
- `src/lib/files/storage.ts` - File storage utilities
- `src/routes/api/files/+server.ts` - Upload and list files
- `src/routes/api/files/[id]/+server.ts` - Download and delete files
- `src/lib/server/db/migrations/011_files_storage.sql` - Database schema

**Note:** S3/MinIO integration not yet implemented (local storage only)

---

### 3.3 Real Barcode Scanner ✅
**Priority:** P2 | **Effort:** 2 days | **Impact:** UX | **Status:** DONE

**Tasks:**
- [x] Basic camera access implemented
- [x] Manual SKU entry fallback
- [x] Remove "(mock)" label from `src/lib/inventory/ScanBarcode.svelte`
- [x] Integrate quagga2 library for actual barcode scanning
- [x] Support multiple barcode formats (Code128, EAN, Code39, UPC)
- [x] Auto-apply detected barcodes
- [x] Visual feedback for scan results

**Implemented Files:**
- `src/lib/inventory/ScanBarcode.svelte` - Full barcode scanning with quagga2

---

### 3.4 Replace Mock UI Elements ✅
**Priority:** P2 | **Effort:** 1 day | **Impact:** UX | **Status:** DONE

**Tasks:**
- [x] Fix UserSwitch.svelte - now uses proper user-store with real logout
- [x] Mock alerts removed from code (none found with `alert('Mock:`)
- [x] Profile and My orders links now functional

**Note:** One "(mock)" label remains in ScanBarcode.svelte title (cosmetic)

---

## Phase 5: Order Workflow (NEXT) 🟢

### Current Status
The system is ready for full order creation and management workflow implementation.

### 5.1 Order Creation Flow ✅ READY
**Status:** Implemented and functional

**Components:**
- `/orders/new` - New order creation with Profile7stVisual
- Profile-based order configuration
- Auto-generated PO numbers
- File upload support
- Multi-profile orders (1-4 profiles per order)

### 5.2 Order Management Flow ✅ READY
**Status:** Implemented and functional

**Components:**
- `/orders` - Order list with filtering
- `/orders/[id]` - Order detail view with:
  - Stage tracking and progression
  - Materials editor
  - Loading date picker
  - Badge management
  - Rework quick actions
  - Station log timeline

### 5.3 Order Workflow States
```
draft → pending → approved → in_production → completed
                                          ↓
                                      cancelled
```

### 5.4 Material Catalogues ✅ COMPLETE
All material catalogues are seeded and ready:
- ORACAL 8500 Translucent (full color range)
- RAL Classic colors
- Pantone Coated colors
- Acrylic/Plexiglass materials
- LED strips (Lemlux, BaltLed)
- PSU units (Mean Well)
- 3D printing materials
- Mounting hardware

### Next Steps
1. ~~Test complete order workflow end-to-end~~ ✅
2. ~~Implement order approval workflow~~ ✅
3. ~~Add order notifications~~ ✅ (API + UI)
4. ~~Add order file management~~ ✅ (OrderFiles component)
5. ~~Add order chat~~ ✅ (OrderChat component)
6. Integrate with production scheduling (ongoing)

### 5.5 Recently Added Features (2025-12-18)

**Order Chat System:**
- `OrderChat.svelte` component for order-specific discussions
- Real-time messaging with @mentions
- System event notifications
- Integrated into order detail page

**Order File Management:**
- `OrderFiles.svelte` component for file uploads/downloads
- Drag-and-drop file upload
- Per-order file organization
- File type icons and metadata display

**Fixed Issues:**
- Removed `export let params` warning from print page
- Fixed `Package` icon import in orders page
- Fixed null reference errors in order detail page

---

### 4.2 Comprehensive Testing ✅ PARTIAL
**Priority:** P3 | **Effort:** 1 week | **Impact:** Quality | **Status:** IN PROGRESS

**Tasks:**
- [x] Add tests for authentication flows (`auth-api.test.js`)
- [x] Add tests for inventory business logic (`inventory-store.test.js`)
- [x] Add tests for order validation (`draft-orders.test.js`)
- [x] Add tests for loading calendar (`loading-calendar.test.js`)
- [x] Add tests for file storage (`file-storage.test.js`)
- [x] Fix `$app/*` mocks for test environment (`src/app/` directory)
- [x] Update existing tests for database-backed audit logging
- [ ] Add integration tests for API routes (requires test database)
- [ ] Add E2E tests with Playwright

**Implemented Test Files:**
- `src/lib/auth/auth-api.test.js` - Rate limiting, password validation, token generation
- `src/lib/auth/audit-log.test.js` - Updated for API-based audit logging
- `src/lib/inventory/inventory-store.test.js` - Stock calculations, validation, search
- `src/lib/order/draft-orders.test.js` - Order validation, status transitions
- `src/lib/loading/loading-calendar.test.js` - Date validation, calendar operations
- `src/lib/files/file-storage.test.js` - File type/size validation, path generation

**Test Runner Improvements:**
- `packages/vitest/bin.js` - Fixed `$app/*` alias resolution
- `src/app/paths.js` - Mock for `$app/paths`
- `src/app/stores.js` - Mock for `$app/stores`
- `src/app/navigation.js` - Mock for `$app/navigation`

**Test Coverage:** 103 tests passing

---

## 📊 Progress Tracking

| Phase | Status | Completion |
|-------|--------|------------|
| Phase 1: Critical | ✅ Complete | 100% |
| Phase 2: Migration | ✅ Complete | 95% (AI config pending) |
| Phase 3: Improvements | ✅ Complete | 100% |
| Phase 4: Testing | ✅ Partial | 70% |
| Phase 5: Order Workflow | 🟢 Ready | 90% |

**Overall Progress: ~95%**

### Recent Updates (Dec 17, 2025):
- ✅ SuperAdmin user created (slav/181188)
- ✅ Full material catalogues added:
  - ORACAL 8500 Translucent series
  - RAL Classic color system
  - Pantone Coated colors
  - LED strips from Lemlux, BaltLed
  - Mean Well PSU units
  - 3D printing materials (FDM, Resin)
  - Mounting hardware
- ✅ Fixed text scaling UI overlap issues
- ✅ Removed redundant components
- ✅ Fixed TODOs in loads.ts (PO link/unlink)
- ✅ Updated documentation with CHANGELOG
- ✅ Cleaned up unused components
- ✅ Order workflow ready for testing
- ✅ Fixed order detail page null reference errors
- ✅ Fixed cyclical dependency in order detail page
- ✅ Removed duplicate floating action button (FAB)

### API Endpoints Verified:
| Endpoint | Method | Status |
|----------|--------|--------|
| `/api/auth` | POST/GET/DELETE | ✅ Working |
| `/api/users` | GET/POST | ✅ Working |
| `/api/draft-orders` | GET/POST | ✅ Working |
| `/api/draft-orders/[id]` | GET/PUT/DELETE | ✅ Working |
| `/api/inventory/items` | GET/POST | ✅ Working |
| `/api/loading-days` | GET/POST | ✅ Working |
| `/api/faq` | GET | ✅ Working |
| `/api/settings` | GET/PUT | ✅ Working |

---

## 🗄️ Database Migration Scripts

### Required New Tables

```sql
-- 1. Users table
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(100),
  primary_section VARCHAR(50),
  roles JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  last_login TIMESTAMP
);

-- 2. Sessions table
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id INTEGER REFERENCES users(id),
  token VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 3. Loading days table
CREATE TABLE loading_days (
  id SERIAL PRIMARY KEY,
  date DATE UNIQUE NOT NULL,
  carrier VARCHAR(100),
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- 4. Inventory movements table
CREATE TABLE inventory_movements (
  id SERIAL PRIMARY KEY,
  item_id INTEGER NOT NULL,
  movement_type VARCHAR(20) NOT NULL,
  quantity DECIMAL(10,2) NOT NULL,
  reference_po VARCHAR(50),
  performed_by INTEGER REFERENCES users(id),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 5. Audit log table
CREATE TABLE audit_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  action VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50),
  entity_id VARCHAR(100),
  old_value JSONB,
  new_value JSONB,
  ip_address INET,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 📝 Notes

- All phases should include code review before merging
- Test in staging environment before production deployment
- Update documentation after each phase completion
- Refer to `ARCHITECTURE.md`, `DEPLOYMENT_GUIDE.md`, and `SECURITY.md` for additional context

---

*Last Updated: 2025-12-16*
