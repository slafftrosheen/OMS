# OMS-R10 — Genuine Canvas image and PDF understanding

Implemented on top of OMS-R09 without changing SQL tables or file storage policies.

## User flow

1. Upload an image (PNG/JPEG/WebP) or a PDF into a Toolkit Canvas project.
2. Select the uploaded document shape.
3. Optionally enter a specific question in the assistant composer (for example,
   "Read the dimensions, quantity and material type" or "Compare the lettering
   placement with the photo").
4. Click **Analyze selected image / PDF**. This sends the **real asset bytes**
   from the *private* `toolkit-assets` Supabase bucket to OpenRouter on an
   explicit user action. No public or signed file URL is created.
5. Read the private answer. Page numbers, text, dimensions and measurements
   must be verified against the original file before production.
6. Continue brainstorming against the board: the current tab remembers a
   bounded extract or model interpretation and includes it as **labeled,
   untrusted reference context** on subsequent Canvas requests.
7. If appropriate, click **Add findings to shared Canvas**. The system places
   a clearly labeled, truncated research card only after this explicit
   publishing action. The full source PDF/image is not copied into the card.
   Alternatively use **Save last AI response as note**.

Private analysis replies join the authenticated user's personal Toolkit
conversation; summarized extractions are **ephemeral** in the active browser tab.
They are cleared on project changes and refresh, rather than being persisted
to a public/shared board without consent.

## Models / parsers

**Images** use the administrator's `OPENROUTER_VISION_MODEL` via OpenRouter
chat completions with a base64 `image_url` content part. Model MUST support
image input; `OPENROUTER_MODEL` alone does not guarantee image recognition.
GIF remains previewable but is not part of the supported AI-analysis inputs.

**PDFs** use the administrator's `OPENROUTER_MODEL` with a base64
`type: file` content part and the explicit `file-parser` plugin.

- Default **`cloudflare-ai`** engine parses text/Markdown without an
  additional OCR fee. It may miss text in scanned pages and diagrams.
- **`mistral-ocr`** is separately enabled by the administrator and requested
  with a checkbox plus a **per-request confirmation dialog**. OCR is billed
  per page by OpenRouter, in addition to any model inference charges.
- Model-native PDF processing is **not** the implicit fallback. We pin the
  parser to avoid accidental OCR charges from provider defaults.
- OpenRouter file annotations, when returned, are read only for textual parts.
  Embedded base64 page images are never persisted or returned to the browser.

All AI responses are interpretations, not independently checked facts.
Provider-extracted text is labeled differently from image descriptions.
The assistant is told not to invent page numbers or visually read PDFs
that were text-only parsed. For page-aware engineering verification, always
inspect the original PDF. Scanned plans may require paid OCR and manual review.

## Deployment

Set environment variables in the **server** service (never `PUBLIC_`):

```dotenv
OPENROUTER_MODEL=openrouter/free
OPENROUTER_VISION_MODEL=google/gemma-4-31b-it:free
OPENROUTER_TOOLKIT_PDF_OCR=false
```

These are configuration examples, not assertions about currently offered
model capabilities. Check actual model availability and input modalities in
<https://openrouter.ai/models>. If enabling billed OCR, set
`OPENROUTER_TOOLKIT_PDF_OCR=true` **only after** OpenRouter billing/spend
limits are configured. Then restart `reclame-oms.service`.

The per-analysis limits are **8 MiB for JPEG/PNG/WebP** and **12 MiB for PDF**
to bound memory, upload payload and provider costs. The existing normal
Canvas *upload* limit remains 25 MiB. Larger uploaded files are previewable
but cannot use this analysis endpoint. SvelteKit's existing rate limit is
enforced for each analysis request. Server errors never expose raw API keys,
provider error bodies or original binary data.

## Privacy boundary and safety

- `requireToolkitManager` enforces the existing RD/Boss/Head of Production
  role policy.
- The server checks the **board ID and asset ID together**, resolves the
  metadata under Supabase RLS, enforces exact content size, checks file
  signatures against registered MIME, then downloads by the trusted
  `storage_path` from the private bucket.
- Browser requests cannot specify arbitrary public URLs, arbitrary model IDs,
  external storage paths or unchecked MIME types.
- The user explicitly consents to send a particular file to the external
  OpenRouter/provider infrastructure. Do not send files whose third-party
  processing is prohibited by contract or confidentiality policy.
- The analysis endpoint is read-only. It cannot write to the shared board or
  the OMS order/inventory database. Publishing requires a separate click.
- All uploaded file and extracted evidence text is treated as untrusted
  content; its instructions are not executed as agent commands.
- The server sends the selected language preference for EN/LV/RU, regardless
  of document language, without translating hard-coded technical identifiers.

## Acceptance matrix

1. Run `npm run check`, `npm run build`, and
   `npx vitest run tests/unit/oms-r10-multimodal.test.ts`, alongside
   R07–R09 regression tests.
2. Select a stored PNG/JPEG/WebP; ask about lettering, count, colors and text.
   Verify model truly describes the source and reports unreadable details
   as unknown. Confirm no publicly accessible URL is used.
3. Select text-based PDF; ask for exact quantities/material and a cautious
   summary. Verify the default `cloudflare-ai` parser, source evidence and
   no OCR charge.
4. Select scanned PDF; check free-parser limitations and, only on a
   deliberately configured test account, enable/confirm paid OCR. Verify
   page charges and OCR model output against the original file.
5. Attempt file on another project and invalid IDs; 404/400 expected.
   Reject mismatched MIME/magic, malformed requests and oversize files.
6. Switch projects during active analysis. Verify that no answer is
   accidentally posted in the newly opened project's conversation.
7. Confirm explicit publish-to-board, save conflicts, and that reloading
   does not embed binary/PDF text automatically into shared snapshots.
8. Switch EN/RU/LV and verify the new controls, default questions, warnings,
   private replies and publishing labels.
9. Recheck `OPENROUTER_VISION_MODEL` supports current image-input modalities;
   provider model routing may change and free models may become unavailable.

## Limitations

No local on-device inference, no image embedding index, no background batch
analysis, and no guaranteed page-level citations for provider-parsed PDFs.
For text-only PDFs, diagrams or scanned drawings can be missing from
`cloudflare-ai` extraction. No test/deployment was executed on a live OMS
server during this GitHub pass.

Docs: <https://openrouter.ai/docs/guides/overview/multimodal/pdfs>,
<https://openrouter.ai/docs/guides/overview/multimodal/images>.
