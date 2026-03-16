# Svelte 5 Migration Audit Report

## Executive Summary

Your codebase is **~85% migrated to Svelte 5 Runes**. The major patterns (`$props()`, `$state`, `$derived`, snippets) are correctly implemented. However, there are several critical issues that need attention before production deployment.

---

## 🔴 Critical Issues

### 1. `$app/stores` Usage (SSR Bleeding Risk)

**Files affected:**
- `src/lib/components/Chat.svelte:4`
- `src/lib/components/MobileNav.svelte:2`

**Current code:**
```svelte
import { page } from '$app/stores';
let userId = $derived($page.data.session?.user?.id);
```

**Problem:** Using `$app/stores` instead of `$app/state` can cause issues in SSR contexts.

**Fix:**
```svelte
// Chat.svelte
import { page } from '$app/state';
let userId = $derived(page.data.session?.user?.id);

// MobileNav.svelte  
import { page } from '$app/state';
function isActive(href: string) {
    return page.url.pathname === href || page.url.pathname.startsWith(href + '/');
}
```

---

### 2. Global State Singletons Without Context

**Files importing global state directly (27+ files):**
```javascript
import { orderState } from '$lib/order/orderState.svelte';
import { currentUser } from '$lib/auth/authState.svelte';
import { ui } from '$lib/state/appState.svelte';
```

**Problem:** Direct imports of singleton state classes can cause SSR session bleeding between users.

**Fix Strategy:**

1. **In `src/routes/+layout.svelte`:**
```svelte
<script lang="ts">
  import { setContext } from 'svelte';
  import { OrderState } from '$lib/order/orderState.svelte';
  import { AuthState } from '$lib/auth/authState.svelte';
  import { AppState } from '$lib/state/appState.svelte';
  
  // Create instances once at root level
  const orderStateInstance = new OrderState();
  const authStateInstance = new AuthState();
  const appStateInstance = new AppState();
  
  setContext('orderState', orderStateInstance);
  setContext('authState', authStateInstance);
  setContext('appState', appStateInstance);
</script>
```

2. **In child components:**
```svelte
<script lang="ts">
  import { getContext } from 'svelte';
  import type { OrderState } from '$lib/order/orderState.svelte';
  
  const orderState = getContext<OrderState>('orderState');
</script>
```

**Priority files to refactor:**
- `src/routes/orders/+page.svelte` (line 9)
- `src/routes/calendar/+page.svelte` (line 5)
- `src/lib/ui/OperationsDigest.svelte` (line 2)
- All files in `src/lib/topbar/` importing `appState`
- All files importing `currentUser` from authState

---

### 3. `$effect` Overuse - Potential Infinite Loops

**High-risk files:**

#### `src/routes/orders/+page.svelte:82-92`
```svelte
$effect(() => {
  const orders = orderState.orders;
  const filtered = isAdmin 
    ? orders 
    : orders.filter((order: any) => !order.isDraft);
  
  untrack(() => {
    rows = filtered.map(toRow);
    hasLoadedOnce = true;
  });
});
```

**Issue:** Using `untrack` indicates the effect has too many dependencies.

**Better approach:** Use `$derived` for the filtering logic:
```svelte
let filteredOrders = $derived.by(() => {
  const orders = orderState.orders;
  return isAdmin 
    ? orders 
    : orders.filter((order: any) => !order.isDraft);
});

let rows = $derived(filteredOrders.map(toRow));
```

#### Other files with suspicious `$effect` usage:
- `src/lib/components/orders/OrderList.svelte:43`
- `src/lib/export/ExportDialog.svelte:80,156` (two effects)
- `src/lib/inventory/ItemModal.svelte:23`
- `src/lib/order/*.svelte` (multiple files)

**Audit each `$effect` and ask:**
1. Does this compute a value from other state? → Use `$derived`
2. Does this perform a side effect (API call, DOM manipulation)? → `$effect` is correct
3. Do I need `untrack`? → Restructure the logic

---

### 4. `onMount` + `$state` Race Conditions

**Files with multiple `onMount` or complex mount logic:**

#### `src/lib/calendar/CalendarMonth.svelte:62,85`
Two separate `onMount` blocks that could be consolidated.

#### `src/routes/+layout.svelte:199,362`
Two `onMount` blocks - consider consolidating.

**Recommendation:**
- Merge related `onMount` logic
- Move state initialization to `$state` with lazy initialization where possible
- Use `$effect` for browser-only side effects (it only runs client-side by default)

Example refactoring:
```svelte
// Before
let data = $state([]);
onMount(async () => {
  data = await fetchData();
});

// After (if data can be derived)
let data = $derived(computeFromOtherState());

// Or keep onMount for actual side effects but consolidate
onMount(async () => {
  await Promise.all([
    loadUser(),
    loadPreferences(),
    initRealtime()
  ]);
});
```

---

## 🟡 Medium Priority Issues

### 5. Reassignment Instead of Mutation

**Pattern found in `OrderForm.svelte:58,69`:**
```svelte
function addMaterial() {
  materials = [...materials, {...}]; // Reassignment
}

function removeMaterial(index: number) {
  materials = materials.filter((_, i) => i !== index); // Reassignment
}
```

**For `$state` arrays, direct mutation is fine and often preferred:**
```svelte
function addMaterial() {
  materials.push({...}); // Direct mutation works with $state proxies
}

function removeMaterial(index: number) {
  materials.splice(index, 1); // Direct mutation
}
```

However, your current pattern (reassignment) also works correctly with Svelte 5, so this is optional optimization.

---

### 6. Missing Error Boundaries

Several route pages lack error boundaries:
- `src/routes/admin/users/+page.svelte`
- `src/routes/admin/materials/+page.svelte`
- `src/routes/analytics/+page.svelte`

Consider wrapping these with error boundaries similar to `orders/+page.svelte`.

---

## ✅ Confirmed Good Patterns

Your codebase correctly implements:

1. **`$props()` with callbacks** ✓
   - `OrderForm.svelte` uses `onsubmit`, `oncancel` as callback props
   
2. **Snippets API** ✓
   - `{@render children?.()}` used throughout UI components
   
3. **`$derived` for computed values** ✓
   - `visible`, `totalPages`, `paginatedRows` in orders page
   
4. **`$bindable` for two-way binding** ✓
   - `Modal.svelte` uses `open = $bindable(false)`
   - `Input.svelte` uses `value = $bindable("")`
   
5. **Type-safe props** ✓
   - All major components have proper TypeScript interfaces

---

## 📋 Action Plan

### Phase 1: Critical (Do First)
1. [ ] Fix `$app/stores` → `$app/state` in Chat.svelte and MobileNav.svelte
2. [ ] Implement `setContext`/`getContext` pattern for global state in `+layout.svelte`
3. [ ] Refactor 10 highest-priority files to use context instead of direct imports

### Phase 2: High Priority
4. [ ] Audit all `$effect` usages - convert computed values to `$derived`
5. [ ] Specifically fix `orders/+page.svelte` effect/untrack pattern
6. [ ] Consolidate duplicate `onMount` blocks

### Phase 3: Optimization
7. [ ] Review array mutation patterns
8. [ ] Add missing error boundaries
9. [ ] Performance testing for reactivity loops

---

## Testing Checklist

After making changes:

- [ ] Run `npm run check` for TypeScript errors
- [ ] Run `npm run lint` for Svelte 5 specific rules
- [ ] Test SSR rendering with `npm run build && npm run preview`
- [ ] Verify no console warnings about reactivity
- [ ] Test multi-user scenarios to confirm no session bleeding
- [ ] Check for infinite render loops using React DevTools equivalent

---

## Files Requiring Immediate Attention

| File | Issue | Severity |
|------|-------|----------|
| `src/lib/components/Chat.svelte` | `$app/stores` import | 🔴 Critical |
| `src/lib/components/MobileNav.svelte` | `$app/stores` import | 🔴 Critical |
| `src/routes/orders/+page.svelte` | `$effect` + `untrack` | 🔴 Critical |
| `src/routes/+layout.svelte` | No `setContext` for global state | 🔴 Critical |
| `src/lib/calendar/CalendarMonth.svelte` | Duplicate `onMount` | 🟡 Medium |
| `src/lib/components/orders/OrderList.svelte` | `$effect` overuse | 🟡 Medium |
| 25+ other files | Direct state imports | 🔴 Critical |

---

Generated: $(date)
Auditor: AI Code Assistant
