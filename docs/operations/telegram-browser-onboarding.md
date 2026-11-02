# Telegram onboarding without an installed desktop app

## Symptom and scope

`Failed to launch 'tg://resolve?...' because the scheme does not have a registered handler`
is a browser/OS application-launch failure on the Telegram landing page. It is not a
Bot API response and does not establish that the configured bot token is invalid.
The OMS link was a valid `https://t.me/<bot>?start=<one-time-token>` link, but the UI
provided no direct browser-client route when Telegram Desktop was unavailable.

The fix changes only onboarding UI and client helpers. Long polling, private-server
networking, bot credentials, database schema, token expiry and two-sided confirmation
are unchanged. No migration, public IP, webhook or inbound port is needed for this fix.

## Connection paths

1. **Telegram Web (computer):** Settings → Integrations → Telegram → Connect.
   Choose **Open Telegram Web**, sign in to your own Telegram account if necessary,
   and press **Start** in the bot chat. Return to OMS and confirm the displayed
   Telegram account. The web URL is HTTPS; its `tgaddr` fragment is handled inside
   Telegram Web K, without asking the OS to launch `tg://`.
2. **Telegram app / phone:** choose **Open Telegram app**, or scan the QR code with
   a phone that has Telegram installed. Press **Start**, return to OMS and confirm.
3. **Manual:** expand **Connect manually instead**, find the displayed bot username
   in Telegram and send the entire generated `/start <one-time-token>` command in
   its private chat. Plain `/start` only shows help; it does not pair the account.
   Return to OMS, check the displayed identity and confirm it.

Clipboard access is not assumed. On HTTP/Tailscale origins, or when browser
permissions deny copying, OMS selects the read-only command and explains how to
copy manually. The text remains selectable without Clipboard API access.

Create a fresh link if the old one expired during Telegram login. Cancel any
connection link that was shared or included in a screenshot. Do not paste a live
command into bug reports. The one-time command is not the company's Bot API token.

## Security boundaries

All launch paths use the same server-issued pairing token. The client accepts only
`https://t.me`, the configured bot username, exactly one `start` parameter and the
43-character base64url format used by `createTelegramLinkToken` and
`readTelegramCommand`. It rejects credentials, alternate origins, extra parameters,
fragments and injected commands. Web launch keeps the payload in the URL fragment;
external anchors also use `noopener noreferrer` and `no-referrer`.

Opening a link or copying a command never marks the account connected. Existing
server-side single-use/expiry checks and explicit confirmation by the signed-in OMS
user remain authoritative. Pairing data stays in component memory; it is not added
to storage, logs, analytics or a QR generation service. Clipboard feedback is ignored
after account changes, cancellation, expiry, confirmation readiness or unmount.

## Verification and deployment

Focused repository tests:

```sh
node packages/vitest/bin.js tests/unit/telegram-onboarding.test.ts tests/unit/telegram-onboarding-copy.test.ts
```

Before deploying, run the normal full gates on a complete checkout with dependencies:

```sh
npm test
npm run test:unit
npm run check
npm run build
```

The authoring environment could not clone/install dependencies because outbound DNS
was unavailable. It used the exact existing component blob (hash-verified), the new
sources and tests in a focused snapshot. The 30 committed checks passed after
TypeScript transpilation, using Node's test runner for `describe`/`it` and the same
Node assertions as the repository tests. Strict TypeScript checking of both new
helper modules and `git diff --check` passed. The UI wiring check is a source-contract
check, not a rendered component test. Full repository tests, Svelte checking,
production build and live Telegram/database end-to-end verification were not run.

On the OMS host, pull `main` without discarding local changes, run the gates above,
then restart the existing service:

```sh
cd /opt/reclame-oms
git pull --ff-only origin main
# Run the validation/build commands above before restarting.
sudo systemctl restart reclame-oms.service
systemctl is-active reclame-oms.service
```

Browser acceptance: test a computer without Telegram Desktop, app/QR launch on a
phone, missing/denied clipboard on the private HTTP origin, an expired link,
cancellation, account switching and English/Russian/Latvian labels. Confirm that
opening Telegram alone leaves OMS pending, and that only the identity confirmation
completes linking. If Telegram receives the command but OMS never shows confirmation,
inspect the existing R&D receiver status; that is a separate inbound-delivery issue,
not the missing protocol handler.

References: https://core.telegram.org/bots/features#deep-linking and
https://core.telegram.org/api/links#bot-links. Web K's `tgaddr` hash handling is in
https://github.com/morethanwords/tweb/blob/master/src/index.ts.
