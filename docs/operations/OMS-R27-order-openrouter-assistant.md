# OMS-R27 — OpenRouter contextual assistant in Orders

The existing generic chat pane in `/orders/[id]/edit?section=chat` is replaced
by a **saved-order-aware assistant**. This batch has no new database migration;
it reuses server-side OpenRouter/Vault provider credentials, the R13 validated
suggestion contract and the existing R17/R12 versioned draft edit flow.

## Two deliberately different assistant modes

**Ask a question** (default) sends a bounded authenticated snapshot of the
saved draft/order to OpenRouter and returns a conversational answer. It can
help staff with customer clarification questions, incomplete fields, signage
production considerations and stage handoffs. Only a small in-memory recent
conversation is included. The conversation stays mounted across order-workspace
tabs, resets when the order ID changes, and is **not shared between users**,
persisted in chats or written to Supabase.

**Suggest draft field changes** explicitly requests strict structured JSON:
reply, proposals and missing questions. The model may propose only R13
allowlisted fields (clientName, title, deadline, loadingDate, priority, notes,
deliveryAddress, deliveryContact, deliveryPhone, deliveryEmail, isRd, rdNotes).
Values are validated with Zod, including ISO dates, email, boolean and enums.
Confidence and evidence are model-reported and **not independently verified**.
The assistant never suggests status, PO number, stage, inventory transaction,
prices, quantity or profile-template IDs as an executable field operation.
Staff must select each checkbox (all start unchecked), then **Apply selected**
copies only those fields into local editable draft state. It does not save.
Staff must review them and use normal Save Draft, which retains its existing
revision-based authorization and database atomicity.

## Context and permissions

The server checks the caller's authenticated account and draft editing
permissions before sending any data to a model. For confirmed/in-production
orders, only authorized managers can ask read-only questions; field application
is disabled by the editor. Data is read through the caller's Supabase client,
not a service-role bypass.

The prompt context includes the current *saved* order fields, a maximum of
30 of 100 verified profile instances (with active template name/code),
up to 50 of 100 verified order-material rows, stage states, and the linked
file count. It never includes raw file bytes, unverified stock balances,
private storage URLs or the browser's unsaved form fields. No model is allowed
to call order mutation tools; the endpoint contains no SQL writes, stage
commands or arbitrary user-supplied model IDs. Order notes, material descriptions
and past chat text are explicitly treated as **untrusted reference material**.

A visible consent box authorizes sending the saved order context and current
question to OpenRouter. The API also requires `consent:true`. Requests use the
existing per-user AI rate limit. Changes to persisted order `updated_at`
cause a 409; before any proposed field can be applied the client checks both
local form fingerprint and a fresh GET of the saved order. This guards stale
suggestions in addition to the ordinary Save Draft revision check.

Language is resolved from the selected EN/RU/LV user preference on the
server (with request/header fallback) and applied to *all* user-visible
assistant content. Names, technical identifiers and numeric units are not
translated blindly.

## OpenRouter settings

The existing Settings → OpenRouter Vault credential remains the only required
provider credential. Optionally set in the *server* environment:

```dotenv
OPENROUTER_ORDER_ASSISTANT_MODEL=
OPENROUTER_ORDER_ASSISTANT_STRICT=true
```

Blank model uses `OPENROUTER_ORDER_INTAKE_MODEL` then `OPENROUTER_MODEL`.
Ordinary chat needs only text output. **Suggest changes** requires an OpenRouter
provider endpoint supporting strict `response_format:json_schema`. Structured
output is explicitly routed with `provider.require_parameters=true` by the
existing OpenRouter client, so unsupported providers error rather than
silently returning an unverified free-form patch. For a known compatible
legacy JSON-object endpoint, an administrator can explicitly set
`OPENROUTER_ORDER_ASSISTANT_STRICT=false`; Zod validation remains mandatory,
and no automatic fallback is attempted.

The existing Canvas AI shape tools remain available in a separate,
collapsed **Canvas AI tools** subsection, so order-context chat does not
remove prior Maker.js conversion functionality. Canvas shape replacement
requires a separate human confirmation.

**No automatic web access:** the assistant never forwards stored customer
addresses to a third-party web-search plugin. Future research mode should
require separate permission, explicit request and sanitized search context.

## Staging acceptance

1. Install dependencies; run `npm run check`,
   `npx vitest run tests/unit/oms-r27-order-assistant.test.ts`,
   `npx vitest run tests/unit/oms-r13-order-intake.test.ts`,
   and `npm run build`.
2. Configure Vault credentials and two OpenRouter models: a standard text
   model for chat, and a structured-output-capable model for suggestions.
3. As draft author: ask about a saved order. Confirm relevant notes, profiles,
   materials and stages are described and no private file URLs/bytes leak.
4. With unsaved local changes: ensure the warning shows and the model only
   receives saved values, not the unsaved form.
5. Request suggested fields. Leave all checkboxes unchecked; nothing applies.
   Select only two and apply. Verify only those fields change locally, and
   no database state changes until Save Draft is clicked.
6. Have another manager edit the draft during a response and again before
   applying a suggestion; both stale-version paths must refuse.
7. Try non-authorized staff, inactive account, different user's draft,
   confirmed order, invalid model JSON, unsupported structured-output model,
   missing Vault key, and rate limiting. The AI must never write an order.
8. Check user-selected EN/LV/RU answers and visible labels, long text notes,
   empty profile/materials context, consent off, and navigation between tabs.
9. Confirm optional Canvas AI tools still work, with confirmation before shape
   replacement; files/AI Intake/Readiness/Revision workflows must be unchanged.

## Verification

Code was committed via the GitHub connector; this session did **not** run a
live OpenRouter request, the local Svelte/TypeScript build, Vitest, browser
acceptance, or production database changes. Existing OpenRouter model routing
should be verified against the model's up-to-date supported parameters before
enabling strict edits on the live server.
