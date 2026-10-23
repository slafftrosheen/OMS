# Calendar Badge System Implementation Plan

> **For agentic workers:** Use the assigned parallel implementation tasks and review the combined result before publication. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show reliable, accessible summaries of the actual work and events on each calendar day.

**Architecture:** Normalize persisted API records into a pure day-summary model. A shared badge component and the active calendar page consume it. Keep mutations on the existing authorized loading-day APIs.

**Tech Stack:** Svelte 5, TypeScript, SvelteKit, Supabase, local Vitest runner and Playwright.

**Spec:** `docs/superpowers/specs/2026-10-22-calendar-telegram.md`

## Global Constraints

- Preserve `static/brand.css` tokens and EN/RU/LV support.
- Date-only strings must not shift across time zones.
- Missing data and failed reads must remain visible.
- Server readiness, capacity, quality and role checks remain authoritative.

## Review Focus

- A deadline and a loading assignment on the same date must not double-count the same category.
- Completed/cancelled orders must not appear as overdue work.
- API pagination and out-of-order fetch completion must not silently hide records or replace a newer month.
- Raw blocked loading days must stay closed; failed assignments must remain visibly unsaved.
- Long translated labels at phone widths must preserve usable date targets and a readable selected-day agenda.

### Task 1: Summary and data contracts

**Files:** `src/lib/calendar/day-summary.ts`, `src/lib/calendar/calendar-data.ts`, matching `tests/unit/calendar-*.test.ts`.

**Interfaces:** `normalizeCalendarOrder`, `normalizeLoadingDay`, `localDateKey`, `buildCalendarDaySummary`; a bounded calendar data loader with cancellation.

- [x] Test real loading-day fields, status exclusions, unique counts, invalid dates and multiple order pages.
- [x] Implement normalization and pure badge derivation.
- [x] Verify targeted model/loader tests.

### Task 2: Calendar UI and mutations

**Files:** `src/lib/calendar/CalendarDayBadges.svelte`, `src/routes/calendar/+page.svelte`, `src/locales/{en,ru,lv}.json`.

**Interfaces:** Shared `{ summary, compact? }` badge component; existing loading-day assignment endpoints; data contracts from Task 1.

- [x] Render icon/label/count badges, a legend and selected-day agenda.
- [x] Integrate events, complete order retrieval and truthful loading/error/empty states.
- [x] Correct assignment/removal requests, gate actions by role and handle rejected writes.
- [x] Exercise desktop/phone layouts, translated labels, date selection and mutation failure in Playwright.

### Task 3: Integration and publication

- [x] Review calendar changes independently and resolve material findings.
- [x] Run source/unit tests, Svelte checks, production build and targeted browser verification.
- [x] Commit the verified combined change to `main` with a guarded remote update.
