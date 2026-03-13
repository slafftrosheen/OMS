# Manual Testing Guide for Authentication Fix

This document describes how to manually verify that the authentication fix resolves the 401 cascade issue.

## The Fix

Added `/api/preferences` and `/api/materials` to the public routes whitelist in `src/hooks.server.ts` (lines 176-177).

## Testing Steps

### 1. Browser DevTools Testing (No Server Restart Required)

Open your browser's DevTools Console and run these commands:

```javascript
// Test preferences endpoint - should return defaults without authentication
fetch('/api/preferences')
  .then(r => {
    console.log('Status:', r.status); // Should be 200, not 401
    return r.json();
  })
  .then(d => console.log('Preferences:', d))
  .catch(e => console.error('Failed:', e));

// Test materials endpoint - should return data without authentication
fetch('/api/materials')
  .then(r => {
    console.log('Status:', r.status); // Should be 200, not 401
    return r.json();
  })
  .then(d => console.log('Materials count:', d.length))
  .catch(e => console.error('Failed:', e));

// Test materials with category filter
fetch('/api/materials?categories=ACRYLIC_XT,ALU_SHEET')
  .then(r => {
    console.log('Status:', r.status); // Should be 200, not 401
    return r.json();
  })
  .then(d => console.log('Filtered materials:', d.length))
  .catch(e => console.error('Failed:', e));

// Verify PUT is still protected
fetch('/api/preferences', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ theme: 'LightMode' })
})
  .then(r => {
    console.log('PUT Status:', r.status); // Should be 401 for anonymous users
    return r.json();
  })
  .then(d => console.log('PUT Response:', d))
  .catch(e => console.error('Failed:', e));
```

### 2. Expected Results

**Before the fix:**
- `/api/preferences` GET → 401 Unauthorized
- `/api/materials` GET → 401 Unauthorized
- Multiple 401 errors in browser console
- App hangs when loading draft orders page
- Material dropdowns don't work

**After the fix:**
- `/api/preferences` GET → 200 OK with default preferences
- `/api/materials` GET → 200 OK with materials array
- No 401 errors for these endpoints
- App loads smoothly
- Material dropdowns work correctly

### 3. Draft Orders Page Testing

1. Navigate to `/orders/new` (draft orders page)
2. Check browser console - should see no 401 errors
3. Try selecting materials in any MaterialSelect dropdown
4. Material selection should work without hanging
5. Page should remain responsive

### 4. Network Tab Verification

1. Open DevTools → Network tab
2. Navigate to `/orders/new`
3. Filter by "preferences" and "materials"
4. Verify all requests return 200 status codes
5. Verify no retry loops or cascade failures

### 5. Authenticated vs Anonymous Behavior

**Anonymous User:**
- GET `/api/preferences` → Returns defaults (200)
- GET `/api/materials` → Returns materials (200)
- PUT `/api/preferences` → Unauthorized (401)
- POST `/api/materials` → Unauthorized (401)

**Authenticated User:**
- GET `/api/preferences` → Returns user's saved preferences (200)
- GET `/api/materials` → Returns materials (200)
- PUT `/api/preferences` → Updates preferences (200)
- POST `/api/materials` → Creates material (201 or 200)

## Automated Tests

Run the Playwright tests:

```bash
npm run test:e2e -- tests/e2e/public-api.spec.ts
```

The test suite verifies:
1. Anonymous access to GET `/api/preferences` works
2. Anonymous access to GET `/api/materials` works
3. Category filters work correctly
4. PUT and POST operations still require authentication

## Security Considerations

✅ **Safe to make public:**
- GET `/api/preferences` - Already returns defaults for anonymous users
- GET `/api/materials` - Read-only materials catalog data

✅ **Still protected (requires authentication):**
- PUT `/api/preferences` - Only authenticated users can save preferences
- POST `/api/materials` - Only authenticated users can create materials
- All other API endpoints - Unchanged authentication requirements

## Rollback Plan

If any issues arise, revert by removing lines 176-177 from `src/hooks.server.ts`:

```typescript
// Remove these lines:
{ path: '/api/preferences', methods: ['GET'] }, // Returns defaults for anonymous users
{ path: '/api/materials', methods: ['GET'] }, // Read-only materials data
```

Then restart the server.
