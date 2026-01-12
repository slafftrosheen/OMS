# System Architecture

## Overview

Reclame OMS follows a modern full-stack architecture with SvelteKit providing both the frontend framework and API layer, backed by PostgreSQL for persistent storage.

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Browser                          │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   Svelte    │  │   Stores    │  │    i18n     │             │
│  │ Components  │  │  (Reactive) │  │ (EN/RU/LV)  │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP/REST
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      SvelteKit Server                           │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │ API Routes  │  │   Session   │  │    SSR      │             │
│  │ /api/*      │  │  Management │  │  Rendering  │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ pg (node-postgres)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       PostgreSQL                                │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │  Users   │  │  Orders  │  │ Inventory│  │ Calendar │       │
│  │ Sessions │  │ Profiles │  │ Materials│  │  Events  │       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

## Layer Descriptions

### 1. Presentation Layer (Client)

**Technology**: Svelte 5, TypeScript

- **Components**: Reusable UI components in `src/lib/`
- **Stores**: Reactive state management with Svelte stores
- **Routing**: File-based routing via SvelteKit
- **Styling**: CSS custom properties with theme support

#### Key Stores

| Store | Location | Purpose |
|-------|----------|---------|
| `user-store` | `src/lib/users/` | Current user, authentication |
| `calEvents` | `src/lib/calendar/` | Calendar events |
| `chat-store` | `src/lib/chat/` | Chat rooms and messages |
| `theme` | `src/lib/stores/` | UI theme preference |

### 2. API Layer (Server)

**Technology**: SvelteKit API Routes

All API endpoints are in `src/routes/api/` and follow REST conventions:

```
/api/
├── auth/           # Authentication
├── users/          # User management
├── preferences/    # User preferences
├── draft-orders/   # Order management
├── inventory/      # Inventory operations
├── calendar/       # Calendar events
├── chat/           # Chat system
├── notifications/  # User notifications
└── audit-log/      # Audit trail
```

#### Request Flow

```
1. Client makes HTTP request
2. SvelteKit routes to +server.ts handler
3. Handler validates session (if protected)
4. Handler executes database query
5. Response returned as JSON
```

### 3. Data Layer (Database)

**Technology**: PostgreSQL 14+

#### Connection Pool

```typescript
// src/lib/server/db/connection.ts
const pool = new Pool({
  host: env.DB_HOST,
  port: parseInt(env.DB_PORT),
  database: env.DB_NAME,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  max: 20,                    // Maximum pool size
  idleTimeoutMillis: 30000,   // Close idle connections
  connectionTimeoutMillis: 2000
});
```

#### Transaction Support

```typescript
import { transaction } from '$lib/server/db/connection';

await transaction(async (client) => {
  await client.query('INSERT INTO orders ...');
  await client.query('INSERT INTO order_items ...');
  // Auto-commits on success, rollback on error
});
```

## Data Flow Patterns

### Authentication Flow

```
┌────────┐     ┌────────┐     ┌────────┐     ┌────────┐
│ Client │────▶│ /api/  │────▶│ Verify │────▶│ Create │
│ Login  │     │ auth   │     │ Password│    │ Session│
└────────┘     └────────┘     └────────┘     └────────┘
                                                  │
                                                  ▼
┌────────┐     ┌────────┐     ┌────────┐     ┌────────┐
│ Client │◀────│ Set    │◀────│ Generate│◀───│ Store  │
│ Cookie │     │ Cookie │     │ Token  │     │ in DB  │
└────────┘     └────────┘     └────────┘     └────────┘
```

### Data Synchronization Pattern

Stores use a hybrid approach for optimal UX:

1. **Instant Load**: Read from localStorage cache
2. **Background Sync**: Fetch from server API
3. **Update Cache**: Store response in localStorage
4. **Debounced Write**: Sync changes to server

```typescript
// Example: Theme store
const stored = localStorage.getItem('rf_theme');  // 1. Instant
theme.set(stored);

fetch('/api/preferences')                          // 2. Background
  .then(res => res.json())
  .then(prefs => {
    theme.set(prefs.theme);                       // 3. Update
    localStorage.setItem('rf_theme', prefs.theme);
  });

theme.subscribe(value => {
  localStorage.setItem('rf_theme', value);        // Cache
  debounce(() => syncToServer(value), 500);       // 4. Debounced
});
```

## Security Architecture

### Authentication

- **Method**: Session-based with HTTP-only cookies
- **Token Storage**: SHA-256 hashed in database
- **Session Duration**: 7 days (configurable)
- **CSRF Protection**: SameSite cookie attribute

### Authorization

Role-based access control with per-section permissions:

```typescript
type Role = 'SuperAdmin' | 'StationLead' | 'Operator' | 'Viewer';
type Section = 'Admin' | 'Production' | 'Logistics';

interface User {
  roles: Record<Section, Role>;
}
```

### Audit Logging

All sensitive operations are logged:

```sql
INSERT INTO audit_log (user_id, action, entity_type, entity_id)
VALUES ($1, 'UPDATE_ORDER', 'order', $2);
```

## Scalability Considerations

### Database

- Connection pooling (max 20 connections)
- Indexed queries for common operations
- JSONB for flexible metadata storage

### Caching Strategy

| Data Type | Cache Location | TTL |
|-----------|---------------|-----|
| User preferences | localStorage + DB | Permanent |
| Session | HTTP-only cookie | 7 days |
| UI state | localStorage | Permanent |
| Calendar events | Memory (store) | Per-session |

### Future Considerations

- [ ] Redis for session storage (horizontal scaling)
- [ ] WebSocket for real-time updates
- [ ] CDN for static assets
- [ ] Read replicas for reporting queries
