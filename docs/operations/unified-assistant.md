# Shared screen assistant

## User experience

The signed-in application layout owns one floating **Assistant** button. The drawer sits above the bottom navigation, supports desktop and phone layouts, closes with Escape when focus is inside, and returns focus to the control that opened it. Opening the launcher does not invoke an AI provider. The generic conversation requires consent and an explicit Send action.

Screens can add tools to the same drawer:

- A new order offers contextual drafting guidance and the existing save-and-ask handoff.
- A saved order's editor offers discussion, file analysis, readiness and the advanced canvas handoff when the user's existing permissions allow them.
- The order detail view offers current-order help and links into its saved discussion and file-analysis workflow.
- Toolkit canvas keeps its brainstorming, research and explicit proposal-approval workflow inside the drawer.
- Inventory, material details, calendar, production and workstations supply the visible records, filters and current selection to general screen help.

The general conversation does not save or mutate orders, inventory or the canvas. Existing native tools retain their own validation, permission checks and explicit apply/approval actions. R&D provider settings and diagnostics remain in their existing administration screens.

## Context and lifecycle

`src/lib/assistant/context.ts` creates a controller per layout; there is no server-global user context. A page registers an identifier, title getter, context getter and optional tools/snippet through `getAssistantContext()`. Return the cleanup function from `onMount`. Each registration owns a lease, so teardown from a previous page cannot clear a newer registration.

Context getters run at Send time. Include bounded, user-visible state such as current form values, selected records, filters and loading/error indicators. Do not pass a whole store, DOM snapshot, file content, storage keys, signed URLs, credentials or private provider configuration. `safeScreenData` adds depth, array, string and sensitive-key limits; the server validates the resulting request again.

Native tool panels stay mounted while changing tools or closing and reopening the drawer on the same screen. This preserves typed questions and explicit proposal state. A path, registration or account change destroys the previous conversation and aborts pending requests. Conversations are held in memory; this drawer does not write them to browser storage. Existing saved order and canvas conversation services retain their established persistence behavior.

General-help context is a user-supplied snapshot, not proof of database state. The assistant prompt distinguishes unsaved screen values from verified tool results. It must state missing information instead of inventing product specifications, prices, stock or permissions.

## Server contract

`GET /api/ai/assistant?path=...` returns the permitted tool labels for that screen without calling OpenRouter. `POST /api/ai/assistant` accepts a question, explicit consent, supported language, current screen snapshot and bounded user/assistant history. Authentication and request rate limits are required. Clients cannot submit tool definitions or privileged conversation roles.

`src/lib/server/ai/screen-assistant.ts` bounds the model/tool loop. A tool must be present in both the current screen selection and the server registry. Permissions are checked again before every execution. Station tools also check the authenticated user's station assignment. Catalog and operational lookups use the request-scoped Supabase client and its RLS; business data is never fetched with service-role access. Tool descriptor metadata follows the existing server registry.

| Screen | Potential general-help tools, subject to permission |
| --- | --- |
| Dashboard | Catalog search, pending orders, low stock |
| Orders | Catalog search, pending orders |
| Draft editor | Catalog search, signage calculations |
| Inventory/materials | Catalog search, low stock |
| Calendar | Pending orders |
| Production | Catalog search, pending orders, low stock |
| Workstation | Catalog search, plus CNC, paint or signage tools for the relevant station |
| Canvas/Toolkit | Catalog search, signage calculations; web research uses the existing canvas workflow |
| Settings, notifications and other screens | General guidance |

Model output is rendered as text. Provider/tool failures leave the user's input available for retry. If the configured model explicitly rejects tool support, the service can fall back to guidance from the supplied context and marks that result as lacking live tool access. Cancellation propagates through provider requests and database/tool calls.

The catalog tool returns known specifications and source metadata. It explicitly reports that supplier stock and supplier prices were not verified. The separate low-stock tool uses OMS inventory values; those are not supplier availability. Pending-order results disclose their 25-record limit. Low-stock results disclose the 500-record inspection limit, the 100-result cap and any unclassifiable balances; a partial result must not be presented as a complete total or proof that no shortage exists.

## Material integration

Material display naming is centralized in `src/lib/profiles/helpers.ts`. Existing color/swatches keep their useful compact labels; electronics, frame materials and 3D print materials retain the selected product/model. Generic legacy labels such as `LED` cannot override a more specific catalog name.

FACE, BACK, SIDES and FRAME share `MaterialThicknessSelect`. Frame wall thickness remains independent of its section dimensions, while legacy dimensions such as `40x40x2` or `D20x2` are read compatibly. Updating thickness explicitly synchronizes an embedded legacy wall value. Missing thickness metadata retains the existing family fallback; an explicit empty array means no sheet-thickness choices.

The optional 3D material selection persists with the profile. Filament diameter is product metadata, not sheet thickness. The [catalog README](../../supabase/catalogs/README.md) documents product provenance, importer behavior, known supplier inconsistencies and the separate migration procedure.

## Verification and release

Use the checked-in UI harness to exercise the real assistant and profile components with mocked HTTP boundaries. It does not need a live database or provider key:

```sh
npm test
npm run test:unit
npm run check
npm run build
npx playwright test --config tests/ui/playwright.config.ts assistant.spec.ts profile-materials.spec.ts profile-controls.spec.ts app-shell.spec.ts
node scripts/catalog/generate-lemona-seed.mjs --check
git diff --check
```

The catalog README also documents an isolated PostgreSQL-compatible execution check for the generated SQL, including import, repeat execution, conflict rollback and preservation of existing inventory fields.

Build and service restart do not apply database migrations. Apply the reviewed `20261030000001_lemona_branded_catalog.sql` migration through the normal process for the intended database. After deployment, verify the compiled revision and perform a signed-in smoke check with the intended roles: open the shared drawer, send a deliberate provider request, inspect the expected tool list, and confirm a seeded product appears with its model in an order badge. Local mocked-provider tests do not establish live OpenRouter or production database readiness.
