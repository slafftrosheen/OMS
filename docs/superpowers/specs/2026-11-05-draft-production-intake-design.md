# Draft production intake

Implement the user's 2026-11-05 request in the existing R13 intake and native Profile7stVisual form. Keep authenticated linked-file storage, OpenRouter/Vault, per-user rate limits, explicit OCR billing consent and ordinary versioned draft saves. Never infer internal PO/status, template IDs, stock availability or compatible electrical products.

## Approach

Extend reviewed intake rather than introduce an autonomous writer. Extract semantic production facts, then resolve exact catalog identities under RLS. Return actual material IDs and native codes; generic or ambiguous specifications stay unresolved for manual selection. Do not send the catalog to the model or accept model IDs. A selected saved profile is required to apply production changes. Preserve multi-part dimensions as evidence; width/height/specifications without dedicated native controls append to station notes. External references and client addresses append to order notes, independently approved; delivery addresses use existing order fields. Conflicting facts cannot apply. Every choice starts unchecked. Existing filled controls require an additional explicit replacement acknowledgment; any local change, profile change, removed file or stale server revision invalidates application.

## Addresses

An additive database trigger captures every saved, nonempty client delivery address from manual and AI-assisted saves in the same transaction. Conservative Unicode/case/whitespace normalization deduplicates per client without guessing geography or merging apartment numbers. Immutable usage history retains source order, revision, actor, raw address and contact snapshots. RLS limits reads to active users with access to a source order; only triggers can write. Backfill current saved addresses. Reuse through an authenticated per-client lookup; choosing a prior address is explicit.

## Examples and verification

All five supplied PDFs were retrieved and rendered locally. They are predominantly image-only, so configure native PDF support explicitly or request paid OCR; retain free text parsing without automatic billing fallback. Public fixtures contain hand-checked technical observations and file hashes, with contact details excluded. Original PDFs remain private. Tests cover exact/ambiguous/unknown catalog matches, incompatible roles, units and ranges, conflicting multi-part facts, safe apply, references, provider routing and transactional address history/RLS. Run focused tests, complete repository suites, Svelte check, build and diff check. Review the final change before committing/pushing main if its remote head is still the inspected base. No production deployment or production migration is authorized by this repository change.
