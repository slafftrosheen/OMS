# Authentication & Authorization

Security model for Reclame OMS.

## Overview

Reclame OMS uses session-based authentication with role-based access control (RBAC).

```
┌──────────────────────────────────────────────────────────────┐
│                    Authentication Flow                        │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│   ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐  │
│   │ Client  │───▶│ Login   │───▶│ Verify  │───▶│ Create  │  │
│   │ Form    │    │ API     │    │ Creds   │    │ Session │  │
│   └─────────┘    └─────────┘    └─────────┘    └─────────┘  │
│                                                      │        │
│   ┌─────────┐    ┌─────────┐    ┌─────────┐         │        │
│   │ Stored  │◀───│ Set     │◀───│ Generate│◀────────┘        │
│   │ Cookie  │    │ Cookie  │    │ Token   │                  │
│   └─────────┘    └─────────┘    └─────────┘                  │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

## Session Management

### Session Creation

When a user logs in successfully:

1. A random 32-byte token is generated
2. Token is hashed with SHA-256 and stored in `user_sessions` table
3. Plain token is set as HTTP-only cookie
4. Session expires after 7 days

```typescript
// Token generation
const token = crypto.randomBytes(32).toString('hex');
const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

// Cookie settings
cookies.set('session', token, {
  path: '/',
  httpOnly: true,        // Not accessible via JavaScript
  secure: true,          // HTTPS only in production
  sameSite: 'lax',       // CSRF protection
  maxAge: 7 * 24 * 60 * 60  // 7 days
});
```

### Session Validation

On each authenticated request:

1. Read `session` cookie from request
2. Hash the token
3. Query database for matching session
4. Verify session hasn't expired
5. Update `last_activity_at` timestamp

```sql
SELECT u.id, u.username, u.roles
FROM users u
JOIN user_sessions s ON s.user_id = u.id
WHERE s.token_hash = $1 
  AND s.expires_at > NOW()
  AND u.is_active = true
```

### Session Termination

Sessions end when:

- User logs out (explicit deletion)
- Cookie expires (7 days)
- Session expires in database
- User account is deactivated

```typescript
// Logout
const tokenHash = hash(cookies.get('session'));
await query('DELETE FROM user_sessions WHERE token_hash = $1', [tokenHash]);
cookies.delete('session');
```

## Password Storage

### Hashing

Passwords are hashed before storage. For production, use bcrypt:

```typescript
import bcrypt from 'bcrypt';

// Hash password
const hash = await bcrypt.hash(password, 10);

// Verify password
const valid = await bcrypt.compare(password, hash);
```

### Default Users

Development seeds use placeholder hashes that accept any password:

```sql
-- Placeholder (accepts any password in dev)
INSERT INTO users (username, password_hash) 
VALUES ('admin', '$2b$10$placeholder_admin_hash');
```

> ⚠️ **Production**: Replace all placeholder hashes with real bcrypt hashes.

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
