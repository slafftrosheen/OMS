# Reclame OMS - Deep System Analysis Report

**Generated:** 2025-12-11  
**System Version:** 1.0.1  
**Analysis Type:** Comprehensive Code Review

---

## 📊 Executive Summary

| Category | Status | Issues Found |
|----------|--------|--------------|
| Database | ⚠️ Partial | Missing tables, schema inconsistencies |
| Authentication | ⚠️ Mock Only | No real auth, hardcoded users |
| API Endpoints | ✅ Functional | Working but incomplete coverage |
| Data Stores | ⚠️ Mixed | Dual storage (localStorage + PostgreSQL) |
| Order Management | ⚠️ Deprecated | Many placeholder functions |
| Inventory | ⚠️ Mock | localStorage-only, no API integration |
| AI Integration | ⚠️ Unconfigured | API key placeholder |

---

## 🔴 Critical Issues

### 1. Authentication System (SECURITY RISK)

**Location:** `src/lib/auth/auth-utils.ts`

```typescript
// Mock user database for demonstration
const mockUsers: User[] = [
  { username: 'boss', passwordHash: 'mock-hash-boss', ... },
  { username: 'admin', passwordHash: 'mock-hash-admin', ... },
];

// Simple mock - accept any password for demo purposes
const user = mockUsers.find(u => u.username.toLowerCase() === username.toLowerCase());
```

**Issues:**
- ❌ Passwords not validated - ANY password works
- ❌ Hardcoded users in source code
- ❌ No session management
- ❌ No JWT/token authentication
- ❌ `passwordHash` field is fake (never used)

**Recommendation:**
1. Implement proper authentication with bcrypt password hashing
2. Add JWT token-based session management
3. Create `users` table in PostgreSQL
4. Add rate limiting for login attempts

---

### 2. Deprecated Order Store Functions

**Location:** `src/lib/order/signage-store.ts`

```typescript
// Placeholder functions to maintain compatibility during refactor
export function createOrder(seed: any) { console.warn('createOrder deprecated'); }
export function addRevision(orderId: string, file: any) { console.warn('addRevision deprecated'); }
export function setDefaultRevision(orderId: string, revId: string) { console.warn('setDefaultRevision deprecated'); }
export function openChangeRequest(orderId: string, payload: any) { console.warn('openChangeRequest deprecated'); }
export function approveChangeRequest(orderId: string, crId: string) { console.warn('approveChangeRequest deprecated'); }
export function declineChangeRequest(orderId: string, crId: string) { console.warn('declineChangeRequest deprecated'); }
export function setBadges(orderId: string, badges: Badge[]) { console.warn('setBadges deprecated'); }
export function addBadge(orderId: string, b: Badge) { console.warn('addBadge deprecated'); }
export function removeBadge(orderId: string, b: Badge) { console.warn('removeBadge deprecated'); }
export function setRedoSelection(orderId: string, stage: any, reason: string) { console.warn('setRedoSelection deprecated'); }
export function addRedoFlag(orderId: string, stage: any, reason: string) { console.warn('addRedoFlag deprecated'); return []; }
export function clearRedoFlag(orderId: string, stage: any) { console.warn('clearRedoFlag deprecated'); return []; }
export function setLoadingDate(orderId: string, date: string) { console.warn('setLoadingDate deprecated'); }
```

**Impact:**
- 14 core order management functions are non-functional
- Order editing, revisions, change requests don't work
- Badge management broken
- Rework tracking disabled

**Recommendation:**
Implement these functions with PostgreSQL API calls:
```typescript
export async function createOrder(seed: Partial<Order>): Promise<Order> {
  const response = await fetch('/api/draft-orders', {
    method: 'POST',
    body: JSON.stringify(seed)
  });
  return response.json();
}
```

---

### 3. Dual Data Storage Problem

**Issue:** The system uses BOTH localStorage AND PostgreSQL inconsistently.

| Feature | Storage | Problem |
|---------|---------|---------|
| Orders | PostgreSQL | ✅ OK |
| Inventory | localStorage | ❌ Not synced |
| Profiles | PostgreSQL | ✅ OK |
| User Prefs | localStorage | ⚠️ OK for prefs |
| Loading Days | localStorage | ❌ Should be DB |
| Movements | localStorage | ❌ Critical data lost on clear |

**Files Affected:**
- `src/lib/inventory/store.ts` - localStorage only
- `src/lib/inventory/inventory-store.ts` - localStorage only
- `src/lib/loading/loading-store.ts` - localStorage only

**Recommendation:**
Migrate all business data to PostgreSQL with API endpoints.

---

### 4. `getOrder()` Always Returns Null

**Location:** `src/lib/order/signage-store.ts:51`

```typescript
export function getOrder(id: string): Order | null {
  return null;  // Always returns null!
}
```

**Impact:** Order detail pages cannot fetch orders by ID.

**Fix:**
```typescript
export async function getOrder(id: string): Promise<Order | null> {
  const response = await fetch(`/api/draft-orders/${id}`);
  if (!response.ok) return null;
  return response.json();
}
```

---

## 🟡 Major Issues

### 5. Missing Database Tables

The migration files reference tables that may not exist or be consistent:

**Tables in migrations but schema unclear:**
- `template_versions` (referenced in API, not in 001_profiles_schema.sql)
- `profile_sections` vs `profile_section_fields` (naming confusion)
- `profile_fields` vs `profile_section_fields` (API uses both)

**Missing API endpoint for:**
- `/api/draft-orders/[id]` - GET single order
- `/api/draft-orders/[id]` - PUT/PATCH update order
- `/api/draft-orders/[id]` - DELETE order
- `/api/inventory/[id]` - CRUD operations

---

### 6. Qwen AI Not Configured

**Location:** `.env`
```
DASHSCOPE_API_KEY=your_qwen_api_key_here
```

**Impact:** All AI features will fail:
- Order analysis
- Profile suggestions
- FAQ answers
- Manufacturing instructions

---

### 7. Mock UI Elements

**Locations with mock alerts:**
```svelte
<!-- src/lib/topbar/UserSwitch.svelte -->
<a href="/reclame_OMS/settings">Profile (mock)</a>
<a href="/reclame_OMS/orders">My orders (mock)</a>
<button on:click={()=>alert('Mock: sign out')}>Sign out</button>

<!-- src/routes/orders/[id]/+page.svelte -->
<button on:click={()=>alert('Mock: revert form')}>Discard</button>
<button on:click={()=>alert('Mock: saved')}>Save</button>

<!-- src/lib/inventory/ScanBarcode.svelte -->
<h3>Scan barcode (mock)</h3>
```

---

### 8. Async/Sync Mismatch in loading-store.ts

**Location:** `src/lib/loading/loading-store.ts:76`

```typescript
export function usage(dateISO: string) {
  const matching = listOrders().filter(...)  // listOrders is now async!
}
```

**Problem:** `listOrders()` was changed to async but `usage()` still calls it synchronously.

---

## 🟢 Working Components

### Properly Implemented:
1. ✅ Database connection pool (`src/lib/server/db/connection.ts`)
2. ✅ Profile templates API (`/api/profiles/templates`)
3. ✅ Draft orders API basic CRUD
4. ✅ Inventory API structure
5. ✅ i18n translations (EN/RU/LV)
6. ✅ Theme/density/font preferences
7. ✅ Color systems (RAL, PANTONE, ORACAL)
8. ✅ PDF viewer component
9. ✅ Profile builder visual components

---

## 📁 File Statistics

| Directory | Files | Issues |
|-----------|-------|--------|
| src/lib | 210 | 45+ |
| src/routes | 42 | 12 |
| src/locales | 3 | 0 |
| Migrations | 5 | 2 |
| Seeds | 10 | 0 |

**Console warnings/errors in code:** 47 instances

---

## 🔧 Recommended Upgrades

### Phase 1: Critical (1-2 weeks)

1. **Fix Authentication**
   ```sql
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
   ```

2. **Implement Order CRUD API**
   - `GET /api/draft-orders/[id]`
   - `PUT /api/draft-orders/[id]`
   - `DELETE /api/draft-orders/[id]`

3. **Fix signage-store.ts**
   - Implement all deprecated functions
   - Make `getOrder()` functional

### Phase 2: Important (2-4 weeks)

4. **Migrate Inventory to PostgreSQL**
   - Create inventory API endpoints
   - Migrate localStorage data
   - Add stock movement tracking

5. **Migrate Loading Calendar to PostgreSQL**
   - Create `loading_days` table
   - Create API endpoints

6. **Configure Qwen AI**
   - Add valid API key
   - Test all AI endpoints

### Phase 3: Improvements (4-8 weeks)

7. **Add Real Barcode Scanner**
   - Integrate Web Barcode Detection API
   - Or use quagga2 library

8. **Implement File Upload**
   - CDR file storage
   - PDF storage
   - S3/MinIO integration

9. **Add WebSocket for Real-time**
   - Order status updates
   - Chat functionality
   - Inventory alerts

---

## 🗄️ Database Schema Recommendations

### New Tables Needed:

```sql
-- User sessions
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id INTEGER REFERENCES users(id),
  token VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Loading calendar
CREATE TABLE loading_days (
  id SERIAL PRIMARY KEY,
  date DATE UNIQUE NOT NULL,
  carrier VARCHAR(100),
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Inventory movements (if not exists)
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

-- Audit log
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

## 🧪 Testing Gaps

**No test files found for:**
- API endpoints
- Database operations
- Authentication flows
- Profile validation

**Existing tests:**
- `src/lib/auth/audit-log.test.js`
- `src/lib/order/material-integration.test.js`
- `src/lib/inventory/inventory-store.test.js`

**Recommendation:** Add Jest/Vitest tests for all API routes.

---

## 📋 Action Items Summary

| Priority | Task | Effort | Impact |
|----------|------|--------|--------|
| P0 | Fix auth system | 3 days | Security |
| P0 | Implement order API | 2 days | Core function |
| P0 | Fix getOrder() | 1 hour | Core function |
| P1 | Migrate inventory | 5 days | Data integrity |
| P1 | Configure AI | 1 hour | Features |
| P1 | Fix loading-store async | 2 hours | Bug fix |
| P2 | Add file upload | 3 days | Features |
| P2 | Real barcode scanner | 2 days | UX |
| P3 | WebSocket integration | 5 days | Real-time |
| P3 | Add comprehensive tests | 1 week | Quality |

---

## 📞 Contact

For questions about this analysis, refer to:
- `ARCHITECTURE.md` - System design
- `DEPLOYMENT_GUIDE.md` - Deployment instructions
- `SECURITY.md` - Security considerations

---

*This analysis was generated by automated code review. Manual verification recommended.*
