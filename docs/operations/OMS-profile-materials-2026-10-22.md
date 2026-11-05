# Profile materials and UI stability

## Changes

- FACE accepts multiple material rows, each with its own material, thickness, color and catalog metadata. Add/remove controls are localized in English, Russian and Latvian. Removing the first selected row promotes the next selection for older consumers.
- Material pickers open with category names and counts. Selecting a category shows its materials; search covers all permitted categories, codes, brands and translated names/category labels. Long material names and thickness lists wrap inside the menu.
- Keyboard navigation, Escape, outside focus and outside pointer dismissal are supported. Internal category and retry transitions retain focus instead of closing the menu when the previous button is removed.
- Thickness controls use the selected catalog material's options. Legacy bare values such as `3` display against `3mm` options without rewriting saved data on opening. Existing values outside the catalog remain visible.
- Missing legacy thickness metadata uses a bounded fallback lookup. Explicit empty options provide manual entry. Failures expose manual entry and Retry; canceled or superseded responses cannot replace a newer material's choices. Composite aluminum is classified before the generic aluminum family.
- Shared legacy color tokens now follow the selected application theme. The OS dark preference no longer overrides explicit LightVim colors. Native thickness controls and options use the theme's foreground/background colors.
- Partial profiles are normalized before initial rendering. Explicit edit callbacks run after Svelte's input bindings update, so the last typed character, notes and checkbox changes reach the saved draft. Opening, hydration and read-only viewing do not emit an edit.
- Phone and laptop layouts avoid fixed section minimum widths and overflowing cable controls. Assembly spans the available row on medium screens; empty grid space uses the theme border color.

## Persistence and compatibility

The row list is stored as `CNC_FREZER.faceMaterials` inside the existing profile configuration JSON. No database migration or new endpoint is required. The legacy scalar FACE fields remain a mirror of the first selected row on explicit edits. An explicit empty list remains authoritative and does not revive an old scalar selection.

Production/assistant summaries include every selected FACE material as scalar material/thickness pairs. The existing PDF utility also includes a paginated FACE schedule for multiple rows and excludes picker metadata from the compact field list. That PDF utility is not currently called by an active application route.

## Material roles and compact selections

The native form uses `material-roles.ts` to filter candidate materials by their intended part. BACK includes cast (GS), extruded (XT) and LED acrylic. FACE, BACK and SIDES reject identifiable aluminium flatstock and profiles; FRAME offers those forms instead of sheets. Explicit material-form metadata takes precedence over narrowly recognized legacy names. Historical flat bars and tubes stored under `ALU_SHEET` are grouped correctly in the picker without changing the source inventory row.

The unfiltered category response still resolves saved selections, including an old flatstock BACK, profile SIDES or control cable. Loading the form never migrates or replaces those values. The workshop's generic 1500 × 3000 mm sheet and nine thickness options are supplied by the separate [workshop seed](../../supabase/catalogs/workshop-materials.md); applying that migration remains a deployment step.

Selected electronics use one compact control: LED brand/temperature/power, PSU brand/rated power/series, and cable size/voltage rating/entered sign-cable length. The exact model remains available in the accessible description, hover title and open picker's selected-material section. Full technical and package facts remain in catalog choices and inventory product details. White-channel temperatures, maximum W/m, rated voltage, conductor cross-section and outer diameter retain their distinct meanings. Missing facts remain absent.

Main-cable choices prioritize recorded mains/power cable applications and suitable catalog families, excluding known signal/control/internal wiring. This is a relevance filter, not electrical compatibility validation. The cable-length input is the outgoing length from the sign; supplier reel length never fills it. The existing saved configuration keys and units remain unchanged.

Browser coverage includes role filtering, all requested sheet thicknesses, compact selected controls, changing outgoing cable length, exact model access, toggle preservation, saved legacy values and serialized reopen/read-only behavior. Cable evidence and admin edits have shared regression coverage to prevent stale imported dimensions or voltage ratings from reappearing after edits.

## Original 2026-10-22 verification

| Check | Result |
| --- | --- |
| Source suite, `npm test` | 110 passed, 0 failed |
| Unit suite, `npm run test:unit` | 412 passed, 0 failed |
| Type check, `npm run check` | 0 errors; 318 existing warnings |
| Browser suite, `npm run test:ui:profiles` | 18 passed, 0 failed; no page runtime errors |
| Production build, `npm run build` | Passed, including the Node adapter output |
| Final diff check | Passed |

```bash
npm ci
npm test
npm run test:unit
npm run check
npm run build
npx playwright install chromium
npm run test:ui:profiles
```

The browser suite mounts the real native profile form and material components through `tests/ui/`, serves the application's real styles, and intercepts only catalog/thickness HTTP responses. It needs no user account or database. It covers partial legacy hydration, final input events, multiple independent FACE rows, serialized reopen/removal, read-only controls, custom text/color/thickness, category/search navigation, focus dismissal, errors/retry, stale requests, four responsive widths (320/768/1024/1440), and all three app themes against both OS light/dark preferences.

Unit regressions additionally exercise the real order field/canonical profile save contracts, summaries, PDF rows, catalog request deduplication/timeouts, thickness normalization and the request-scoped thickness API.

For environments with a preinstalled Chromium binary, the UI runner accepts `OMS_QA_CHROMIUM_EXECUTABLE` and optional JSON-array `OMS_QA_CHROMIUM_ARGS`. This does not change application dependencies or production configuration.

This session used the existing Playwright 1.57 dependency with an isolated Chromium 153 binary. Initial browser setup problems (missing font configuration and a single-process launch argument that prevented context reuse) were corrected before the accepted run. The final screenshots were visually inspected at phone, tablet and laptop widths. The first unit run encountered a sandbox restriction on an existing tldraw asset test's Node subprocess; the permitted rerun passed all 412 tests.

## Verification boundaries

The browser catalog is a controlled fixture. These checks do not claim a live database save, authenticated production journey or production deployment. Existing repository accessibility/unused CSS diagnostics remain outside this focused repair. Deployment should include a smoke check of an existing profile and a newly saved profile with two FACE materials.
