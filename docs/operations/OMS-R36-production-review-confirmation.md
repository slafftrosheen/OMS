# OMS-R36 — Reliable review and production-release handoff

Status: source changes committed directly to `main`; no CI, GitHub Actions,
build, live API call, SQL migration execution or production deployment run.

## Production lifecycle contracts (unchanged unless stated)

- The original order form (CNC, BENDER, FRONT, PAINTING, ASSEMBLING, quantities,
  notes, profile templates) is still authoritative. All OpenRouter order chat
  and AI Intake output is advisory, and approved suggestions are only staged in
  local form state pending an explicit operator Save Draft.
- The workflow still supports manager confirmation of `DRAFT`, `draft`, or
  `PENDING_REVIEW`. **R36 does not silently outlaw direct DRAFT confirmation**,
  which is covered by existing tests; the modal instead warns when it bypasses
  Pending Review. A separate product-policy decision would be needed to force
  Pending Review for every order.
- Boss alone assigns an external PO. RD / Boss / HeadOfProduction may confirm
  according to existing role rules. PO uniqueness is still database-enforced.
- Confirmed orders still enter the original `CAD → CNC → EDGE → ASSEMBLY →
  PAINT → PACKAGING → DELIVERY` station workflow in one transaction.

## New migration: deploy before new frontend/backend

`supabase/migrations/20261016000001_confirmation_handoff_guards.sql`

Requires R02, R12 and their dependent tables. It redefines the existing
two-argument `confirm_order_with_stages(UUID,TEXT)` while retaining all
prior statuses and stage creation behavior. It adds a required file-link
check (joins `order_files` to `files`) **inside the locked confirmation
transaction**, so deleting all attachments after review cannot publish an
empty order to production.

It additionally creates an explicitly revision-checked overload,
`confirm_order_with_stages(UUID,TEXT,TIMESTAMPTZ)`. It locks the same
`draft_orders` row, compares `updated_at` under that lock, and only then
calls the established two-argument function. An old direct caller can continue
using the two-argument RPC (but it still receives the attachment requirement).
The application confirmation endpoint now uses only the three-argument RPC,
which must be installed **before deploying R36 app code**. No new tables,
columns, order-form fields or automatically issued PO values are added.

## Server confirmation

`POST /api/draft-orders/{id}/confirm` and its `/approve` compatibility
alias now require a valid `expectedUpdatedAt` ISO timestamp from the
operator's saved order snapshot. A missing value yields 428; an older saved
revision or missing linked files yields 409. On success, return the stored
status/PO from the atomic RPC.

A simultaneous second confirmation may reach the RPC after the first one
committed. When the RPC says `idempotent:true`, the endpoint **does not
repeat** activity log writes, CAD station-room messages or staff
notifications. It returns the existing confirmed state instead.

## User-facing review flow

**Order editor:**

1. Refresh the canonical attached-file count before presenting or submitting
   the confirmation dialog. Missing/unknown files block the action.
2. Keep the existing native Save Draft requirement. It persists operator
   changes first (including individually accepted AI fields).
3. Send `expectedUpdatedAt:orderUpdatedAt`, using R35's chained final
   form/Canvas revision. Stale results are rejected rather than overwritten.
4. Display a warning for direct DRAFT release. Do not insert a second
   technical-specification form or a new review-approval state.

**Review queue:**

1. Clicking Confirm loads a fresh saved order using its canonical GET rather
   than trusting the summary card. The modal displays the current deadline,
   profile count and the first eight attached drawing names, and captures
   `updatedAt`.
2. The release button is unavailable while loading, on no/unknown file links,
   or without a valid revision or external PO number.
3. The final POST sends the captured `expectedUpdatedAt`; a concurrent
   change results in an explicit reload/re-review instruction, not automatic
   retries or silent approval.
4. The original Reject flow and review queue role controls remain untouched.

EN/RU/LV user-facing confirmation preflight messages are included.

## Operator acceptance checklist

1. **Migration order:** apply the SQL above on staging before starting the R36
   SvelteKit server. Confirm both RPC signatures are present and accessible to
   authenticated staff; anon cannot execute them.
2. Create a DRAFT containing a single native profile and **no linked file**.
   Confirmation by Boss must fail with 409 and produce **zero** new stage rows.
   Upload a PDF and retry; it must succeed using the same saved order ID.
3. Submit an order for review with a PDF; unlink the file from another session,
   then try confirming the pending order. The transaction must refuse release.
4. Open the order editor twice. Save a native field in session A; try confirming
   from the stale session B. Expect 409, no stages, no notifications.
5. Open a review-queue confirmation modal, then edit the order elsewhere.
   Attempt confirming from the modal: expect the stale warning and require
   a new snapshot. Verify the modal displays the correct linked filenames and
   profile count.
6. Simultaneously send two valid confirmation requests from authorized users.
   Exactly one should transition the order and notify staff; the other should
   be stale or idempotent, never duplicate production/station notifications.
7. Confirm that HoP cannot invent/assign the PO, and Boss can supply the
   externally issued PO. Preserve all existing role and visibility checks.
8. Repeat DRAFT and PENDING_REVIEW paths in EN/RU/LV and verify the DRAFT
   bypass warning. Confirm no AI request or new manufacturing field is created.

## Verification and deployment limitations

Regression source tests are in
`tests/unit/oms-r36-production-handoff.test.ts`. Static GitHub source
checks are not a substitute for Postgres transactional tests or a browser
smoke run. **No tests/builds were executed by this batch.**

Recommended on the operator's staging system, after migration:

```sh
npm ci
npm run check
npx vitest run tests/unit/oms-r36-production-handoff.test.ts
npm run build
```

Deploy by updating the existing self-hosted systemd OMS service only after
the migration and acceptance pass. GitHub is used for source storage; no
GitHub Actions workflow or CI/deployment pipeline is required.
