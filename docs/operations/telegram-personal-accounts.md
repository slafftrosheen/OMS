# Personal Telegram accounts, private alerts and canvas AI

This supplements `telegram-private-server.md` and replaces the older one-step
account-linking instructions in `telegram-notifications.md`. Long polling remains
supported: no public ingress, router port forwarding or Tailscale Funnel is needed.

## Deployment gate

Apply `supabase/migrations/20261023000002_telegram_personal_accounts.sql` after the
three 20261022 Telegram migrations and `20261023000001_telegram_polling.sql`.
Back up and verify the target database first. The migration is transactional and
retains existing connections; it does not require users to link again. Do not apply
it implicitly during a build. Deploy the matching app code and restart the persistent
production Node service after the migration and normal checks.

Personal OpenRouter consent defaults to **off**, including for existing linked
accounts. R&D's company switch alone is no longer sufficient. Existing queued AI
replies without consent provenance fail closed. Ordinary notification delivery
keeps its existing recipient and category defaults until a user changes them.

## Connect each user's own account

1. Sign into that person's OMS account and open Settings → Integrations → Telegram.
2. Create the expiring connection link and press Start in the private bot chat.
3. Return to OMS. Review the nominated Telegram username and numeric user ID,
   check “This is my Telegram account”, and confirm.
4. OMS binds that Telegram identity to the signed-in account. No OMS password,
   bot credential or service-role key is entered into Telegram.

The bearer link only nominates an identity. It cannot activate account access by
itself. Confirmation requires the same active OMS account and the exact pending
request ID, within the original ten-minute expiry. A candidate cannot be silently
replaced. Replayed/expired confirmations, a different private sender, and a Telegram
identity already owned by another OMS account are rejected. Cancel the link and
create another if the shown identity is not yours. `/stop` also cancels an unconfirmed
handshake. Existing confirmed links remain valid and can be paused or disconnected.

Personal API calls derive the owner from the current authenticated session. Submitted
user IDs/chat IDs are not accepted. Status responses expose only that owner's link,
pending candidate and preferences. Changing accounts aborts/fences old UI requests
and QR generation. Pausing, preferences and disconnect do not require the company's
bot or Vault lookup to be available; the account database must still be reachable.

## Only relevant personal notifications

Automatic phone delivery requires an existing trusted notification whose `user_id`
is that account. Personal choices cannot subscribe someone to another user's feed
or broaden their role. This change does not invent new assignment-based recipients:
existing notification producers remain responsible for choosing intended users.

Each person can choose Orders/production, Messages/mentions, Inventory/materials,
and System alerts. All choices intersect the company's category policy, the existing
overall notification switch, and per-type notification preferences. Eligibility is
checked when enqueuing and again when obtaining the delivery payload. A newly excluded
category cancels outstanding deliveries; retry does not override it. Order-source
notifications additionally recheck current order visibility. There is no bot-wide
broadcast of all company notifications.

Private preview replaces the original title/body with a localized generic alert.
The owner-scoped link/read action remains available. This hides automatic message
text, not the existence of an alert or its destination link. Explicit commands such
as `/orders` and `/notifications` can still return details the user requested.

A provider request already in flight cannot be recalled. Disconnect/opt-out prevents
subsequent eligible work and cancels queued work; it cannot retract a message already
accepted by Telegram or data already submitted to the AI provider.

## Expanded OpenRouter `/ask`

Both R&D's Telegram assistant setting and the user's “Allow OpenRouter answers for
my account” preference must be enabled. Without personal consent, `/ask` returns
localized setup guidance without calling OpenRouter. The question and account context
are removed from that guidance reply's stored payload.

Examples: `/ask What is the status of PO-1042?`, `/ask Which Acme orders are due next
week?`, or `/ask Find the completed order PO-987 and summarize its dates.`

The model can use one read-only tool, `search_orders`, with literal PO/client/title
text, optional due-date range, and an explicit historical-orders flag. It cannot
select an account, table, SQL query, arbitrary result limit or writable tool. The
server binds every lookup to the active queued reply and its current claim. SQL
checks connection version, activity, role, personal/company AI permission and order
visibility. Looked-up order IDs are recorded before data is returned, so revocation
can invalidate the answer after inference and immediately before phone delivery.

Limits: three provider rounds, three lookups total, at most two calls in a model
response, ten returned orders per lookup, 90 days when both date bounds are set,
900 output tokens per round and a 35-second orchestration deadline. Initial context
and lookup results are field-allowlisted and bounded to 16,000/8,000 characters by
dropping complete rows, not cutting JSON. Replies should identify actual PO references
and acknowledge missing/truncated data; model factual correctness is not guaranteed.
A provider rejecting initial tool use can fall back once to the bounded snapshot.
Rendered replies are saved before phone sending, so Telegram retries do not repeat
inference. Personal AI opt-out cancels and clears pending/processing AI replies.

## Canvas: real frame-contained proposals

The existing Toolkit assistant can create frames and place new objects inside them:

```json
[
  {"kind":"create","ref":"phase","shape":{"type":"frame","x":100,"y":100,"props":{"w":900,"h":650,"name":"Prototype"}},"reason":"Group this phase"},
  {"kind":"create","ref":"task","shape":{"type":"idea-card","parentId":"@phase","x":40,"y":60,"props":{"title":"Build first sample","kind":"task","body":"Check fit before the production run."}},"reason":"Add a task inside the phase"}
]
```

Parent IDs are permitted only for creation, and only for an existing editable frame
on the current page or an earlier named frame in the same proposal. Child positions
are local to the frame. These are actual tldraw parent relationships: moving the frame
moves its contents. Nested frames are supported. Existing-object reparenting, arbitrary
page IDs, protected/locked frames and forward references remain rejected.

The server's existing model prompt imports the updated action instructions. Validation,
proposal persistence, dependency batching, parent version checks and execution all use
the same contract. The complete batch uses the existing one-mark/run/rollback undo path.
No additional top toolbar or duplicate tool icons were added.

## Verification record and remaining checks

Executed against exact fetched baseline modules plus this overlay:

- 53 focused tests: account validation (8), account service/body bounds (8), localized
  copy (2), assistant orchestration (12), assistant delivery (4), existing bot regressions
  (10), and frame action/executor regressions (9).
- Strict TypeScript checking of the dependency-free account, assistant and canvas
  modules and their local dependencies.
- TypeScript syntax checks of changed modules and Svelte script blocks; JavaScript
  syntax check of the integration harness. These are not Svelte compilation.
- Whitespace/diff checks for the published overlay.

The test runtime used TypeScript transpilation and Node's test/assert implementation
for the tests' Vitest-compatible assertions. Provider, database and editor boundaries
were controlled fixtures; production code under test was not replaced. No production
credentials or real provider calls were used.

**Not executed in this environment:** full repository tests, Svelte check, production
build, native browser UI/editor tests, or PostgreSQL/PGlite execution. Network/dependency
access was unavailable. The executable SQL harness is included but must be run before
production migration; its passing status is not claimed here.

```sh
npm run test
npm run test:unit
npm run check
npm run build
OMS_PGLITE_MODULE=/absolute/path/to/pglite/dist/index.js \
  node tests/integration/telegram-personal-accounts.mjs
```

Use an isolated test database for the harness. It applies the real migrations with a
minimal Vault SQL API stub; it does not verify Vault encryption or multi-process lock
contention. The earlier integration harnesses are historical migration-stage coverage;
run this new harness for the final two-sided linking/consent behavior.

In the browser, verify EN/RU/LV at mobile/desktop widths, candidate approval/cancellation,
account switching during pending requests, and unsaved personal preferences during
status refresh. With two consenting test users, verify recipient separation, category
opt-out during a queued delivery, private previews, `/ask` consent, specific-order lookup,
role revocation during inference and disconnect. On Toolkit, apply a framed proposal,
move the frame, save/reload, and verify one native Undo/Redo. OMS links remain private
and require Tailscale on the phone; Telegram bot messages/commands use outbound polling.
