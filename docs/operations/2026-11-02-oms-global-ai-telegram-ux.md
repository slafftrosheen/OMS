# OMS · November 2, 2026 — atomic profile controls, AI policy and Telegram audit

## Changes in this pass

- The native production-profile form commits catalog choices to **local form
  state** as soon as a selection is complete. FACE, BACK, SIDES and FRAME
  thickness choices collapse their picker without a second Done click. A
  custom material/description editor closes on leaving the picker or Escape.
  **This does not auto-submit or approve an order**; the canonical draft Save,
  approval rules, permission checks and read-only production view remain.
- Settings now has General, AI & OpenRouter, Telegram R&D and Integrations
  sections. The Telegram admin console has Connection & keys, Notifications,
  and Bot commands panels, with a shared save button so edits are retained
  when changing tabs.
- Repetitive provider-sharing checkboxes were removed from the screen assistant,
  order assistant, intake/file analysis, production readiness and revision
  comparison. No model-initiated field modification is automatically accepted.
  All field proposals still require explicit human review.
- A single company-wide **Allow OMS to send data to OpenRouter** switch is
  managed by active R&D users and enforced at the central server-side provider
  gateway. Its database value is read **on every provider request** for fast
  revocation. No key, source file or private order context goes to OpenRouter
  when the switch is off, the database is down, or the policy migration is
  missing. The API's existing `consent: true` payload field remains for
  backwards-compatible request validation; it is *not* used as permission.
  OpenRouter credentials and the R&D switch are independent.
- The **personal Telegram /ask permission** is retained separately: a global
  company setting must not covertly link private Telegram accounts or enable
  personal AI processing. Telegram's independent account authorization, role
  visibility, confirmation and notification settings remain intact.

## Required migration before deploying the new AI gateway

Apply `supabase/migrations/20261102000001_openrouter_global_policy.sql`
on the intended backed-up database after the existing October migrations.
The singleton policy row defaults to **disabled**; only service-role database
access is permitted. Do **not** run migrations as part of the build or restart
or assume that committing to main applies them.

After migration, an active R&D member can enable the switch under
**Settings → AI & OpenRouter**. Staff can then use the assistant without
confirming every single provider transmission. Turning it off disables
subsequent provider requests immediately. Prompts/inference calls in flight
when disabled are not forcibly cancelled; do not assume revocation deletes
previously transmitted model data.

The R&D settings endpoint is `/api/settings/ai-policy`:
GET for active OMS users, PATCH `{ "enabled": true | false }` only for
active R&D accounts. It uses the current authenticated user, checks the live
profile, validates the exact request shape and writes an audit record.

## Telegram Bot API audit

Official references: https://core.telegram.org/bots/api and
https://core.telegram.org/bots/faq

- **Transport**: `getUpdates` and `setWebhook` are mutually exclusive.
  OMS uses the persistent outbound long-polling receiver for the private
  Tailscale deployment, with no inbound public IP/port requirement.
  Polling first verifies the bot with `getMe`, then clears a legacy webhook
  with `deleteWebhook` / `drop_pending_updates: false`. Single receiver
  leases prevent concurrent consumers.
- **Offset durability**: Telegram confirms updates only on a later request
  with `offset > update_id`. OMS advances the durable cursor inside its
  command-processing transaction, not before successful processing; rate-limit
  and receiver-conflict backoff remain in place.
- **Callback buttons**: Telegram clients display progress until
  `answerCallbackQuery`. OMS now acknowledges valid private-chat callback
  IDs even when a command is disabled, stale or unrecognized. Polling sends
  acknowledgement after the transactional cursor commit; the webhook path
  acknowledges disabled/unknown callbacks without creating a command reply.
- **Webhook endpoint**: API-secret header validation is retained. Payloads
  are now consumed from a bounded stream (64 KiB) with a deadline, instead
  of allocating the entire `request.text()` before checking length.
- **Account isolation**: linking still uses a short-lived, server-issued
  one-time token and a separate OMS identity confirmation. Bot commands do
  not accept client-supplied OMS user IDs. Queued notifications are checked
  against account visibility at delivery. Revocations and retries are
  independently guarded by server/database contracts.

Telegram live bot identity, webhook registration, RPC migration state and
end-to-end delivery cannot be proven from a GitHub source inspection.
**Do not describe the bot as production-verified before testing the deployed
instance.**

## Validation checklist

On a complete OMS checkout with dependencies, run:

```sh
npm ci
npm test
npm run test:unit
npm run check
npm run build
git diff --check
```

Optional browser tests (requires the existing Playwright configuration and
supported browser): `npx playwright test tests/e2e/profile-materials.spec.ts
tests/e2e/assistant.spec.ts`.

Acceptance: form selection auto-closes with a correct single badge; custom
notes and cable lengths survive reload, read-only users cannot edit; switch
ON/OFF takes effect for every AI entry point with no checkbox; regular users
cannot PATCH R&D policy; tabs are keyboard reachable and preserve unsaved
settings; Telegram private polling receives a paired `/start`, displays
the candidate identity for confirmation, processes /today, /orders, callback
buttons, retry/backoff and multiple users without cross-account leakage.

Deployment: make a backup, review/apply the migration, run the gates, build
and restart the existing `reclame-oms.service` only after checks succeed.
No Cloudflare/Tailscale port exposure changes are required.

## Verification limitation

The connected GitHub repository was editable, but no deploy host, Bot API
token or live Supabase access was available in this session. Local cloning
failed due missing outbound DNS, and the GitHub Actions validation job
created in the preceding pass terminated before exposing test steps or
artifacts. Source-level regression tests were added or updated but full
npm/Svelte/Playwright and live Telegram tests were **not executed** here.
