# OMS system contract reconciliation

User intent: reconcile the existing app's parts instead of adding another isolated feature.
Baseline: `0a7d44794d7ad0e8cd2beafc878ab7fea5f1bbbd`.

Use existing workflow, role and database contracts. Preserve the private Tailscale deployment,
per-user Telegram linking/consent, original order forms, and reviewed/undoable Canvas writes.
No provider activation, infrastructure changes, database migration or production deployment.

## Approach

Prefer small shared read/projection contracts and adapter fixes over an event-bus rewrite or
another parallel service layer. Canonical `draft_orders` and notifications remain authoritative.
Presentation aliases never authorize a transition. The HTTP and realtime notification adapters
must round-trip the same identity, unread state, category and links. Per-type preference writes
must target the current authenticated active user, not arbitrary submitted fields.

The Canvas action path must preserve omitted fields and reject invalid scene context. Telegram
AI must retain provider tool definitions through the tool-result round and use the same response
language policy as Toolkit; bounded lookup and personal consent remain unchanged.

## Evidence and limits

The connector permits pinned source reads and compare-and-swap publication. This container cannot
clone the repository or install dependencies (GitHub DNS unavailable). Work in an isolated,
blob-hash-verified partial checkout. Run executable focused regressions against actual modules;
record external boundary fixtures honestly. Do not claim full application, browser, database or
provider validation without running it. Keep a deployment verification checklist.
