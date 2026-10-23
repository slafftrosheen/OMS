# Telegram on a private OMS server

This is the setup guide for local servers reached through Tailscale. It supersedes the public-HTTPS prerequisite in `telegram-notifications.md` **when Long polling is selected**. Keep OMS and Supabase private. Do not expose port 3000, enable Funnel, or forward a router port for this transport.

## Deploy

1. Back up and verify the target database using the normal deployment procedure. Apply `supabase/migrations/20261023000001_telegram_polling.sql` after all three `20261022000001`–`20261022000003` Telegram migrations. The migration is not run automatically by the build. It uses the existing Supabase Vault installation.
2. On the server, install the locked dependencies and run the normal check/build before restarting `reclame-oms.service` from `/opt/reclame-oms`. Keep the existing Supabase containers and private network setup unchanged.
3. In **Settings → Telegram · R&D administration**, select **Private server / Long polling**, enter the bot token and username, enable Telegram, and save. Existing installations keep webhook mode until explicitly changed; new unconfigured installations suggest polling.
4. The OMS address is optional in polling mode. Use the normal private HTTP/HTTPS Tailscale address, including any application base path, for “Open OMS” links. Leave it empty to omit those links. Polling requires no webhook secret or external scheduler secret. A saved optional secret is still validated and never returned unmasked.
5. Select **Test connection**, **Update bot commands**, then **Refresh receiver status**. Verify a recent successful poll. Saving and enabling polling makes the worker validate the bot identity and remove its existing webhook with `drop_pending_updates: false`. Do not register a webhook in this mode.
6. Link a consenting test account through **Settings → Integrations**. Verify `/today`, `/notifications`, reading an own notification, `/pause`, `/resume` and `/stop`. Existing role checks, private-chat restrictions and per-command R&D toggles remain authoritative. `/ask` remains an explicit, read-only OpenRouter opt-in.

Only outbound HTTPS access to Telegram and the server's existing private database connection are needed. Telegram on a phone works without Tailscale, but opening a private OMS link still needs Tailscale. The Node process must remain running: development, build, test and sleeping/serverless processes do not run the receiver. The external dispatch endpoint sends queued work; it does not replace the persistent incoming receiver.

## Runtime and recovery

The receiver uses a 10–50 second `getUpdates` wait (default 25). Telegram returns as soon as updates arrive; this is not a fixed command delay. Incoming polling is independent of the outgoing notification timer. Command replies continue to be dispatched when **Automatic delivery** for ordinary notifications is off; disabling the master Telegram switch still stops both.

One service-only PostgreSQL lease coordinates all OMS processes sharing the database. The owner renews every five seconds during a request; settings/token changes or database failures abort the request and prevent further effects. A crashed owner's lease expires after 90 seconds. This cannot coordinate an unrelated installation using a different database: use one installation per bot. Telegram conflict responses cause visible backoff rather than repeated webhook deletion.

The existing command/link parser and SQL authorization functions are reused. Command effects, reply enqueue and the update cursor commit in one database transaction. The next `getUpdates` offset is sent only after those commits. A database failure therefore leaves the failed update unacknowledged. Unsupported updates advance the transport cursor without invoking a command. Raw updates, link tokens and provider error descriptions are not stored in receiver state.

Same-bot token rotation preserves the cursor and account links. Changing bot identity resets the cursor and the old bot's per-chat replay IDs; existing settings logic revokes account links. After a week without received updates the offset is omitted, accommodating Telegram's randomized update IDs. Telegram retains pending updates for at most 24 hours, so an extended server outage is not an unlimited message archive.

Provider 429 responses honor `retry_after`. Network/provider failures back off exponentially, bounded to five minutes; conflict and credential failures have separate delays. Retry state is stored in PostgreSQL and survives process restarts. An explicit settings save starts a new configuration generation and allows reconciliation again. Health displays the last successful poll, last committed update, safe error category and next retry. Status refresh never overwrites unsaved form fields.

Delivery remains **at least once**: a provider-accepted outgoing message followed by a database acknowledgement failure can appear twice. Atomic incoming cursor/command commits are not a claim of exactly-once Telegram message display.

## Switching back to webhooks

Select webhook mode, supply the public HTTPS address and existing webhook/scheduler credentials, and save. Register the webhook only after the old polling request releases its lease. A busy response means retry after the receiver stops; the API will not race an old poll's `deleteWebhook` against a new registration. Webhook provider writes use the same receiver lease, and the webhook endpoint rejects incoming requests while polling mode is selected. Existing environment-based configurations must first be saved into R&D settings before using the leased webhook administration actions.

## Troubleshooting

- **Unavailable:** check the new migration, database and Vault access. No network polling occurs without durable receiver storage.
- **Waiting for worker:** verify the production Node process is running with normal Supabase credentials. A recent successful poll can coexist with this brief between-batch state. A crashed process may retain its lease until expiry.
- **Bot mismatch / credentials rejected:** verify the username and token belong to the same bot; save corrected credentials.
- **Receiver conflict:** stop another poller or externally managed webhook for this bot, then save settings to retry reconciliation. The receiver deliberately does not continually fight an external webhook registrar.
- **Backoff:** inspect the safe reason and next retry timestamp. Do not repeatedly rotate credentials to work around a Telegram rate limit.

Do not log or paste API tokens, database service-role keys, raw updates or private chat IDs. Receiver health is restricted to active R&D users and returns none of these.

## Verification

The change includes focused transport/configuration/administration tests and a PGlite migration harness. In a complete checkout:

```sh
npm run test:unit
npm run test
npm run check
npm run build
OMS_PGLITE_MODULE=/absolute/path/to/pglite/dist/index.js node tests/integration/telegram-polling.mjs
```

The SQL harness uses the actual four Telegram migrations and a Vault API stub. It checks service-only access, competing leases, cursor recovery, atomic command rollback, duplicate updates, mode/token changes, persisted backoff and health privacy. It does not test Vault encryption or live Telegram delivery.

Authoring-session evidence: 36 focused tests passed against the actual TypeScript implementation using a Node test adapter; strict TypeScript checking passed for the dependency-free receiver core, configuration reader, public types, administration helper and translations. The execution environment could not download the full repository/dependencies; full Svelte checks/build, browser testing and the PGlite harness were **not executed** there. They remain deployment gates, along with a real-bot test. No production database, provider configuration or server was changed by the code commit.

Protocol reference: Telegram Bot API, `getUpdates`, `deleteWebhook` and `Update` at https://core.telegram.org/bots/api. Shutdown integration follows adapter-node's `sveltekit:shutdown` lifecycle event, https://svelte.dev/docs/kit/adapter-node.
