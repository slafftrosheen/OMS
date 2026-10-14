# OMS-R17 — Revision-safe order editing and audit hardening

**Source committed; live validation outstanding.** Depends on applying
`supabase/migrations/20261014000001_order_edit_concurrency_and_audit.sql`
after R12's atomic draft form migration.

R16 prevented accidental navigation with unsaved local changes; it did not
prevent two operators from overwriting the same draft/profile instances.
R17 requires `expectedUpdatedAt` (the exact prior GET/PUT timestamp) in
draft PUT and manager PATCH. Missing versions return HTTP 428. The new
four-argument SQL wrapper locks the order, compares its timestamp, then
invokes R12's role-checked transactional form/profile updater. A stale
save returns 409 and writes no form or profile changes. Manager PATCH
checks both status and updated_at in its update predicate.

Editor and new-order upload retries keep the last saved revision. EN/RU/LV
warnings explicitly tell operators to copy unsaved work before reloading.
No automatic merge, file lifecycle or AI approval behavior is changed.

The audit API no longer treats browser-supplied usernames, entity IDs or
before/after values as authoritative. A new restricted UI-telemetry RPC
derives actor identity from auth.uid(), tags UI entries with `ui:`, and
bounds their details. Generic create_audit_log EXECUTE is revoked from
authenticated users. Audit listing is gated by active manager profiles.

## Required deployment and acceptance

1. Back up DB; inspect active functions/grants and callers of the old
   three-argument order updater or create_audit_log. Migrate external
   callers before revoking the old signatures.
2. Apply R17 SQL on staging **before** deploying matching application
   code. New API fails closed (503) when required RPC is missing.
3. Run `npm run check`, `npx vitest run tests/unit/oms-r17-consistency.test.ts`,
   and `npm run build`.
4. Open a draft simultaneously in two browsers. Save different profile
   quantities in A and B: B must get 409; A's order and profiles must
   remain intact. Check manager PATCH on a confirmed order.
5. Retry a partially-uploaded order: attachments stay under the same UUID.
   Confirm exact server revision is sent when updating the retry draft.
6. Verify spoofed username/entity/oldValues are not accepted as audit;
   nonmanagers receive 403 on list; direct generic RPC calls are denied.

No live Supabase test, build or browser E2E could run in this GitHub
connector-only session. Treat staging verification as mandatory.
