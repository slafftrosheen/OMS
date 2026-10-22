# Calendar clarity and Telegram notifications

## Goal

Make each calendar day understandable at a glance and prepare an opt-in Telegram channel for phone notifications. Continue the existing OMS identity and commit the verified implementation to `main`.

## Calendar

The active `/calendar` view will combine actual order deadlines, loading assignments, loading-day availability, meetings and notes. Shared day summaries and icon/label/count badges will distinguish loading, due, overdue, meeting, note and closed states. A selected-day agenda exposes the underlying records. Empty and failed data loads must be distinguishable; partial data must never be presented as a complete schedule. Date-only values use local calendar dates, with EN/RU/LV labels.

Correct existing contract defects: normalize real loading-day fields (`is_blocked`, `notes`), retrieve all relevant paginated orders, and use the existing loading-day assignment endpoints and authorization rather than the nonexistent draft-order PATCH. Preserve server readiness, quality and capacity checks.

## Telegram

Add a dedicated Settings component that reports unconfigured, unavailable, unlinked, pending, connected and paused states. An authenticated user requests a short-lived private-chat linking URL, opens it or scans a locally generated QR code, and starts the bot. The interface can refresh status, pause/resume notifications and disconnect.

All credentials remain server-only. Linking tokens are random, stored as hashes, expire, and are consumed atomically. Telegram webhooks require the configured secret header and accept private-chat identity only. Delivery uses a durable, bounded, retryable queue populated by trusted server notification emitters. Arbitrary in-app notification inserts must not cause phone messages. The integration is disabled by default. No real Telegram messages, remote schema changes or deployment are performed during development.

The supported events are the existing order review/confirmation/rejection, inventory/material-consumption, order-chat and rework notifications. Scheduled calendar reminder generation is outside this preparation; no UI claims it exists.

## Contracts

- `GET /api/notifications/telegram`: `{ configured, available, connected, enabled, username, linkedAt, pendingUntil, botUsername }`.
- `POST /api/notifications/telegram` with `{ action: 'connect' }`: `{ url, expiresAt }`.
- `PATCH /api/notifications/telegram` with `{ enabled: boolean }`: saved result.
- `DELETE /api/notifications/telegram`: disconnect, revoke outstanding links and cancel pending delivery.
- `POST /api/telegram/webhook`: Telegram secret-header authentication.
- `POST /api/telegram/dispatch`: delivery-secret bearer authentication.

## Verification

Use focused model/loader/provider/auth tests, execute the migration against an isolated local SQL runtime when available, inspect actual Svelte UI at desktop and phone widths in all supported themes, and run the existing unit, source, type and production build checks. No credentials or production data are required for fixture-based verification.
