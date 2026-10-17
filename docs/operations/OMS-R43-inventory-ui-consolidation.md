# OMS-R43 — Inventory UI consolidation and safe catalog intake

**Status:** committed directly to `main` of `slafftrosheen/OMS`.
**Execution:** GitHub source editing and inspection only. No CI, GitHub
Actions, tests, build, live Supabase migration, deployment or inventory
transactions were performed in this pass.

## Scope

R43 closes three confirmed contradictions in inventory's user-facing code:

1. The shared Svelte material store expects `name_en`,
   `item_group`, `min_stock` and other canonical columns, but legacy
   `/api/inventory/items` responses use `name`, `group`,
   `min`, `colorCode` etc. This corrupted the displayed catalog and
   made metadata saves silently ignore many edited fields.
2. The barcode component automatically attempted to increase stock by 1
   with `updateMaterial(...,{stock:...})` on camera detection. That metadata
   endpoint deliberately rejects unaudited changes as of R41, and camera
   false positives/repeated detections must not be stock transactions.
3. The CSV component invoked an obsolete `createItem` export and accepted
   arbitrary opening `stock` per line, conflicting with R41's audited,
   zero-opening-stock creation contract.

## Canonical UI-to-API contract

`src/lib/inventory/api-contract.ts` now maps the legacy item DTO to the
canonical `Material` model used by the store, including material names,
groups/subgroups, minimum stock, supplier, color and source timestamps.
Metadata writes convert canonical fields back to the established API
names. **Stock is deliberately excluded** from metadata update requests.
New material creation sends `stock:0`.

The store loads all pages of the canonical item API (100 rows/page, bounded
at 100 pages) rather than treating only the first default page of 50 rows
as the full catalog. A fetch failure or incomplete/oversized catalog is
an error, not grounds to claim that the inventory is complete. Direct
material URLs independently fetch `/api/inventory/items/{id}`, avoiding
the old half-second redirect race when the index had not loaded yet.
Inventory requests use the configured SvelteKit base path.

Metadata forms preserve untouched fields when an older API receipt omits
them, and no longer silently close/navigate if saving fails. Operator-facing
stock updates remain exclusively in R41/R42's audited movement RPC.

## Inventory pages

- **Inventory index:** subscriptions initialize on mount without leaking
  a late subscription after unmount. Create, import, delete and stock
  consistency controls are visible to RD, Boss and HeadOfProduction;
  operator/read-only access retains catalog lookup, scanning and movement
  history without misleading write controls. Server-side role checks remain
  authoritative.
- **Material detail:** IN/OUT movement controls require an authorized
  manager and a positive integer quantity. The UI waits for the committed
  movement receipt before clearing the input or showing success, and
  displays an explicit unconfirmed-operation warning on error. Editing
  product metadata never writes stock.
- **Material creation and shared edit modal:** new catalog entries start at
  zero. Current stock is displayed read-only, separate from min-stock,
  location and supplier metadata. Failed saves remain visible, instead of
  closing the modal or navigating as though success occurred.
- **Barcode:** camera detection is lookup only. No automatic stock writes.
  An operator verifies the result and opens the saved material record to
  perform an explicitly authorized inventory movement. Detection and
  scanner control text is localized.
- **Bulk CSV:** supports the existing nine-column format
  `section,group,subgroup,sku,name,unit,stock,min,location`.
  Validates quoting, duplicate SKUs, integer minimums, empty mandatory
  fields and all declared opening-stock values. **Nonzero stock aborts
  preview; it is never silently discarded or imported.** A separate
  explicit Create step writes records at zero balance and reports partial
  row failures. An opening balance requires an audited inventory movement
  after the material has been created.
- **Movements:** removes duplicate initial fetches and ignores stale
  responses after filter changes. An API/network error is visibly
  `unavailable`, not misrepresented as zero movements. Order links respect
  the SvelteKit base path.

The station material selector still loads canonical materials from the same
existing `/api/inventory/items` API and records consumption only through the
R38/R42 stage-completion transaction. R43 does **not** add artificial stock
reservation or purchasing modules.

## Pre-deployment requirements

There is **no new R43 SQL migration**, but R41
`20261016000004_inventory_audit_atomic_manual_movements.sql` and R42
`20261016000005_canonical_inventory_consumption.sql` must already be
applied before R43 app code is deployed, along with their earlier
dependencies. R43's new client code would otherwise call unimplemented
atomic movement endpoints or encounter mismatched balances.

**Do not interpret stock displayed in the catalog as an authoritative
physical count if a legacy parity discrepancy remains.** Resolve known
R42 discrepancies from Inventory Consistency with a manager-verified
physical count, documented reason and an audit movement.

## Manual staging acceptance

1. Open the inventory index with more than 50 materials. Verify that
   all groups, product names, stock values, minimums, supplier and
   color information appear, including items beyond page one.
2. Open a material direct URL in a new tab without first navigating the
   catalog. It should load from its own canonical read and should not
   immediately redirect. Verify a missing/unreadable record shows an
   error rather than stale stock.
3. Change an ordinary material name, group, location, minimum stock,
   supplier and/or price. Save and reload. Every field must persist;
   stock must remain unchanged.
4. Create a material from the full form and the shared modal. Both must
   start with `stock=0`. Use a manager-authenticated IN movement to
   create an opening balance and verify the R41 movement ID.
5. Scan a barcode repeatedly, both from camera and manual SKU entry.
   Inventory stock must never increase merely from detection. Open the
   matched material, explicitly add a quantity, and check it is audited.
6. Paste a CSV with opening stock 5. It must be rejected before any
   row creation. Retry with all stock values zero; verify the preview,
   create, failure counts and saved metadata. Try duplicate SKU and
   invalid minimum / quoted comma-bearing names.
7. Switch the movement-history filter quickly during loading; only the
   last selected filter should be shown. Simulate a failed history
   request and confirm the UI does not display a false empty audit.
8. Check read-only Operator, StationHead, RD/Boss/HoP account behavior,
   especially hiding inventory write controls while retaining readable
   catalog and scanner functionality. Verify server authorization by
   direct API calls as well.
9. Check EN/RU/LV labels, narrow screens and the configured base path.
   Confirm original production stage completion and R42 parity alerts
   continue working.

Regression coverage:
`tests/unit/oms-r43-inventory-ui-consolidation.test.ts`.

**Not run in this batch:** `npm run check`, Vitest, build, browser
automation, actual inventory movements, RLS checks or deployment.
For operator-run staging acceptance, run checks only on the authorized
OMS host after database prerequisites are installed.
GitHub is used as source storage, not as a CI or deployment platform.
