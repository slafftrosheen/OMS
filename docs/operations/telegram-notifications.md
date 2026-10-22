# Telegram notifications and two-way OMS commands

Telegram is administered in **Settings → Telegram · R&D administration**. The company configuration is available only to active `RD` accounts. Each person separately links their private Telegram account under **Settings → Integrations**.

The integration supports:

- Trusted OMS notifications for orders/production, chat, inventory and system events, with company category filters and existing personal notification preferences.
- Private, linked-account commands for today's work, accessible orders, unread notifications, marking an own notification read, and pausing/resuming delivery.
- Optional OpenRouter questions grounded in the linked account's accessible OMS data.
- A production Node background worker, configurable delivery interval/batch/retry policy, and an optional authenticated external scheduler.
- Connection diagnostics, webhook/command-menu registration, queued-message dispatch and eligible-failure recovery from R&D settings.

No bot token, webhook secret, scheduler secret or service-role key is returned to a browser. The administrator sees whether each secret exists and its last four characters. Entering a replacement is an explicit write; an empty replacement field preserves the current secret.

## Initial installation

Apply these migrations, in order, through the normal deployment migration runner:

1. `supabase/migrations/20261022000001_telegram_notifications.sql`
2. `supabase/migrations/20261022000002_telegram_rd_settings.sql`
3. `supabase/migrations/20261022000003_telegram_bidirectional.sql`

The installation must have Supabase Vault available, as required by the existing OpenRouter settings. Keep Vault out of PostgREST's exposed schemas. Only service-role RPC wrappers can read/write the three Telegram Vault secrets. The wrapper that changes configuration also verifies that its application-supplied actor is an active `RD` profile.

The OMS server still needs its normal `PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; these infrastructure credentials are not Telegram user settings. Serve OMS at a public HTTPS address reachable by Telegram. Account linking and commands use `/api/telegram/webhook`, or that path below the application's configured base path.

### Configure everything from R&D settings

1. Create the company bot with Telegram's official **@BotFather** and obtain its API token and username.
2. Open **Settings → Telegram · R&D administration** in OMS. Enter the username, API token and public OMS address, including any application base path. Choose the calendar timezone; the default is `Europe/Riga`.
3. Generate two different secrets using the form buttons, one for webhook verification and one for the optional external scheduler. Generated values remain in the form until saved. Use “Show newly entered secrets” if you need to copy the scheduler secret. Previously saved values cannot be revealed.
4. Choose notification categories, delivery controls and available commands. Automatic delivery is enabled by default. OpenRouter `/ask` is **off** until R&D opts in.
5. Enable Telegram and save. Credential fields clear after a successful save. Saving options never silently replaces an existing credential with an empty field.
6. Use **Test connection**. The response identifies the bot and reports whether the webhook matches this OMS installation. A token/username mismatch must be corrected before registration.
7. Use **Register webhook**. OMS registers the saved HTTPS address with Telegram's verification secret, accepts only messages and callback queries, and updates private-chat command menus in English, Russian and Latvian. Pending Telegram updates are preserved. If menu synchronization is incomplete, the UI reports it and offers **Update bot commands**.
8. Each person opens **Settings → Integrations**, creates a connection link, and opens it in their private bot chat. The expiring QR/link identifies the current OMS account; it contains no bot credential.

After a webhook URL or verification-secret change, register the webhook again. Saving a new verification secret takes effect on the OMS endpoint immediately, so incoming updates using the old secret fail closed until registration is updated. Token rotation for the same bot preserves account links. Switching to a different bot ID disconnects all prior accounts and revokes pending links, including when migrating from environment configuration to Vault settings.

Delivery workers compare their captured settings revision and credential fingerprint with the authoritative settings before claiming work, immediately before every send (including after a slow AI response), and before finalizing a failed provider request. A changed or unavailable configuration releases only that worker's current lease and restores its provider attempt budget when Telegram has not confirmed success. This also handles an old-token failure that arrives after a credential rotation. Prepared replies remain available to the current runtime; cancelled work cannot be revived by a release.

Successful provider sends remain acknowledged even if configuration changes while the request is in flight. A request already submitted to Telegram cannot be recalled. The generation checks prevent subsequent sends using an obsolete runtime and prevent failed stale-token requests from permanently failing newly eligible work.

**Remove stored credentials** disables the integration, cancels queued delivery/replies and revokes all account links. A remaining legacy environment token does not reactivate a configuration explicitly disabled or cleared in settings. **Remove webhook** only stops incoming Telegram updates; automatic outgoing delivery remains governed by the master and delivery switches.

## R&D controls

| Control | Effect |
|---|---|
| Enable Telegram | Master gate for outgoing notifications and incoming commands. Disabling cancels queued work. |
| Bot username/API token | Identity and server-only credential used for all Telegram provider calls. |
| Public OMS address | Source of application links, webhook URL and optional scheduler URL. |
| Webhook verification secret | Authenticates Telegram HTTP updates with `X-Telegram-Bot-Api-Secret-Token`. |
| External scheduler secret | Separately authenticates `POST /api/telegram/dispatch`. |
| Calendar timezone | Defines the civil date for `/today` and `/ask` context. |
| Notification categories | Applies at enqueue and again immediately before delivery. |
| Automatic delivery | Enables the production OMS process's background queue worker. |
| Delivery interval | Desired interval between background batches; 10–300 seconds, default 30. Processing time can make a busy batch take longer. |
| Messages per batch | 1–10 ordinary notifications, default 10. |
| Parallel sends | 1–2 ordinary provider sends per worker, default 2. Database leases coordinate multiple workers. |
| Maximum attempts | 1–5 attempts for newly processed notifications/replies, default 5. |
| Initial retry delay | 10–300 seconds, default 30, with exponential backoff. Telegram `retry_after` takes precedence. |
| Linked-account commands | Enables the two-way command surface while preserving the separate `/stop` disconnect path. |
| Individual command toggles | Controls each supported command in both processing and the private command menu. |
| OpenRouter assistant | Allows `/ask` only when the command and AI switches are enabled. |
| Send queued messages | Runs a bounded batch through the same persisted worker and recipient checks. |
| Retry eligible failures | Requeues failed, unread/undismissed notifications from the last 24 hours, only for the same active, opted-in connection and currently allowed preferences/categories. It cannot revive expired, blocked, disconnected or already acknowledged messages. |

The administration summary shows linked account count, queued notifications/replies and failures from the last 24 hours. It exposes neither chat IDs nor notification bodies.

## Private commands

Commands only work in a private chat whose Telegram sender owns the chat and is linked to an active OMS account. Forwarded messages, group chats, bot senders, unknown commands and arbitrary callback data are ignored. Account role and data visibility are checked in the database; bot access does not create a general service-role API.

| Command | Behavior |
|---|---|
| `/start <connection token>` | Consumes the single-use, ten-minute OMS linking token. |
| `/start` or `/help` | Shows the enabled private-chat commands. |
| `/today` | Shows up to ten accessible orders due/loading on the configured local date and up to ten calendar events. |
| `/orders [search text]` | Lists up to ten accessible active orders; optional literal search matches PO, title or client. |
| `/order <PO or UUID>` | Reads one accessible order's status, dates, priority and identifying details. Another person's private draft remains unavailable. |
| `/notifications` | Shows the account's five most recent unread, undismissed notifications. |
| `/read <notification UUID>` | Marks only the linked account's own notification as read. Inline “Mark read” buttons use the same authorization and replay fence. |
| `/pause` | Pauses new phone alerts and cancels outstanding alerts. Commands remain available. |
| `/resume` | Resumes future phone alerts. Cancelled alerts are not replayed. |
| `/ask <question>` | Optional read-only OpenRouter answer using the limited account-scoped snapshot. |
| `/stop` | Disconnects the Telegram account and revokes pending links/deliveries. Reconnect through OMS settings. |

Ordinary commands are rate-limited to one accepted command per second per chat. `/ask` additionally requires a minute between accepted AI questions. These limits are applied in the same database transaction as replay checks and account mutations. Duplicate or old Telegram updates do not mark notifications twice, reverse a pause/resume action, or replay an old disconnect against a newer connection. Telegram's randomized update-ID reset after a week of inactivity remains supported.

Bot responses use the account's saved EN/RU/LV language. `/today` is a bounded view rather than an exhaustive report: use the app calendar for complete details. The menu describes order lookup arguments, and notification action buttons avoid typing long UUIDs.

## OpenRouter in Telegram

R&D enables **OpenRouter assistant in Telegram**, and the `/ask` command must also be allowed. The existing system OpenRouter credential and configured text model are used; no separate model provider or key is stored in Telegram settings.

A question is limited to 1,000 characters. The server selects up to ten visible active orders, today's calendar events and the account's five unread notifications. Private drafts follow the same creator/management visibility rule as the app. The model receives no bot secret, service key, account-wide database capability or writable tool. The request is limited to 900 output tokens and a 20-second provider timeout. It instructs the model to answer in the account's language, treat embedded titles/notes as untrusted data, explain missing context and avoid claiming to perform changes.

The resulting answer is persisted before phone delivery so a Telegram retry does not rerun inference. If the provider is unavailable, the user receives a localized fallback and can continue with deterministic commands. This phone assistant is read-only: the writable canvas assistant remains an explicit in-app workflow.

Current role, active account, connection version, command/AI switches and visibility of every referenced order are checked again after inference and immediately before sending. Revocation during a slow model call cancels the private reply.

## Automatic delivery and optional scheduler

The Node server starts one Telegram loop per process outside development, tests and builds. The timer is unreferenced, does not prevent shutdown, reloads saved configuration on each cycle and never overlaps its own batches. A ten-second poll observes configuration changes and applies the configured delivery interval. Database `FOR UPDATE SKIP LOCKED` claims keep replicas, manual actions and an external scheduler from concurrently claiming the same queue item.

Ordinary notifications retain a five-minute lease and a 24-hour delivery lifetime. Command replies have a two-minute lease and ten-minute lifetime. Stale leases can be recovered after a process crash. Completed/failed/cancelled command replies remove their question/context/message payload; raw Telegram updates and connection tokens are never stored.

Automatic delivery requires a persistent production Node process. Serverless processes that sleep between requests should disable it and invoke the scheduler endpoint instead. The external path remains available for operational control:

```sh
curl --fail-with-body --request POST \
  --header "Authorization: Bearer ${OMS_TELEGRAM_DELIVERY_SECRET}" \
  "${OMS_PUBLIC_URL}/api/telegram/dispatch"
```

Use a secret store for the scheduler variable and invoke at the desired interval, for example every 30 seconds. The endpoint's secret must differ from the webhook verification secret. Disabling the master Telegram switch prevents delivery through either worker.

Telegram transport has an eight-second request timeout. `429` honors `retry_after`; transient transport/provider failures back off; blocked users are paused. Successful sends store the Telegram message ID. The worker checks unread/undismissed state, global/category preferences, account activity and connection version after claiming, just before sending.

Delivery is **at least once**. Telegram does not accept an idempotency key for ordinary `sendMessage`; a crash after provider acceptance but before the database acknowledgement can produce a duplicate. The replay fence guarantees that a retried incoming bot update does not repeat its database mutation. It does not promise exactly-once provider message display.

## Environment compatibility

Existing installations may initially use:

```dotenv
TELEGRAM_ENABLED=false
TELEGRAM_BOT_TOKEN=
TELEGRAM_BOT_USERNAME=
TELEGRAM_WEBHOOK_SECRET=
TELEGRAM_DELIVERY_SECRET=
```

The optional variables are retained in `.env.example` and Docker Compose for migration compatibility. A first successful R&D save imports the current effective credentials into Vault and makes the saved options authoritative. A missing settings migration may use explicitly configured legacy environment credentials so the previously installed notification path remains available. A database/Vault outage **does not** fall back to environment credentials, because that could reactivate a bot deliberately disabled in settings.

Bot credentials use the Vault names `reclame_oms_telegram_bot_token`, `reclame_oms_telegram_webhook_secret` and `reclame_oms_telegram_delivery_secret`. Public configuration resides in `telegram_system_settings`; connection metadata, link digests, notification outbox, replay state and command replies use separate service-only RLS tables. API responses are private/no-store, and provider bodies or token-bearing errors are not logged.

## Notification request lifecycle

The in-app bell and notifications page share one account-scoped realtime channel and initial refresh. Overlapping refreshes and identical pending writes reuse their request; clearing read notifications updates at most the 50 displayed IDs in one owner-scoped operation. Account changes and sign-out abort pending reads/writes and fence late responses before they can update the next account's feed.

Personal Telegram pause/resume returns the refreshed connection status with its successful `PATCH`, avoiding a second HTTP request. The client retains a bounded status-`GET` fallback for deployments where an older server still returns only `success`. Existing webhook and scheduler URLs remain available; requests with absent or malformed machine secrets are rejected before reading configuration or Vault. Valid credentials still pass the authoritative saved-configuration and runtime-generation checks.

Trusted notification publishing skips optional configuration lookup when there are no recipients. If a fanout discovers that the Telegram outbox migration is absent, its remaining batches use ordinary in-app notification storage directly. This fallback lasts only for that publication; a later publication can use a newly available migration.

## Verification and deployment checks

Automated coverage includes option validation, secret masking/preservation, RD and active-account authorization, saved-disable precedence, fail-closed configuration outages, registered webhook destinations, private command menus, command/callback validation, language and bounded AI context, rendered-answer retry persistence, and permission revocation during inference.

The executable PostgreSQL harnesses apply the actual migrations to an isolated PGlite database. They test grants/RLS, hashed linking tokens, replay ordering, own-notification writes, draft visibility, settings switches, outbox leases, category filtering, manual retry eligibility and credential/bot-identity revocation. The settings harness uses a minimal Vault SQL API stub; it verifies the application's Vault contract rather than claiming to test the extension's encryption. It is not a multi-process concurrency stress test.

```sh
npm run test:unit
OMS_PGLITE_MODULE=/path/to/pglite/dist/index.js node tests/integration/telegram-migration.mjs
OMS_PGLITE_MODULE=/path/to/pglite/dist/index.js node tests/integration/telegram-settings-bot.mjs
```

No production credentials, real bot messages or live migration execution are part of these tests. After deployment, perform provider registration and connect a consenting test account through the settings UI, then verify an authorized notification, `/today`, an own-notification read, pause/resume and disconnect. Confirm the reverse proxy preserves the webhook secret header and the public HTTPS address reaches the running Node server.
