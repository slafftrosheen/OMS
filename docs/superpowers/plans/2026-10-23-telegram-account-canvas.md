# Account-bound Telegram and Canvas Implementation Plan

> Execute inline with test-driven development and verification before publication.

**Goal:** Verified per-account bot linking, personal delivery controls, bounded AI
order retrieval, and real frame-aware canvas creation.
**Architecture:** Reuse Telegram transports/outboxes and canvas proposal validation.
**Tech Stack:** TypeScript, Svelte 5, SvelteKit, PostgreSQL/Supabase, OpenRouter.
**Spec:** `docs/superpowers/specs/2026-10-23-telegram-account-canvas.md`

## Constraints
No public server access required. No new production package dependency. EN/RU/LV
copy. No duplicated toolbars. Server-only credentials and user identity.

## Review focus
Stolen/expired link approval; submitted foreign user IDs; permission changes during
AI inference; dropped personal filters on retry; nested locked canvas parents.

## Tasks
- [x] Test and implement shared personal-preference validation and owner-bound API.
- [x] Add pending-link confirmation, subscription checks, safe previews and
      claim-scoped AI order search in a forward-only migration.
- [x] Implement the personal settings UI and privacy/confirmation copy.
- [x] Test and implement a bounded AI lookup loop and wire it to existing replies.
- [x] Test and implement frame-aware canvas actions, execution and model guidance.
- [x] Review security boundaries, run available focused checks, document remaining
      full-environment verification.
- [x] Prepare the verified publication tree; final branch update is separately confirmed against GitHub.

## Environment note
The editing runtime has Node and TypeScript but cannot resolve GitHub/npm hosts.
Repository sources are fetched through the connected GitHub tool at the pinned
commit. Focused checks can execute against these exact sources; a full dependency
install, Svelte build and PostgreSQL runtime must not be claimed without execution.

## Execution evidence
53 focused tests passed in the Node/TypeScript fixture runner; strict dependency-free
core TypeScript passed. The new integration harness passed JavaScript syntax checking
only. Full dependency/build/browser/SQL execution is blocked, not passed. See the
operations guide for exact scope and deployment gates.
