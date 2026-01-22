# Security Guide

## Credential Management

### Initial Setup

1. **Generate Secure Secrets**

```bash
# Generate SESSION_SECRET
openssl rand -base64 32

# Generate JWT_SECRET
openssl rand -base64 32

# Generate admin password
openssl rand -base64 24
```

### Update .env File

```bash
# NEVER commit this file to git
DATABASE_URL=postgresql://user:STRONG_PASSWORD@host:5432/db
SESSION_SECRET=<generated-session-secret>
JWT_SECRET=<generated-jwt-secret>
SUPABASE_SERVICE_ROLE_KEY=<from-supabase-dashboard>
```

### Password Rotation

**When to Rotate:**

*   Every 90 days (recommended)
*   After suspected breach
*   When team member leaves
*   After security audit

**Rotation Procedure:**

```bash
# 1. Generate new secrets
./scripts/generate-secrets.sh

# 2. Update environment variables (zero-downtime)
# For Vercel/cloud:
vercel env add SESSION_SECRET_NEW

# 3. Update application code to support both old and new
# Deploy with dual-secret support

# 4. After 24 hours, remove old secret
vercel env rm SESSION_SECRET_OLD

# 5. Update SESSION_SECRET_NEW to SESSION_SECRET
```

## Supabase RLS Policies

All tables have Row-Level Security enabled. Update policies:

```sql
-- Example: Restrict order access
ALTER TABLE draft_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only see assigned orders"
ON draft_orders FOR SELECT
USING (
  auth.uid() IN (
    SELECT user_id FROM order_assignments 
    WHERE order_id = draft_orders.id
  )
  OR
  EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() 
    AND users.roles->>'admin' = 'true'
  )
);
```

## Security Headers

Headers are automatically applied via hooks.server.ts:

*   **CSP:** Restricts resource loading
*   **HSTS:** Enforces HTTPS (production only)
*   **X-Frame-Options:** Prevents clickjacking
*   **Referrer-Policy:** Controls referrer information

## Audit Logging

All sensitive actions are logged to audit_log table:

```typescript
// Example: Log password change
await logAudit({
  user_id: userId,
  action: 'password_change',
  entity_type: 'user',
  entity_id: userId,
  ip_address: request.headers.get('x-forwarded-for')
});
```

## Incident Response

**Suspected Breach:**

1.  Immediately rotate all secrets
2.  Force logout all sessions: `DELETE FROM user_sessions;`
3.  Review audit logs
4.  Notify affected users

**Vulnerability Discovery:**

1.  Document in private security issue
2.  Develop and test fix
3.  Deploy to production
4.  Notify users if data exposed

## Compliance Checklist

*   [ ] All passwords hashed with bcrypt (cost factor ≥10)
*   [ ] HTTPS enforced in production (HSTS enabled)
*   [ ] Rate limiting active on auth endpoints
*   [ ] Audit logging capturing all data changes
*   [ ] Regular security updates (npm audit)
*   [ ] RLS policies on all Supabase tables
*   [ ] CSP headers configured
*   [ ] Secrets stored in environment variables (not code)
