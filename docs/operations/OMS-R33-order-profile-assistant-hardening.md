# OMS-R33 — Safe native-profile edits and context-aware OpenRouter assistance

**Status:** Committed to `main` through GitHub. Source-only changes; no database
migration, deployment, CI/Actions invocation or live model request in this pass.

## Intent and final workflow

OMS-R31 removed the duplicate `Технические характеристики` form. OMS-R32
restored the original production-profile form in the saved-order editor and
added a distinct Save Draft & Ask AI handoff. R33 tightens their behavior
without adding any new order fields, mandatory fabrication details or
profile-schema transformations.

### New Order

1. Fill client and deadline plus the original native profile selections.
2. **Save draft & ask AI** works **without a file attachment**. It creates or
   updates a real draft, uploads any files already selected, then opens the
   saved-order assistant with a prepared profile question. The order is NOT
   submitted for review. OpenRouter has no unsaved form context, and the user
   must explicitly consent before sending any prompt.
3. The existing **Save** button continues to use the original review
   submission route and still requires selected or previously uploaded
   attachments. The backend `/submit` checks linked attachments as well.
4. Failed uploads retain the same draft ID for retry and prevent the
   assistant handoff. A failed upload is never reported as an analyzed drawing.

The database's original **client and deadline** requirements remain in place
for creating a real draft. They are not bypassed by the AI shortcut.

### Existing Order

1. Choose a profile and open **Edit production form**.
2. The original `Profile7stVisual` opens in a modal with a separate editable
   copy. Closing the modal (including Escape) **discards that dialog's edits**.
   Reading a legacy configuration cannot default-fill or dirty stored JSON.
3. **Apply to draft** accepts the changed CNC, BENDER, FRONT, PAINTING and
   ASSEMBLING values *only in local editor state*. The usual **Save Draft**
   action is still needed to persist through the existing revision-checked
   `oms_update_draft_form` workflow.
4. Read-only viewers may open the native form but may neither edit nor apply.
   No model response edits these fields.
5. **Ask AI about this profile** prepares a question for exactly its
   1-based saved profile position. It uses the existing consent-gated,
   authorized OpenRouter endpoint. Profile ordering is explicitly restored
   by `order_index` in the order GET route, matching the assistant's saved
   profile ordering.

### AI context semantics

Only saved server-side profile configurations are summarized. When a native
form checkbox disables a surface or assembly option, the old hidden material
selection is **preserved in the database** but **omitted from OpenRouter
context**. Examples:

- `FRONT.face=false` means an old `faceFilm` is not presented as selected.
- `PAINTING.back=false` excludes old `backColor` and `backCustom`.
- `ASSEMBLING.led=false` excludes old LED module references.
- `ASSEMBLING.psu=false` excludes old PSU and dimmer references.
- `ASSEMBLING.frame=false` excludes old frame details.
- Unselected CNC face/back material suppresses its old thickness;
  unselected BENDER sides suppress default depth and old thickness.

Active boolean toggles remain visible to the assistant so it can distinguish
explicit `false` from absent information. Notes remain bounded and untrusted.
This changes **only the model summary**, not the native form or persisted JSON.
Files still require an explicit AI Intake request to read their contents.

## Manual acceptance before deploy

- Create an order with client + deadline but **no file**, then Save draft & ask
  AI. It must remain DRAFT, with no automatic model invocation.
- Try the original review Save with no files: it must report the missing
  attachment rather than publish a bare order.
- Save a draft with a PDF and image; make one upload fail. AI handoff must stay
  on the current page until the missing upload is retried successfully.
- In a saved draft with two profiles, edit the second native form, close with
  Escape: no profile JSON change should be applied. Repeat, click **Apply to
  draft**, check unsaved state, then **Save Draft** and reload.
- Verify the profile ordering is unchanged across reload/save, even if the
  PostgREST embedded relation arrives in another order.
- Toggle a populated LED/PSU/paint/film option OFF, save, ask the assistant
  about that specific profile. The hidden old model/SKU/code must not be
  described as currently required. Switching it ON again must recover the
  stored selection (no destructive conversion).
- Switch EN, RU and LV; confirm the dialog actions, assistant shortcut and
  draft handoff remain translated. On read-only roles, original fields are
  inspectable but cannot be applied.
- Verify OpenRouter failure, invalid key, stale `updatedAt`, and refused
  consent do not mutate the order.

## Verification limitation

GitHub file fetches and commit confirmation verify source changes, not runtime
behavior. **Svelte check, Vitest, production build, Supabase RLS, upload requests
and actual OpenRouter calls have not been executed here.** Run in staging:

```sh
npm ci
npm run check
npx vitest run tests/unit/oms-r31-native-order-assistant.test.ts
npm run build
```

Deploy via the existing self-hosted service after passing acceptance. No
GitHub Actions or CI setup is required.
