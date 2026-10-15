# OMS-R31 — Native order forms, OpenRouter assistance and file intake

**This batch supersedes the R30 form expansion.** The screenshot-reported
"Технические характеристики" fieldset duplicated information already captured
by OMS's original Profile7stVisual. It is no longer displayed on New Order
or the saved-order editor, and its additional schema/save restrictions were
removed. The original profile form, order schema, draft lifecycle, presets,
quantities, materials, Canvas and attachment uploads remain authoritative.
There is **no data deletion and no database migration**.

## Actual order flow

1. Use the original Profile7stVisual to choose CNC faces/back, BENDER side
   material/depth, FRONT film, PAINTING and ASSEMBLING requirements.
2. Select and upload the customer's PDF/images through the normal Files
   flow, without having to fill any additional manufacturing fields.
3. In a saved order, choose **Ask AI about saved profiles** (or open the Order
   Assistant). The assistant's server collects only the signed-in user's
   authorized saved order, existing profile selections, linked materials,
   file names/count, and stage states. The interface prepares a relevant
   question but **does not call OpenRouter** until the user consents and sends.
4. For actual file-content understanding choose **Analyze PDF or image**
   (AI Intake), select an attached file and explicitly request analysis.
   The existing Intake endpoint reads a verified, linked file from authorized
   storage and calls a capable OpenRouter PDF/vision model. The ordinary chat
   cannot claim to have read the drawing based on its filename.
5. Human reviewers select individual suggestions and use the normal
   version-checked Save Draft. No AI result writes production stages,
   materials, schedule or order data automatically.

## What OpenRouter sees

The server produces a compact allowlisted snapshot of Profile7stVisual
settings: `CNC_FREZER`, `BENDER`, `FRONT`, `PAINTING`, and `ASSEMBLING`.
It includes selected materials and process options and bound-length notes.
It **does not** forward arbitrary configuration keys, file storage URLs,
raw PDF/image bytes or unapproved unsaved form values. Linked filenames
are bounded to 20, and the complete file count is reported separately.
The contextual model prompt treats those values as untrusted saved notes,
not verified manufacturing drawings, unit-certified measurements,
material availability, pricing or machine-feasibility evidence.

Historic R30 `configuration.fabricationSpec` values may remain in existing
order JSON. They are not shown in the default form, not required, not used to
block a draft save, and not the primary OpenRouter profile context. The
R30 historical parser remains for compatibility only; there is deliberately
no destructive migration or automatic conversion.

## Staging acceptance

- Run `npm ci`, `npm run check`,
  `npx vitest run tests/unit/oms-r31-native-order-assistant.test.ts`,
  `npx vitest run tests/unit/oms-r30-fabrication-spec.test.ts`,
  `npx vitest run tests/unit/oms-r27-order-assistant.test.ts`,
  and `npm run build`.
- Open New Order in Russian and compare with the supplied screenshot.
  The entire section beneath Profile7stVisual must be absent; its original
  CNC/BENDER/FRONT/PAINTING/ASSEMBLING fields must behave identically.
- Load presets, duplicate profiles and save a draft. Check that
  `order_profiles.configuration` remains byte-equivalent for the existing
  options and that previously saved R30 JSON is retained on updates.
- Upload a PDF, PNG and JPG through the original uploader. Follow the
  Files → AI Intake action and inspect suggestions before applying.
- On saved order, click the contextual AI button by production profiles.
  The assistant should have a prepared question but no automatic request.
  Verify accurate interpretation of BENDER/FRONT/PAINTING/ASSEMBLING choices.
- Confirm normal consent, EN/RU/LV answers, role restrictions, rate limiting,
  stale-order detection, field-proposal checkbox opt-in, and persistence through
  the existing atomic draft revision path.
- Verify unavailable storage, unreadable PDFs, missing OpenRouter key and
  unsupported models show errors without affecting order data.

**Execution status:** Source was edited and committed through GitHub. Live
OpenRouter requests, database migrations, Svelte build, Vitest and browser
staging execution were not performed here.
