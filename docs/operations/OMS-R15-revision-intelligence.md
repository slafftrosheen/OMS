# OMS-R15 — Revision Intelligence: customer file comparisons and audited change requests

**Status:** code committed directly to `main`, live validation still required.
**Migration:** `supabase/migrations/20261013000002_harden_change_request_rpcs.sql`.
Back up and inspect the live migration history before applying. This change
updates the behavior and execute permissions of existing privileged
change-request functions. Deploy the migration before enabling the new UI.

## How the workflow works

1. Upload both the original and revised customer PDF/images to the **same
   canonical order UUID** through the existing private file upload system.
   Do not overwrite/delete the original; it remains essential evidence.
2. Open **Orders → Edit order → Revisions**, choose original and revised
   files, approve sending *both* to OpenRouter, then click **Compare versions**.
3. OMS confirms the logged-in user's order access, both `order_files` links,
   allowable MIME types and maximum file sizes (8 MiB per image, 12 MiB per
   PDF, 20 MiB total). The authenticated Storage reader verifies file signatures
   and hashes both payloads with SHA-256.
4. OpenRouter receives two labeled, **real** private files plus limited
   persisted order context. PDFs use the no-OCR `cloudflare-ai` parser.
   The response must pass strict JSON Schema / Zod validation and can
   report differences, ambiguities, risks and suggested **order fields only**.
   Visual/CAD measurements and model-quoted evidence are *not* verified
   production specifications.
5. **All proposal checkboxes are unchecked by default.** Staff explicitly
   select the actual fields to request. No PDF extraction silently
   overwrites a saved order, modifies a production station, or confirms a PO.
6. When **Submit for review** is confirmed, the server checks that the
   order's `updated_at` still matches, reopens **both source binaries**
   and compares their SHA-256 hashes again, validates proposed field values
   and checks that proposed changes differ from persisted values.
7. The new `oms_create_revision_change_request` RPC atomically creates
   an ordinary `change_requests` record and `order_activity_log` event
   **plus** an immutable `order_revision_sources` row containing both
   file IDs, hashes, order ID, author and creation time.
   Both `files.id` references are `ON DELETE RESTRICT`.
   The file deletion API checks for these references **before removing bytes**
   from Supabase Storage and rejects deletion with 409.
8. RD/Boss/HeadOfProduction review a pending request through the existing
   `POST /api/change-requests/{id}/review` endpoint. **Review changes
   the request status but never applies an order update.**
   The existing legacy `/approve` endpoint can additionally apply
   changes: R15 does not invoke it; after migration its underlying
   `apply_change_request` RPC is restricted to authorized active managers,
   excludes lifecycle columns, and rejects already-applied requests.

## What AI can and cannot propose

Writable change-request fields from the AI comparison are:
`title`, `client`, `due_date`, `priority`, `notes`,
`is_rd`, `rd_notes`.

A production-material change, profile quantity, CAD geometry, drawing
revision or station route is summarized as a **risk/question requiring
human clarification**. Those do not gain new writable fields just
because a language model reported them.

The legacy change-request allowlist is now explicitly hardened to exclude
`status`, `po_number`, `confirmed_at` and other lifecycle columns.
Existing historical requests proposing `status` cannot be auto-applied
after this migration. That is intentional and should be communicated to
the production management team.

## Security and persistence

- New comparison endpoint `POST /api/ai/order-revisions` is strictly
  read-only and uses `locals.supabase` (user JWT/RLS). No public URLs,
  client-supplied file paths, storage signed URLs or external web tools.
- Tracked request creation endpoint
  `POST /api/orders/revision-change-request` re-verifies order, role,
  file ownership, file integrity and order revision, then uses the
  transaction-backed RPC.
- The database migration replaces previously under-protected
  SECURITY DEFINER `create_change_request`, `review_change_request`
  and `apply_change_request`. Managers can review/apply; active order
  creators/managers and assigned workers can request changes.
  `order_revision_sources` exposes read-only information under RLS;
  clients cannot insert/delete audit evidence directly.
- Approving a request and applying the order changes are deliberately
  separate decisions. Any client invoking the legacy apply endpoint will
  still need a manager role at the database layer.
- Immutable SHA-256 hashes prove which bytes were compared **if the
  originals still exist**. They do not certify the AI conclusion.
- Revisions are tied to file IDs, not filenames; two identical filenames
  can represent separate historical binaries and remain distinguishable.
- No third-party customer documents should be sent without appropriate
  organizational/customer permission. Staff explicitly opt in per comparison.

## Model selection and operation

```dotenv
OPENROUTER_MODEL=openrouter/free
OPENROUTER_ORDER_INTAKE_MODEL=your-compatible-text-pdf-model
OPENROUTER_VISION_MODEL=your-compatible-image-and-structured-output-model
OPENROUTER_ORDER_INTAKE_STRICT=true
```

Models must support genuine images and/or PDF parser plugin and JSON Schema
structured responses. Strict JSON Schema mode is the default and fails
closed if unsupported. Operator opt-in
`OPENROUTER_ORDER_INTAKE_STRICT=false` allows JSON mode for compatible
legacy models, with mandatory server-side Zod validation.

PDF parsing defaults to the explicitly selected no-OCR Cloudflare parser.
Scanned PDFs may yield incomplete results; R15 does **not** automatically
enable paid OCR. Convert to a verified preview if OCR is necessary.
Native CDR/DXF comparisons are not yet supported: convert to PDF/raster
without discarding originals. The source attachments remain unmodified.

## Tests and acceptance

```bash
npm run check
npx vitest run tests/unit/oms-r15-revision-intelligence.test.ts
npx vitest run tests/unit/oms-r14-production-readiness.test.ts tests/unit/oms-r13-order-intake.test.ts
npm run build
```

Manual staging test matrix:

1. Prepare an order with baseline and revised 1-page PDFs/images whose
   differences are known. Select the files in reverse order and verify
   the assistant labels old/new correctly.
2. Make an explicit comparison request with consent. Check model/source
   labels, source excerpts, missing details, risks, uncertainty and that
   no field is selected by default.
3. Accept only one of multiple proposals. Create a change request and
   inspect `change_requests`, `order_activity_log`,
   `order_revision_sources`, both actual file IDs and stored SHA-256 values.
4. Reload/reopen from another authorized account. Confirm the recorded
   request is visible in Revisions history. Verify both file downloads
   are byte-identical and **cannot be deleted** after audit creation.
5. As a non-manager editor create a review request (where authorized);
   attempt to approve or apply: expect 403. As Boss/HoP/RD approve/reject
   through the dedicated review endpoint and verify the order fields and
   stage states **remain unchanged**.
6. Try replacing an original file, removing a file association, using a file
   linked to another order, passing a fake hash, or editing the order while
   a comparison is open: request creation must fail without partial audit.
7. Try `status`, `po_number`, template ID, stage state or inventory
   changes in a model result / forged POST / direct RPC: reject.
8. Test read-only archived/dispatched/cancelled orders, unrelated users and
   signed-out sessions: no paid model calls or mutations.
9. Verify EN/RU/LV labels and mobile/editor layout. Check model errors do
   not create phantom requests and no automatic fallback to paid OCR occurs.
10. Confirm previous R12 order file upload/list/download and R14 readiness
    regression tests still pass.

**Environment limitation:** A source-level GitHub audit can verify the
contracts and committed tests; it cannot prove the migration has been
applied, the model is correctly configured or the workflows succeed on
your running OMS installation. Run the acceptance matrix against a
disposable staging order before production rollout.
