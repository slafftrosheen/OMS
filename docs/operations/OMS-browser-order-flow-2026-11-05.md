# Browser actions, order deletion and workflow verification — 2026-11-05

Changes were rebuilt and deployed to `/opt/reclame-oms` on 2026-11-05. The running compilation reports revision `7b448be760df`, built at `2026-11-05T09:51:26.472Z`. Only `reclame-oms.service` was restarted; database services and the private environment were preserved.

The newer remote/production changes were merged before building, including the production checkout's previously uncommitted Toolkit analysis regression test. Both local checkouts are synchronized with the release source. This document's deployment update is a later documentation-only commit than the compiled revision.

Production health returned HTTP 200 with database, Auth and OpenRouter checks healthy. All **29 authenticated live checks passed**, covering the order list, analytics, logistics, production board, fourteen station queues, seven page routes and a nonexistent-order DELETE returning 404 without mutation. No customer records were edited by these checks. Telegram polling resumed with zero failures and a fresh heartbeat.

A verified PostgreSQL custom-format backup and the previous application build are retained privately under `/home/reclame/.local/state/oms/deployments/20261105-7b448be/`. The database backup was validated with `pg_restore --list` before migrations.

## Findings and changes

- Notification success and error paths called `crypto.randomUUID()` unconditionally. That reproduced the supplied exception and could make a successful business action appear to fail, then fail again while reporting the error. Client notifications, toast events, material/color rows, offline actions, error handling and the order editor now share a UUID helper. It uses native UUIDs when available, then `getRandomValues`, with a non-secret UI fallback for environments without Web Crypto. Optional sound failures cannot interrupt feedback and finished audio contexts are closed. [Browser API secure-context requirement](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID).
- Both existing order DELETE URLs now use an authorized, version-checked database transaction. Boss, HeadOfProduction and RD can delete open drafts/orders from the overview or saved editor. Deletion means `CANCELLED`: attachments, PO identity, material consumption and audit history remain. Production reservations and loading links are released atomically. Dispatched/archived/voided orders retain their closed lifecycle; archive remains the route for dispatched orders. Cancelled orders leave normal lists and station queues; `/api/orders?status=CANCELLED` and direct detail links retain history access under RLS. Direct physical deletion by authenticated clients is revoked.
- The station realtime store subscribed to the `orders` view and filtered stages by a nonexistent `order_id`. It now uses `draft_orders` and `draft_order_id`. Read-only inspection also found the production realtime publication lacked both canonical order tables. An additive migration publishes them idempotently.
- Ready-to-load station cards provide the loading-calendar handoff and disable production mutations the server would reject. The order overview offers dispatch only at READY_TO_LOAD and stage changes only during production.
- Dashboard/analytics queries referenced missing columns and incompatible views: `completed_at` does not exist on canonical orders, `order_trends` is weekly rather than daily, and KPI fields expected by the old API do not match its view. Reports now page through request-scoped, RLS-authorized canonical rows. Daily completions use dispatch dates (with archive/legacy fallback), cancelled work is excluded, station workload has the shape the page renders, and unavailable reports show retry/error states. Dates use Europe/Riga for dashboard day boundaries. Logistics now has an endpoint returning the aggregates its dashboard consumes. Main dashboard inventory navigation uses `/inventory`, and the create action is limited to authorized managers.
- Server upload validation already accepts empty/generic browser MIME declarations. Multipart regressions verify PDF bytes, normalization to `application/pdf`, private bucket use and rejection of disguised contents. The shared upload component passes in Chromium and Firefox with `randomUUID` unavailable.

## Applied production migrations

Applied through `bash scripts/supabase-migrate.sh push` and recorded in `supabase_migrations.schema_migrations`:

1. `supabase/migrations/20261105000001_audited_order_deletion.sql`
2. `supabase/migrations/20261105000002_order_realtime_publication.sql`

The runner applied these two migrations and found 103 prior migrations already current. Verification confirmed the deletion RPC, revoked direct physical-delete privilege, and publication of both `draft_orders` and `order_stages`. The deletion migration explicitly reloads the PostgREST schema. Existing stored attachments are not copied or removed by these migrations.

## Validation

All workloads run sequentially on the Raspberry Pi, with one browser worker and Node heaps bounded to 1–1.5 GiB. Existing application and database services were preserved. Browser GTK dependencies were extracted under `/tmp/oms-browser-libs` without installing system packages.

- `NODE_OPTIONS=--max-old-space-size=1024 node packages/vitest/bin.js tests/unit`: **1,120 passed**.
- `NODE_OPTIONS=--max-old-space-size=1536 npm run check`: **0 errors, 14 warnings in 6 files** after integrating newer upstream UI changes.
- `NODE_OPTIONS=--max-old-space-size=1536 npm run build`: **passed**, including adapter-node; vendor bundler warnings remain.
- `scripts/ops/oms-local-order-check.sh`: **passed**. Pinned to `supabase_db_OMS`, with both new migrations and all test records rolled back. Covers missing-file submission rejection, draft/review/confirmation, fourteen station completions, sequential handoffs, canonical stock deduction, duplicate-completion denial, stale deletion, idempotent deletion, audit, operator denial, physical-delete denial and publication registration.
- `NODE_OPTIONS=--max-old-space-size=1024 node packages/vitest/bin.js src`: **110 passed**.
- `node node_modules/@playwright/test/cli.js test --config tests/ui/playwright.order-flow.config.ts`: **40 passed** across Chromium and Firefox, using one worker. On this host, supply `OMS_QA_CHROMIUM_EXECUTABLE=/home/reclame/.cache/ms-playwright/chromium_headless_shell-1208/chrome-linux/headless_shell` and `LD_LIBRARY_PATH=/tmp/oms-browser-libs/usr/lib/aarch64-linux-gnu` for the installed binaries/dependencies. Covers notifications with no randomUUID, multipart uploads, deletion failure/retry, all manager roles, station-role denial, all fourteen station views/controls and READY_TO_LOAD delivery handoff.
- `git diff --check`: **passed**.

The SQL material fixture starts with 20 units and ends with 6 after fourteen one-unit completions; replay attempts consume nothing further. Attachments remain linked after confirmation. SQL fixtures are metadata fixtures, not actual Storage objects.

Browser fixtures mount real Svelte components and intercept API responses. The separate database tests exercise actual SQL transactions. The subsequent live checks verify authenticated production reads and missing-order rejection after deployment. Safari/WebKit, writes to live customer orders/files and external Telegram message delivery were not exercised.

## Telegram and monitoring

Read-only production inspection found enabled Telegram configuration, automatic delivery enabled, a configured application link, one enabled connection, and a polling receiver with recent heartbeats (17–25 seconds old when sampled), zero failures and no last error. Publishing/outbox functions exist; no queued deliveries were present when inspected. The existing notification/Telegram unit suites run as part of the 1,120-test suite. No messages were sent, and tokens, chat IDs and customer payloads were not printed.

The missing Sentry DSN warning means optional error monitoring is disabled. It did not cause the UUID/action failure; no DSN or external monitoring service was invented or configured.

Final release logs are local under `/tmp/oms-release-{unit,source,check,build,browser,database,preflight,migrations,live-smoke}-20261105.log` (not committed).
