# Found failures implementation plan

> **For agentic workers:** Execute the independent domains with superpowers:dispatching-parallel-agents and use superpowers:systematic-debugging and superpowers:test-driven-development for each defect.

**Goal:** Resolve the failures recorded by the OMS functional verification, preserving current workflow contracts.

**Architecture:** Repair implementations where observed behavior violates their contracts; replace stale source-text assertions with behavioral or current semantic assertions without removing coverage. Keep the current shared working tree and its authorized earlier changes. Use the isolated development Supabase stack for database/browser verification; do not deploy production.

**Tech Stack:** Svelte 5, SvelteKit, TypeScript, local Vitest-compatible runner, Playwright, PostgreSQL/Supabase.

**Spec:** `docs/operations/OMS-order-station-flow-2026-10-21.md`, Outstanding unit failures and Limitations/open work, plus the user's instruction to fix all found failures.

## Global constraints

- Preserve prior-session edits; no reset, production migration, deployment, blanket skips, or weakened security contracts.
- Heavy builds/type checks/browser suites run sequentially under the coordinator.
- Agents own disjoint paths; request coordination before changing another domain's files.
- Verify every fix against its reproducer and document any genuinely stale test contract.

## Review focus

- Unknown/ambiguous inventory must not be guessed into a readiness approval.
- Private Toolkit conversations and media must not leak into shared snapshots.
- Canvas assets must load under the existing self-hosted CSP without CDN allowlisting.
- Test matcher failures must fail the suite rather than create false passes.
- Existing chat data/RLS must survive schema compatibility repairs.

## Tasks

- [x] Toolkit/canvas: inspect failures in oms-r05/r06/r07/r09/r10/r11 tests and actual Canvas integration; reproduce real defects, repair them or replace stale formatting assertions with meaningful coverage. Resolve Toolkit TS diagnostics and self-host required tldraw assets. Run only focused tests; report owned paths and evidence.
- [x] Production: reproduce oms-r14/r23/r25/r29/r39/r40 failures, preserving strict inventory matching, validated exception reviews and oversight authorization. Fix associated production/inventory helper TS errors. Run focused tests; report semantic changes separately from stale test repairs.
- [x] Types and remaining UI/API/test contracts: fix test-runner matchers and type declarations, remaining TS diagnostics and oms-r01/r03/r13/r16/r28/r31/security-boundaries failures. Preserve behavior in current localized interfaces; test real boundaries wherever practical.
- [x] Chat: inspect actual development table definitions and current handlers, reproduce missing-column failures, add the smallest additive migration or correct handler mapping, preserve RLS and verify station-message persistence and anonymous denial.
- [x] Integration: run npm test, npm run test:unit and npm run check after domain changes; fix any integration issues. Build the full final source once in the isolated source copy. Rerun order, preview, responsive and station browser/API journeys with local assets and chat enabled. Review the combined diff and update the verification report with exact final evidence.
