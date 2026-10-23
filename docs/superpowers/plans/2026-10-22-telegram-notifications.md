# Telegram Notification Preparation Implementation Plan

> **For agentic workers:** Use the assigned parallel implementation tasks and review the combined result before publication. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare private, opt-in phone notifications that can be enabled through server configuration and user linking.

**Architecture:** Server-only configuration, connections and one-time linking records feed a durable notification outbox. Trusted existing order/inventory emitters enqueue events. A secret-authenticated webhook links accounts and an independently authenticated dispatcher sends queued messages.

**Tech Stack:** Svelte 5, TypeScript, SvelteKit, Supabase/PostgreSQL, Telegram Bot API, existing QRCode dependency.

**Spec:** `docs/superpowers/specs/2026-10-22-calendar-telegram.md`

## Global Constraints

- Disabled by default; no credentials in the browser or repository.
- No real Telegram messages, deployment or remote migration during this task.
- Only private chats, authenticated account owners and trusted notification emitters.
- Existing in-app notification behavior must continue when Telegram is unavailable.

## Review Focus

- Expired/replayed link tokens and attempts to attach an already-linked chat must fail atomically.
- Missing configuration/migration must produce an actionable, non-crashing Settings state.
- Retryable provider failures, rate limits and concurrent dispatches must preserve queue ownership.
- Pausing/disconnecting must prevent later delivery of stale queued work.
- Existing canonical notification fields must produce correct unread counts and idempotent read updates.

### Task 1: Server integration

**Files:** `src/lib/server/notifications/telegram*`, `src/routes/api/notifications/telegram/+server.ts`, `src/routes/api/telegram/{webhook,dispatch}/+server.ts`, a new Supabase migration, existing trusted notifier files and `src/hooks.server.ts`.

**Interfaces:** HTTP contracts in the spec; exported enqueue helper for trusted notifier rows; injectable provider transport for tests.

- [x] Test configuration gating, link parsing/authentication, message bounds and retry decisions.
- [x] Add service-owned tables/functions with restricted privileges, expiring single-use links and delivery claims.
- [x] Implement user-scoped status/connect/pause/disconnect and narrowly allowlisted secret-authenticated endpoints.
- [x] Wire trusted order/inventory notifications into the queue without depending on Telegram for successful order mutations.
- [x] Verify migration behavior in an isolated SQL runtime and targeted server tests.

### Task 2: Settings and in-app stability

**Files:** `src/lib/notifications/TelegramSettings.svelte`, `src/routes/settings/+page.svelte`, locales, `src/lib/stores/notifications.ts` and matching tests.

**Interfaces:** The spec's `/api/notifications/telegram` contract; canonical notification database fields mapped to the existing client view model.

- [x] Build configured/unavailable/pending/linked/paused states with explicit link, refresh, pause and disconnect controls.
- [x] Generate a QR code locally and clear it when expired, linked or disconnected.
- [x] Keep requests bounded, abort on unmount and prevent duplicate writes.
- [x] Correct unread/read/realtime normalization using canonical database fields and test repeated events.
- [x] Verify Settings flows with mocked network responses in the actual Svelte component.

### Task 3: Operations and review

- [x] Document migration, environment variables, HTTPS webhook registration, scheduler authentication and enablement.
- [x] Independently review authorization, secret handling, queue claims and disconnect behavior.
- [x] Run combined verification and publish the verified tree to `main`.
