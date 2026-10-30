# Private-server Telegram implementation plan

Goal: receive Telegram commands on a private Tailscale-only OMS server and retain the optional webhook transport.
Architecture: separate polling from outgoing delivery, use one fenced database receiver lease, and atomically checkpoint incoming updates through the existing SQL command pipeline.
Stack: TypeScript, Svelte 5, Node fetch, existing Supabase RPCs/PostgreSQL. No new runtime dependency.
Spec: ../specs/2026-10-23-telegram-private-server.md

1. Add mode-aware options and configuration validation. Preserve legacy webhook defaults and require no public address or machine secrets for polling.
2. Add a service-only migration for receiver leases, generation checks, transactionally persisted offsets, prepared transport state and sanitized health.
3. Implement bounded getUpdates transport, lease heartbeat/cancellation, preparation, replay-safe batching, durable retry and a production worker. Reuse current parsing and SQL commands.
4. Fence webhook administration and disable incoming webhook processing in polling mode. Add receiver health to R&D responses.
5. Update the R&D form with a connection selector, private-server guidance, polling timeout, independent status refresh and EN/RU/LV copy; retain all existing controls.
6. Add transport/configuration/SQL contract tests, review adversarial cases, document deployment and verify the published tree before advancing main without force.

Review focus: active poll during token/mode changes; database failure after provider receipt; out-of-order/invalid IDs; week-idle cursor reset; a second process competing for the same bot; preserving drafts when refreshing status; provider conflicts and retries without credential leakage.

Environment: GitHub connector access is available. The execution container cannot resolve or connect to GitHub/npm; this workspace is a scoped source snapshot, not a full clone. Execute isolated tests against the actual changed TypeScript, and report full-app/build/SQL execution limits explicitly rather than inheriting prior test claims.

Execution record: all six implementation tasks have code and tests. The 36 dependency-free focused tests passed; focused strict TypeScript and syntax checks passed. The SQL harness was syntax-checked but cannot run without PGlite. Full app/browser/build checks remain unrun because the container cannot obtain the full checkout/dependencies. See the operational guide for exact deployment gates. No production deployment or migration was performed.
