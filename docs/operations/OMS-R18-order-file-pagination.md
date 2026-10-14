# OMS-R18 — Complete order attachment lists and reliable workspace refresh

**Source:** GitHub main after OMS-R17. **SQL:** none (existing R12/R15 migration requirements remain).

## Behavior and contracts

- The authenticated `GET /api/files?orderId=...&offset=N&limit=M` still returns a **plain JSON array**, preserving existing callers; a separate `X-Total-Count` response header reports the exact number of RLS-visible `order_files` junction rows. Each request is limited to 100 and uses deterministic `created_at, id` ordering with `Cache-Control: private, no-store`. Invalid pagination returns HTTP 400.
- The shared OrderFiles panel shows an accurate count, loads 50 records at a time, and lets staff load more. It invalidates stale requests when the order or response generation changes, preserving existing results when a refresh fails.
- The editor/overview task navigation reads the exact count using a 1-row page, rather than assuming a 100-row cap. The editor no longer preloads a redundant incomplete 50-row attachment list.
- The revision comparison and AI intake selectors paginate over the complete attachment set. They reject incomplete or concurrently changing lists rather than silently omitting sources. A safety limit of 10,000 attachment records reports an error explicitly.
- Upload attempts process the selected queue sequentially; successful files persist even if another upload fails. A final refresh reconciles the server truth; errors for failed files remain visible. A deletion is not reflected as successful until the server confirms it. Local order-file change events refresh relevant mounted consumers; independent browser tabs still require manual refresh.
- EN/RU/LV user-facing strings cover counts, pagination, errors and destructive confirmation.

## Acceptance before production

1. Prepare a draft with 120+ attachments. Verify exact count and Load more in editor and overview. Check revision and intake selectors can choose the newest and oldest records.
2. Upload three files with one unsupported/corrupt item. Confirm the two successful files remain linked and the failure is clearly listed. Refresh: no phantom uploads or duplicates.
3. Reject a delete of R15 revision evidence and verify the file remains listed and downloadable. Delete an ordinary file and confirm badge, overview and selectors reconcile.
4. Open multiple views; test rapid refresh, leaving before a response, order switches and stale requests. Check EN/RU/LV controls and mobile layout.
5. Exercise unrelated user/anonymous API requests, malformed offsets and requests beyond 100 per page. Confirm the list does not reveal inaccessible order attachments.
6. Run `npm run check`, `npx vitest run tests/unit/oms-r18-order-files.test.ts`, `npx vitest run tests/unit/oms-r16-order-workspace.test.ts` and `npm run build`.

**Not verified:** This connector-only batch cannot execute the real Svelte build, Supabase query, browser acceptance, or live file round-trip. Test on staging.
