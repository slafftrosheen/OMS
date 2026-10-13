# OMS-R14 — Production Intelligence / Readiness (13 October 2026)

**Status: committed source only; live deploy and acceptance outstanding.**

## Purpose

Build on OMS-R12 canonical order UUIDs and OMS-R13 OpenRouter proposal review.
This is a **read-only** readiness report, not a production authorization.
An AI recommendation **never changes profile templates, stock, station statuses,
assignments, order state, purchasing or shipping**.

## Workflow

1. Open an existing draft or active production order at `/orders/{uuid}/edit`.
2. Select the new **Readiness** tab, review the confidentiality notice and opt in.
3. Run the check. OMS reads `draft_orders`, `order_profiles`,
   `profile_templates`, `order_materials`, `materials`,
   `order_files` and `order_stages` **using the user's authenticated
   request-scoped Supabase client**. No service-role bypass.
4. Deterministic checks show missing client/deadline/profiles/source documents,
   invalid primary quantities, inactive/unresolved templates,
   unresolved material mappings, known shortages and minimum-stock warnings.
5. OpenRouter receives a bounded summary of that evidence and the deterministic
   issues. It may explain additional risks, propose real production stations,
   and ask follow-up questions. All output is validated again using Zod.
6. Staff resolve the issues through ordinary authorized OMS form, inventory
   and stage workflows, then rerun the check. No automatic updates happen.
   The order editor's **Details → Production profiles** area now offers a
   dropdown of actual, active `profile_templates` UUIDs via the new
   authenticated `GET /api/order/profile-choices` endpoint. Selecting a
   real template changes the local draft form, which still requires the
   normal **Save Draft** action and authorized R12 transactional RPC.
   Inactive/missing templates stay explicitly unverified; the picker does not
   invent, create or automatically attach templates.

The report shows both its capture time and the draft revision timestamp.
Saving draft fields invalidates older reports in the editor. Stock changes,
attachments and stage updates can occur independently, so **even a report
whose draft revision matches may be stale**; always rerun before decisions.

## Deterministic stock policy

Matching is intentionally conservative:

- An `order_materials.material_type` must **exactly** match an inventory
  `materials.sku` or `materials.code` (case-insensitive, trimmed).
- A single unique match, equal units, positive required quantity and a
  finite numeric `stock` value are necessary for an availability comparison.
  Unit mismatches explicitly display the order and inventory units so staff
  can correct them using real material/quantity contracts.
- Unknown or ambiguous references, unit mismatch, malformed quantities,
  absent materials, and incomplete inventory snapshots are clearly marked
  **unverified**—never silently treated as sufficient.
- If available stock is below required stock: **blocker**.
  If projected remaining stock is at/below minimum: **warning**.
- A stock quantity is a point-in-time record, **not a reservation or allocation**.
  Other orders may consume the same stock before production starts.
- The repository's `order_materials` table has no canonical material UUID
  foreign key. A verified SKU/code match is useful but does not prove that
  the specified product, finish, thickness or dimensions are suitable for
  fabrication. A true allocation/reservation model is a separate task.

The API retrieves at most 101 profiles, 101 material rows and 1001 inventory
items to detect truncation. More than 100 related order profiles/materials
returns an explicit error, never a false clean report. If the inventory
catalog exceeds 1000 rows, the evidence is marked incomplete and any
unmatched items remain unknown.

## AI model controls

```dotenv
OPENROUTER_PRODUCTION_MODEL=
OPENROUTER_ORDER_INTAKE_MODEL=
OPENROUTER_ORDER_INTAKE_STRICT=true
```

Set an explicit model known to support OpenRouter structured JSON Schema,
or reuse the R13 intake model. Strict JSON Schema / provider
`require_parameters=true` is the default. Setting
`OPENROUTER_ORDER_INTAKE_STRICT=false` deliberately enables legacy
JSON-object response mode; the server **still validates and rejects**
unsupported station IDs, malformed output and unintended extra fields.
The recommended station vocabulary exactly matches the canonical
`confirm_order_with_stages` station list:
`CAD, CNC, EDGE, ASSEMBLY, PAINT, PACKAGING, DELIVERY`.

The server will *not* execute tool calls or model-suggested writes.
If OpenRouter, key resolution, routing or structured output fails, the
server returns the **deterministic checks alone** with an explicit
`aiWarning`, not a fabricated AI assessment.

Send only a limited number of profile and material references to the
provider (max 30 profiles, 50 materials, 2000 characters of order notes).
Server-side permission and user consent are both required.
Customer/order information and stock numbers are external-provider data:
do not run this against restricted customer orders without authorization.
The request doesn't send file binaries, unrelated orders or the full
material catalog to the provider.

## API

`POST /api/ai/order-readiness` with JSON:

```json
{"orderId":"<canonical draft_orders UUID>","consent":true,"language":"en"}
```

The server responds with source-backed `issues`, `materials`,
`profiles`, `state` (`blocked` / `needs-review` /
`checklist-clear`), `capturedAt`, `updatedAt` and optional
`ai`, `model`, `aiWarning`. Even `checklist-clear` is **not
approval to start production**.

The endpoint permits authorized editing roles for drafts, and
RD/Boss/HeadOfProduction on active confirmed/in-production orders;
archived, dispatched, cancelled or voided orders are not analyzed through
this production planner. All lookups respect existing RLS.

## Tests and live verification

```bash
npm run check
npx vitest run tests/unit/oms-r14-production-readiness.test.ts
npx vitest run tests/unit/oms-r13-order-intake.test.ts tests/unit/oms-r12-draft-orders.test.ts
npm run build
```

With authorized staging credentials and a disposable order:

1. Test a draft with no profiles, materials or attachments: missing fields
   and unknown inventory must not display as ready.
2. Add two actual profiles and one file; verify the template codes/name
   and quantity slots against the stored order UUID.
3. Match an order material to one SKU with the correct unit; verify the
   exact quantity and inventory stock. Change unit to force 'unknown',
   duplicate the SKU to force 'ambiguous', and create a genuine shortfall.
4. Check minimum-stock warnings without allowing stock reservation.
5. Confirm the same UUID into production; check the model sees only
   canonical stage names and cannot change their status.
6. Try from a disconnected account, wrong user role, invalid UUID and
   dispatched/archived orders: expect 401/403/400.
7. Temporarily disable OpenRouter or use a model without strict output
   support. Deterministic checks must still render with visible warning.
8. Edit and save draft while a report is displayed; confirm it becomes
   stale and the operator can rerun the check.
9. Check EN/RU/LV, keyboard navigation, client-data disclosure and
   no unexpected requests to external services from the browser.

**No SQL migration is required for R14.** R12 transactional form migrations
and existing profile/material/station RLS contracts must already be deployed.
No live database tests, OpenRouter calls, builds or browser acceptance were
run from this GitHub-only environment.
