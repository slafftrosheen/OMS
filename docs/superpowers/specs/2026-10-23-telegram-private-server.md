# Private-server Telegram transport

Approved scope: retain OMS and Supabase behind Tailscale; implement incoming long polling, configure it in R&D settings, and publish to main. No network exposure, production credentials, live bot activation, or production migrations in this change.

The existing webhook transport remains available. New installations recommend polling; existing saved/environment configurations retain webhook behavior until R&D explicitly changes the connection mode. Polling requires only bot credentials and normal OMS database configuration. An optional OMS URL may be private HTTP/HTTPS; webhook mode requires an HTTPS application URL and verification secret. The external dispatch secret is optional in polling mode.

Use Telegram getUpdates with a positive wait, an HTTP deadline longer than the wait, and message/callback filters. Acquire a database lease before accessing the incoming transport. Reuse the current parser and database command/linking functions. Persist command effects, durable replies and the next offset in one transaction; never confirm an uncommitted update. An unavailable database fails closed. Ignore unsupported updates without poisoning the queue. Keep provider errors and secrets out of diagnostics.

A settings revision and credential fingerprint fence every lease and update transaction. Heartbeats cancel requests when configuration changes or the lease is lost. Webhook registration shares the receiver lease, preventing an old poller from removing a newly registered webhook. Switching to polling removes a webhook without dropping pending updates, once per saved configuration. Subsequent conflicts are reported, not fought by repeatedly deleting webhooks. Persist backoff, health and offsets; reset only the offset after a week without incoming updates, as Telegram can randomize update IDs.

R&D UI shows mode, polling wait, private-address guidance, receiver health, latest successful poll/update and sanitized errors. Refreshing health must not overwrite unsaved settings or secrets. English, Russian and Latvian copy follows existing themes and mobile layout. Notification delivery and command reply delivery stay independent of the incoming receiver.

Alternatives: exposing the full app was rejected; a public webhook gateway remains optional but is unnecessary for this deployment. A separate bot service was rejected to avoid duplicate account/command authorization.
