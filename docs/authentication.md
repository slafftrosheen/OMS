# Authentication & Authorization

Security model for Reclame OMS.

## Overview

Reclame OMS uses **Supabase Auth** with JWT-based authentication and role-based access control (RBAC). Supabase handles all authentication flows including user management, session handling, and token refresh.

```
┌──────────────────────────────────────────────────────────────┐
│                 Supabase Authentication Flow                  │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│   ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐  │
│   │ Client  │───▶│ Supabase│───▶│ Verify  │───▶│ Return  │  │
│   │ Form    │    │ Auth    │    │ Creds   │    │ JWT     │  │
│   └─────────┘    └─────────┘    └─────────┘    └─────────┘  │
│                                                      │        │
│   ┌─────────┐    ┌─────────┐    ┌─────────┐         │        │
│   │ Access  │◀───│ Refresh │◀───│ Session │◀────────┘        │
│   │ APIs    │    │ Token   │    │ Stored  │                  │
│   └─────────┘    └─────────┘    └─────────┘                  │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

## Supabase Auth Configuration

### Client-Side Setup

```typescript
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

### Server-Side Setup

```typescript
// src/lib/server/supabase.ts
import { createClient } from '@supabase/supabase-js';

export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
```

## Authentication Methods

### Sign In with Email/Password

```typescript
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'password'
});

if (error) {
  console.error('Login failed:', error.message);
} else {
  console.log('Logged in:', data.user);
}
```

### Sign Out

```typescript
const { error } = await supabase.auth.signOut();
```

### Get Current User

```typescript
const { data: { user } } = await supabase.auth.getUser();
```

## Session Management

Supabase handles sessions automatically with JWT tokens:

- **Access Token**: Short-lived (1 hour default), used for API calls
- **Refresh Token**: Long-lived, used to get new access tokens
- **Session Storage**: Tokens stored in localStorage by default

### Session Refresh

Supabase automatically refreshes tokens before expiry:

```typescript
// Listen for auth state changes
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'TOKEN_REFRESHED') {
    console.log('Token refreshed');
  }
});
```

## Default Users

For development, the following users are seeded (use the password set via `SEED_ADMIN_PASSWORD`):

| Username | Role | Section |
|----------|------|---------|
| `boss` | SuperAdmin | Admin |
| `admin` | SuperAdmin | Admin |
| `cnc` | Operator | Production |
| `sanding` | Operator | Production |
| `logistics` | StationLead | Logistics |

> ⚠️ **Production**: Ensure strong passwords are set for all users via Supabase Dashboard.

## Role-Based Access Control

### Sections

The system has three primary sections:

| Section | Description |
|---------|-------------|
| `Admin` | Administrative functions, user management |
| `Production` | Manufacturing, station operations |
| `Logistics` | Shipping, loading, delivery |

### Roles

Each user has a role per section:

| Role | Level | Capabilities |
|------|-------|--------------|
| `SuperAdmin` | 4 | Full access, user management, system config |
| `StationLead` | 3 | Team management, approvals, reports |
| `Operator` | 2 | Day-to-day operations, create/edit |
| `Viewer` | 1 | Read-only access |

### User Role Structure

```typescript
interface User {
  id: number;
  username: string;
  primarySection: 'Admin' | 'Production' | 'Logistics';
  sections: string[];  // Accessible sections
  roles: {
    Admin: Role;
    Production: Role;
    Logistics: Role;
  };
  stations?: string[];  // For operators: CNC, SANDING, etc.
}
```

### Permission Check Example

```typescript
function canApproveOrder(user: User): boolean {
  const productionRole = user.roles.Production;
  return ['SuperAdmin', 'StationLead'].includes(productionRole);
}

function canAccessSection(user: User, section: string): boolean {
  return user.sections.includes(section);
}

function canEditOrder(user: User, order: Order): boolean {
  // SuperAdmin can edit any order
  if (user.roles.Admin === 'SuperAdmin') return true;
  
  // StationLead can edit orders in their section
  if (user.roles.Production === 'StationLead') return true;
  
  // Operator can only edit their own orders
  if (user.roles.Production === 'Operator') {
    return order.created_by === user.id;
  }
  
  return false;
}
```

## Implementing Protected Routes

### API Route Protection

```typescript
// src/routes/api/protected/+server.ts
import { json } from '@sveltejs/kit';
import { query } from '$lib/server/db/connection';
import crypto from 'crypto';

export const GET: RequestHandler = async ({ cookies }) => {
  const token = cookies.get('session');
  
  if (!token) {
    return json({ error: 'Not authenticated' }, { status: 401 });
  }
  
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  
  const result = await query(
    `SELECT u.* FROM users u
     JOIN user_sessions s ON s.user_id = u.id
     WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
    [tokenHash]
  );
  
  if (result.rowCount === 0) {
    return json({ error: 'Session expired' }, { status: 401 });
  }
  
  const user = result.rows[0];
  
  // Check role
  if (user.roles.Admin !== 'SuperAdmin') {
    return json({ error: 'Insufficient permissions' }, { status: 403 });
  }
  
  // Proceed with protected logic
  return json({ data: 'protected content' });
};
```

### Helper Function

```typescript
// src/lib/server/auth.ts
import { query } from '$lib/server/db/connection';
import crypto from 'crypto';

export async function getSessionUser(cookies: Cookies) {
  const token = cookies.get('session');
  if (!token) return null;
  
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  
  const result = await query(
    `SELECT u.id, u.username, u.display_name, u.roles, u.sections, u.stations
     FROM users u
     JOIN user_sessions s ON s.user_id = u.id
     WHERE s.token_hash = $1 AND s.expires_at > NOW() AND u.is_active = true`,
    [tokenHash]
  );
  
  return result.rowCount > 0 ? result.rows[0] : null;
}

export function hasRole(user: any, section: string, minRole: string): boolean {
  const roleHierarchy = ['Viewer', 'Operator', 'StationLead', 'SuperAdmin'];
  const userRoleLevel = roleHierarchy.indexOf(user.roles[section]);
  const requiredLevel = roleHierarchy.indexOf(minRole);
  return userRoleLevel >= requiredLevel;
}
```

## Client-Side Auth State

### Auth Store

```typescript
// src/lib/users/user-store.ts
import { writable, derived } from 'svelte/store';

export const currentUserId = writable<number | null>(null);
export const users = writable<User[]>([]);

export const currentUser = derived(
  [users, currentUserId],
  ([$users, $id]) => $users.find(u => u.id === $id) || null
);

export async function loadCurrentUser() {
  const res = await fetch('/api/auth');
  const data = await res.json();
  if (data.user) {
    currentUserId.set(data.user.id);
  }
}
```

### Protected Page

```svelte
<!-- src/routes/admin/+page.svelte -->
<script lang="ts">
  import { currentUser } from '$lib/users/user-store';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  
  onMount(() => {
    if (!$currentUser || $currentUser.roles.Admin !== 'SuperAdmin') {
      goto('/login');
    }
  });
</script>

{#if $currentUser?.roles.Admin === 'SuperAdmin'}
  <h1>Admin Panel</h1>
  <!-- Admin content -->
{:else}
  <p>Loading...</p>
{/if}
```

## Audit Logging

All authentication events are logged:

```sql
-- Login
INSERT INTO audit_log (user_id, username, action, entity_type, entity_id)
VALUES ($1, $2, 'LOGIN', 'user', $3);

-- Logout
INSERT INTO audit_log (user_id, username, action)
VALUES ($1, $2, 'LOGOUT');

-- Failed login attempt
INSERT INTO audit_log (username, action, metadata)
VALUES ($1, 'LOGIN_FAILED', '{"reason": "invalid_password"}');
```

## Security Best Practices

### Password Requirements

For production, enforce:

- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character

```typescript
function validatePassword(password: string): boolean {
  const minLength = password.length >= 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*]/.test(password);
  
  return minLength && hasUpper && hasLower && hasNumber && hasSpecial;
}
```

### Session Security

- [ ] Use HTTPS in production
- [ ] Set `secure: true` on cookies in production
- [ ] Implement session rotation on privilege escalation
- [ ] Add rate limiting on login endpoint
- [ ] Monitor for brute force attempts
- [ ] Implement account lockout after failed attempts

### Token Security

- [ ] Use cryptographically secure random generator
- [ ] Hash tokens before storing in database
- [ ] Never log or expose plain tokens
- [ ] Implement token refresh mechanism

## Future Enhancements

- [ ] Two-factor authentication (2FA)
- [ ] OAuth2/OIDC integration
- [ ] API key authentication for integrations
- [ ] Session management UI (view/revoke sessions)
- [ ] Password reset via email
- [ ] Account recovery options
