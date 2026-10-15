# OMS-R32 — Native profile editing and explicit OpenRouter handoff

This pass follows R31 (removal of the redundant "Технические характеристики"
fieldset). It is a source-only change to the existing order UI and uses no new
database columns, migrations, external order schemas, or GitHub Actions.

## What changed

- **New Order:** original `Profile7stVisual` stays unchanged. Alongside
  the existing **Save / submit for review** action, there is a distinct
  **Save draft & ask AI** action (EN/RU/LV). Both paths validate and save the
  same order fields and upload through the same existing file endpoint.
  The AI path waits until every attachment upload succeeds, **does not call**
  `/submit`, and opens `/orders/{id}/edit?section=chat&assist=profiles`.
  An attachment failure retains the same created order ID for retry rather than
  creating a duplicate order. The established submission path remains intact.
- **Saved Order editor:** profile rows still support the existing template,
  quantities, notes, add/remove and Save Draft. Each profile now also opens
  the original CNC / BENDER / FRONT / PAINTING / ASSEMBLING form in a wide native
  dialog; it is read-only for roles that cannot edit the order.
  `OrderNativeProfileForm` isolates the form's default-merging behavior so
  merely *opening* the form does not mark the order dirty or expand its stored
  `configuration`. Only an explicit operator action copies changes into
  local draft state. The same existing version-checked Save Draft persists them.
- **OpenRouter:** the assistant is prefilled with a fixed localized question,
  without consenting, sending, or modifying anything automatically. A real
  model request still needs explicit consent in the assistant panel. The server
  reads only authorized saved profiles and linked file metadata; actual PDF
  / image interpretation goes through the separate explicit AI Intake.
- Existing R30 `fabricationSpec` JSON remains preserved for historical order
  compatibility but is never displayed as another user-facing specification
  form.

## Operator acceptance

1. On a new order, fill out **one existing native profile** (CNC, BENDER,
   FRONT, PAINTING, ASSEMBLING), add customer PDF/image files, then choose
   **Save draft & ask AI**. Confirm the order stays `DRAFT`, file links exist
   and the assistant opens with a prefilled question and **unchecked consent**.
   No review submission, production assignment or model call should have run.
2. Ask the assistant only after granting consent. Its response must mention
   recorded operator selections and distinguish assumptions from saved facts.
   Use the Files/AI Intake action to analyze the *contents* of a PDF or image.
3. Return to Details, open each saved profile's original production form,
   change one native selection, close the dialog and Save Draft. Reload:
   selection, quantities, profile template and notes must persist.
4. Open an untouched legacy profile in the dialog, close without interacting
   and verify **no spurious unsaved-changes warning**, no default-filled JSON
   update and no lost `fabricationSpec` keys on the next legitimate save.
5. Verify that read-only staff can inspect but cannot change native selections;
   that unprivileged staff cannot call OpenRouter through the order endpoint;
   and that EN/LV/RU labels display correctly.
6. Force one attachment upload to fail. The draft ID must be retained for
   retry; the AI assistant must not open until the upload succeeds.
7. Confirm the old **Save** button still performs its review submission path
   and that changes in the native dialog use the existing version conflict
   protections.

## Verification status

Changes were committed through GitHub only. This environment has no OMS
checkout or live staging credentials: `npm run check`, Vitest, build,
browser interaction, and real OpenRouter/Supabase calls have **not** been run.
Run:

```sh
npm ci
npm run check
npx vitest run tests/unit/oms-r31-native-order-assistant.test.ts
npm run build
```

Deploy or restart the OMS app separately after validation. A previous browser
screenshot or deployed build may still show the obsolete R30 fieldset until the
running site is updated to a commit containing R31/R32.
