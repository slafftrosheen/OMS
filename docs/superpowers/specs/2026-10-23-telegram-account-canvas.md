# Account-bound Telegram and structured canvas assistance

Base: OMS main `38179feafa268f585a468ffb95cf81f21b5803b2`.

## Intent
Keep OMS private behind Tailscale. Each Telegram identity belongs to one active
OMS account, with personal alert controls and the same authorization boundaries as
the application. Expand useful OpenRouter retrieval and structured canvas editing,
not unrestricted service-role tools or invisible writes.

## Design
- Preserve both existing transports and their replay/lease rules.
- A one-time `/start` link stages a Telegram identity. The signed-in owner must
  approve that exact pending request in OMS before it becomes a connection.
  Existing confirmed connections remain valid; new links require confirmation.
- Personal category subscriptions intersect R&D categories and existing per-type
  and global user preferences. A private-preview mode hides order/message text.
  Individual OpenRouter consent is separate from the company AI switch.
- Settings mutations derive the actor from the active server session, never a
  client-supplied account/chat ID. Disconnect remains available while the company
  integration is disabled. All new database state and RPCs are service-only.
- Phone AI may request a bounded read-only order search. The reply claim binds the
  query to its user, active role, connection version and current permissions.
  Retrieved order IDs are retained for the pre-send authorization recheck.
- Canvas proposals may create children in an existing or proposal-local frame.
  Parent permissions/version and page ownership are included in validation;
  dependent operations remain one reviewed, undoable batch. No second toolbar.

## Alternatives and choices
A Telegram password/login flow was rejected: OMS already authenticates the owner.
A one-click bearer link alone is kept only for starting the handshake, not granting
access. A separate bot-wide AI database connection was rejected in favor of the
existing claim-scoped RPC boundary. Native framed objects are preferred to visual
rectangles that do not actually own their children.

## Non-goals
No autonomous order mutations, arbitrary SQL, external media generation, public
webhook exposure, production migration execution or credentials in source code.
