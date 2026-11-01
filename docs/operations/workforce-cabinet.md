# Personal cabinet, hours and absence reporting

## Daily use

**My cabinet** is available to every authenticated role from the desktop navigation, mobile menu and account menu. The personal screen contains a date, Start time and Finish time entry form, an absence form and selectable monthly history. Operators and Station Heads see two summary cards: actual hours worked and hours including doubling. These totals follow the clearly labelled selected month, with the current month selected by default. R&D, Boss and Head of Production retain the detailed breakdown and management controls. Labels and status/error messages are provided in English, Latvian and Russian.

Ordinary workers use a concise dated history, including the recorded clock interval where available. The manager view also includes a Monday-first calendar overview. Saved time, a historical explicit zero, active absence notices, unrecorded dates and upcoming days have separate icons; 2× dates remain identified. Select a past/current date to open the existing entry form, or use arrow keys within the calendar. Existing unsaved-entry confirmation still applies. The next/previous month controls and “This month” return button also work for team history and reports. The calendar does not infer schedules, expected hours or missed shifts.

Managers can find workers by name or username (including Latvian names entered without diacritics) and filter active/inactive accounts, no entries or an absence in the selected month. The shown-worker count and absence list follow the filters; the summary explicitly keeps whole-team totals. A saved zero counts as an entry.

Enter the start and finish in Riga local time for the selected date. The date defaults to today; future worked time is rejected by both API and database. A date has one record per person. Finish must be later than start on the same calendar date, and the server derives the whole-minute duration. An overnight interval is not silently assigned to one day. Breaks are not deducted automatically. The form displays the calculated actual and credited duration before saving. Updating or deleting a record requires its current version. Retrying an already-saved identical entry does not create a duplicate.

Records created before clock entry was introduced retain their original duration and null start/finish fields. History identifies these as earlier duration-only records; editing one requires the user to supply the actual times. No default start time is invented. Historical zero entries remain distinguishable from missing days, but a new equal start/finish interval is rejected.

Absence notices have an inclusive date range, full/partial-day status, a short category and an optional note. They are notices, not a leave-approval or medical-record workflow. An active full-day absence cannot overlap positive recorded work, and active absence ranges for a person cannot overlap. Cancelled notices remain in history. The Head of Production receives an immediate in-app notice when an absence is created or cancelled, including after the morning report. Notifications contain dates and duration type, without the private reason/note.

## Access

| Role | Personal hours and absence entry | Team history and absence details | Report archive, CSV, monthly regeneration | Calendar exceptions |
| --- | --- | --- | --- | --- |
| Operator | Own records | No | No | No |
| StationHead | Own records | No | No | No |
| HeadOfProduction | Own records | All workers | Yes | Yes |
| Boss | Own records | All workers | Yes | Yes |
| RD (R&D/system roots) | Own records | All workers | Yes | Yes |

API handlers use the authenticated request's Supabase client. Row-level security and security-definer RPCs enforce active account/role checks independently of the interface. User IDs, durations, multipliers and report payloads cannot be supplied as authoritative mutation fields. The entry API accepts start/finish values and the database calculates the duration again. Authenticated roles have no direct table write grants. Internal report construction, scheduling and lease RPCs are not available to ordinary clients.

The UI cancels obsolete reads and resets drafts and manager data when account or role changes. Workforce responses use `Cache-Control: private, no-store`. The floating assistant receives only a limited screen summary when the user explicitly sends a question: personal totals, or the currently shown team/report counts and non-sensitive filter modes. Counts remain unknown while loading. Search text, worker identities, absence reasons and private notes are excluded from that projection. The assistant cannot edit hours or generate reports.

## Time and the company credit policy

Storage and calculation use integer minutes, avoiding decimal-hour rounding. For new entries, `start_time` and `finish_time` preserve the entered local clock values and `actual_minutes` is calculated by the database. Historical duration-only records keep their original `actual_minutes`. `credited_minutes` is generated as actual minutes multiplied by the server-calculated multiplier. An eight-hour Saturday is **8 actual hours and 16 credited hours**. A holiday on a Saturday still receives **2×**, not 4×.

Clock duration is real elapsed time in **Europe/Riga**, including daylight-saving changes. An interval crossing the spring clock change can therefore be shorter than its displayed clock difference; an interval crossing the autumn change can be longer. A start or finish within a nonexistent or repeated local-time period is rejected because a time-only input cannot uniquely identify that instant. TypeScript feedback and PostgreSQL calculation use the same policy. This feature records one continuous same-day interval, without estimating unpaid breaks or splitting an overnight shift automatically.

The default 2× rule covers weekends, Latvia's recurring public holidays and the applicable observed days off. The latter are identified separately from public holidays in the calendar. This is the requested company credit policy; the feature does not calculate currency, taxes, overtime/night supplements or full statutory payroll.

Calendar dates are date-only values. Current-day checks and report boundaries use **Europe/Riga**, including daylight-saving changes. The recurring calendar includes Easter-related dates, Mother's Day, Pentecost and the fixed holidays. Verified historical one-off dates are included. Future Song and Dance Festival closing dates and new exceptional holidays must be added deliberately through the manager calendar exceptions controls; no future festival date is guessed. An exception changes the affected day's credit and marks existing monthly reports stale. Removing it restores the base calendar. A weekend continues to qualify for the company's 2× credit even when a weekday holiday exception is removed.

Government workday transfers are not automatically adopted as the company's schedule. Missing days are not assumed to be eight-hour shifts or absences.

Calendar sources checked on 2026-10-31:

- [Latvian law on public holidays, commemoration and celebration days](https://likumi.lv/ta/en/en/id/72608-on-public-holidays-commemoration-days-and-celebration-days).
- [VDI: 2018 festival closing day and following day off](https://www.vdi.gov.lv/lv/jaunums/03072018-pec-dziesmu-un-deju-svetkiem-pirmdiena-9-julijs-ir-brivdiena).
- [VDI: questions including the 2023-07-10 observed day off](https://www.vdi.gov.lv/lv/dazadi-jautajumi).
- [Official publisher: 2023-07-09 festival holiday and 2023-07-10 day off](https://lvportals.lv/skaidrojumi/353173-sogad-9-julijs-svetku-diena-10-julijs-atputas-diena-2023).

## Scheduled reports

| Report | Due time in Europe/Riga | Contents | Recipients |
| --- | --- | --- | --- |
| Daily absences | Every day at 08:00 | Active full/partial-day absence notices covering today, including a zero-absence result | Active HeadOfProduction accounts |
| Monthly hours | First day of each month at 08:00 | Previous month's per-worker actual, regular, premium and credited time, recorded-day counts and team totals | Active HeadOfProduction accounts |

R&D and Boss can access the same report archive without being added to the automatic notification recipients. Registered profiles with no entries and inactive workers with historical records remain visible in the monthly totals, so a missing submission is not silently dropped.

The adapter-node production server starts a reporting loop from `hooks.server.ts`. It polls every 30 seconds; the database decides which jobs are due using its own clock. Delivery therefore starts on the first available poll at or after 08:00, not before it. The loop is disabled during builds, development and unit tests.

`workforce_due_report_jobs` returns a bounded batch. `workforce_claim_report_job` atomically takes a five-minute lease keyed by report kind and period. `workforce_complete_report_job` builds the snapshot, inserts Head of Production notifications and marks completion in one transaction. Optional Telegram outbox enqueueing uses the existing transport if its database function is present; it follows that integration's normal connection/preferences rules. Scheduled reports do not require Telegram to be enabled. Immediate absence notices are in-app.

A crash or uncertain network response is recovered through the stored lease; application code does not send a second notification independently. Multiple app replicas share the same durable job ledger. The earliest automatic monthly period is the month in which the workforce migration was installed. All missed months from that point are eligible for catch-up. Daily catch-up covers **today only**, avoiding a burst of obsolete morning notices after extended downtime. Older closed months can be generated by a manager when required.

The archive separates monthly-hours and daily-absence reports and defaults to the latest version for each period, with monthly reports listed first. “All saved versions” makes earlier snapshots available. Opening a notification for an earlier version reveals that version instead of silently replacing it with the latest one. Filters change the list only; CSV downloads and previews still refer to the chosen immutable snapshot.

Reports retain their dated payload and version. Later entry, absence or applicable calendar changes mark affected snapshots stale. A manager can generate another monthly version; the old snapshot remains available and the original scheduled job remains completed. Manual regeneration does not repeat the automatic monthly notification. CSV downloads preserve both readable durations and exact integer minutes and protect spreadsheet cells against formula injection.

## Database and release

Apply `supabase/migrations/20261031000003_workforce_cabinet.sql` through the normal reviewed migration procedure, after confirming the intended environment and canonical `profiles`/`notifications` schema. The migration creates:

- `workforce_work_entries` and `workforce_absences`;
- `workforce_holiday_overrides`;
- `workforce_reports`, `workforce_report_jobs` and `workforce_report_schedule`;
- `workforce_audit_log`, read policies and authorized RPCs.

Entries and absences reference profiles with deletion restricted so historical workforce records cannot disappear through account deletion. Deactivate an account instead. Record changes retain before/after audit data. A build, commit or app restart does not apply the migration.

Before deploying the start/finish UI, also apply `supabase/migrations/20261031000006_workforce_clock_times.sql`. This additive migration checks the predecessor table and RPC contract, adds nullable clock columns, validates their consistency with calculated minutes and introduces `workforce_save_clock_entry`. It removes client access to the old `workforce_save_entry` duration RPC, so coordinate the database and application update rather than leaving old entry clients running. Historical rows are not backfilled with guessed times; their values and versions remain unchanged. Existing RLS, audit, absence conflict, credit calculation and report workflows remain in force. Confirm the actual target schema before applying the migration; the isolated verification fixture is not evidence of a live schema match.

The running server needs its existing `PUBLIC_SUPABASE_URL` and private `SUPABASE_SERVICE_ROLE_KEY` for the scheduled worker. Interactive personal/team APIs use the signed-in request, not that service key. The worker initializes lazily, logs a sanitized configuration/schema warning when unavailable and retries; it does not crash the app or log notes, raw database responses or credentials. Check server logs for `Workforce reports completed` or `Workforce reports are waiting for recovery` when validating operation.

Before production activation, verify the migration and grants on the intended database, test one worker plus each manager role, and confirm a scheduled report creates a snapshot and Head of Production notification at the expected local boundary. Local database fixtures, browser fixtures and a successful build do not establish that the live migration or production scheduler is already active.

## Verification scope

The feature's focused tests cover calendar classification, clock parsing and daylight-saving boundaries, exact minutes and validation, API authorization, CSV safety and reporting-dispatch retries. The isolated database checks execute both actual workforce migrations and exercise historical-row preservation, clock persistence, duration tampering, denial of the old RPC, RLS, protected mutations, overlap/version rules, snapshot freshness, scheduler authorization and atomic job completion. Browser fixtures exercise the real cabinet components with mock HTTP responses, including the two-card worker view, manager access, historical rows, clock entry, account changes, absent-day handling and responsive themes.

Run the standard application gates (`npm test`, `npm run test:unit`, `npm run check`, `npm run build`, `git diff --check`) along with the workforce browser and isolated SQL checks before release. Keep `check` and `build` sequential because both update `.svelte-kit`.

```sh
npx playwright test --config tests/ui/playwright.config.ts workforce-cabinet.spec.ts
node scripts/workforce/verify-workforce.mjs
```

The SQL verifier uses `@electric-sql/pglite` in a disposable database. If it is installed outside this checkout, set `OMS_WORKFORCE_PGLITE_MODULE` to that installation's absolute `dist/index.js` path. It reads the migration files unchanged, replaces only a private current-date helper inside its disposable fixture for deterministic boundary checks, and never connects to the configured Supabase server. The exhaustive calendar comparison covers all 31,046 supported dates from 2015 through 2099; separate clock cases compare TypeScript and SQL across Riga daylight-saving boundaries. This verifies implementation parity, not that future legislation cannot change.
