# Development Guide

Guidelines for contributing to Reclame OMS.

## Development Setup

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Git
- VS Code (recommended)

### Initial Setup

```bash
# Clone repository
git clone <repository-url>
cd reclame_OMS

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Initialize database
./scripts/init-database.sh

# Start development server
npm run dev
```

### VS Code Extensions

Recommended extensions for development:

```json
{
  "recommendations": [
    "svelte.svelte-vscode",
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "bradlc.vscode-tailwindcss",
    "mtxr.sqltools",
    "mtxr.sqltools-driver-pg"
  ]
}
```

## Project Structure

```
reclame_OMS/
├── src/
│   ├── lib/                    # Shared library code
│   │   ├── server/             # Server-only code
│   │   │   └── db/             # Database layer
│   │   │       ├── connection.ts
│   │   │       ├── migrations/ # SQL migrations
│   │   │       └── seeds/      # Seed data
│   │   ├── auth/               # Authentication
│   │   ├── users/              # User management
│   │   ├── calendar/           # Calendar module
│   │   ├── chat/               # Chat module
│   │   ├── inventory/          # Inventory module
│   │   ├── orders/             # Order module
│   │   ├── stores/             # Global stores
│   │   └── components/         # Shared components
│   ├── routes/                 # SvelteKit routes
│   │   ├── api/                # REST API endpoints
│   │   ├── orders/             # Order pages
│   │   ├── inventory/          # Inventory pages
│   │   └── ...
│   └── locales/                # i18n translations
├── static/                     # Static assets
├── scripts/                    # Utility scripts
├── docs/                       # Documentation
└── tests/                      # Test files
```

## Coding Standards

### TypeScript

- Use strict mode
- Define explicit types for function parameters
- Use interfaces for complex objects
- Avoid `any` type when possible

```typescript
// ✅ Good
interface User {
  id: number;
  username: string;
  roles: Record<string, string>;
}

async function getUser(id: number): Promise<User | null> {
  // ...
}

// ❌ Bad
async function getUser(id: any): Promise<any> {
  // ...
}
```

### Svelte Components

- Use TypeScript in script blocks
- Keep components focused and single-purpose
- Extract reusable logic to stores or utilities

```svelte
<script lang="ts">
  // Props with types
  export let title: string;
  export let count: number = 0;
  
  // Reactive declarations
  $: doubled = count * 2;
  
  // Event handlers
  function handleClick() {
    count += 1;
  }
</script>

<button on:click={handleClick}>
  {title}: {count} (doubled: {doubled})
</button>

<style>
  button {
    /* Component-scoped styles */
  }
</style>
```

### API Endpoints

- Follow REST conventions
- Return consistent JSON responses
- Handle errors gracefully
- Validate input data

```typescript
// src/routes/api/example/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db/connection';

export const GET: RequestHandler = async ({ url }) => {
  try {
    const result = await query('SELECT * FROM example');
    return json(result.rows);
  } catch (err) {
    console.error('Error:', err);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
};

export const POST: RequestHandler = async ({ request }) => {
  const data = await request.json();
  
  // Validation
  if (!data.name) {
    return json({ error: 'Name is required' }, { status: 400 });
  }
  
  try {
    const result = await query(
      'INSERT INTO example (name) VALUES ($1) RETURNING *',
      [data.name]
    );
    return json(result.rows[0], { status: 201 });
  } catch (err: any) {
    if (err.code === '23505') {
      return json({ error: 'Name already exists' }, { status: 409 });
    }
    return json({ error: 'Internal server error' }, { status: 500 });
  }
};
```

### Database Queries

- Use parameterized queries (prevent SQL injection)
- Use transactions for multi-step operations
- Add appropriate indexes for frequently queried columns

```typescript
// ✅ Good - Parameterized query
const result = await query(
  'SELECT * FROM users WHERE username = $1',
  [username]
);

// ❌ Bad - SQL injection vulnerability
const result = await query(
  `SELECT * FROM users WHERE username = '${username}'`
);
```

### CSS

- Use CSS custom properties for theming
- Prefer component-scoped styles
- Follow existing naming conventions

```css
/* Use CSS variables */
.button {
  background: var(--primary);
  color: var(--text);
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-md);
}

/* Responsive design */
@media (max-width: 768px) {
  .button {
    width: 100%;
  }
}
```

## Git Workflow

### Branch Naming

```
feature/add-user-management
bugfix/fix-login-error
hotfix/security-patch
refactor/improve-db-queries
docs/update-api-reference
```

### Commit Messages

Follow conventional commits:

```
feat: add user preferences API
fix: resolve session expiry bug
docs: update deployment guide
refactor: simplify calendar store
test: add auth endpoint tests
chore: update dependencies
```

### Pull Request Process

1. Create feature branch from `main`
2. Make changes with descriptive commits
3. Ensure tests pass: `npm run test`
4. Ensure build succeeds: `npm run build`
5. Create PR with description
6. Request code review
7. Address feedback
8. Squash and merge

## Adding New Features

### Adding a New API Endpoint

1. Create route file:

```bash
mkdir -p src/routes/api/new-feature
touch src/routes/api/new-feature/+server.ts
```

2. Implement endpoint:

```typescript
// src/routes/api/new-feature/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  return json({ message: 'New feature' });
};
```

3. Add to API documentation in `docs/api-reference.md`

### Adding a New Database Table

1. Create migration file:

```bash
touch src/lib/server/db/migrations/011_new_feature.sql
```

2. Write migration:

```sql
-- src/lib/server/db/migrations/011_new_feature.sql
CREATE TABLE new_feature (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_new_feature_name ON new_feature(name);
```

3. Run migration:

```bash
./scripts/init-database.sh
```

4. Document in `docs/database-schema.md`

### Adding a New Store

1. Create store file:

```typescript
// src/lib/new-feature/store.ts
import { writable } from 'svelte/store';
import { base } from '$app/paths';

export interface NewItem {
  id: number;
  name: string;
}

export const items = writable<NewItem[]>([]);
export const loading = writable(false);

export async function loadItems(): Promise<void> {
  loading.set(true);
  try {
    const res = await fetch(`${base}/api/new-feature`);
    if (res.ok) {
      items.set(await res.json());
    }
  } finally {
    loading.set(false);
  }
}
```

### Adding Translations

1. Add keys to all locale files:

```json
// src/locales/en.json
{
  "newFeature": {
    "title": "New Feature",
    "description": "This is a new feature"
  }
}
```

```json
// src/locales/ru.json
{
  "newFeature": {
    "title": "Новая функция",
    "description": "Это новая функция"
  }
}
```

2. Use in components:

```svelte
<script>
  import { t } from 'svelte-i18n';
</script>

<h1>{$t('newFeature.title')}</h1>
<p>{$t('newFeature.description')}</p>
```

## Testing

### Running Tests

```bash
# Run all tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm run test -- src/lib/auth/auth.test.ts
```

### Writing Tests

```typescript
// src/lib/example/example.test.ts
import { describe, it, expect } from 'vitest';
import { someFunction } from './example';

describe('someFunction', () => {
  it('should return expected value', () => {
    const result = someFunction('input');
    expect(result).toBe('expected');
  });

  it('should handle edge cases', () => {
    expect(someFunction('')).toBeNull();
    expect(someFunction(null)).toThrow();
  });
});
```

## Debugging

### Server-Side Debugging

```typescript
// Add debug logging
console.log('Debug:', { variable, data });

// Use debugger statement
debugger;
```

### Database Debugging

```bash
# Connect to database
psql -U reclame_admin -d reclame_oms

# View table structure
\d table_name

# Run query
SELECT * FROM users LIMIT 10;

# View query execution plan
EXPLAIN ANALYZE SELECT * FROM large_table WHERE condition;
```

### Network Debugging

Use browser DevTools Network tab to inspect:
- Request/response headers
- Request body
- Response timing
- Error responses

## Performance

### Database Query Optimization

```sql
-- Add indexes for frequently queried columns
CREATE INDEX idx_orders_status ON draft_orders(status);

-- Use EXPLAIN to analyze queries
EXPLAIN ANALYZE SELECT * FROM draft_orders WHERE status = 'pending';
```

### Frontend Optimization

- Lazy load components when possible
- Use `{#await}` blocks for async data
- Minimize store subscriptions
- Use pagination for large lists

```svelte
{#await loadData()}
  <p>Loading...</p>
{:then data}
  <DataList {data} />
{:catch error}
  <p>Error: {error.message}</p>
{/await}
```

## Common Issues

### "Cannot find module" errors

```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

### Database connection errors

```bash
# Check PostgreSQL is running
systemctl status postgresql

# Verify connection details in .env
cat .env | grep DB_
```

### Build errors

```bash
# Clear build cache
rm -rf .svelte-kit build

# Rebuild
npm run build
```

## Resources

- [SvelteKit Documentation](https://kit.svelte.dev/docs)
- [Svelte Documentation](https://svelte.dev/docs)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
