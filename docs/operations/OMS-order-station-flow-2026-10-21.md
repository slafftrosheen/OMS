# Order and station functional verification — 2026-10-21

## Scope and environment

Exercised an isolated source copy at `http://127.0.0.1:3100` against the local Supabase development API on port 54321 (`supabase_db_OMS`). Generated TEST ONLY PDFs, DXF drawings, PNG and JPEG images, plus corrupted-PDF and unsupported-executable fixtures. Created separate Boss, HeadOfProduction, RD and station-operator accounts in that development stack. Test orders and audited movements remain there for inspection. Production database migrations and the running production app were not changed by this verification.

## Corrections in the working tree

- Order-child access: repair `can_access_order` to use `order_assignees.draft_order_id`, so saved profiles, attachments and stages can be read under RLS.
- Station updates: add the missing `order_stages.updated_by` actor column needed by Start, Block and Resume.
- DXF: accept Chromium's `image/vnd.dxf` declaration and include DXF in the native order picker. Match displayed file formats in EN, RU and LV.
- PDF previews: use the installed PDF.js module and bundled worker rather than an external global script or nonexistent worker path. Cancel pending preview timers and capture PDF data before scheduling so image/CAD selection cannot trigger an undefined-data render.
- Saved editor loading: remove server-only `locals` access from the universal loader. Both successful loading and unavailable-order fallback now work without `locals`; behavioral unit tests failed before the fix and passed after it.
- Editor toolbar: anchor the workspace to its page container rather than the viewport. Canceling the page-entry animation previously put Save/Confirm underneath global navigation. A pointer hit-testing regression reproduces that failure, including after form fields are edited.
- Lightweight test runner: retain the prior session's matcher/require support and preserve the negation proxy target type.

Additional corrections completed after the initial verification:

- Canvas assets: self-host all installed tldraw 2.4.6 assets under the existing CSP. Real drawing, save and reload now work without CDN requests.
- Chat: add the missing schema columns, use canonical message fields, preserve existing rooms, report failed writes, and exclude deleted messages from history/search. RLS checks both direct and room-linked order access, including messages without their own order ID.
- Production validation: validate exception dates before early returns and sort oversight events by exact timestamps. Preserve strict inventory matching and role/order scoping.
- Inventory API: remove an error-variable shadow that broke authorization and validation responses.
- Types and tests: resolve all TypeScript errors; correct malformed fixtures, stale text assertions and matcher support while retaining privacy, authorization and concurrency coverage.
- Unsaved navigation: use the native unload prompt on reload, avoiding a blocked custom confirmation while retaining client-side navigation protection.

Three additive SQL migrations are listed in the deployment readiness runbook and verified in the development stack only. They have not been applied to production.

## Final verified results

All previously recorded failures are resolved. These results use the final source and isolated production build unless otherwise stated.

| Check | Result |
| --- | --- |
| Source suite, `npm test` | 110/110 passed |
| Unit suite, `npm run test:unit` | 380/380 passed |
| Type check, `npm run check` | 0 errors; 324 existing warnings |
| Isolated production build | Passed |
| API workflow assertions | 129/129 passed |
| Assigned-operator browser checks, seven stations | 30/30 passed |
| Native order creation/edit/upload/confirmation | 10/10 passed |
| Native canvas drawing/save/reload | 6/6 passed; zero CDN requests |
| PDF/image/DXF previews | 6/6 passed |
| Responsive toolbar and native unsaved reload | 5/5 passed |
| Chat HTTP authorization and persistence | 7/7 passed |
| Chat database persistence and RLS | 11/11 passed |

Browser journeys recorded no page/runtime errors in their final runs. Responsive pointer checks cover widths 320, 768, 1024 and 1440 pixels with the page-entry transform disabled, plus a real native reload confirmation.

The API journey verifies creation, reopening, stale-save rejection, authenticated byte-identical downloads, anonymous denial, review/PO/confirmation behavior, seven station handoffs, wrong-station denial, progress, blocking/resuming, rework, timing, version-checked completion, replay denial, loading and dispatch. Inventory starts at 100 units and finishes at 88 after six stages consume two units each; replay cannot consume twice. The station browser fixture separately exercises simulated work with no physical materials.

The order browser journey uploaded PDF, two DXFs, PNG and JPEG, then persisted title/notes, added a revised PDF and confirmed the order with all six attachments retained. Canvas checks created a real shape and verified persisted versioned state after reload. Chat checks include private order access through linked rooms, anonymous denial, edits and soft deletion.

Focused independent reviews found no remaining critical or important issues in the reviewed changes. The chat review identified a linked-room privacy gap during implementation; a real database regression reproduced it, the policy was corrected, and the final review and all eleven database checks passed.

## Session recovery verification — 2026-10-22

Recovered the interrupted session without changing application code. Fresh sequential runs passed all 110 source tests and all 380 unit tests; `git diff --check` also passed. Logs are `/tmp/oms-source-resumed-20261022.log` and `/tmp/oms-unit-resumed-20261022.log`.

The earlier interrupted session's type-check log, `/tmp/oms-check-20261022.log`, ends with 0 errors and 324 warnings. Compared 782 source, static-asset and package files with the isolated application used for the accepted build and browser journeys: all matched. The configuration comparison found only the isolated Vite development-server allowance for `/opt/reclame-oms/node_modules`. The accepted build and browser evidence above therefore still covers the current application source; those expensive checks were not repeated during recovery.

Checks ran one workload at a time with a 1 GB Node heap limit. Available RAM stayed around 3.2 GB; swap was full. Running application/database services were preserved. Changes remain uncommitted, and production deployment/migrations remain outside this verification.

## Remaining limitations

- The 324 existing type-check warnings remain, chiefly accessibility and unused CSS diagnostics; the type check has zero errors.
- CAD coverage uses valid DXF drawings, not native proprietary CDR files. The unused PDF comparison component is build-checked rather than a separately accepted user journey.
- This is functional evidence for the tested local stack. Production deployment, production migrations and an exhaustive security/concurrency audit are outside this run.

## Artifacts and repeatability

Original fixtures, JSON results and screenshots are under `test-results/order-flow-20261021/`. Final accepted logs, JSON results and smoke scripts are under `test-results/failures-fixed-20261021/` (both gitignored). Sensitive development configuration, passwords and browser login state remain private under `/tmp/oms-flow-20261021/`; do not publish or commit them. The scripts are retained in the artifact bundle so another restart does not lose the test logic. Playwright output uses a separate directory to avoid clearing the functional artifacts.

The layout spec is `tests/e2e/order-editor-layout.spec.ts`. Supply `OMS_QA_BASE_URL`, `OMS_QA_ORDER_ID` and `OMS_QA_STORAGE_STATE` for an isolated app, editable TEST ONLY order, and private manager storage state. It edits fields locally without saving, performs trial pointer clicks and verifies the native unsaved reload prompt. The default legacy E2E suite was not accepted or claimed to pass.

## Initial unit failures — all now passing

These names are retained as the initial failure inventory. Each is passing in the final 380-test unit run; no tests were skipped to obtain that result.

- does not write a temporary CSV file from a production handler
- does not offer a stage completion dropdown on the read-only overview
- renders real station stages instead of order lifecycle status
- exposes accessible filters, retry, and no-data states
- filters untrusted proposed cards to known kinds, lengths and count
- loads, creates and persists a board, including suggestions
- never modifies the board before a user approves a proposed card
- passes a bounded board context, not raw internal editor records, to the provider
- keeps the existing order form shapes and engineering tools available
- archives embedded legacy ChatShape threads privately and strips shared snapshots
- never overwrites on conflict and preserves a recovery path
- restores editor affordances without dropping old shapes
- keeps media evidence private and never automatically mutates the shared drawing
- retired PDF endpoint cannot read binary as Latin1 or auto-update forms
- forces explicit unchecked field approvals, verifies current state, never auto saves
- compares exact SKU/code only, checks units and distinguishes unknown inventory
- blocks actual shortages and empty orders independently from the model
- replaces the overloaded sidebar with grouped sections, focus mode and deep-link state
- reuses one private-file component across editor and overview
- does not offer invalid COMPLETED stage transitions from order overview
- flags actual hours overruns even if no reservation exists
- validates claim, revision and resolution note contracts
- keeps a prior review in the ledger when its condition is no longer live
- shows status-specific handoff tips without bypassing order roles
- rejects truncated or otherwise invalid technical snapshots
- translates contextual links in EN, RU and LV
- flags elapsed stage updates only on active unpaused work, not as a claim of inactivity
- requires manager and validates cited movements against the actual review order
- requires request-scoped clients for user-facing data routes
