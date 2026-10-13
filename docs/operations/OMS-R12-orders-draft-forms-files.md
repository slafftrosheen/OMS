# OMS-R12 — Orders / Draft Orders contract stabilization (13 October 2026)

**Status:** committed to `main`. Requires an additive SQL migration and live acceptance before describing the deployed installation as working.

## Canonical model

`draft_orders` is the **only mutable order header table**. A confirmed order does not move to a new table or gain a new ID: the `orders` view points to the same row. Thus `order_profiles.draft_order_id`, `order_stages.draft_order_id` and `order_files.draft_order_id` must always refer to the same UUID. `files` owns file metadata; `order_files` links a file to an order. There is **no file copying on confirmation**.

## Corrected workflow

1. RD, Boss or HeadOfProduction creates an order via `POST /api/draft-orders`. All fields and profiles are validated, normalized and saved **atomically** by `oms_create_draft_form`. The initial status is always `DRAFT`; PO is null.
2. The browser uploads one or more attachments through `POST /api/files/upload`. New uploads use request-scoped Supabase storage in the existing **private `files` bucket**, rather than the legacy global anonymous StorageService and its unavailable `order-files` bucket. A `files` record and `order_files` link are created; failure triggers cleanup and does not falsely report a successful upload. File types include PDF, PNG/JPEG/WebP/GIF, CDR, DXF, ZIP, DOCX, XLSX and TXT (maximum 25 MiB; validated MIME/extension and common file signatures).
3. Only when **every required attachment has uploaded** does the UI call `POST /api/draft-orders/{id}/submit`. The `oms_submit_draft_for_review` RPC locks the row, verifies at least one persisted `order_files` link, and transitions `DRAFT` to `PENDING_REVIEW`. Notification is sent only on the actual transition; repeat requests are idempotent.
4. If any upload fails, the draft remains **DRAFT**, retains its UUID and successful uploads, and permits retry. The new-order form uses PUT on retry so changed form/profile fields aren't lost. Duplicate UI submits are suppressed after success.
5. Before confirmation, the draft creator or RD/Boss/HeadOfProduction can edit the fields and profiles via `PUT /api/draft-orders/{id}`. `oms_update_draft_form` validates role/status again under a row lock, updates order metadata and replaces profile rows in a **single DB transaction**. No direct PO/status mutation.
6. A manager reviews and confirms via `POST /api/draft-orders/{id}/confirm`. Boss alone assigns the externally issued PO; a manager can confirm a PO already assigned. The existing `confirm_order_with_stages` RPC atomically publishes `CONFIRMED` and creates station rows. The editor now calls this actual endpoint instead of the obsolete `/approve` route. If its prerequisite save fails, confirmation stops.
7. Confirmation keeps the order UUID and file links intact. Authorized roles can continue attaching production files to CONFIRMED/IN_PRODUCTION/READY_TO_LOAD/ON_HOLD orders; DISPATCHED/ARCHIVED/VOIDED reject further file modification. Deleting an order via draft DELETE is a status change to `CANCELLED`, not a cascade of linked files.
8. Order editor now includes editable metadata (client, title, deadline, loading date while draft, priority, notes, delivery contact details, delivery email, R&D flag/notes), profiles (all four quantity slots and notes), and **Files** tab; all role-gated on the server. The R&D flag and notes map to `is_rd`, `rd_notes`; delivery email is preserved in `draft_orders.metadata.delivery_email` to avoid a breaking table change. Other existing `metadata` keys remain untouched.

## Role matrix

| Operation | RD | Boss | HeadOfProduction | Creator without manager role | Other staff |
| --- | --- | --- | --- | --- | --- |
| Create draft | Yes | Yes | Yes | No | No |
| View draft | Yes | Yes | Yes | Own only | No |
| Edit draft fields/profiles | Yes | Yes | Yes | Own only | No |
| Upload/remove draft attachments | Yes | Yes | Yes | Own only | No |
| Submit completed draft to review | Yes | Yes | Yes | Own only | No |
| Assign external PO | No | Yes | No | No | No |
| Confirm with already assigned PO | Yes | Yes | Yes | No | No |
| Edit confirmed metadata/upload production files | Yes | Yes | Yes | No | No |
| View confirmed order and linked attachments | Existing order visibility/RLS rules apply | | | | |

The server and database RPC enforce the role/status rules; hidden/disabled UI controls are *not* the security boundary. Existing RLS migrations still matter and require live inspection.

## Deployment dependencies

Apply `supabase/migrations/20261013000001_atomic_draft_forms.sql` **after** the existing order/RLS/lifecycle migrations and a backup. The OMS service must run with `BODY_SIZE_LIMIT=32M` (set in its actual systemd environment) and the live proxy must permit 32 MiB requests. The self-hosted Supabase stack must have applied `20260425000008_storage_buckets.sql`, with the private `files` bucket and suitable RLS policies, and its **global Storage upload limit must accommodate at least 25 MiB**. No migration is applied automatically by committing to GitHub.

The current `files` Storage bucket has historically permissive authenticated policies. Server API routes enforce order-specific roles, but direct Supabase Storage access may have broader read/write grants on existing objects. **Do not claim end-to-end order attachment confidentiality before auditing and tightening the live Storage RLS and shared-bucket consumers.** Avoid broad Storage policy rewrites without impact analysis for other OMS file domains.

## Validation

```bash
npm run check
npx vitest run tests/unit/oms-r12-draft-orders.test.ts
npx vitest run tests/unit/oms-r02-lifecycle.test.ts tests/unit/oms-r10-multimodal.test.ts
npm run build
```

For a disposable draft and manager session, test uploads, listing and hash-identical authenticated download:

```bash
OMS_BASE_URL=https://oms.example.com \
OMS_ORDER_ID=<draft-uuid> \
OMS_COOKIE_JAR=/secure/private-curl-cookies.txt \
OMS_TEST_FILE=/tmp/proof.pdf \
bash scripts/smoke-order-attachments.sh
```

The script leaves its disposable test file linked so the attachment can be checked after confirmation. Do not paste or expose session cookies.

### Browser acceptance matrix

- Create an order with 1–3 profiles, all quantity fields, client/title, deadline, loading date, priority, contact/address/email, R&D flag/notes, and multiple files. Confirm stored values and order counts on reload and in the review queue.
- Cause a file upload failure (oversize file, unsupported MIME, unavailable Storage): draft remains DRAFT and previous attachments remain linked. Retry; after success submit to review exactly once.
- Editor PUT on the same draft: change title, deadline, delivery, notes and profile quantities; reload and verify. Submit, assign PO as Boss, confirm and inspect the same UUID; all earlier files remain accessible in the order Files tab.
- Confirm as HoP with no PO (expected rejection); assign PO as Boss, confirm as HoP; duplicate confirmation is idempotent and creates no duplicate station rows. Existing workflow station statuses remain unchanged on repeat.
- Test authentication and authorization for RD/Boss/HoP, creator Operator/StationHead, unrelated Operator/StationHead, signed-out client. Ensure denied writes receive 403 and no metadata changes.
- Try deleting attachments while unauthorised, or editing/adding after DISPATCHED; verify denial. Check legacy stored files remain downloadable via the compatibility path.
- Confirm no changes to the `orders` view, no duplicate header rows, and no unexpected `order_files` cascade.

**Limitations:** Existing old-era order-file records may have lived in a local filesystem or historical `order-files` Storage bucket; the compatibility download attempts those paths but must be verified on production with real legacy rows. No live database migration, test suite, web UI or storage round trip was executed during this GitHub-only development pass.
