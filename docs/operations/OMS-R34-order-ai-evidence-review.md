# OMS-R34 — Evidence-scoped OpenRouter assistance within native orders

**GitHub source batch only.** Uses the existing self-hosted OMS/Supabase stack
and the existing Vault-managed OpenRouter credential. No new manufacturing
form, schema/migration, automatic AI writes, workflow transition, or CI/Actions
integration is introduced.

## Changes

### File → saved production profile → OpenRouter

An authorized draft editor can open **Files** and choose the small AI action
on a PDF, JPEG, PNG or WebP attachment. It opens the existing **AI Intake**
panel with that canonical linked file preselected. An editor can alternatively
choose **Analyze a drawing for this profile** beside any native production
profile. Intake then offers the original saved profile order (or **Whole
order**) alongside its selected file. Changing either input invalidates the
current analysis; it must be rerun. Paid PDF OCR still requires the existing
explicit checkbox, confirmation and administrator enablement.

The server rejects unauthenticated and unauthorized access, invalid UUIDs and
profile indices, missing linked attachments, unsupported media and stale order
versions. It resolves the profile ONLY from `order_profiles` belonging to
that saved order, sorted by `order_index`. The bounded native
`CNC_FREZER/BENDER/FRONT/PAINTING/ASSEMBLING` summary from R33 is sent as
*unverified operator selections*, together with the explicitly approved file
bytes and saved order context. A supplied browser index is only a selector:
it cannot supply profile configuration or bypass RLS. Neither route mutates
the form or stores a generated profile.

**Chat is not attachment vision.** The normal order assistant still sees
linked names/count only. Actual PDF or image content reasoning remains in
`POST /api/ai/order-intake` with file-specific consent. Results from a
parser are not automatically certified or endorsed by the system. Staff must
inspect the original drawing and evidence.

### Human review and stale state

The order chat and file intake now share a pure no-op check that identifies
model suggestions identical to the local field. These rows remain visible
for transparency but their approval checkbox is disabled. Field names and
confidence badges are localized in EN/RU/LV.

- Order assistant chat may answer informational questions using its saved
  snapshot while local changes exist, with the existing warning.
- **Suggest field edits** is blocked while the local editor is dirty; pending
  approvals become stale when saved revision, local field values, or form-dirty
  state change.
- Intake is blocked on unsaved **order-form** changes, not unrelated Canvas
  editing. It sends `expectedUpdatedAt` and refuses a stale server revision.
- Following the model reply, approvals remain **unchecked**. Selected
  suggestions are applied only to local order fields via the existing
  allowlist, after fetching the latest saved order and rechecking local state.
- Changed file/profile selections hide the old results and demand reanalysis.
  Old results from a changed order or local form are labeled stale and cannot
  apply.

Existing R31/R32/R33 native form controls, profile templates, file persistence,
versioned Save Draft, review submission, permissions and historical R30 data
are preserved. No extra `Технические характеристики` section is added.

### Compilation blocker corrected

The accidental duplicate `type ProductionSection` definition in
`native-profile-context.ts` from R33 has been removed. This is a source
correction; a successful TypeScript build has **not** been asserted.

## Operator staging checklist

1. Open a DRAFT with at least two saved profiles and one customer PDF/image.
   Click the file's AI action. Verify the exact linked file is preselected.
2. Switch **Whole order** to the second production profile. The model should
   reason from that saved profile's currently active native settings and the
   file bytes; it must report unknown dimensions rather than inventing them.
3. Change the selected profile or file after analysis. Previous proposals
   must disappear from the actionable review, requiring a new request.
4. Ask chat for field suggestions. Verify localized field labels, confidence,
   current/proposed values, evidence, no-op warnings, unchecked approvals and
   local-only Apply.
5. Edit a profile or order field before accepting proposals: the original
   suggestions must become stale. Save/reload and analyze again. Confirm the
   database revision conflict is handled without overwriting another user.
6. Change only an unrelated Canvas shape. Intake should not treat that alone
   as an unsaved order field, but the editor must still warn about Canvas
   saving separately.
7. Delete an attachment in another session, then attempt an AI request:
   the server must not retrieve an unrelated file. Try invalid/out-of-range
   profile indices and an unauthorized account; expect errors, no model call.
8. Repeat with RU/LV/EN UI and OCR-disabled deployment. Confirm the existing
   paid OCR opt-in remains explicit and no background analysis is triggered.

## Verification

GitHub file content and HEAD were checked while preparing the batch, but
no private staging runtime, deployed service, live Supabase/RLS session, PDF
inference, or OpenRouter key was accessed. **No builds/tests/CI were run.**

For an operator-controlled smoke pass on the OMS server:

```sh
npm ci
npm run check
npx vitest run tests/unit/oms-r31-native-order-assistant.test.ts tests/unit/oms-r34-order-ai-review.test.ts
npm run build
```

Deploy manually using the existing application service only after passing
these checks. GitHub remains source storage, not deployment automation.
