# OMS-R35 — Native order form and Canvas revision chain

Status: source changes committed directly to `main`; no CI, GitHub Actions,
build, Supabase migration, external API call or deployment performed.

## Problem found

The saved-order editor used a version-checked native order form update, but
the separate Canvas save ran immediately afterwards and updated
`draft_orders.updated_at` again without returning that version to the
editor. The editor retained the earlier version, causing future saves to fail
with 409 even without a second operator.

Worse, the original Canvas endpoint only matched order UUID/status, not the
`updated_at` revision. Thus its write could overwrite a newer Canvas created
by another operator.

R35 fixes these issues with the **existing** versioned order contracts.

## Updated persistence sequence

1. The editor has a valid saved order ID, fetched revision and initial form
   fingerprint. No model suggestion is automatically saved.
2. **Only if native fields or profiles changed**, the editor uses the existing
   4-argument versioned `oms_update_draft_form` RPC via the form PUT.
   It captures the submitted fingerprint and records both the returned order
   version and that committed fingerprint. Another edit during the request
   remains dirty.
3. **Only if Canvas changed**, the editor takes a fresh document snapshot from
   tldraw at save time (not the 250 ms debounced callback's older snapshot).
   It sends `{ snapshot, expectedUpdatedAt }` to the Canvas PUT. The API
   validates that revision and that the only other input is `snapshot`.
4. The Canvas update matches order UUID, lifecycle status **and**
   `updated_at` in the same conditional update. A mismatch returns 409,
   and it returns its authoritative `updatedAt` on success. A changed order
   cannot silently overwrite the Canvas.
5. The editor adopts the returned Canvas revision, so the next ordinary form
   or Canvas save uses the actual latest token. If more Canvas edits occur
   while the save runs, a local serial guard keeps the dirty indicator set
   and requires another explicit save.
6. If the native form was saved but the Canvas request fails, the editor
   retains the committed native fingerprint and updated version. Retrying
   writes only the still-dirty Canvas. It does not destroy/recreate every
   native profile a second time.
7. Confirmation still calls `saveDraft()` first and refuses confirmation
   when the latest local changes were not saved.

This sequence preserves the order form's original CNC / BENDER / FRONT /
PAINTING / ASSEMBLING fields, profile templates, quantities and uploaded file
links. The new Canvas body contract has exactly one known client caller,
the saved-order editor, which is updated in this batch.

## Deployment/acceptance plan

- On an existing DRAFT, edit only client notes then Save Draft twice. The
  second save must not rewrite the Canvas or trigger an optimistic-lock error.
- Edit only the Canvas, save immediately after dragging a shape (before the
  250 ms debounce) and reload. The most recent position should persist.
- Edit both the profile form and Canvas in one session and save. Reload, change
  another native field and save again: no spurious 409.
- Edit Canvas from two browser sessions. Save session A; saving session B
  without reloading must return 409 and must not overwrite A's Canvas.
- Simulate a failed Canvas PUT after native form update, then retry. Ensure
  the profile values persist and the retry only writes the Canvas.
- While a save request is in flight, edit a form field or Canvas shape.
  The user must still be prompted to save again before confirmation.
- Check DRAFT and PENDING_REVIEW permissions and confirm flow.
  Unauthorized roles must not get a Canvas write or use these endpoints.
- Verify AI Intake and order assistant suggestions still only stage accepted
  values locally and require an explicit Save Draft.

The R34 AI source-to-profile contract remains unchanged. AI does not
trigger new Canvas or order writes.

## Verification limitation

Only GitHub source contract checks and authored regression tests were added.
A live server, real Supabase policies, actual concurrency, and browser/React
tldraw behavior have **not** been verified. Before deployment, manually run:

```sh
npm ci
npm run check
npx vitest run tests/unit/oms-r35-order-persistence.test.ts
npm run build
```

Deploy with the existing self-hosted OMS service after the acceptance pass;
GitHub is source storage, not the deployment runtime.
