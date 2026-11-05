# Browser actions, order deletion and workflow verification — 2026-11-05

Changes are in `/home/reclame/oms-main-publish`. The running service uses `/opt/reclame-oms`; it has not been redeployed or restarted, and production migrations have not been applied.

## Findings and changes

- Notification success and error paths called `crypto.randomUUID()` unconditionally. That reproduced the supplied exception and could make a successful business action appear to fail, then fail again while reporting the error. Client notifications, toast events, material/color rows, offline actions, error handling and the order editor now share a UUID helper. It uses native UUIDs when available, then `getRandomValues`, with a non-secret UI fallback for environments without Web Crypto. Optional sound failures cannot interrupt feedback and finished audio contexts are closed. [Browser API secure-context requirement](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID).
- Both existing order DELETE URLs now use an authorized, version-checked database transaction. Boss, HeadOfProduction and RD can delete open drafts/orders from the overview or saved editor. Deletion means `CANCELLED`: attachments, PO identity, material consumption and audit history remain. Production reservations and loading links are released atomically. Dispatched/archived/voided orders retain their closed lifecycle; archive remains the route for dispatched orders. Cancelled orders leave normal lists and station queues; `/api/orders?status=CANCELLED` and direct detail links retain history access under RLS. Direct physical deletion by authenticated clients is revoked.
- The station realtime store subscribed to the `orders` view and filtered stages by a nonexistent `order_id`. It now uses `draft_orders` and `draft_order_id`. Read-only inspection also found the production realtime publication lacked both canonical order tables. An additive migration publishes them idempotently.
- Ready-to-load station cards provide the loading-calendar handoff and disable production mutations the server would reject. The order overview offers dispatch only at READY_TO_LOAD and stage changes only during production.
- Dashboard/analytics queries referenced missing columns and incompatible views: `completed_at` does not exist on canonical orders, `order_trends` is weekly rather than daily, and KPI fields expected by the old API do not match its view. Reports now page through request-scoped, RLS-authorized canonical rows. Daily completions use dispatch dates (with archive/legacy fallback), cancelled work is excluded, station workload has the shape the page renders, and unavailable reports show retry/error states. Dates use Europe/Riga for dashboard day boundaries. Logistics now has an endpoint returning the aggregates its dashboard consumes. Main dashboard inventory navigation uses `/inventory`, and the create action is limited to authorized managers.
- Server upload validation already accepts empty/generic browser MIME declarations. Multipart regressions verify PDF bytes, normalization to `application/pdf`, private bucket use and rejection of disguised contents. The shared upload component passes in Chromium and Firefox with `randomUUID` unavailable.

## Deployment requirements

Apply these migrations through the normal migration workflow before deploying this build:

1. `supabase/migrations/20261105000001_audited_order_deletion.sql`
2. `supabase/migrations/20261105000002_order_realtime_publication.sql`

The DELETE endpoints report 503 if the deletion RPC is absent. A code-only deployment cannot enable deletion or database realtime publication. Existing stored attachments are not copied or removed by these migrations.

## Validation

All workloads run sequentially on the Raspberry Pi, with one browser worker and Node heaps bounded to 1–1.5 GiB. Existing application and database services were preserved. Browser GTK dependencies were extracted under `/tmp/oms-browser-libs` without installing system packages.

- `NODE_OPTIONS=--max-old-space-size=1024 node packages/vitest/bin.js tests/unit`: **899 passed**.
- `NODE_OPTIONS=--max-old-space-size=1536 npm run check`: **0 errors, 0 warnings**.
- `NODE_OPTIONS=--max-old-space-size=1536 npm run build`: **passed**, including adapter-node; vendor bundler warnings remain.
- `scripts/ops/oms-local-order-check.sh`: **passed**. Pinned to `supabase_db_OMS`, with both new migrations and all test records rolled back. Covers missing-file submission rejection, draft/review/confirmation, fourteen station completions, sequential handoffs, canonical stock deduction, duplicate-completion denial, stale deletion, idempotent deletion, audit, operator denial, physical-delete denial and publication registration.
- `NODE_OPTIONS=--max-old-space-size=1024 node packages/vitest/bin.js src`: **110 passed**.
- `node node_modules/@playwright/test/cli.js test --config tests/ui/playwright.order-flow.config.ts`: **40 passed** across Chromium and Firefox, using one worker. On this host, supply `OMS_QA_CHROMIUM_EXECUTABLE=/home/reclame/.cache/ms-playwright/chromium_headless_shell-1208/chrome-linux/headless_shell` and `LD_LIBRARY_PATH=/tmp/oms-browser-libs/usr/lib/aarch64-linux-gnu` for the installed binaries/dependencies. Covers notifications with no randomUUID, multipart uploads, deletion failure/retry, all manager roles, station-role denial, all fourteen station views/controls and READY_TO_LOAD delivery handoff.
- `git diff --check`: **passed**.

The SQL material fixture starts with 20 units and ends with 6 after fourteen one-unit completions; replay attempts consume nothing further. Attachments remain linked after confirmation. SQL fixtures are metadata fixtures, not actual Storage objects.

Browser fixtures mount real Svelte components and intercept API responses. The separate database tests exercise actual SQL transactions. Together these verify the tested contracts and controls; they are not a claim of a newly deployed production end-to-end journey. Safari/WebKit, live customer files, production migration application and external Telegram message delivery were not exercised.

## Telegram and monitoring

Read-only production inspection found enabled Telegram configuration, automatic delivery enabled, a configured application link, one enabled connection, and a polling receiver with recent heartbeats (17–25 seconds old when sampled), zero failures and no last error. Publishing/outbox functions exist; no queued deliveries were present when inspected. The existing notification/Telegram unit suites run as part of the 899-test suite. No messages were sent, and tokens, chat IDs and customer payloads were not printed.

The missing Sentry DSN warning means optional error monitoring is disabled. It did not cause the UUID/action failure; no DSN or external monitoring service was invented or configured.

Logs are local under `/tmp/oms-{unit,source,check,build,browser,database}-20261105.log` (not committed).
