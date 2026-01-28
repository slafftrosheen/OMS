# OMS Testing Guide

## Quick Test Commands

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:a11y           # Accessibility tests
npm run test:contrast       # Color contrast tests
npm run type-check          # TypeScript type checking
npm run lint                # ESLint checks

# Development helpers
npm run dev:clean           # Clean build and start dev server
./scripts/test-fixes.sh     # Run fix validation
```

## Manual Testing Checklist

### 1. Orders Page Tests

#### Load Tests
- [ ] Page loads without errors
- [ ] Empty state displays correctly
- [ ] Loading spinner shows during fetch
- [ ] Data populates after load

#### Interaction Tests
- [ ] Search filters orders correctly
- [ ] Sorting works (click headers)
- [ ] Pagination controls work
- [ ] Refresh button works
- [ ] Status filter tabs work

#### Error Handling Tests
- [ ] Offline mode shows error banner
- [ ] Invalid API response handled gracefully
- [ ] Error dismissal works
- [ ] Retry functionality works

#### Performance Tests
- [ ] Large dataset (100+ orders) loads quickly
- [ ] Scrolling is smooth
- [ ] Search is instant
- [ ] No memory leaks (check DevTools Performance)

### 2. Dashboard Tests

- [ ] Statistics load correctly
- [ ] Charts render properly
- [ ] Real-time updates work (if applicable)
- [ ] Navigation links work

### 3. API Tests

#### Draft Orders API
```bash
# Test locally
curl http://localhost:5173/api/draft-orders

# Expected response:
# {
#   "data": [...],
#   "pagination": { "page": 1, "limit": 20, ... }
# }
```

#### Search API
```bash
curl "http://localhost:5173/api/search?q=test"

# Expected response:
# {
#   "results": [...],
#   "query": "test",
#   "count": 5
# }
```

### 4. Browser Testing Matrix

| Browser | Version | Status |
|---------|---------|--------|
| Chrome | Latest | ✅ |
| Firefox | Latest | ✅ |
| Safari | Latest | ✅ |
| Edge | Latest | ✅ |
| Mobile Safari | iOS 15+ | ⚠️ Test required |
| Mobile Chrome | Latest | ⚠️ Test required |

### 5. Accessibility Tests

```bash
# Run automated a11y tests
npm run test:a11y

# Manual checks:
# - [ ] Keyboard navigation works
# - [ ] Screen reader announces properly
# - [ ] Focus indicators visible
# - [ ] Color contrast meets WCAG AA
# - [ ] Forms have labels
# - [ ] Images have alt text
```

### 6. Performance Benchmarks

| Metric | Target | Current |
|--------|--------|---------|
| First Contentful Paint | < 1.5s | ⏱️ |
| Largest Contentful Paint | < 2.5s | ⏱️ |
| Time to Interactive | < 3.5s | ⏱️ |
| Cumulative Layout Shift | < 0.1 | ⏱️ |

**Measure with:**
```bash
# Lighthouse CLI
npm install -g lighthouse
lighthouse http://localhost:5173/orders --view

# Or use Chrome DevTools > Lighthouse tab
```

### 7. Security Tests

- [ ] No console warnings about security
- [ ] HTTPS enabled in production
- [ ] CSP headers configured
- [ ] Authentication works correctly
- [ ] Authorization prevents unauthorized access
- [ ] XSS protection active
- [ ] CSRF protection active

### 8. Error Scenarios

Test these error conditions:

#### Network Errors
```javascript
// In DevTools Console
// Simulate offline
navigator.serviceWorker?.controller?.postMessage({ type: 'SIMULATE_OFFLINE' });

// Test recovery
location.reload();
```

#### API Errors
- [ ] 500 Internal Server Error
- [ ] 404 Not Found
- [ ] 403 Forbidden
- [ ] Network timeout
- [ ] Malformed JSON response

#### Edge Cases
- [ ] Empty search results
- [ ] Very long order names
- [ ] Special characters in input
- [ ] Concurrent requests
- [ ] Rapid clicking/interaction

## Debugging Tips

### View Performance Metrics
```javascript
// In browser console
import { perfMonitor } from '/src/lib/utils/performance';
console.table(perfMonitor.getSummary());
```

### View Request Cache Stats
```javascript
import { requestDeduplicator } from '/src/lib/utils/dedupe';
console.log(requestDeduplicator.getStats());
```

### Enable Verbose Logging
```bash
# In .env.local
VITE_LOG_LEVEL=debug
```

## Common Issues & Solutions

### Issue: ".map is not a function"
**Solution:** Check that API returns array format
```typescript
const data = Array.isArray(response) ? response : (response.data || []);
```

### Issue: "Cannot read property of undefined"
**Solution:** Add null checks
```typescript
const value = obj?.property || fallback;
```

### Issue: Styling not applied
**Solution:** Check CSS import in +layout.svelte
```typescript
import '../app.css';
```

### Issue: Slow page load
**Solution:** Enable request deduplication
```typescript
await dedupeRequest('key', fetchFn, { cacheTime: 10000 });
```

## Continuous Integration

### GitHub Actions Workflow (Optional)

```yaml
# .github/workflows/test.yml
name: Test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm ci
      - run: npm run type-check
      - run: npm run lint
      - run: npm run test:a11y
```

## Reporting Issues

When reporting bugs, include:
1. Steps to reproduce
2. Expected behavior
3. Actual behavior
4. Browser/OS version
5. Console errors (screenshot)
6. Network tab (if API related)

## Performance Monitoring in Production

Use these tools:
- Google Analytics
- Sentry for error tracking
- LogRocket for session replay
- Web Vitals monitoring
