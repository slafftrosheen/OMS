# OMS-R13 — OpenRouter-assisted Order Intake

**Committed source feature, not yet production-validated.** AI prepares proposed fields; staff members decide. Neither model responses nor the proposal endpoint may directly create, confirm, dispatch, delete or edit an order.

## What changed

- Added `POST /api/ai/order-intake`: authenticated draft UUID, optional **linked** PDF/JPEG/PNG/WebP file UUID, optional paid-OCR flag, and output language. It rejects unlinked files, unsupported MIME, oversize files, invalid signatures, unauthorized roles, and non-editable lifecycle states.
- Reads files from the canonical `files` -> `order_files.draft_order_id` relationship through the private authenticated Storage reader; no signed/public URLs and no arbitrary paths supplied by browsers. File size limits: **8 MiB** images, **12 MiB** PDFs; ordinary order upload remains **25 MiB**. Existing legacy storage compatibility is retained.
- Uses actual image bytes with an OpenRouter `image_url` content part; PDFs use `type:file` and explicitly the `file-parser` plugin's `cloudflare-ai` engine. Paid `mistral-ocr` requires administrator `OPENROUTER_TOOLKIT_PDF_OCR=true`, user checkbox **and per-use confirmation**, with no automatic fallback to OCR. Free text parser cannot guarantee reading scans or drawings.
- Sends bounded persisted order notes as context. Uploaded documents and notes are **untrusted data**, not commands. No arbitrary web access is enabled for this pass.
- Requests OpenRouter's `response_format: json_schema`, `strict:true` and `provider.require_parameters:true`. Compatible providers/models are required; this is deliberately fail-closed rather than silently falling back to free-form or guessed JSON.
- Validates model output again using Zod (`src/lib/order/intake-contract.ts`); allowlisted field names: clientName, title, deadline, loadingDate, priority, notes, deliveryAddress, deliveryContact, deliveryPhone, deliveryEmail, isRd, rdNotes. Rejects unknown extra keys, wrong types, unsupported enums, impossible dates and out-of-range values. The response is never treated as an order database patch.
- Includes possible profile items and missing/contradictory details, but profile template assignment and production decisions remain manual until OMS-R14.
- Returns the provider-reported model, source file ID/name, model-reported evidence snippets, and per-field confidence. Marks an excerpt verified **only if** it literally appears in provider-reported PDF extracted-text annotations; a matched snippet does **not** independently verify the correctness of the proposed value.
- New **AI Intake** tab on `/orders/[id]/edit` and a context action for selected PDFs. The older `/api/ai/canvas/extract-pdf` delegates to the same read-only route rather than the deprecated PDF binary Latin1 fallback. Nothing auto-overwrites Svelte state.
- UI requires affirmative consent to send the selected customer material to OpenRouter, checks no form fields changed while awaiting the model, loads the latest persisted order to guard against concurrent edits, and requires **individual unchecked-by-default approvals**. It then applies *only selected* fields **locally** and directs staff to review and **Save Draft** (the regular authorized PUT/atomic R12 RPC). No PO/status/confirmation tool exists in the AI pipeline.

## Configuring the intake model

In the active OMS service environment (not just `.env.example`), choose an OpenRouter model endpoint with **structured-output `json_schema`** support:

```dotenv
OPENROUTER_MODEL=openrouter/free
# An explicit strict-json-compatible text/PDF intake model is recommended
OPENROUTER_ORDER_INTAKE_MODEL=your-provider/your-strict-json-model
# For image intake, set a model supporting BOTH image inputs and JSON Schema
OPENROUTER_VISION_MODEL=your-provider/your-vision-and-json-model
OPENROUTER_TOOLKIT_PDF_OCR=false
```

If `OPENROUTER_ORDER_INTAKE_MODEL` is unset, the endpoint tries the current
`OPENROUTER_MODEL` for notes/PDFs; this is **not guaranteed to work** with
strict JSON Schema (particularly free-router aliases). Image analyses always
use the configured vision model. Confirm the model's supported input modalities
and `structured_outputs` at OpenRouter's live models pages:
- https://openrouter.ai/docs/guides/features/structured-outputs
- https://openrouter.ai/docs/guides/overview/multimodal/pdfs
- https://openrouter.ai/docs/guides/overview/multimodal/images

OpenRouter calls may incur provider token charges even when using a free PDF text parser. OCR can incur additional per-page charges; set spend limits and disclose third-party document processing before enabling it. Customer confidential materials should only be sent when contractually allowed. API keys remain server/Vault-side.

## Browser workflow and acceptance

1. Create a draft order (R12) and upload a PDF/image attachment through the existing Files tab. The attachment must be persisted to `order_files`; merely placing an image in tldraw does not qualify.
2. Open **AI Intake**, choose a linked source file (or use saved order notes), review the third-party sharing consent and click **Analyze**.
3. Verify the generated proposals show exact fields, proposed values, original values, evidence snippets, confidence, missing details and possible profile items. Unsupported source file types are excluded from the picker.
4. Leave all checkboxes unchecked: clicking Apply must be disabled. Check a subset; apply. Verify **only selected fields change locally** and the database remains unchanged until a human clicks Save Draft.
5. Apply after another staff member edits/saves/confirms the same order. Expect a stale-state warning; no proposed fields should be applied.
6. Try a file belonging to a different order, an unrelated user, a confirmed order, unsupported file types, or an oversize PDF. Expect 4xx denial and no provider call or writes.
7. For a scanned drawing, test default text parsing and its limitations; only with billing configured, check optional paid OCR and explicit confirmation.
8. Test provider that does *not* support JSON Schema. Expect a controlled error, **not** unvalidated or guessed fields.
9. Inspect network/dev tools: no public/signed Storage URL, no raw file bytes in the browser response, no automatic PUT/confirmation, and no unexpected externally fetched URL.
10. Test EN/LV/RU UI and model response language. Source field units/names must remain faithful to actual documents.
11. Run R12 draft/attachment lifecycle and persisted-order checksum tests as regression coverage.

## Tests

```bash
npm run check
npx vitest run tests/unit/oms-r13-order-intake.test.ts
npx vitest run tests/unit/oms-r12-draft-orders.test.ts
npm run build
```

**Known limitations**: This is a review-and-proposal workflow for an **existing saved draft**. It does not create an order from an unpersisted customer file on the New Order screen yet. CDR/DXF are not directly understood by OpenRouter; convert them to approved PDF/raster previews or implement a deterministic CAD parser in a later batch. Profile mapping, material validation, production feasibility and revision tracking are intentionally deferred to R14/R15. Model confidence is self-reported, **not** a statistical guarantee.

No live model requests, tests, server build, database write, migration or deployed browser smoke test were executed from this GitHub-only environment. The R13 additions require no new SQL migration but depend on the deployed R12 atomic draft workflow and existing R10 private-file processing prerequisites.
