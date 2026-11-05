# Production PDF assistance and saved client addresses

The saved-order toolbar's **Upload & analyze PDF** button opens Assistant → Attachment analysis. Use **Upload PDF or image** there to attach and select a private source directly, or select a file already uploaded through Files. Save any order edits, select a source and saved profile, then request analysis. On a new order, upload the source, enter the client and deadline, and choose **Save & analyze PDF** to save a draft and open attachment analysis without submitting for review. Uploading alone never requests AI analysis. The workflow uses the existing company OpenRouter API key from Settings/Vault (or its existing server environment fallback); no separate key is needed. The server reads the actual private linked file under the current user's permissions and uses the company sharing policy. It never sends a private download URL or the material catalog to the model.

Each choice starts unchecked. Review the source excerpt, page/part, confidence, current value and proposed value. Unknown material identities, multiple matches, conflicting order-field alternatives or part values, dimensions without explicit units, ranges and placeholder references cannot apply. Low-confidence facts still need deliberate approval. Generic “6500K”, “regular PSU” or “230V black cable” specifications do not identify an electrical product; use the normal catalog picker to resolve them. Exact catalog matches prove identity only, not compatibility, stock, electrical sizing or drawing accuracy.

Choose the saved profile that actually corresponds to the drawing part. Different depths/dimensions for separate parts remain unresolved until separate profiles/manual edits clarify them. No template or internal PO number is inferred. External customer references and separately labelled billing/client addresses can be approved into order notes. Delivery address/contact fields use the existing form. The application does not assume the delivery recipient or logo is the ordering client.

Production choices use the existing form keys: CNC face/back, thickness, BENDER sides/depth, FRONT films/PRINT, PAINTING colors and ASSEMBLING LED/PSU/main cable/frame choices. Material selections retain real database IDs alongside the native catalog codes. Width/height append to CNC notes; generic LED/PSU/cable specifications and details without dedicated controls append to assembly notes. DC cable descriptions do not choose a mains cable. Applying a quantity updates the native editor quantity used by Save Draft. Read-only station packets use the same saved configuration.

Existing filled controls require the additional replacement acknowledgment. Local state, selected source/profile, linked files, server revision and the complete, exactly counted catalog are rechecked before applying; thickness-only changes also resolve their selected material against current catalog options; changes invalidate the preview. Application is all-or-nothing and local. Nothing is persisted until normal **Save Draft**, whose atomic RPC checks the order revision and authorization. Confirmation remains a separate workflow.

## Reviewing and resolving choices

The source setup shows available PDF processing options. Unavailable options are disabled; retry configuration lookup if it failed. The default remains text processing without OCR. Staff can cancel a pending analysis; canceled or late responses cannot apply changes to the draft.

The review summary shows extracted, attention and selected counts. **Needs attention** isolates uncertain, unresolved and manually selected material decisions; **Selected** shows the choices being prepared. Each row compares the current and suggested values. Expand its source excerpt for the original text, page and catalog ID; source details include a private download of the original file. Keyboard focus moves to the review heading when analysis finishes.

**Choose from catalog** opens the same role-filtered native picker as the production form. A deliberate staff selection retains the original source value, excerpt and model confidence, and is labelled as staff-selected. It starts unchecked and needs approval. **Use the original suggestion** or clearing the picker invalidates its approval and restores the original source interpretation. Conflicting source parts still require separate profiles or manual native-form editing. Selected decisions assigning different values to one field are blocked before application.

Application rechecks the current, complete catalog for both automatic and staff selections, including material dependencies for thickness-only edits. Removed, changed or incompatible products fail without a partial form update. Native material names and codes remain supported. Clearing approvals or changing a material decision also clears replacement acknowledgment. Recovery messages identify missing materials, unsupported thicknesses and multiple face rows in the selected UI language. The apply summary reiterates that Save Draft is required.

## Consistent order controls and previews

The new-order primary action is labelled **Submit for review**, matching its existing behavior. **Save & analyze PDF** and **Save draft & ask AI** retain a draft instead. Upload controls support keyboard activation; file preparation and saving prevent attachment changes in flight. Source and profile selectors have explicit labels.

The local PDF preview caches each complete source independently, cancels obsolete renders, and releases documents when files are removed or the page closes. Drawings sharing the same PDF header cannot reuse another drawing's preview. Loading and preview failures are shown explicitly.

Profile preset dialogs use the same native focus, Escape and recovery behavior as other order dialogs. Saving a preset never marks the order saved or disables its save actions. Preset controls, profile controls and consumption labels follow the selected EN/LV/RU language. Translation interpolation supports both flat parameters and nested `values`, preserving zero counts in production progress summaries. File dates follow the selected interface language, and saved-address comparisons show both current and saved email addresses.

## Scanned PDFs

All five supplied examples are one-page, predominantly image-only production drawings. Text extraction alone does not recover their specifications. The free text parser remains the default, and there is no silent fallback to paid OCR. For scanned drawings, configure a model with native PDF **and strict structured-output** support:

```dotenv
OPENROUTER_ORDER_INTAKE_PDF_MODEL=your-provider/your-native-pdf-model
```

Then select “Read scanned artwork with the configured PDF model”. Native PDF input may incur model charges. Alternatively, an administrator can enable the existing `OPENROUTER_TOOLKIT_PDF_OCR=true`; staff must select and confirm the paid OCR option for each request. Configure `OPENROUTER_ORDER_INTAKE_MODEL` for ordinary PDF/text requests and `OPENROUTER_VISION_MODEL` for images. Strict structured JSON remains the default; the existing explicit `OPENROUTER_ORDER_INTAKE_STRICT=false` compatibility option still validates all output with Zod. Incompatible models fail without applying anything.

OpenRouter documents the explicit `native`, `cloudflare-ai` and `mistral-ocr` engines and their differing input/cost behavior in its [PDF input guide](https://openrouter.ai/docs/guides/overview/multimodal/pdfs). Provider annotations are optional. A matching parsed-text excerpt is labelled only as such, not independent engineering verification; native/image facts remain model-reported.

## Saved client delivery addresses

Apply `supabase/migrations/20261105000003_client_delivery_addresses.sql` separately through the normal reviewed database deployment process **before releasing address history/reuse**. The application build does not apply it. Existing order saves continue to work before the migration; address lookup returns a clear unavailable message.

An AFTER trigger on `draft_orders` captures every nonempty client delivery address on create or delivery-detail change, whether entered manually or assisted. Recording and the order save share a transaction. Normalized client/address keys use NFKC, case and whitespace/comma normalization only; there is no geocoding, guessed country or removal of apartment/unit characters. The unique client/address constraint makes deduplication atomic. Different clients retain separate books. Raw address/contact/email/phone snapshots, actor, source order, revision and time remain in immutable history. Unchanged delivery details do not add history; clearing a current address never deletes prior uses. Migration backfill records only currently saved addresses and does not invent earlier history.

**Find saved client addresses** loads up to 50 addresses visible for the entered client. Choose one, review its address/contact and explicitly approve replacing entered details when needed. It updates only local delivery controls, clears the old delivery-preset selection, and still requires Save Draft.

Address lookup now supports accent-insensitive search across address, contact, phone and email within the 50 most recently used visible addresses. The preview compares current and saved delivery details and shows its last-used date. **View use history** reads immutable, authorized snapshots in pages of 20, preserving past contacts and linking to their source orders. History can be read on a read-only order, while using an address still requires edit permission. A changed client or selected address cancels obsolete history reads. New edits to delivery details invalidate an earlier replacement approval.

Both tables use RLS: active users can read only history attached to orders they can access, and therefore only addresses with a visible use. The latest contact returned by the SECURITY INVOKER lookup comes from visible history. Anonymous reads and direct client writes are denied; the trigger helpers are not executable by authenticated users. History remains after source-order deletion with its source link cleared and is no longer exposed through that order. Contact details are personal data and must follow the organization's existing database backup/access/retention practices.

## Examples and verification

`tests/fixtures/production-intake/examples.json` contains technical observations hand-checked against rendered pixels from all five supplied PDFs, hashes and review questions. They are **not captured provider outputs**. Original PDFs and contact details are excluded from the public repository. Place originals in ignored `.local/production-pdfs/`, or set `OMS_PRODUCTION_PDF_DIR` to their directory to rerun private-file acceptance:

```sh
npm ci
TZ=UTC npm test
npm run test:unit
npm run test:db
node --test tests/acceptance/production-pdfs.test.mjs
OMS_QA_CHROMIUM_EXECUTABLE=/usr/bin/chromium npx playwright test --config tests/ui/playwright.production-intake.config.ts
npm run check
npm run build
git diff --check
```

The private-file check verifies hashes, bounds, page counts and lack of useful embedded text without transmitting customer data. Without originals it explicitly skips; an explicitly supplied directory fails on missing/mismatched files. Behavioral tests exercise extraction validation, real-form mapping, references, role-aware exact catalog resolution, stale edits, endpoint authorization/provider failures and local approval controls. PGlite runs the actual migration SQL to verify backfill, deduplication, historical contacts, rollback, RLS and grants in isolated PostgreSQL; it does not migrate production. The repository's older loading-calendar test assumes UTC (`TZ=UTC` avoids its local-time mismatch).

Before deployment, run a deliberate live provider request on staging using the intended model and an authorized private PDF, and verify with an author, a different ordinary user and a manager against the deployed database/RLS. No live OpenRouter request or production database migration is implied by offline tests.

Verification on 2026-11-05 after the flow expansion: 110 app tests (UTC), 1,160 unit tests, two migration SQL tests, all five original PDF checks and 14 Chromium acceptance tests passed. Browser coverage includes deliberate catalog choices, deleted/changed products, conflicting decisions, clearing an approved picker, cancellation, filters, history pagination, stale client responses, read-only recovery, and Russian mobile keyboard/focus/interpolation. Desktop/light and mobile/dark visual checks confirmed visible counts/dates and no horizontal overflow. The mechanical design scan returned no findings. Focused ESLint passed. Svelte check reported zero errors and 14 existing warnings; the production build passed. Fresh review findings were reproduced and fixed with regression tests. Live provider and production database acceptance remain deployment prerequisites.

Upload entry follow-up on 2026-11-05: 110 app tests (`TZ=UTC node packages/vitest/bin.js src`), 1,160 unit tests and 23 Chromium acceptance tests passed. The browser checks exercise the actual new-order, saved-order detail and editor pages, private source upload and selection, failed-upload retries, upload/review exclusion and Russian mobile keyboard access. Focused ESLint, the production build and `git diff --check` passed; Svelte check reported zero errors and the same 14 existing warnings. The shared dependency directory's `npm test` executable registered zero tests, so the app suite was explicitly run through this checkout's runner. No live provider request, database migration or production deployment was performed for this follow-up.

The subsequent order-flow consistency pass verified 110 app tests through `TZ=UTC npm test` and 1,162 unit tests. The test command now explicitly uses the checkout's runner, and both the application and browser fixtures resolve the checkout's translation helper. All 31 Chromium scenarios passed in the complete release run, including identical-header PDFs, delayed PDF workers, source removal, keyboard upload, translated progress counts, preset focus/save/retry and complete delivery comparisons. Desktop/light and mobile/dark captures showed no horizontal overflow. The design detector reported no findings on the six reviewed order surfaces; no ignores were added. Focused ESLint, the production build and `git diff --check` passed. Svelte check reported zero errors and 14 existing warnings. No database migration was performed by these checks.

## Deployed application release — 2026-11-05

Application revision `475a7f9bf4b3`, built at `2026-11-05T13:14:27.287Z`, was deployed to `/opt/reclame-oms` and `reclame-oms.service` restarted. The running build fingerprint matches that commit. The private environment was unchanged, all 23 existing containers retained their start times, and no database migration was applied. The previous build is retained privately at `/home/reclame/.local/state/oms/deployments/20261105T131340Z-pdf-upload/build.previous`.

Live checks passed for liveness, readiness, database, Auth, existing OpenRouter key configuration, login HTML and client entry assets. Anonymous GET/POST analysis, file-list, address-lookup and address-history requests were denied. Live Chromium confirmed that protected order-page visits redirect to login after client authentication checks, that the password form is usable, and that client boot raises no uncaught JavaScript errors. No customer records were changed and no provider inference request was sent by the deployment checks. Signed-in role and authorized private-PDF/provider acceptance remain separate from these smoke checks.
