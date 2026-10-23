# OMS System Contracts Implementation Plan

> Execute inline with regression-first checks. The user has requested continued implementation on main.

**Goal:** Make existing notification, calendar/badge and AI/Canvas paths agree at their boundaries.
**Architecture:** Reuse canonical stores and authorization; consolidate only duplicated projections.
**Tech stack:** Existing TypeScript/SvelteKit/Supabase and OpenRouter adapters, no new dependencies.
**Spec:** `docs/superpowers/specs/2026-10-23-system-contracts.md`.

## Global constraints

No mutation of order-form schema, production data or live integrations. Preserve Telegram personal
consent and private polling. Publish an additive fast-forward against the verified remote head.

## Review focus

Cross-account writes, stale read flags, missing optional fields, legacy cancellation spellings,
and tool result messages after the last allowed lookup must not bypass policy or destroy data.

## Tasks

- [x] Pin and materialize relevant baseline blobs; record source hashes.
- [x] Reproduce notification DTO/preference API drift and account-scoping failures.
- [x] Repair owner-scoped APIs and shared projections, retain legacy read aliases where safe.
- [x] Reproduce and consolidate status classification used by order badges and calendar summaries.
- [x] Reproduce partial Canvas edits and invalid scene acceptance; fix normalization/execution together.
- [x] Verify Telegram tool-result orchestration against the shared OpenRouter adapter and language policy.
- [x] Run focused regressions, strict core TypeScript/syntax/diff checks; review integration edges.
- [ ] Publish and re-read main after final verification; operations notes record remaining full-runtime gates.

## Execution rulings

- Work in a blob-verified partial checkout; full runtime checks are blocked by dependency/network access.
- Retain old HTTP notification aliases, but correct the unused legacy email-shaped preference API to actual per-type rows.
- Add idempotent in-app fallback for uncertain Telegram publication acknowledgements; no exactly-once delivery claim.
- Review of streamed-body validation added cancellation-error coverage so cleanup cannot mask a 413 response.
- The legacy iCal export was audited but is explicitly retained as unresolved integration debt, not claimed equivalent to the app calendar.
