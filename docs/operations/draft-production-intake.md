# Production PDF assistance and saved client addresses

The saved-order Assistant → Attachment analysis workflow now extracts production facts as well as ordinary order fields. Upload source PDFs/images through Files, save the draft, select a source and saved profile, then request analysis. The server reads the actual private linked file under the current user's permissions and uses the existing OpenRouter integration and company sharing policy. It never sends a private download URL or the material catalog to the model.

Each choice starts unchecked. Review the source excerpt, page/part, confidence, current value and proposed value. Unknown material identities, multiple matches, conflicting order-field alternatives or part values, dimensions without explicit units, ranges and placeholder references cannot apply. Low-confidence facts still need deliberate approval. Generic “6500K”, “regular PSU” or “230V black cable” specifications do not identify an electrical product; use the normal catalog picker to resolve them. Exact catalog matches prove identity only, not compatibility, stock, electrical sizing or drawing accuracy.

Choose the saved profile that actually corresponds to the drawing part. Different depths/dimensions for separate parts remain unresolved until separate profiles/manual edits clarify them. No template or internal PO number is inferred. External customer references and separately labelled billing/client addresses can be approved into order notes. Delivery address/contact fields use the existing form. The application does not assume the delivery recipient or logo is the ordering client.

Production choices use the existing form keys: CNC face/back, thickness, BENDER sides/depth, FRONT films/PRINT, PAINTING colors and ASSEMBLING LED/PSU/main cable/frame choices. Material selections retain real database IDs alongside the native catalog codes. Width/height append to CNC notes; generic LED/PSU/cable specifications and details without dedicated controls append to assembly notes. DC cable descriptions do not choose a mains cable. Applying a quantity updates the native editor quantity used by Save Draft. Read-only station packets use the same saved configuration.

Existing filled controls require the additional replacement acknowledgment. Local state, selected source/profile, linked files, server revision and the complete, exactly counted catalog are rechecked before applying; thickness-only changes also resolve their selected material against current catalog options; changes invalidate the preview. Application is all-or-nothing and local. Nothing is persisted until normal **Save Draft**, whose atomic RPC checks the order revision and authorization. Confirmation remains a separate workflow.

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

Verification on 2026-11-05: 110 app tests (UTC), 1,148 unit tests, two actual migration SQL tests, all five original PDF checks and four Chromium acceptance tests passed. Focused ESLint passed. Svelte check reported zero errors and 14 existing warnings; the production build passed. Fresh review findings on catalog pagination, fabrication process markers, current thickness options and inactive film preservation were reproduced and fixed with regression tests. Live provider and production database acceptance remain deployment prerequisites.
