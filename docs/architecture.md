# System Architecture

## Overview

Reclame OMS follows a modern full-stack architecture with SvelteKit providing both the frontend framework and API layer, backed by **Supabase** for the database, authentication, and storage.

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
│  │ API Routes  │  │   Supabase  │  │    SSR      │             │
│  │ /api/*      │  │   Client    │  │  Rendering  │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Supabase Client
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                           Supabase                              │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ Postgres │  │   Auth   │  │ Storage  │  │   APIs   │       │
│  │ RLS      │  │ (JWT)    │  │ (Files)  │  │ (REST)   │       │
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
├── auth/           # Authentication (handled by Supabase)
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
3. Handler uses Supabase client to interact with the database
4. Session is validated by Supabase client and RLS policies
5. Response returned as JSON
```

### 3. Data Layer (Database)

**Technology**: Supabase

- **Database**: Managed PostgreSQL with Row-Level Security (RLS).
- **Authentication**: Supabase Auth handles user authentication and session management via JWTs.
- **Storage**: Supabase Storage for file uploads and management.
- **API**: Auto-generated RESTful API, though we primarily use the Supabase client library.

## Data Flow Patterns

### Authentication Flow

```
┌────────┐     ┌──────────────┐     ┌────────┐
│ Client │────▶│ Supabase Auth│────▶│  JWT   │
│ Login  │     │ (Sign In)    │     │ Session│
└────────┘     └──────────────┘     └────────┘
    │                                   │
    └───────────────────────────────────┘
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

- **Method**: Supabase Auth (JWT-based with server-side helpers)
- **Session Management**: Handled by `@supabase/auth-helpers-sveltekit`.

### Authorization

- **Method**: PostgreSQL Row-Level Security (RLS)
- **Policies**: Defined in `supabase/migrations/` to control access to tables and rows based on user roles and permissions.

### Audit Logging

All sensitive operations are logged to the `audit_log` table via Supabase functions or triggers.

## Scalability Considerations

### Database

- Managed by Supabase, including connection pooling, indexing, and scaling.
- JSONB for flexible metadata storage.

### Caching Strategy

| Data Type | Cache Location | TTL |
|-----------|---------------|-----|
| User preferences | localStorage + DB | Permanent |
| Session | Supabase Auth | Configurable |
| UI state | localStorage | Permanent |
| Calendar events | Memory (store) | Per-session |

### Future Considerations

- [ ] Real-time updates with Supabase Realtime
- [ ] CDN for static assets (managed by hosting provider)
- [ ] Edge functions for performance-critical operations
